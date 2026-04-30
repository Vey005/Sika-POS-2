import { ipcMain } from 'electron';
import { getDb } from '../db/database';

// Ghana Tax Rates 2024
const GHANA_TAX = {
  VAT_RATE: 0.125,      // 12.5%
  NHIL_RATE: 0.025,     // 2.5%
  GETFUND_RATE: 0.025,  // 2.5%
  COVID_RATE: 0.01,     // 1.0%
};

export interface TaxBreakdown {
  subtotal: number;
  vat: number;
  nhil: number;
  getfund: number;
  covid: number;
  totalTax: number;
  grandTotal: number;
}

export function calculateGhanaTax(subtotal: number, taxCategory: string): TaxBreakdown {
  if (taxCategory === 'zero_rated' || taxCategory === 'exempt' || subtotal <= 0) {
    return {
      subtotal,
      vat: 0, nhil: 0, getfund: 0, covid: 0,
      totalTax: 0,
      grandTotal: subtotal,
    };
  }

  // Tax-exclusive calculation (tax applied on top of subtotal)
  const vat = subtotal * GHANA_TAX.VAT_RATE;
  const nhil = subtotal * GHANA_TAX.NHIL_RATE;
  const getfund = subtotal * GHANA_TAX.GETFUND_RATE;
  const covid = subtotal * GHANA_TAX.COVID_RATE;
  const totalTax = vat + nhil + getfund + covid;

  return {
    subtotal,
    vat: round2(vat),
    nhil: round2(nhil),
    getfund: round2(getfund),
    covid: round2(covid),
    totalTax: round2(totalTax),
    grandTotal: round2(subtotal + totalTax),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function generateReceiptNumber(db: ReturnType<typeof getDb>): string {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const countResult = db.prepare(`
    SELECT COUNT(*) FROM transactions
    WHERE created_at >= date('now', 'start of day')
  `).pluck().get() as number;
  const seq = String(countResult + 1).padStart(4, '0');
  return `SP-${dateStr}-${seq}`;
}

export function registerSalesHandlers() {
  const db = getDb();

  ipcMain.handle('sales:create', (_event, data: {
    items: Array<{
      product_id: number;
      product_name: string;
      product_barcode?: string;
      product_size?: string;
      category: string;
      quantity: number;
      unit_price: number;
      cost_price: number;
      is_inventory: number;
      tax_category: string;
    }>;
    customer_id?: number;
    customer_name?: string;
    cashier_name: string;
    payment_method: string;
    discount_amount: number;
    discount_type?: string;
    amount_tendered: number;
    momo_reference?: string;
    order_type?: string;
    order_note?: string;
  }) => {
    // ── Input Validation ──
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('Transaction must contain at least one item.');
    }
    if (!data.cashier_name || typeof data.cashier_name !== 'string') {
      throw new Error('Cashier name is required.');
    }
    const validPaymentMethods = ['cash', 'momo', 'card', 'credit'];
    if (!validPaymentMethods.includes(data.payment_method)) {
      throw new Error(`Invalid payment method: ${data.payment_method}`);
    }
    if (typeof data.discount_amount !== 'number') {
      data.discount_amount = 0;
    }
    if (data.discount_amount < 0) {
      throw new Error('Discount cannot be negative.');
    }

    const inventoryItems = data.items.filter(item => item.product_id && item.is_inventory === 1);
    const productStmt = db.prepare(`SELECT id, stock_qty FROM products WHERE id = ?`);
    for (const item of inventoryItems) {
      const product = productStmt.get(item.product_id) as { id: number; stock_qty: number } | undefined;
      if (!product) {
        throw new Error(`Inventory product not found: ${item.product_name} (ID ${item.product_id})`);
      }
      if (product.stock_qty < item.quantity) {
        throw new Error(`Insufficient stock for "${item.product_name}". Available: ${product.stock_qty}.`);
      }
    }

    for (const item of data.items) {
      if (!item.product_name || typeof item.product_name !== 'string') {
        throw new Error('Each item must have a product name.');
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        throw new Error(`Invalid quantity for "${item.product_name}". Must be a positive integer.`);
      }
      if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
        throw new Error(`Invalid price for "${item.product_name}". Must be a non-negative number.`);
      }
    }
    if (typeof data.discount_amount === 'number' && data.discount_amount < 0) {
      throw new Error('Discount cannot be negative.');
    }

    // Calculate totals
    const subtotal = data.items.reduce((s, item) => s + item.unit_price * item.quantity, 0);
    const discountedSubtotal = Math.max(0, subtotal - (data.discount_amount || 0));

    // Calculate tax on all standard items
    const standardSubtotal = data.items
      .filter(i => i.tax_category === 'standard')
      .reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const adjustedStandardSubtotal = standardSubtotal * (discountedSubtotal / (subtotal || 1));

    const tax = calculateGhanaTax(round2(adjustedStandardSubtotal), 'standard');
    const grandTotal = round2(discountedSubtotal + tax.totalTax);

    if (data.payment_method !== 'credit') {
      if (typeof data.amount_tendered !== 'number' || data.amount_tendered < 0) {
        throw new Error('Amount tendered is required and must be a non-negative number for cash, momo, and card payments.');
      }
      if (data.amount_tendered < grandTotal) {
        throw new Error(`Amount tendered (${data.amount_tendered}) is less than the total due (${grandTotal}).`);
      }
    } else if (!data.customer_id) {
      throw new Error('Customer selection is required for credit sales.');
    }

    const changeGiven = round2(Math.max(0, (data.amount_tendered || grandTotal) - grandTotal));
    const receiptNumber = generateReceiptNumber(db);

    // Atomic transaction
    const createTx = db.transaction(() => {
      const txResult = db.prepare(`
        INSERT INTO transactions (
          receipt_number, customer_id, customer_name, cashier_name, status, payment_method,
          subtotal, discount_amount, discount_type, tax_vat, tax_nhil, tax_getfund, tax_covid,
          total_tax, grand_total, amount_tendered, change_given, momo_reference
        ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receiptNumber, data.customer_id || null, data.customer_name || null,
        data.cashier_name || 'Cashier', data.payment_method,
        round2(subtotal), round2(data.discount_amount || 0), data.discount_type || null,
        tax.vat, tax.nhil, tax.getfund, tax.covid,
        tax.totalTax, grandTotal,
        round2(data.amount_tendered || grandTotal), changeGiven,
        data.momo_reference || null
      );

      const transactionId = txResult.lastInsertRowid as number;

      // Insert items and deduct stock
      for (const item of data.items) {
        db.prepare(`
          INSERT INTO transaction_items (transaction_id, product_id, product_name, product_barcode, product_size, category, quantity, unit_price, cost_price, line_total, tax_category)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          transactionId, item.product_id || null, item.product_name,
          item.product_barcode || null, item.product_size || null, item.category || 'General',
          item.quantity, item.unit_price, item.cost_price || 0,
          round2(item.unit_price * item.quantity), item.tax_category || 'standard'
        );

        // Deduct stock if it's an inventory item
        if (item.product_id && item.is_inventory === 1) {
          db.prepare(`
            UPDATE products SET stock_qty = stock_qty - ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(item.quantity, item.product_id);

          // Push updated product to sync queue (priority 5 for products)
          const updatedProduct = db.prepare(`SELECT * FROM products WHERE id = ?`).get(item.product_id);
          db.prepare(`
            INSERT INTO sync_queue (entity, operation, payload, status, priority)
            VALUES ('product', 'update', ?, 'pending', 5)
          `).run(JSON.stringify(updatedProduct));
        }
      }

      // Update customer stats
      if (data.customer_id) {
        if (data.payment_method === 'credit') {
          db.prepare(`
            UPDATE customers SET credit_balance = credit_balance + ?, total_spent = total_spent + ?, loyalty_points = loyalty_points + ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(grandTotal, grandTotal, Math.floor(grandTotal), data.customer_id);
          db.prepare(`
            INSERT INTO credit_log (customer_id, transaction_id, amount, type, note)
            VALUES (?, ?, ?, 'credit', 'Sale on credit')
          `).run(data.customer_id, transactionId, grandTotal);
        } else {
          db.prepare(`
            UPDATE customers SET total_spent = total_spent + ?, loyalty_points = loyalty_points + ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(grandTotal, Math.floor(grandTotal), data.customer_id);
        }
      }

      // Get the actual transaction timestamp from database
      const txRecord = db.prepare(`SELECT created_at FROM transactions WHERE id = ?`).get(transactionId) as {created_at: string};
      const txCreatedAt = txRecord?.created_at || new Date().toISOString();

      // Queue for offline sync
      const syncPayload = JSON.stringify({
        id: transactionId,
        receipt_number: receiptNumber,
        customer_id: data.customer_id,
        customer_name: data.customer_name || null,
        cashier_name: data.cashier_name,
        payment_method: data.payment_method,
        subtotal: round2(subtotal),
        discount_amount: round2(data.discount_amount || 0),
        tax: tax,
        grand_total: grandTotal,
        amount_tendered: round2(data.amount_tendered || grandTotal),
        change_given: changeGiven,
        created_at: txCreatedAt,
        items: data.items.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          category: i.category || 'General',
          quantity: i.quantity,
          unit_price: i.unit_price,
          line_total: round2(i.unit_price * i.quantity)
        }))
      });

      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('transaction', 'create', ?, 'pending', 1)
      `).run(syncPayload);

      return { id: transactionId, receiptNumber, grandTotal, changeGiven, tax, customerName: data.customer_name };
    });

    return createTx();
  });

  ipcMain.handle('sales:getAll', (_event, filters?: { from?: string; to?: string; status?: string }) => {
    let sql = `
      SELECT t.*, COUNT(ti.id) as item_count
      FROM transactions t
      LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
    `;
    const params: (string | number)[] = [];
    const wheres: string[] = [];

    if (filters?.from) { wheres.push("t.created_at >= ?"); params.push(`${filters.from} 00:00:00`); }
    if (filters?.to) { wheres.push("t.created_at <= ?"); params.push(`${filters.to} 23:59:59`); }
    if (filters?.status) { wheres.push("t.status = ?"); params.push(filters.status); }

    if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`;
    sql += ` GROUP BY t.id ORDER BY t.created_at DESC LIMIT 200`;

    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('sales:getById', (_event, id: number) => {
    const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id);
    const items = db.prepare(`SELECT * FROM transaction_items WHERE transaction_id = ?`).all(id);
    return { ...tx as object, items };
  });

  ipcMain.handle('sales:void', (_event, id: number, reason: string) => {
    const db = getDb();
    return handleTransactionStatusChange(db, id, 'voided', reason);
  });

  ipcMain.handle('sales:reverse', (_event, id: number, reason: string) => {
    const db = getDb();
    return handleTransactionStatusChange(db, id, 'reversed', reason);
  });

  function handleTransactionStatusChange(db: any, id: number, newStatus: string, reason: string) {
    try {
      const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id);
      if (!tx) {
        console.error(`[DB] Transaction ${id} not found`);
        return { success: false, message: 'Invalid transaction' };
      }
      
      const items = db.prepare(`SELECT * FROM transaction_items WHERE transaction_id = ?`).all(id) as any[];
      console.log(`[DB] Restoring stock for ${items.length} items`);

      // 1. Restore stock
      for (const item of items) {
        if (item.product_id) {
          db.prepare(`UPDATE products SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?`)
            .run(item.quantity, item.product_id);
        }
      }

      // 2. Reverse customer stats
      if (tx.customer_id) {
        console.log(`[DB] Reversing stats for customer ${tx.customer_id}`);
        if (tx.payment_method === 'credit') {
          db.prepare(`
            UPDATE customers SET
              credit_balance = MAX(0, credit_balance - ?),
              total_spent = MAX(0, total_spent - ?),
              loyalty_points = MAX(0, loyalty_points - ?),
              updated_at = datetime('now')
            WHERE id = ?
          `).run(tx.grand_total, tx.grand_total, Math.floor(tx.grand_total), tx.customer_id);

          db.prepare(`
            INSERT INTO credit_log (customer_id, transaction_id, amount, type, note)
            VALUES (?, ?, ?, 'payment', ?)
          `).run(tx.customer_id, id, tx.grand_total, `Transaction ${newStatus}: ${reason}`);
        } else {
          db.prepare(`
            UPDATE customers SET
              total_spent = MAX(0, total_spent - ?),
              loyalty_points = MAX(0, loyalty_points - ?),
              updated_at = datetime('now')
            WHERE id = ?
          `).run(tx.grand_total, Math.floor(tx.grand_total), tx.customer_id);
        }
      }

      // 3. Update transaction status
      db.prepare(`UPDATE transactions SET status = ?, void_reason = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(newStatus, reason, id);

      // 4. Queue for sync (priority 1 for transactions)
      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('transaction', 'update', ?, 'pending', 1)
      `).run(JSON.stringify({ id, status: newStatus, reason }));

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  ipcMain.handle('sales:getSummary', (_event, filters?: { from?: string; to?: string }) => {
    let sql = `
      SELECT
        COUNT(*) as transaction_count,
        COALESCE(SUM(grand_total), 0) as total_revenue,
        COALESCE(AVG(grand_total), 0) as avg_basket,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN grand_total ELSE 0 END), 0) as momo_total,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total ELSE 0 END), 0) as credit_total
      FROM transactions
      WHERE status = 'completed'
    `;
    const params: string[] = [];
    
    if (filters?.from) {
      sql += " AND created_at >= ?";
      params.push(`${filters.from} 00:00:00`);
    } else if (!filters?.to) {
      // Default to today if no range provided
      sql += " AND created_at >= date('now', 'start of day')";
    }

    if (filters?.to) {
      sql += " AND created_at <= ?";
      params.push(`${filters.to} 23:59:59`);
    }

    return db.prepare(sql).get(...params);
  });

  ipcMain.handle('sales:getRecentTransactions', (_event, limit: number) => {
    return db.prepare(`
      SELECT t.*, COUNT(ti.id) as item_count
      FROM transactions t
      LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC LIMIT ?
    `).all(limit || 10);
  });

  ipcMain.handle('sales:getDailyReportData', (_event, date: string) => {
    console.log(`[IPC] Fetching daily report data for date: ${date}`);
    try {
      const summary = db.prepare(`
        SELECT
          COUNT(*) as transaction_count,
          COALESCE(SUM(grand_total), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN grand_total ELSE 0 END), 0) as momo_total,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN grand_total ELSE 0 END), 0) as card_total,
          COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total ELSE 0 END), 0) as credit_total
        FROM transactions
        WHERE status = 'completed'
          AND created_at LIKE ?
      `).get(`${date}%`);

      // Get transactions
      const transactions = db.prepare(`
        SELECT id, receipt_number, created_at, grand_total, payment_method
        FROM transactions
        WHERE status = 'completed'
          AND created_at LIKE ?
        ORDER BY created_at ASC
      `).all(`${date}%`) as any[];

      // Attach items to each transaction
      const getItems = db.prepare(`
        SELECT product_name, product_size, quantity, unit_price, line_total
        FROM transaction_items
        WHERE transaction_id = ?
      `);

      for (const tx of transactions) {
        tx.items = getItems.all(tx.id);
      }

      // Flat item summary: total qty sold per product across all transactions
      const itemSummary = db.prepare(`
        SELECT 
          ti.product_name,
          ti.product_size,
          SUM(ti.quantity) as total_qty
        FROM transaction_items ti
        INNER JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at LIKE ?
        GROUP BY ti.product_name, ti.product_size
        ORDER BY total_qty DESC
      `).all(`${date}%`);

      console.log(`[IPC] Found ${transactions.length} transactions for ${date}`);
      return { summary, transactions, itemSummary };
    } catch (err: any) {
      console.error(`[IPC] Error fetching report data for ${date}:`, err);
      throw err;
    }
  });

  ipcMain.handle('sales:hold', (_event, { payload, customerName }) => {
    return db.prepare(`
      INSERT INTO held_sales (payload, customer_name) VALUES (?, ?)
    `).run(JSON.stringify(payload), customerName || 'Walk-in');
  });

  ipcMain.handle('sales:getHeld', (_event) => {
    return db.prepare(`SELECT * FROM held_sales ORDER BY created_at DESC`).all();
  });

  ipcMain.handle('sales:deleteHeld', (_event, id: number) => {
    return db.prepare(`DELETE FROM held_sales WHERE id = ?`).run(id);
  });

  // Shift summary: get all transactions by a specific cashier during a time window
  ipcMain.handle('sales:getByShift', (_event, params: { cashierName: string; clockIn: string; clockOut?: string }) => {
    const { cashierName, clockIn, clockOut } = params;
    const endTime = clockOut || new Date().toISOString().replace('T', ' ').slice(0, 19);

    const transactions = db.prepare(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.id) as item_count
      FROM transactions t
      WHERE t.cashier_name = ?
        AND t.created_at >= ?
        AND t.created_at <= ?
        AND t.status = 'completed'
      ORDER BY t.created_at DESC
    `).all(cashierName, clockIn, endTime);

    const summary = db.prepare(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(grand_total), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN grand_total ELSE 0 END), 0) as momo_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN grand_total ELSE 0 END), 0) as card_total,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total ELSE 0 END), 0) as credit_total
      FROM transactions
      WHERE cashier_name = ?
        AND created_at >= ?
        AND created_at <= ?
        AND status = 'completed'
    `).get(cashierName, clockIn, endTime);

    return { transactions, summary };
  });
}
