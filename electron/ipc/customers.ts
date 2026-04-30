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

  ipcMain.handle('customers:save', (_event, customer: {
    id?: number; name: string; phone?: string; email?: string; notes?: string;
  }) => {
    if (customer.id) {
      db.prepare(`
        UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, updated_at = datetime('now') WHERE id = ?
      `).run(customer.name, customer.phone || null, customer.email || null, customer.notes || null, customer.id);
      return { id: customer.id, success: true };
    } else {
      const result = db.prepare(`
        INSERT INTO customers (name, phone, email, notes) VALUES (?, ?, ?, ?)
      `).run(customer.name, customer.phone || null, customer.email || null, customer.notes || null);
      return { id: result.lastInsertRowid, success: true };
    }
  });

  ipcMain.handle('customers:addCreditPayment', (_event, customerId: number, amount: number, note: string) => {
    // Validate inputs
    if (!customerId || typeof customerId !== 'number' || customerId <= 0) {
      return { success: false, message: 'Invalid customer ID.' };
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return { success: false, message: 'Payment amount must be a positive number.' };
    }

    const tx = db.transaction(() => {
      db.prepare(`UPDATE customers SET credit_balance = MAX(0, credit_balance - ?), updated_at = datetime('now') WHERE id = ?`)
        .run(amount, customerId);
      db.prepare(`INSERT INTO credit_log (customer_id, amount, type, note) VALUES (?, ?, 'payment', ?)`)
        .run(customerId, amount, note || 'Credit payment');
    });
    tx();
    return { success: true };
  });
}
