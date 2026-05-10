import { ipcMain } from 'electron';
import { getDb } from '../db/database';

export function registerCustomerHandlers() {
  const db = getDb();

  ipcMain.handle('customers:getAll', (_event) => {
    return db.prepare(`
      SELECT * FROM customers ORDER BY name
    `).all();
  });

  ipcMain.handle('customers:search', (_event, query: string) => {
    const q = `%${query}%`;
    return db.prepare(`
      SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 20
    `).all(q, q);
  });

  ipcMain.handle('customers:getById', (_event, id: number) => {
    const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
    const creditLog = db.prepare(`SELECT * FROM credit_log WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20`).all(id);
    const recentSales = db.prepare(`
      SELECT * FROM transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(id);
    return { ...customer as object, creditLog, recentSales };
  });

  ipcMain.handle('customers:save', async (_event, customer: {
    id?: number; name: string; phone?: string; email?: string; notes?: string; credit_limit?: number;
  }) => {
    let customerId: number;
    const creditLimit = customer.credit_limit || 0;
    
    if (customer.id) {
      db.prepare(`
        UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, credit_limit = ?, updated_at = datetime('now') WHERE id = ?
      `).run(customer.name, customer.phone || null, customer.email || null, customer.notes || null, creditLimit, customer.id);
      customerId = customer.id;
    } else {
      const result = db.prepare(`
        INSERT INTO customers (name, phone, email, notes, credit_limit) VALUES (?, ?, ?, ?, ?)
      `).run(customer.name, customer.phone || null, customer.email || null, customer.notes || null, creditLimit);
      customerId = result.lastInsertRowid as number;
    }

    // Queue sync
    const updated = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customerId);
    db.prepare(`
      INSERT INTO sync_queue (entity, operation, payload, status, priority)
      VALUES ('customer', 'update', ?, 'pending', 5)
    `).run(JSON.stringify({ ...updated as object, local_id: customerId }));

    return { id: customerId, success: true };
  });

  ipcMain.handle('customers:addCreditPayment', (_event, customerId: number, amount: number, note: string, method: string = 'cash') => {
    console.log(`[IPC] Recording credit payment: customer=${customerId}, amount=${amount}, method=${method}`);
    try {
      let result: any = null;

      const tx = db.transaction(() => {
        // 1. Check for duplicate FIRST (before any changes)
        const recent = db.prepare(`
          SELECT id FROM credit_payments
          WHERE customer_id = ? AND amount = ? AND payment_method = ? AND created_at >= datetime('now', '-30 seconds')
        `).get(customerId, amount, method) as { id: number } | undefined;

        if (recent) {
          // Duplicate detected - return current customer without making any changes
          console.log('[IPC] Duplicate payment detected within 30s window. Skipping.');
          const currentCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
          result = { success: true, message: 'Duplicate payment ignored.', customer: currentCustomer };
          return;
        }

        // 2. Update customer balance (only if not duplicate)
        db.prepare(`UPDATE customers SET credit_balance = MAX(0, credit_balance - ?), updated_at = datetime('now') WHERE id = ?`)
          .run(amount, customerId);

        // 3. Record the payment
        const payResult = db.prepare(`INSERT INTO credit_payments (customer_id, amount, payment_method, note) VALUES (?, ?, ?, ?)`)
          .run(customerId, amount, method, note || 'Credit payment');

        const paymentId = payResult.lastInsertRowid as number;

        // 4. Get updated customer after balance change
        const updatedCustomer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customerId);

        // 5. Update debt transactions with paid_amount (FIFO allocation)
        const debtTxs = db.prepare(`
          SELECT id, grand_total, paid_amount, receipt_number FROM transactions
          WHERE customer_id = ? AND status = 'debt' AND payment_method = 'credit'
          ORDER BY created_at ASC
        `).all(customerId) as Array<{ id: number; grand_total: number; paid_amount: number; receipt_number: string }>;

        console.log(`[IPC] Found ${debtTxs.length} debt transactions for customer ${customerId}`);

        let remainingPayment = amount;
        for (const tx of debtTxs) {
          if (remainingPayment <= 0) break;
          
          const txTotal = tx.grand_total;
          const alreadyPaid = tx.paid_amount || 0;
          const remainingOnTx = Math.round((txTotal - alreadyPaid) * 100) / 100;
          
          if (remainingOnTx <= 0) continue;

          const paymentToApply = Math.min(remainingPayment, remainingOnTx);
          const newPaidAmount = Math.round((alreadyPaid + paymentToApply) * 100) / 100;
          const newStatus = newPaidAmount >= txTotal ? 'completed' : 'debt';

          console.log(`[IPC] Allocation for ${tx.receipt_number}: applying=${paymentToApply}, newPaid=${newPaidAmount}, status=${newStatus}`);
          
          db.prepare(`UPDATE transactions SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(newPaidAmount, newStatus, tx.id);

          remainingPayment = Math.round((remainingPayment - paymentToApply) * 100) / 100;

          // Queue sync for transaction update
          const updatedTx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(tx.id);
          db.prepare(`
            INSERT INTO sync_queue (entity, operation, payload, status, priority)
            VALUES ('transaction', 'update', ?, 'pending', 1)
          `).run(JSON.stringify({ ...updatedTx as object, local_id: tx.id }));
        }

        // 6. Queue sync for customer (balance update)
        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('customer', 'update', ?, 'pending', 5)
        `).run(JSON.stringify({ ...updatedCustomer as object, local_id: customerId }));

        // 7. Queue sync for credit_payment (history)
        const payment = db.prepare(`SELECT * FROM credit_payments WHERE id = ?`).get(paymentId);
        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('credit_payment', 'create', ?, 'pending', 5)
        `).run(JSON.stringify({ ...payment as object, local_id: paymentId }));

        result = { success: true, customer: updatedCustomer };
      });
      tx();
      console.log(`[IPC] Credit payment recorded successfully. New balance: ${result?.customer?.credit_balance}`);
      return result;
    } catch (err: any) {
      console.error(`[IPC] Error recording credit payment:`, err);
      return { success: false, message: err.message };
    }
  });
}
