import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'sikapos.db');

  db = new Database(dbPath);

  // Performance PRAGMAs
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -32000'); // 32MB
  db.pragma('temp_store = MEMORY');
  db.pragma('synchronous = NORMAL');

  runMigrations(db);

  console.log(`[DB] Initialized at ${dbPath}`);
}

function runMigrations(db: Database.Database) {
  // Create migrations version table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = db.prepare('SELECT version FROM schema_version').pluck().all() as number[];
  const applyMigration = (version: number, sql: string) => {
    if (!applied.includes(version)) {
      console.log(`[DB] Applying migration V${version}...`);
      try {
        db.exec(sql);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
        console.log(`[DB] Migration V${String(version).padStart(3, '0')} applied successfully`);
      } catch (err: any) {
        console.error(`[DB] Migration V${version} FAILED:`, err.message);
        throw err;
      }
    } else {
      // console.log(`[DB] Migration V${version} already applied`);
    }
  };

  // V001 — Settings
  applyMigration(1, `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // V002 — Products
  applyMigration(2, `
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT UNIQUE,
      category TEXT NOT NULL DEFAULT 'General',
      unit_price REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0,
      stock_qty INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      tax_category TEXT NOT NULL DEFAULT 'standard',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_pharmacy INTEGER NOT NULL DEFAULT 0,
      expiry_date TEXT,
      batch_number TEXT,
      nafdac_number TEXT,
      unit TEXT NOT NULL DEFAULT 'each',
      image_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
  `);

  // V003 — Customers
  applyMigration(3, `
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT,
      credit_balance REAL NOT NULL DEFAULT 0,
      loyalty_points INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  `);

  // V004 — Transactions
  applyMigration(4, `
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT,
      cashier_name TEXT NOT NULL DEFAULT 'Cashier',
      status TEXT NOT NULL DEFAULT 'completed',
      payment_method TEXT NOT NULL DEFAULT 'cash',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      discount_type TEXT,
      tax_vat REAL NOT NULL DEFAULT 0,
      tax_nhil REAL NOT NULL DEFAULT 0,
      tax_getfund REAL NOT NULL DEFAULT 0,
      tax_covid REAL NOT NULL DEFAULT 0,
      total_tax REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      amount_tendered REAL NOT NULL DEFAULT 0,
      change_given REAL NOT NULL DEFAULT 0,
      momo_reference TEXT,
      void_reason TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
  `);

  // V005 — Transaction Items
  applyMigration(5, `
    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      product_barcode TEXT,
      category TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      tax_category TEXT NOT NULL DEFAULT 'standard'
    );
    CREATE INDEX IF NOT EXISTS idx_items_transaction ON transaction_items(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_items_product ON transaction_items(product_id);
  `);

  // V006 — Credit log
  applyMigration(6, `
    CREATE TABLE IF NOT EXISTS credit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      transaction_id INTEGER REFERENCES transactions(id),
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'credit',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_credit_log_customer ON credit_log(customer_id);
    CREATE INDEX IF NOT EXISTS idx_credit_log_transaction ON credit_log(transaction_id);
  `);

  // V017 — Credit Log Transaction Types
  applyMigration(17, `
    -- Add check constraint for valid transaction types
    CREATE TRIGGER IF NOT EXISTS validate_credit_log_type
    BEFORE INSERT ON credit_log
    BEGIN
      SELECT CASE
        WHEN NEW.type NOT IN ('credit_sale', 'payment', 'void', 'refund', 'adjustment')
        THEN RAISE(ABORT, 'Invalid credit_log type')
      END;
    END;

    -- Fix existing default values
    UPDATE credit_log SET type = 'credit_sale' WHERE type = 'credit';
  `);

  // V007 — Sync Queue
  applyMigration(7, `
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
  `);

  // V008 — Users (Role-Based Access)
  applyMigration(8, `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'cashier',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // V009 — Attendance (Clock In/Out)
  applyMigration(9, `
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(created_at);
  `);

  // V010 — Held Sales (Hold/Unhold)
  applyMigration(10, `
    CREATE TABLE IF NOT EXISTS held_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      customer_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // V011 — Food Joint / Restaurant Features
  applyMigration(11, `
    ALTER TABLE transactions ADD COLUMN order_type TEXT DEFAULT 'retail';
    ALTER TABLE transactions ADD COLUMN order_note TEXT;
    ALTER TABLE held_sales ADD COLUMN order_type TEXT DEFAULT 'retail';
    ALTER TABLE held_sales ADD COLUMN order_note TEXT;
  `);

  // V012 — Inventory vs Non-Inventory items
  applyMigration(12, `
    ALTER TABLE products ADD COLUMN is_inventory INTEGER NOT NULL DEFAULT 1;
  `);

  // V013 — Product Size
  applyMigration(13, `
    ALTER TABLE products ADD COLUMN size TEXT;
  `);

  // V014 — Sync retry tracking
  applyMigration(14, `
    ALTER TABLE sync_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
  `);

  // V015 — Transaction Item Size
  applyMigration(15, `
    ALTER TABLE transaction_items ADD COLUMN product_size TEXT;
  `);

  // V016 — Sync Priority for prioritized syncing
  applyMigration(16, `
    ALTER TABLE sync_queue ADD COLUMN priority INTEGER NOT NULL DEFAULT 5;
    CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority);
    -- Update existing rows: transactions = high priority (1), products = medium (5), others = low (10)
    UPDATE sync_queue SET priority = 1 WHERE entity = 'transaction';
    UPDATE sync_queue SET priority = 5 WHERE entity = 'product';
    UPDATE sync_queue SET priority = 10 WHERE entity NOT IN ('transaction', 'product');
  `);
  // V018 — Credit Payments (Debt History)
  applyMigration(18, `
    CREATE TABLE IF NOT EXISTS credit_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cloud_id INTEGER,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_credit_payments_customer ON credit_payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_credit_payments_customer_date ON credit_payments(customer_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_payments_cloud ON credit_payments(cloud_id);
  `);

  // V019 — Ensure cloud_id column exists for payments (Safe check)
  try {
    db.exec("ALTER TABLE credit_payments ADD COLUMN cloud_id INTEGER;");
  } catch (e) {}
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_payments_cloud ON credit_payments(cloud_id);");
  if (!applied.includes(19)) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(19);
  }

  // V020 — Credit Limit per Customer
  applyMigration(20, `
    ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT 0;
    UPDATE customers SET credit_limit = 0 WHERE credit_limit IS NULL;
    CREATE INDEX IF NOT EXISTS idx_credit_payments_customer_date ON credit_payments(customer_id, created_at);
  `);

  // V021 — Revenue Realization (Paid Amount)
  applyMigration(21, `
    ALTER TABLE transactions ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0;
    
    -- Backfill existing data: 
    -- 1. All non-credit sales are fully paid
    -- 2. All credit sales marked as 'completed' are fully paid
    UPDATE transactions 
    SET paid_amount = grand_total 
    WHERE payment_method != 'credit' OR status = 'completed';
    
    -- 3. For 'debt' transactions, we'll initialize at 0 (they will be updated by new payment logic)
    UPDATE transactions 
    SET paid_amount = 0 
    WHERE payment_method = 'credit' AND status = 'debt';
  `);

  // V022 — Allow duplicate user PINs (remove UNIQUE constraint on users.pin)
  // Some shops intentionally share a PIN across multiple staff; this should not crash the app.
  applyMigration(22, `
    PRAGMA foreign_keys=OFF;

    CREATE TABLE IF NOT EXISTS users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO users_new (id, name, pin, role, created_at, updated_at)
    SELECT id, name, pin, role, created_at, updated_at FROM users;

    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;

    PRAGMA foreign_keys=ON;
  `);

  // V023 — Product pack conversion support (e.g. single vs box)
  applyMigration(23, `
    ALTER TABLE products ADD COLUMN pack_size INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN pack_price REAL;
    ALTER TABLE products ADD COLUMN pack_label TEXT DEFAULT 'Box';
    ALTER TABLE transaction_items ADD COLUMN sale_unit TEXT DEFAULT 'single';
    ALTER TABLE transaction_items ADD COLUMN unit_multiplier INTEGER NOT NULL DEFAULT 1;
  `);

  // V024 — Per-cashier sidebar visibility overrides (JSON; NULL = use shop defaults)
  applyMigration(24, `
    ALTER TABLE users ADD COLUMN cashier_nav_visibility TEXT;
  `);

  // V025 — Box/Pack based inventory tracking (count boxes instead of singles)
  applyMigration(25, `
    ALTER TABLE products ADD COLUMN stock_unit TEXT NOT NULL DEFAULT 'single';
  `);

  // V026 — Expiry alert lead time (months before expiry_date to flag product)
  applyMigration(26, `
    ALTER TABLE products ADD COLUMN expiry_alert_months INTEGER;
    INSERT OR IGNORE INTO settings (key, value) VALUES ('expiry_alert_months_default', '3');
  `);

  // --- SCHEMA HARDENING ---
  // Ensure critical columns exist even if migrations were skipped/corrupted
  const harden = (table: string, column: string, type: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      console.log(`[DB] Hardened: Added missing column ${column} to ${table}`);
    } catch (e) {
      // Column already exists, ignore
    }
  };

  harden('transactions', 'paid_amount', 'REAL NOT NULL DEFAULT 0');
  harden('transactions', 'order_type', "TEXT DEFAULT 'retail'");
  harden('products', 'is_inventory', 'INTEGER NOT NULL DEFAULT 1');
  harden('products', 'pack_size', 'INTEGER NOT NULL DEFAULT 1');
  harden('products', 'pack_price', 'REAL');
  harden('products', 'pack_label', "TEXT DEFAULT 'Box'");
  harden('customers', 'credit_limit', 'REAL DEFAULT 0');
  harden('transaction_items', 'sale_unit', "TEXT DEFAULT 'single'");
  harden('transaction_items', 'unit_multiplier', 'INTEGER NOT NULL DEFAULT 1');
  harden('users', 'cashier_nav_visibility', 'TEXT');
  harden('products', 'stock_unit', "TEXT NOT NULL DEFAULT 'single'");
  harden('products', 'expiry_alert_months', 'INTEGER');
}


