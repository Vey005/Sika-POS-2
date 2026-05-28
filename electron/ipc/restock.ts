import { ipcMain } from 'electron';
import { getDb } from '../db/database';
import { addBatch, reverseRestockQuantity } from '../db/batch-helpers';

export interface RestockInvoiceItem {
  product_id: number;
  product_name: string;
  quantity: number;
  cost_price: number;
  expiry_date?: string;
  batch_number?: string;
}

export interface RestockInvoiceInput {
  invoice_number?: string;
  supplier_name?: string;
  notes?: string;
  is_paid?: number;
  created_by?: string;
  items: RestockInvoiceItem[];
}

export function registerRestockHandlers() {
  const db = getDb();

  // Generate a unique invoice number
  function generateInvoiceNumber(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `RST-${dateStr}-${timeStr.slice(0, 4)}-${rand}`;
  }

  // Get all invoices (summary list)
  ipcMain.handle('restock:getAll', (_event, filters?: {
    search?: string;
    limit?: number;
  }) => {
    let sql = `SELECT * FROM restock_invoices`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.search) {
      const q = `%${filters.search}%`;
      conditions.push(`(invoice_number LIKE ? OR supplier_name LIKE ? OR notes LIKE ?)`);
      params.push(q, q, q);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY created_at DESC`;

    const limit = filters?.limit || 200;
    sql += ` LIMIT ?`;
    params.push(limit);

    return db.prepare(sql).all(...params);
  });

  // Get single invoice with items
  ipcMain.handle('restock:getById', (_event, id: number) => {
    const invoice = db.prepare(`SELECT * FROM restock_invoices WHERE id = ?`).get(id);
    if (!invoice) return null;
    const items = db.prepare(`SELECT * FROM restock_invoice_items WHERE invoice_id = ? ORDER BY id`).all(id);
    return { ...invoice as any, items };
  });

  // Create invoice & apply stock via batch system
  ipcMain.handle('restock:create', (_event, input: RestockInvoiceInput) => {
    try {
      const invoiceNumber = input.invoice_number || generateInvoiceNumber();
      const items = input.items || [];

      if (items.length === 0) {
        return { success: false, message: 'No items in the invoice.' };
      }

      const totalCost = items.reduce((sum, it) => sum + (it.quantity * it.cost_price), 0);
      const totalItems = items.reduce((sum, it) => sum + it.quantity, 0);

      const createTransaction = db.transaction(() => {
        // 1. Create the invoice record
        const invoiceResult = db.prepare(`
          INSERT INTO restock_invoices (invoice_number, supplier_name, notes, is_paid, total_cost, total_items, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          invoiceNumber,
          input.supplier_name || null,
          input.notes || null,
          input.is_paid ?? 0,
          totalCost,
          totalItems,
          input.created_by || null
        );

        const invoiceId = invoiceResult.lastInsertRowid;

        // 2. Insert each item into invoice + create a batch
        const insertItem = db.prepare(`
          INSERT INTO restock_invoice_items (invoice_id, product_id, product_name, quantity, cost_price, expiry_date, batch_number, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          const batchId = addBatch(
            db,
            item.product_id,
            item.quantity,
            item.cost_price,
            item.batch_number,
            item.expiry_date
          );

          insertItem.run(
            invoiceId,
            item.product_id,
            item.product_name,
            item.quantity,
            item.cost_price,
            item.expiry_date || null,
            item.batch_number || null,
            batchId
          );
        }

        // 3. Queue product syncs for updated products
        const queueSync = db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('product', 'update', ?, 'pending', 5)
        `);
        const getProduct = db.prepare(`SELECT * FROM products WHERE id = ?`);

        for (const item of items) {
          const updated = getProduct.get(item.product_id);
          if (updated) {
            queueSync.run(JSON.stringify(updated));
          }
        }

        // 4. Queue restock invoice sync payload
        const invoicePayload = {
          invoice_number: invoiceNumber,
          supplier_name: input.supplier_name || null,
          notes: input.notes || null,
          is_paid: input.is_paid ? 1 : 0,
          total_cost: totalCost,
          total_items: totalItems,
          created_by: input.created_by || 'POS Cashier',
          created_at: new Date().toISOString(),
          items: items.map(it => ({
            product_local_id: it.product_id,
            name: it.product_name,
            quantity: it.quantity,
            cost_price: it.cost_price,
            expiry_date: it.expiry_date || null,
            batch_number: it.batch_number || null
          }))
        };

        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('restock_invoice', 'create', ?, 'pending', 6)
        `).run(JSON.stringify(invoicePayload));

        return { success: true, id: invoiceId, invoice_number: invoiceNumber };
      });

      return createTransaction();
    } catch (error: any) {
      console.error('[Restock] Create Error:', error);
      return { success: false, message: error.message };
    }
  });

  // Delete invoice and reverse stock that was added by each line
  ipcMain.handle('restock:delete', (_event, id: number) => {
    try {
      const invoice = db.prepare(`SELECT id FROM restock_invoices WHERE id = ?`).get(id) as { id: number } | undefined;
      if (!invoice) {
        return { success: false, message: 'Restock invoice not found.' };
      }

      const items = db.prepare(`
        SELECT product_id, quantity, batch_id
        FROM restock_invoice_items
        WHERE invoice_id = ?
      `).all(id) as Array<{ product_id: number; quantity: number; batch_id: number | null }>;

      const deleteTransaction = db.transaction(() => {
        const affectedProductIds = new Set<number>();

        for (const item of items) {
          reverseRestockQuantity(db, item.product_id, item.quantity, item.batch_id ?? null);
          affectedProductIds.add(item.product_id);
        }

        db.prepare(`DELETE FROM restock_invoices WHERE id = ?`).run(id);

        const queueSync = db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('product', 'update', ?, 'pending', 5)
        `);
        const getProduct = db.prepare(`SELECT * FROM products WHERE id = ?`);
        for (const productId of affectedProductIds) {
          const updated = getProduct.get(productId);
          if (updated) {
            queueSync.run(JSON.stringify(updated));
          }
        }
      });

      deleteTransaction();
      return { success: true };
    } catch (error: any) {
      console.error('[Restock] Delete Error:', error);
      return { success: false, message: error.message };
    }
  });

  // Toggle paid status
  ipcMain.handle('restock:togglePaid', (_event, id: number) => {
    try {
      db.prepare(`UPDATE restock_invoices SET is_paid = CASE WHEN is_paid = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?`).run(id);
      const updated = db.prepare(`SELECT * FROM restock_invoices WHERE id = ?`).get(id);
      return { success: true, invoice: updated };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });
}
