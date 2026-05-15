import { ipcMain } from 'electron';
import { getDb } from '../db/database';

<<<<<<< HEAD
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function resolveCustomerId(customerId: unknown): number | null {
  const id = typeof customerId === 'number' ? customerId : parseInt(String(customerId ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

<<<<<<< HEAD
  ipcMain.handle('customers:delete', (_event, id: number) => {
    try {
      const tx = db.transaction(() => {
        // 1. Unlink transactions (preserve store revenue, remove customer reference)
        db.prepare('UPDATE transactions SET customer_id = NULL WHERE customer_id = ?').run(id);
        
        // 2. Delete credit logs and payments
        db.prepare('DELETE FROM credit_log WHERE customer_id = ?').run(id);
        db.prepare('DELETE FROM credit_payments WHERE customer_id = ?').run(id);
        
        // 3. Delete customer
        db.prepare('DELETE FROM customers WHERE id = ?').run(id);
      });
      tx();

      // Queue sync (optional: handle sync queue delete operation if cloud supports it)
      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('customer', 'delete', ?, 'pending', 5)
      `).run(JSON.stringify({ id, local_id: id }));

      return { success: true };
    } catch (err: any) {
      console.error('[Customers] Failed to delete customer:', err.message);
      return { success: false, message: err.message };
    }
  });

=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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
    console.log('[Payments] Processing credit payment.');
<<<<<<< HEAD
    const resolvedId = resolveCustomerId(customerId);
    const paymentAmount = round2(Number(amount));
    const paymentMethod = (method || 'cash').trim() || 'cash';

    if (!resolvedId) {
      return { success: false, message: 'Invalid customer. Please select a registered customer.' };
    }
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return { success: false, message: 'Payment amount must be greater than zero.' };
    }

=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    try {
      let result: any = null;

      const tx = db.transaction(() => {
<<<<<<< HEAD
        const existingCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(resolvedId);
        if (!existingCustomer) {
          throw new Error('Customer not found.');
        }

        // Duplicate guard: same customer, amount, method within 5s (double-click only)
        const recent = db.prepare(`
          SELECT id FROM credit_payments
          WHERE customer_id = ? AND amount = ? AND payment_method = ?
            AND created_at >= datetime('now', '-5 seconds')
        `).get(resolvedId, paymentAmount, paymentMethod) as { id: number } | undefined;

        if (recent) {
          console.log('[Payments] Duplicate payment detected. Skipping.');
          result = {
            success: true,
            duplicate: true,
            message: 'This payment was already recorded.',
            customer: existingCustomer,
          };
          return;
        }

        const balanceUpdate = db.prepare(
          `UPDATE customers SET credit_balance = MAX(0, credit_balance - ?), updated_at = datetime('now') WHERE id = ?`
        ).run(paymentAmount, resolvedId);
        if (balanceUpdate.changes === 0) {
          throw new Error('Could not update customer balance.');
        }

        const payResult = db.prepare(
          `INSERT INTO credit_payments (customer_id, amount, payment_method, note) VALUES (?, ?, ?, ?)`
        ).run(resolvedId, paymentAmount, paymentMethod, note || 'Credit payment');

        const paymentId = payResult.lastInsertRowid as number;

        const updatedCustomer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(resolvedId);

=======
        // 1. Check for duplicate FIRST (before any changes)
        const recent = db.prepare(`
          SELECT id FROM credit_payments
          WHERE customer_id = ? AND amount = ? AND payment_method = ? AND created_at >= datetime('now', '-30 seconds')
        `).get(customerId, amount, method) as { id: number } | undefined;

        if (recent) {
          // Duplicate detected - return current customer without making any changes
          console.log('[Payments] Duplicate payment detected. Skipping.');
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
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        const debtTxs = db.prepare(`
          SELECT id, grand_total, paid_amount, receipt_number FROM transactions
          WHERE customer_id = ? AND status = 'debt' AND payment_method = 'credit'
          ORDER BY created_at ASC
<<<<<<< HEAD
        `).all(resolvedId) as Array<{ id: number; grand_total: number; paid_amount: number; receipt_number: string }>;

        console.log(`[Payments] Allocating payment across ${debtTxs.length} outstanding transactions.`);

        let remainingPayment = paymentAmount;
        for (const debtTx of debtTxs) {
          if (remainingPayment <= 0.001) break;

          const txTotal = round2(Number(debtTx.grand_total));
          const alreadyPaid = round2(Number(debtTx.paid_amount) || 0);
          const remainingOnTx = round2(txTotal - alreadyPaid);

          if (remainingOnTx <= 0.001) continue;

          const paymentToApply = round2(Math.min(remainingPayment, remainingOnTx));
          const newPaidAmount = round2(alreadyPaid + paymentToApply);
          const newStatus = newPaidAmount + 0.001 >= txTotal ? 'completed' : 'debt';

          db.prepare(`UPDATE transactions SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(newPaidAmount, newStatus, debtTx.id);

          remainingPayment = round2(remainingPayment - paymentToApply);

          const updatedTx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(debtTx.id);
          db.prepare(`
            INSERT INTO sync_queue (entity, operation, payload, status, priority)
            VALUES ('transaction', 'update', ?, 'pending', 1)
          `).run(JSON.stringify({ ...updatedTx as object, local_id: debtTx.id }));
        }

        db.prepare(`
          INSERT INTO credit_log (customer_id, transaction_id, amount, type, note)
          VALUES (?, NULL, ?, 'payment', ?)
        `).run(resolvedId, paymentAmount, note || `Credit payment (${paymentMethod})`);

        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('customer', 'update', ?, 'pending', 5)
        `).run(JSON.stringify({ ...updatedCustomer as object, local_id: resolvedId }));

=======
        `).all(customerId) as Array<{ id: number; grand_total: number; paid_amount: number; receipt_number: string }>;

        console.log(`[Payments] Allocating payment across ${debtTxs.length} outstanding transactions.`);

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

          // Payment allocated silently for privacy
          
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
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        const payment = db.prepare(`SELECT * FROM credit_payments WHERE id = ?`).get(paymentId);
        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('credit_payment', 'create', ?, 'pending', 5)
        `).run(JSON.stringify({ ...payment as object, local_id: paymentId }));

        result = { success: true, customer: updatedCustomer };
      });
      tx();
      console.log('[Payments] Credit payment recorded successfully.');
      return result;
    } catch (err: any) {
      console.error('[Payments] Error recording credit payment:', err.message);
      return { success: false, message: err.message };
    }
  });
}
