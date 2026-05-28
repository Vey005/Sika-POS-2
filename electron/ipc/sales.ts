import { ipcMain } from 'electron';
import { getDb } from '../db/database';
import { depleteStockFEFO, restoreStockFromDepletions } from '../db/batch-helpers';

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

/** SQLite-friendly local timestamp (matches `datetime('now')` storage). */
function toSqliteLocalDatetime(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const SHIFT_SALE_STATUSES = "('completed', 'debt')";

/** Valid persisted customer PK (0 and NaN are rejected — 0 was used as a manual-name placeholder). */
function resolveCustomerId(customerId: unknown): number | null {
  const id = typeof customerId === 'number' ? customerId : parseInt(String(customerId ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
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
      cart_key?: string;
      product_id: number;
      product_name: string;
      product_barcode?: string;
      product_size?: string;
      category: string;
      quantity: number;
      sale_unit?: 'single' | 'pack';
      unit_multiplier?: number;
      unit_price: number;
      adjusted_price?: number;
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
    split_cash?: number;
    split_momo?: number;
  }) => {
    // ── Input Validation ──
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('Transaction must contain at least one item.');
    }
    
    // Apply adjusted prices to unit_price before processing
    for (const item of data.items) {
      if (item.adjusted_price !== undefined) {
        item.unit_price = item.adjusted_price;
      }
    }

    if (!data.cashier_name || typeof data.cashier_name !== 'string') {
      throw new Error('Cashier name is required.');
    }
    const validPaymentMethods = ['cash', 'momo', 'credit', 'split'];
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
      const unitsToDeduct = item.quantity * Math.max(1, Number(item.unit_multiplier || 1));
      // Allow negative stock to support "Proceed anyway" flow and real-world POS usage
      // if (product.stock_qty < unitsToDeduct) {
      //   throw new Error(`Insufficient stock for "${item.product_name}". Available: ${product.stock_qty}.`);
      // }
    }

    for (const item of data.items) {
      if (!item.product_name || typeof item.product_name !== 'string') {
        throw new Error('Each item must have a product name.');
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        throw new Error(`Invalid quantity for "${item.product_name}". Must be a positive number.`);
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

    if (data.payment_method === 'split') {
      if (typeof data.split_cash !== 'number' || typeof data.split_momo !== 'number' || data.split_cash < 0 || data.split_momo < 0) {
        throw new Error('Both Cash and MoMo amounts are required and must be non-negative for a split payment.');
      }
      data.amount_tendered = data.split_cash + data.split_momo;
      if (data.amount_tendered < grandTotal) {
        throw new Error(`Amount tendered (${data.amount_tendered}) is less than the total due (${grandTotal}).`);
      }
    } else if (data.payment_method !== 'credit') {
      if (typeof data.amount_tendered !== 'number' || data.amount_tendered < 0) {
        throw new Error('Amount tendered is required and must be a non-negative number for cash and momo payments.');
      }
      if (data.amount_tendered < grandTotal) {
        throw new Error(`Amount tendered (${data.amount_tendered}) is less than the total due (${grandTotal}).`);
      }
    } else {
      const creditCustomerId = resolveCustomerId(data.customer_id);
      if (!creditCustomerId) {
        throw new Error('Customer selection is required for credit sales.');
      }
      data.customer_id = creditCustomerId;

      const customer = db.prepare('SELECT credit_balance, credit_limit FROM customers WHERE id = ?').get(creditCustomerId) as { credit_balance: number; credit_limit: number } | undefined;
      if (!customer) {
        throw new Error('Customer not found. Please select a registered customer for credit sales.');
      }
      const creditLimit = Number(customer.credit_limit) || 0;
      const creditBalance = Number(customer.credit_balance) || 0;
      if (creditLimit > 0) {
        const projectedBalance = round2(creditBalance + grandTotal);
        if (projectedBalance > creditLimit + 0.001) {
          throw new Error(`Credit limit exceeded. Current balance: GHS ${creditBalance.toFixed(2)}, Limit: GHS ${creditLimit.toFixed(2)}, This sale: GHS ${grandTotal.toFixed(2)}, Projected: GHS ${projectedBalance.toFixed(2)}`);
        }
      }
    }

    const isCredit = data.payment_method === 'credit';
    const storedAmountTendered = isCredit ? 0 : round2(data.amount_tendered ?? grandTotal);
    const changeGiven = isCredit
      ? 0
      : round2(Math.max(0, (data.amount_tendered || grandTotal) - grandTotal));
    const receiptNumber = generateReceiptNumber(db);

    // Atomic transaction
    const createTx = db.transaction(() => {
      let customerCreditBalanceAfter: number | undefined;
      const status = data.payment_method === 'credit' ? 'debt' : 'completed';
      const paidAmount = data.payment_method === 'credit' ? 0 : grandTotal;

      const txResult = db.prepare(`
        INSERT INTO transactions (
          receipt_number, customer_id, customer_name, cashier_name, status, payment_method,
          subtotal, discount_amount, discount_type, tax_vat, tax_nhil, tax_getfund, tax_covid,
          total_tax, grand_total, amount_tendered, change_given, momo_reference, paid_amount,
          split_cash, split_momo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receiptNumber, data.customer_id || null, data.customer_name || null,
        data.cashier_name || 'Cashier', status, data.payment_method,
        round2(subtotal), round2(data.discount_amount || 0), data.discount_type || null,
        tax.vat, tax.nhil, tax.getfund, tax.covid,
        tax.totalTax, grandTotal,
        storedAmountTendered, changeGiven,
        data.momo_reference || null, paidAmount,
        data.split_cash || 0, data.split_momo || 0
      );

      const transactionId = Number(txResult.lastInsertRowid);

      // Insert items and deduct stock
      for (const item of data.items) {
        db.prepare(`
          INSERT INTO transaction_items (
            transaction_id, product_id, product_name, product_barcode, product_size, category,
            quantity, unit_price, cost_price, line_total, tax_category, sale_unit, unit_multiplier
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          transactionId, item.product_id || null, item.product_name,
          item.product_barcode || null, item.product_size || null, item.category || 'General',
          item.quantity, item.unit_price, item.cost_price || 0,
          round2(item.unit_price * item.quantity), item.tax_category || 'standard',
          item.sale_unit || 'single',
          Math.max(1, Number(item.unit_multiplier || 1))
        );

        // Deduct stock if it's an inventory item — FEFO batch depletion
        if (item.product_id && item.is_inventory === 1) {
          const prodInfo = db.prepare(`SELECT stock_unit FROM products WHERE id = ?`).get(item.product_id) as { stock_unit: string } | undefined;
          const stockUnit = prodInfo?.stock_unit || 'single';

          let unitsToDeduct = 0;
          if (stockUnit === 'pack') {
            if (item.sale_unit === 'pack') {
              unitsToDeduct = item.quantity;
            } else {
              unitsToDeduct = 0; // Selling singles doesn't deduct from box count
            }
          } else {
            unitsToDeduct = item.quantity * Math.max(1, Number(item.unit_multiplier || 1));
          }

          if (unitsToDeduct > 0) {
            // Deplete from earliest-expiring batch first (FEFO)
            // Pass transactionId so we can record which batches were depleted
            depleteStockFEFO(db, item.product_id, unitsToDeduct, transactionId);

            // Push updated product to sync queue (priority 5 for products)
            const updatedProduct = db.prepare(`SELECT * FROM products WHERE id = ?`).get(item.product_id);
            db.prepare(`
              INSERT INTO sync_queue (entity, operation, payload, status, priority)
              VALUES ('product', 'update', ?, 'pending', 5)
            `).run(JSON.stringify(updatedProduct));
          }
        }
      }

      const saleCustomerId = resolveCustomerId(data.customer_id);
      if (saleCustomerId) {
        data.customer_id = saleCustomerId;
        if (data.payment_method === 'credit') {
          db.prepare(`
            UPDATE customers SET credit_balance = credit_balance + ?, total_spent = total_spent + ?, loyalty_points = loyalty_points + ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(grandTotal, grandTotal, Math.floor(grandTotal), data.customer_id);
          db.prepare(`
            INSERT INTO credit_log (customer_id, transaction_id, amount, type, note)
            VALUES (?, ?, ?, 'credit_sale', 'Sale on credit')
          `).run(data.customer_id, transactionId, grandTotal);
        } else {
          db.prepare(`
            UPDATE customers SET total_spent = total_spent + ?, loyalty_points = loyalty_points + ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(grandTotal, Math.floor(grandTotal), data.customer_id);
        }

        // Push updated customer to sync queue
        const updatedCustomer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(data.customer_id);
        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('customer', 'update', ?, 'pending', 5)
        `).run(JSON.stringify({ ...updatedCustomer as object, local_id: data.customer_id }));
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
        status: status,
        subtotal: round2(subtotal),
        discount_amount: round2(data.discount_amount || 0),
        tax: tax,
        grand_total: grandTotal,
        amount_tendered: storedAmountTendered,
        change_given: changeGiven,
        paid_amount: paidAmount,
        split_cash: data.split_cash || 0,
        split_momo: data.split_momo || 0,
        created_at: txCreatedAt,
        items: data.items.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          category: i.category || 'General',
          quantity: i.quantity,
          sale_unit: i.sale_unit || 'single',
          unit_multiplier: Math.max(1, Number(i.unit_multiplier || 1)),
          unit_price: i.unit_price,
          line_total: round2(i.unit_price * i.quantity)
        }))
      });

      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('transaction', 'create', ?, 'pending', 1)
      `).run(syncPayload);

      if (data.customer_id && data.payment_method === 'credit') {
        const bal = db
          .prepare('SELECT credit_balance FROM customers WHERE id = ?')
          .get(data.customer_id) as { credit_balance: number } | undefined;
        if (bal) customerCreditBalanceAfter = round2(bal.credit_balance);
      }

      return {
        id: transactionId,
        receiptNumber,
        grandTotal,
        changeGiven,
        paymentMethod: data.payment_method,
        amountTendered: storedAmountTendered,
        status,
        paidAmount,
        tax,
        customerName: data.customer_name,
        ...(typeof customerCreditBalanceAfter === 'number'
          ? { customerCreditBalanceAfter }
          : {}),
      };
    });

    return createTx();
  });

  ipcMain.handle('sales:getAll', (_event, filters?: { from?: string; to?: string; status?: string; cashier_name?: string }) => {
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
    if (filters?.cashier_name) { wheres.push("t.cashier_name = ?"); params.push(filters.cashier_name); }

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

      // 1. Restore stock — restore to exact original batches
      for (const item of items) {
        if (item.product_id) {
          const prodInfo = db.prepare(`SELECT stock_unit FROM products WHERE id = ?`).get(item.product_id) as { stock_unit: string } | undefined;
          const stockUnit = prodInfo?.stock_unit || 'single';

          let unitsToRestore = 0;
          if (stockUnit === 'pack') {
            if (item.sale_unit === 'pack') {
              unitsToRestore = item.quantity;
            }
          } else {
            unitsToRestore = item.quantity * Math.max(1, Number(item.unit_multiplier || 1));
          }

          if (unitsToRestore > 0) {
            // Restore to the exact batches that were depleted during this transaction
            restoreStockFromDepletions(db, id, item.product_id, unitsToRestore);
          }
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
            VALUES (?, ?, ?, 'void', ?)
          `).run(tx.customer_id, id, tx.grand_total, `Transaction voided: ${reason}`);
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
      const updatedTx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as any;
      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('transaction', 'update', ?, 'pending', 1)
      `).run(JSON.stringify({
        id,
        receipt_number: updatedTx?.receipt_number ?? tx.receipt_number,
        status: newStatus,
        reason,
        void_reason: reason,
        paid_amount: 0,
        updated_at: updatedTx?.updated_at ?? new Date().toISOString(),
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  ipcMain.handle('sales:getSummary', (_event, filters?: { from?: string; to?: string; cashier_name?: string }) => {
    let sql = `
      SELECT
        COUNT(*) as transaction_count,
        COALESCE(SUM(paid_amount), 0) as total_revenue,
        COALESCE(AVG(paid_amount), 0) as avg_basket,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total WHEN payment_method = 'split' THEN split_cash - change_given ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN grand_total WHEN payment_method = 'split' THEN split_momo ELSE 0 END), 0) as momo_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN grand_total ELSE 0 END), 0) as card_total,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total - paid_amount ELSE 0 END), 0) as credit_issued_total
      FROM transactions
      WHERE status IN ('completed', 'debt') AND (status != 'voided' AND status != 'reversed')
    `;
    const params: string[] = [];
    
    // If no filters provided, default to today's transactions
    if (!filters || (!filters.from && !filters.to)) {
      sql += " AND created_at >= date('now', 'start of day')";
    } else {
      // Apply explicit date range if provided
      if (filters.from) {
        sql += " AND created_at >= ?";
        params.push(`${filters.from} 00:00:00`);
      }
      if (filters.to) {
        sql += " AND created_at <= ?";
        params.push(`${filters.to} 23:59:59`);
      }
    }

    if (filters?.cashier_name) {
      sql += " AND cashier_name = ?";
      params.push(filters.cashier_name);
    }

    const summary = db.prepare(sql).get(...params) as any;
    
    // Revenue calculation internals — no debug logging for privacy

    // 1. Get payments for the current period (must match transaction filter logic)
    let paymentSql = `SELECT COALESCE(SUM(amount), 0) as total FROM credit_payments`;
    const paymentParams: string[] = [];
    
    if (!filters || (!filters.from && !filters.to)) {
      paymentSql += " WHERE created_at >= date('now', 'start of day')";
    } else {
      if (filters.from) {
        paymentSql += " WHERE created_at >= ?";
        paymentParams.push(`${filters.from} 00:00:00`);
      }
      if (filters.to) {
        paymentSql += filters.from ? " AND created_at <= ?" : " WHERE created_at <= ?";
        paymentParams.push(`${filters.to} 23:59:59`);
      }
    }
    
    const payments = db.prepare(paymentSql).get(...paymentParams) as { total: number };

    // 2. Revenue Recognition
    // total_revenue now uses paid_amount column which attributes revenue to the original date of sale.
    // realizedSales and total_revenue are effectively the same in this model.
    summary.total_revenue = Number(summary.total_revenue) || 0;
    summary.debt_recovered = Number(payments.total) || 0;

    // Credit for THIS period: use the date-filtered credit_issued_total from the SQL query
    // This shows credit issued during the selected date range, not all-time debt
    summary.credit_total = Number(summary.credit_issued_total) || 0;

    // Outstanding credit: Total all-time customer debt (separate field for display)
    const totalDebtResult = db.prepare("SELECT COALESCE(SUM(credit_balance), 0) as total FROM customers").get() as { total: number };
    summary.outstanding_credit = Number(totalDebtResult.total) || 0;

    console.log('[Sales] Revenue summary calculated.');

    return summary;
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
    console.log('[Sales] Generating daily report.');
    try {
      const summary = db.prepare(`
        SELECT
          COUNT(*) as transaction_count,
          COALESCE(SUM(paid_amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total WHEN payment_method = 'split' THEN split_cash - change_given ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN grand_total WHEN payment_method = 'split' THEN split_momo ELSE 0 END), 0) as momo_total,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN grand_total ELSE 0 END), 0) as card_total,
          COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total - paid_amount ELSE 0 END), 0) as credit_total
        FROM transactions
        WHERE status IN ('completed', 'debt')
          AND created_at LIKE ?
      `).get(`${date}%`) as any;

      const payments = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM credit_payments
        WHERE created_at LIKE ?
      `).get(`${date}%`) as { total: number };

      const totalOutstanding = db.prepare(`SELECT COALESCE(SUM(credit_balance), 0) as total FROM customers`).get() as { total: number };

      if (summary) {
        summary.debt_recovered = payments.total;
        summary.credit_total = totalOutstanding.total;
        // Total revenue is now correctly attributed via paid_amount column
        summary.total_revenue = Number(summary.total_revenue) || 0;
      }

      // Get transactions
      const transactions = db.prepare(`
        SELECT id, receipt_number, created_at, grand_total, paid_amount, payment_method, status
        FROM transactions
        WHERE status IN ('completed', 'debt')
          AND created_at LIKE ?
        ORDER BY created_at ASC
      `).all(`${date}%`) as any[];

      // Attach items to each transaction
      const getItems = db.prepare(`
        SELECT product_name, product_size, quantity, unit_price, line_total,
               sale_unit, unit_multiplier
        FROM transaction_items
        WHERE transaction_id = ?
      `);

      for (const tx of transactions) {
        tx.items = getItems.all(tx.id);
      }

      // Flat item summary: total **stock units** (singles) sold per product — boxes count as qty × unit_multiplier
      const itemSummary = db.prepare(`
        SELECT 
          ti.product_name,
          ti.product_size,
          SUM(ti.quantity * MAX(1, COALESCE(ti.unit_multiplier, 1))) as total_qty
        FROM transaction_items ti
        INNER JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.status IN ('completed', 'debt')
          AND t.created_at LIKE ?
        GROUP BY ti.product_name, ti.product_size
        ORDER BY total_qty DESC
      `).all(`${date}%`);

      console.log(`[Sales] Daily report generated: ${transactions.length} transactions.`);
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
    const endTime = clockOut || toSqliteLocalDatetime();

    const transactions = db.prepare(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.id) as item_count
      FROM transactions t
      WHERE t.cashier_name = ?
        AND t.created_at >= ?
        AND t.created_at <= ?
        AND t.status IN ${SHIFT_SALE_STATUSES}
      ORDER BY t.created_at DESC
    `).all(cashierName, clockIn, endTime) as Array<{ id: number } & Record<string, unknown>>;

    let transactionsWithItems = transactions;
    if (transactions.length > 0) {
      const txIds = transactions.map((t) => t.id);
      const placeholders = txIds.map(() => '?').join(',');
      const items = db
        .prepare(
          `SELECT * FROM transaction_items WHERE transaction_id IN (${placeholders}) ORDER BY transaction_id, id`
        )
        .all(...txIds) as Array<Record<string, unknown> & { transaction_id: number }>;
      const itemsByTx = new Map<number, typeof items>();
      for (const item of items) {
        const list = itemsByTx.get(item.transaction_id) || [];
        list.push(item);
        itemsByTx.set(item.transaction_id, list);
      }
      transactionsWithItems = transactions.map((t) => ({
        ...t,
        items: itemsByTx.get(t.id) || [],
      }));
    }

    const itemSummary = db
      .prepare(
        `
      SELECT 
        ti.product_name,
        ti.product_size,
        SUM(
          CASE 
            WHEN LOWER(COALESCE(ti.sale_unit, '')) = 'pack' 
            THEN ti.quantity * COALESCE(NULLIF(ti.unit_multiplier, 0), 1)
            ELSE ti.quantity
          END
        ) as total_qty
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.cashier_name = ?
        AND t.created_at >= ?
        AND t.created_at <= ?
        AND t.status IN ${SHIFT_SALE_STATUSES}
      GROUP BY ti.product_name, ti.product_size
      ORDER BY total_qty DESC
    `
      )
      .all(cashierName, clockIn, endTime);

    const summary = db.prepare(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(paid_amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total WHEN payment_method = 'split' THEN split_cash - change_given ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN grand_total WHEN payment_method = 'split' THEN split_momo ELSE 0 END), 0) as momo_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN grand_total ELSE 0 END), 0) as card_total,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total - paid_amount ELSE 0 END), 0) as credit_total
      FROM transactions
      WHERE cashier_name = ?
        AND created_at >= ?
        AND created_at <= ?
        AND status IN ${SHIFT_SALE_STATUSES}
    `).get(cashierName, clockIn, endTime) as any;

    const payments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM credit_payments
      WHERE created_at >= ? AND created_at <= ?
      -- Note: credit_payments currently doesn't store cashier_name, 
      -- but we can filter by time which is usually sufficient for a shift
    `).get(clockIn, endTime) as { total: number };

    if (summary) {
      summary.debt_recovered = payments.total || 0;
    }

    return { transactions: transactionsWithItems, summary, itemSummary };
  });
}
