const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Secrets from environment
const PIN_SALT = process.env.PIN_SALT || 'sikapos-gha-pin-v1-d4nn1t3ch';
const JWT_SECRET = process.env.JWT_SECRET || 'sikapos-default-jwt-secret-change-in-production-2026';
const ADMIN_USER = process.env.PORTAL_ADMIN_USER || 'big admin';
const ADMIN_PASS_HASH = process.env.PORTAL_ADMIN_PASS_HASH || 'd6aec7ba59e18e1ad07e70889e4bab752124bfb8c394808f084595ce92cc1e6e'; // Default: SikaPosAdmin2026! (SHA256 without salt)

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: Using default JWT_SECRET. Set JWT_SECRET in production for security!');
}

function obfuscateKey(key) {
  if (!key) return 'undefined';
  if (key.length < 8) return '***';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

// Simple In-Memory Rate Limiter
const loginAttempts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const limit = 10; // max attempts
  const windowMs = 15 * 60 * 1000; // 15 minutes

  if (!loginAttempts.has(ip)) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return next();
  }

  const attempt = loginAttempts.get(ip);
  if (now - attempt.firstAttempt > windowMs) {
    attempt.count = 1;
    attempt.firstAttempt = now;
    return next();
  }

  attempt.count++;
  if (attempt.count > limit) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }
  next();
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
// (Static middleware removed from here and moved to bottom for better route priority)

// Security Headers Middleware (Relaxed for Portal Assets)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Relaxed CSP to allow fonts and data URIs
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self';");
  next();
});

// Parse helpers
function safeParse(raw) {
  let val = raw;
  for (let i = 0; i < 3; i++) {
    if (typeof val === 'string') {
      try { val = JSON.parse(val); } catch { break; }
    }
  }
  return val;
}

function parsePayload(row) {
  const val = safeParse(row.payload);
  if (!val) return null;
  
  if (Array.isArray(val)) {
    // If it's an array (like users), we can't spread it into an object easily 
    // while keeping it an array. We return the array as is.
    return val;
  }
  
  if (typeof val !== 'object') return null;
  return { ...val, received_at: row.received_at };
}

async function replicatePayloadToReplicaTables(businessId, entity, operation, payload, db) {
  // Use provided client (for transactions) or fall back to pool
  const q = db || pool;
  if (!businessId || !payload || typeof payload !== 'object') return;

  const normalizeBoolean = (value) => value === false ? false : Boolean(value);
  const localId = payload.id ?? null;
  const now = new Date().toISOString();

  switch (entity) {
    case 'product': {
      await q.query(
        `INSERT INTO products (business_id, local_id, name, barcode, category, unit_price, cost_price, stock_qty, low_stock_threshold, tax_category, is_active, is_pharmacy, expiry_date, batch_number, nafdac_number, unit, image_path, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (business_id, local_id) DO UPDATE SET
           name = EXCLUDED.name,
           barcode = EXCLUDED.barcode,
           category = EXCLUDED.category,
           unit_price = EXCLUDED.unit_price,
           cost_price = EXCLUDED.cost_price,
           stock_qty = EXCLUDED.stock_qty,
           low_stock_threshold = EXCLUDED.low_stock_threshold,
           tax_category = EXCLUDED.tax_category,
           is_active = EXCLUDED.is_active,
           is_pharmacy = EXCLUDED.is_pharmacy,
           expiry_date = EXCLUDED.expiry_date,
           batch_number = EXCLUDED.batch_number,
           nafdac_number = EXCLUDED.nafdac_number,
           unit = EXCLUDED.unit,
           image_path = EXCLUDED.image_path,
           updated_at = EXCLUDED.updated_at`,
        [
          businessId,
          localId,
          payload.name || 'Unknown Product',
          payload.barcode || null,
          payload.category || 'General',
          parseFloat(payload.unit_price || payload.price || 0),
          parseFloat(payload.cost_price || 0),
          parseInt(payload.stock_qty || payload.stock || 0),
          parseInt(payload.low_stock_threshold || 5),
          payload.tax_category || 'standard',
          normalizeBoolean(payload.is_active),
          normalizeBoolean(payload.is_pharmacy),
          payload.expiry_date ? new Date(payload.expiry_date) : null,
          payload.batch_number || null,
          payload.nafdac_number || null,
          payload.unit || 'each',
          payload.image_path || null,
          payload.created_at ? new Date(payload.created_at) : now,
          payload.updated_at ? new Date(payload.updated_at) : now
        ].map((v, i) => i === 0 ? v : v) // placeholder for potential map-based casting
      );
      return;
    }
    case 'customer': {
      await q.query(
        `INSERT INTO customers (business_id, local_id, name, phone, email, credit_balance, credit_limit, loyalty_points, total_spent, notes, created_at, updated_at)
         VALUES ($1::varchar, $2::integer, $3::varchar, $4::varchar, $5::varchar, $6::float, $7::float, $8::integer, $9::float, $10::text, $11::timestamp, $12::timestamp)
         ON CONFLICT (business_id, local_id) DO UPDATE SET
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           credit_balance = EXCLUDED.credit_balance,
           credit_limit = EXCLUDED.credit_limit,
           loyalty_points = EXCLUDED.loyalty_points,
           total_spent = EXCLUDED.total_spent,
           notes = EXCLUDED.notes,
           updated_at = EXCLUDED.updated_at`,
        [
          businessId,
          localId,
          payload.name || 'Customer',
          payload.phone || null,
          payload.email || null,
          parseFloat(payload.credit_balance || 0),
          parseFloat(payload.credit_limit || 0),
          parseInt(payload.loyalty_points || 0),
          parseFloat(payload.total_spent || 0),
          payload.notes || null,
          payload.created_at ? new Date(payload.created_at) : now,
          payload.updated_at ? new Date(payload.updated_at) : now
        ]
      );
      return;
    }
    case 'credit_payment': {
      // CRITICAL: Force a local_id to prevent NULL duplicates. 
      // If the payload is missing it, we attempt to find it or generate a stable one.
      const rawLocalId = localId || payload.local_id || payload.id;
      let localIdNum = parseInt(rawLocalId);
      
      if (!localIdNum) {
        // Fallback: Use a stable hash-like integer from amount and timestamp to prevent duplicates
        const fingerprint = `${payload.amount}_${payload.created_at}`;
        localIdNum = 0;
        for (let i = 0; i < fingerprint.length; i++) {
          localIdNum = ((localIdNum << 5) - localIdNum) + fingerprint.charCodeAt(i);
          localIdNum |= 0; 
        }
        localIdNum = Math.abs(localIdNum);
        console.warn(`[Sync] Generated stable local_id ${localIdNum} for payment with missing ID`);
      }
      
      await q.query(
        `INSERT INTO credit_payments (business_id, local_id, customer_id, amount, payment_method, note, created_at)
         VALUES ($1::varchar, $2::integer, (SELECT id FROM customers WHERE business_id=$1::varchar AND local_id=$3::integer), $4::float, $5::varchar, $6::text, $7::timestamp)
         ON CONFLICT (business_id, local_id) DO UPDATE SET
           amount = EXCLUDED.amount,
           payment_method = EXCLUDED.payment_method,
           note = EXCLUDED.note`,
        [
          businessId,
          localIdNum,
          parseInt(payload.customer_id || 0),
          parseFloat(payload.amount || 0),
          payload.payment_method || 'cash',
          payload.note || 'Credit payment',
          payload.created_at ? new Date(payload.created_at) : now
        ]
      );
      return;
    }   
    case 'business_info': {
      await q.query(
        `UPDATE licenses SET business_name = $1, business_logo = $2, business_address = $3, business_phone = $4 WHERE license_key = $5`,
        [payload.business_name, payload.business_logo, payload.business_address, payload.business_phone, businessId]
      );
      return;
    }
    case 'users': {
      const users = Array.isArray(payload) ? payload : [payload];
      const insertUser = `INSERT INTO users (business_id, local_id, name, pin, role, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (business_id, local_id) DO UPDATE SET
          name = EXCLUDED.name,
          pin = EXCLUDED.pin,
          role = EXCLUDED.role,
          updated_at = EXCLUDED.updated_at`;

      for (const userPayload of users) {
        await q.query(insertUser, [
          businessId,
          userPayload.id ?? null,
          userPayload.name || 'User',
          userPayload.pin || '',
          userPayload.role || 'cashier',
          userPayload.created_at ? new Date(userPayload.created_at) : now,
          userPayload.updated_at ? new Date(userPayload.updated_at) : now
        ]);
      }
      console.log(`[Replicate Users] Successfully synced ${users.length} users for business ${obfuscateKey(businessId)}`);
      return;
    }
    case 'transaction': {
      const txResult = await q.query(
        `INSERT INTO transactions (business_id, local_id, receipt_number, customer_id, customer_name, cashier_name, status, payment_method, subtotal, discount_amount, discount_type, tax_vat, tax_nhil, tax_getfund, tax_covid, total_tax, grand_total, amount_tendered, change_given, momo_reference, void_reason, notes, paid_amount, created_at, updated_at)
         VALUES ($1::varchar, $2::integer, $3::varchar, $4::integer, $5::varchar, $6::varchar, $7::varchar, $8::varchar, $9::float, $10::float, $11::varchar, $12::float, $13::float, $14::float, $15::float, $16::float, $17::float, $18::float, $19::float, $20::varchar, $21::text, $22::text, $23::float, $24::timestamp, $25::timestamp)
         ON CONFLICT (business_id, receipt_number) DO UPDATE SET
           local_id = EXCLUDED.local_id,
           customer_id = EXCLUDED.customer_id,
           customer_name = EXCLUDED.customer_name,
           cashier_name = EXCLUDED.cashier_name,
           status = EXCLUDED.status,
           payment_method = EXCLUDED.payment_method,
           subtotal = EXCLUDED.subtotal,
           discount_amount = EXCLUDED.discount_amount,
           discount_type = EXCLUDED.discount_type,
           tax_vat = EXCLUDED.tax_vat,
           tax_nhil = EXCLUDED.tax_nhil,
           tax_getfund = EXCLUDED.tax_getfund,
           tax_covid = EXCLUDED.tax_covid,
           total_tax = EXCLUDED.total_tax,
           grand_total = EXCLUDED.grand_total,
           amount_tendered = EXCLUDED.amount_tendered,
           change_given = EXCLUDED.change_given,
           momo_reference = EXCLUDED.momo_reference,
           void_reason = EXCLUDED.void_reason,
           notes = EXCLUDED.notes,
           paid_amount = EXCLUDED.paid_amount,
           updated_at = EXCLUDED.updated_at
         RETURNING id`,
        [
          businessId,
          localId,
          payload.receipt_number || payload.receiptNumber || `TX-${Date.now()}`,
          payload.customer_id || null,
          payload.customer_name || null,
          payload.cashier_name || 'Cashier',
          payload.status || 'completed',
          payload.payment_method || 'cash',
          parseFloat(payload.subtotal ?? payload.grand_total ?? 0),
          parseFloat(payload.discount_amount ?? 0),
          payload.discount_type || null,
          parseFloat(payload.tax_vat ?? payload.tax?.vat ?? 0),
          parseFloat(payload.tax_nhil ?? payload.tax?.nhil ?? 0),
          parseFloat(payload.tax_getfund ?? payload.tax?.getfund ?? 0),
          parseFloat(payload.tax_covid ?? payload.tax?.covid ?? 0),
          parseFloat(payload.total_tax ?? payload.tax?.totalTax ?? 0),
          parseFloat(payload.grand_total ?? payload.total ?? 0),
          parseFloat(payload.amount_tendered ?? 0),
          parseFloat(payload.change_given ?? 0),
          payload.momo_reference || payload.momoReference || null,
          payload.void_reason || null,
          payload.notes || null,
          parseFloat(payload.paid_amount ?? 0),
          payload.created_at ? new Date(payload.created_at) : now,
          payload.updated_at ? new Date(payload.updated_at) : now
        ]
      );

      const transactionId = txResult.rows[0]?.id;
      if (transactionId && Array.isArray(payload.items)) {
        await q.query('DELETE FROM transaction_items WHERE transaction_id = $1', [transactionId]);
        const insertItem = `INSERT INTO transaction_items (business_id, transaction_id, local_id, product_id, product_name, product_barcode, category, quantity, unit_price, cost_price, line_total, tax_category)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;

        for (const item of payload.items) {
          await q.query(insertItem, [
            businessId,
            transactionId,
            item.id ?? null,
            item.product_id ?? null,
            item.product_name || item.name || 'Item',
            item.product_barcode || item.barcode || null,
            item.category || null,
            parseInt(item.quantity || 1),
            parseFloat(item.unit_price || item.price || 0),
            parseFloat(item.cost_price || 0),
            parseFloat(item.line_total || (item.quantity * (item.unit_price || item.price || 0)) || 0),
            item.tax_category || 'standard'
          ]);
        }
      }
      return;
    }
    default:
      return;
  }
}

// JWT helpers
function signToken(payload, expiresInHours = 24) {
  const exp = Math.floor(Date.now() / 1000) + (expiresInHours * 60 * 60);
  const data = { ...payload, exp };
  const payloadStr = JSON.stringify(data);
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payloadStr).digest('hex');
  return sig + '.' + Buffer.from(payloadStr).toString('base64');
}

function verifyToken(token) {
  try {
    const [sig, dataB64] = token.split('.');
    const payloadStr = Buffer.from(dataB64, 'base64').toString();
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadStr).digest('hex');

    if (sig !== expectedSig) return null;

    const payload = JSON.parse(payloadStr);
    // Check expiration
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload;
  } catch { return null; }
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.auth = payload;
  next();
}

// Sync Auth Middleware
async function requireSyncAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const licenseKey = auth.slice(7);
  if (!licenseKey) return res.status(401).json({ success: false, message: 'Invalid token' });

  try {
    const result = await pool.query('SELECT id FROM licenses WHERE license_key = $1', [licenseKey]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid license key' });
    }
    req.business_id = licenseKey; // Attach for convenience
    next();
  } catch (err) {
    console.error('[Auth Error]:', err.message);
    res.status(500).json({ success: false, message: 'Internal auth error' });
  }
}

// Diagnostic Health Routes
app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date() }));
app.get('/v1/sync/push', (req, res) => res.json({ message: 'Sync push endpoint is online. Use POST to send data.', methods: ['POST'] }));

// DB Connection
const isRailwayInternal = process.env.DATABASE_URL?.includes('postgres.railway.internal');
const railwayPublicPostgresHost = process.env.RAILWAY_SERVICE_POSTGRES_URL;

const dbSslRaw = process.env.DATABASE_SSL;
const dbSslNormalized = typeof dbSslRaw === 'string' ? dbSslRaw.trim().toLowerCase() : undefined;
const dbSslExplicit =
  dbSslNormalized === 'true' ? true :
    dbSslNormalized === 'false' ? false :
      undefined;

// User Suggestion: Skip SSL for internal hosts
const useSsl = isRailwayInternal ? false : (dbSslExplicit ?? (process.env.NODE_ENV === 'production'));

const poolConfig = process.env.DATABASE_URL
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  }
  : {
    host: process.env.PGHOST || 'db',
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'sikapos123',
    database: process.env.PGDATABASE || 'sikapos_cloud',
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  };

let effectiveDbHost = process.env.PGHOST || 'localhost';
let effectiveDbPort = process.env.PGPORT || '5432';
if (poolConfig?.connectionString) {
  try {
    const u = new URL(poolConfig.connectionString);
    effectiveDbHost = u.hostname || effectiveDbHost;
    effectiveDbPort = u.port || effectiveDbPort;
  } catch { /* ignore */ }
}

console.log('[DB Config]', {
  hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  host: effectiveDbHost,
  port: effectiveDbPort,
  DATABASE_SSL: process.env.DATABASE_SSL,
  NODE_ENV: process.env.NODE_ENV,
  isRailwayInternal,
  finalUseSsl: useSsl,
  connectionStringParams: poolConfig?.connectionString?.split('?')[1] || 'none'
});

const pool = new Pool({
  ...poolConfig,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('[Postgres Pool Error]:', err);
});

// Initialize DB Tables with Retry
async function initDb() {
  let retries = 20;
  console.log('⏳ Waiting for database to be ready...');

  while (retries > 0) {
    try {
      console.log('[DB Init] Resolved host:', effectiveDbHost, 'port:', effectiveDbPort, 'ssl:', useSsl);
      console.log('[DB Init] Attempting database connection...');
      const { Client } = require('pg');
      const client = new Client(poolConfig);
      await client.connect();
      try {
        await client.query('SELECT 1');
        console.log('[DB Init] Database connection established.');
      } finally {
        await client.end();
      }
      // 1. Create base tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS synced_data (
          id SERIAL PRIMARY KEY,
          business_id VARCHAR(100),
          entity VARCHAR(50) NOT NULL,
          operation VARCHAR(20) NOT NULL,
          payload JSONB NOT NULL,
          received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          business_id VARCHAR(100) NOT NULL,
          local_id INTEGER,
          name VARCHAR(255) NOT NULL,
          barcode VARCHAR(255),
          category VARCHAR(100) NOT NULL DEFAULT 'General',
          unit_price REAL NOT NULL DEFAULT 0,
          cost_price REAL NOT NULL DEFAULT 0,
          stock_qty INTEGER NOT NULL DEFAULT 0,
          low_stock_threshold INTEGER NOT NULL DEFAULT 5,
          tax_category VARCHAR(100) NOT NULL DEFAULT 'standard',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          is_pharmacy BOOLEAN NOT NULL DEFAULT FALSE,
          expiry_date TIMESTAMP,
          batch_number VARCHAR(255),
          nafdac_number VARCHAR(255),
          unit VARCHAR(100) NOT NULL DEFAULT 'each',
          image_path TEXT,
          created_at TIMESTAMP,
          updated_at TIMESTAMP,
          UNIQUE(business_id, local_id),
          UNIQUE(business_id, barcode)
        );

        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          business_id VARCHAR(100) NOT NULL,
          local_id INTEGER,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(100),
          email VARCHAR(255),
          credit_balance REAL NOT NULL DEFAULT 0,
          credit_limit REAL NOT NULL DEFAULT 0,
          loyalty_points INTEGER NOT NULL DEFAULT 0,
          total_spent REAL NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP,
          updated_at TIMESTAMP,
          UNIQUE(business_id, local_id)
        );

        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          business_id VARCHAR(100) NOT NULL,
          local_id INTEGER,
          name VARCHAR(255) NOT NULL,
          pin VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'cashier',
          created_at TIMESTAMP,
          updated_at TIMESTAMP,
          UNIQUE(business_id, local_id)
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          business_id VARCHAR(100) NOT NULL,
          local_id INTEGER,
          receipt_number VARCHAR(255) NOT NULL,
          customer_id INTEGER,
          customer_name VARCHAR(255),
          cashier_name VARCHAR(255) NOT NULL DEFAULT 'Cashier',
          status VARCHAR(50) NOT NULL DEFAULT 'completed',
          payment_method VARCHAR(100) NOT NULL DEFAULT 'cash',
          subtotal REAL NOT NULL DEFAULT 0,
          discount_amount REAL NOT NULL DEFAULT 0,
          discount_type VARCHAR(100),
          tax_vat REAL NOT NULL DEFAULT 0,
          tax_nhil REAL NOT NULL DEFAULT 0,
          tax_getfund REAL NOT NULL DEFAULT 0,
          tax_covid REAL NOT NULL DEFAULT 0,
          total_tax REAL NOT NULL DEFAULT 0,
          grand_total REAL NOT NULL DEFAULT 0,
          amount_tendered REAL NOT NULL DEFAULT 0,
          change_given REAL NOT NULL DEFAULT 0,
          momo_reference VARCHAR(255),
          paid_amount REAL NOT NULL DEFAULT 0,
          void_reason TEXT,
          notes TEXT,
          created_at TIMESTAMP,
          updated_at TIMESTAMP,
          UNIQUE(business_id, receipt_number)
        );

        CREATE TABLE IF NOT EXISTS transaction_items (
          id SERIAL PRIMARY KEY,
          business_id VARCHAR(100) NOT NULL,
          transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
          local_id INTEGER,
          product_id INTEGER,
          product_name VARCHAR(255) NOT NULL,
          product_barcode VARCHAR(255),
          category VARCHAR(100),
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price REAL NOT NULL DEFAULT 0,
          cost_price REAL NOT NULL DEFAULT 0,
          line_total REAL NOT NULL DEFAULT 0,
          tax_category VARCHAR(100) NOT NULL DEFAULT 'standard'
        );

        CREATE TABLE IF NOT EXISTS licenses (
          id SERIAL PRIMARY KEY,
          license_key VARCHAR(50) UNIQUE NOT NULL,
          business_name VARCHAR(100),
          business_address TEXT,
          business_phone VARCHAR(50),
          business_logo TEXT,
          status VARCHAR(20) DEFAULT 'inactive',
          machine_id VARCHAR(255),
          activated_at TIMESTAMP,
          expires_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS license_machines (
          id SERIAL PRIMARY KEY,
          license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
          machine_id VARCHAR(255) NOT NULL,
          machine_name VARCHAR(100),
          activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(license_id, machine_id)
        );

        CREATE TABLE IF NOT EXISTS super_admins (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Migration: Add columns to super_admins in case it was created with an old schema
      try {
        await pool.query('ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;');
        await pool.query('ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);');
        await pool.query('ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS name VARCHAR(255);');
        // Drop legacy columns that break inserts
        await pool.query('ALTER TABLE super_admins DROP COLUMN IF EXISTS username;');
        await pool.query('ALTER TABLE super_admins DROP COLUMN IF EXISTS password;');
      } catch(e) {
        console.error('[DB Migration] super_admins schema update failed:', e.message);
      }

      // Seed default super admin if table is empty
      const adminCount = await pool.query('SELECT COUNT(*) as count FROM super_admins');
      if (parseInt(adminCount.rows[0].count) === 0 && ADMIN_USER) {
        await pool.query(
          'INSERT INTO super_admins (email, password_hash, name) VALUES ($1, $2, $3)',
          [ADMIN_USER, ADMIN_PASS_HASH, 'System Admin']
        );
      }

      // Migration: Remove problematic unique constraints that block sync
      try {
        await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_business_id_pin_key;');
        await pool.query('ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_business_id_phone_key;');
        console.log('[DB Migration] Dropped legacy unique constraints on users/customers.');
      } catch (e) {
        // ignore
      }

      // Migration: Add missing columns and tables
      try {
        await pool.query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS business_logo TEXT;');
        await pool.query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS business_address TEXT;');
        await pool.query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS business_phone VARCHAR(50);');

        // Migration: Add credit_limit to customers table
        await pool.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit REAL NOT NULL DEFAULT 0;');
        await pool.query('UPDATE customers SET credit_limit = 0 WHERE credit_limit IS NULL;');

        // Migration: Add paid_amount to transactions
        await pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount REAL NOT NULL DEFAULT 0;');
        await pool.query("UPDATE transactions SET paid_amount = grand_total WHERE payment_method != 'credit' OR status = 'completed';");

        await pool.query(`
          CREATE TABLE IF NOT EXISTS credit_payments (
            id SERIAL PRIMARY KEY,
            business_id VARCHAR(100) NOT NULL,
            local_id INTEGER,
            customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            amount REAL NOT NULL,
            payment_method VARCHAR(50) DEFAULT 'cash',
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Ensure unique constraints exist (Postgres doesn't add them automatically with CREATE TABLE IF NOT EXISTS if table exists)
        try { await pool.query('ALTER TABLE credit_payments ADD CONSTRAINT uniq_cp_biz_local UNIQUE(business_id, local_id);'); } catch (e) {}
        try { await pool.query('ALTER TABLE transactions ADD CONSTRAINT uniq_tx_biz_receipt UNIQUE(business_id, receipt_number);'); } catch (e) {}
        try { await pool.query('ALTER TABLE customers ADD CONSTRAINT uniq_cust_biz_local UNIQUE(business_id, local_id);'); } catch (e) {}

        // Automatic Duplicate Purge on Startup
        console.log('[DB Migration] Purging duplicate transactions and payments...');
        
        // 1. Purge duplicate transactions (keep oldest)
        await pool.query(`
          DELETE FROM transactions a USING (
            SELECT MIN(id) as id, business_id, receipt_number 
            FROM transactions 
            GROUP BY business_id, receipt_number 
            HAVING COUNT(*) > 1
          ) b
          WHERE a.business_id = b.business_id 
          AND a.receipt_number = b.receipt_number 
          AND a.id > b.id
        `);

        // 2. AGGRESSIVE PURGE: Remove duplicate credit_payments based on a "fingerprint"
        // (Same business, same amount, same customer, within a 2-hour window)
        console.log('[DB Migration] Running fingerprint purge on credit_payments...');
        await pool.query(`
          DELETE FROM credit_payments a USING credit_payments b
          WHERE a.id > b.id 
          AND a.business_id = b.business_id 
          AND a.amount = b.amount
          AND (a.local_id = b.local_id OR a.local_id IS NULL OR b.local_id IS NULL)
          AND a.created_at >= b.created_at - interval '2 hours'
          AND a.created_at <= b.created_at + interval '2 hours'
        `);

        // 3. AGGRESSIVE PURGE: Remove duplicate transactions
        console.log('[DB Migration] Running fingerprint purge on transactions...');
        await pool.query(`
          DELETE FROM transactions a USING transactions b
          WHERE a.id > b.id 
          AND a.business_id = b.business_id 
          AND a.receipt_number = b.receipt_number
        `);

        // 4. Force Unique Constraints (after cleanup)
        try { await pool.query('ALTER TABLE credit_payments ADD CONSTRAINT uniq_cp_biz_local_v2 UNIQUE(business_id, local_id);'); } catch (e) {}
        // 5. FINAL AGGRESSIVE PURGE: Remove any remaining payments with NULL local_id
        // that share the same amount and approximate timestamp as a valid record
        console.log('[DB Migration] Cleaning up orphaned NULL local_id records...');
        await pool.query(`
          DELETE FROM credit_payments a
          WHERE local_id IS NULL
          AND EXISTS (
            SELECT 1 FROM credit_payments b
            WHERE b.local_id IS NOT NULL
            AND b.business_id = a.business_id
            AND b.amount = a.amount
            AND b.created_at >= a.created_at - interval '10 minutes'
            AND b.created_at <= a.created_at + interval '10 minutes'
          )
        `);

        // Also purge any that have the same local_id regardless of other fields
        await pool.query(`
          DELETE FROM credit_payments a USING (
            SELECT MIN(id) as id, business_id, local_id 
            FROM credit_payments 
            WHERE local_id IS NOT NULL
            GROUP BY business_id, local_id 
            HAVING COUNT(*) > 1
          ) b
          WHERE a.business_id = b.business_id 
          AND a.local_id = b.local_id 
          AND a.id > b.id
        `);

        console.log('[DB Migration] Purge complete.');
      } catch (err) { 
        console.error('[DB Migration Error]:', err.message);
      }

      // 2. Safely add business_id if missing (migration)
      try {
        await pool.query(`ALTER TABLE synced_data ADD COLUMN IF NOT EXISTS business_id VARCHAR(100);`);
      } catch (err) { /* ignore */ }

      // 3. Purge duplicates before creating unique index
      try {
        await pool.query(`
          DELETE FROM synced_data
          WHERE entity = 'transaction'
          AND id NOT IN (
            SELECT MIN(id)
            FROM synced_data
            WHERE entity = 'transaction'
            GROUP BY (payload->>'receipt_number')
          )
        `);
      } catch (err) { console.error('Failed to purge duplicates during init:', err.message); }

      // 4. Add indexes
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_business_id ON synced_data(business_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_transaction 
          ON synced_data((payload->>'receipt_number'))
          WHERE entity = 'transaction';
      `);

      // 5. Migration: Mark any license with a synced business_name as active
      try {
        await pool.query(`
          UPDATE licenses 
          SET status = 'active', activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP) 
          WHERE business_name IS NOT NULL AND business_name != '' AND status != 'active'
        `);
      } catch (err) { /* ignore */ }

      console.log('✅ Database tables initialized');
      global.DB_OFFLINE = false;
      return;
    } catch (err) {
      console.error('Database init error:', err.message);
      console.error('Error Code:', err.code);
      console.error('Error Stack:', err.stack);
      retries--;
      if (retries === 0) {
        console.log('⚠️ Could not connect to database. Starting in OFFLINE mock mode so you can test the frontend.');
        global.DB_OFFLINE = true;
        return;
      }
      const waitMs = Math.min(30000, 2000 + (20 - retries) * 1500);
      console.log(`🔄 Retrying in ${Math.ceil(waitMs / 1000)} seconds... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

const syncAttempts = new Map();
function syncRateLimit(req, res, next) {
  const businessId = req.business_id;
  if (!businessId) return next();

  const now = Date.now();
  const limit = 200; // max 200 requests
  const windowMs = 60 * 1000; // per 1 minute

  if (!syncAttempts.has(businessId)) {
    syncAttempts.set(businessId, { count: 1, firstAttempt: now });
    return next();
  }

  const attempt = syncAttempts.get(businessId);
  if (now - attempt.firstAttempt > windowMs) {
    attempt.count = 1;
    attempt.firstAttempt = now;
    return next();
  }

  attempt.count++;
  if (attempt.count > limit) {
    return res.status(429).json({ success: false, message: 'Too many sync requests. Please try again later.' });
  }
  next();
}

// Batch Sync Endpoint
app.post('/v1/sync/push-batch', requireSyncAuth, syncRateLimit, async (req, res) => {
  const { items } = req.body;
  const business_id = req.business_id;

  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, message: 'Items array is required' });
  }

  const client = await pool.connect();
  try {
    console.log(`[Sync] Pushing batch of ${items.length} items for business: ${obfuscateKey(business_id)}`);

    await client.query('BEGIN');

    for (const item of items) {
      const { entity, operation, payload } = item;
      
      if (!entity || !operation || !payload) continue;

      // Insert into synced_data
      await client.query(
        'INSERT INTO synced_data (business_id, entity, operation, payload) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [business_id, entity, operation, JSON.stringify(payload)]
      );

      // Replicate to specific tables
      await replicatePayloadToReplicaTables(business_id, entity, operation, payload, client);
    }

    await client.query('COMMIT');

    res.json({ success: true, message: 'Batch synced to cloud', synced: items.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[Sync Batch Error] Business: ${obfuscateKey(business_id)}`);
    console.error(`[Sync Error Message]:`, err.message);
    if (err.detail) console.error(`[Sync Error Detail]:`, err.detail);

    res.status(500).json({
      success: false,
      message: 'Internal server error during batch sync',
      debug: err.message
    });
  } finally {
    client.release();
  }
});

// Single Sync Endpoint (Legacy/Fallback)
app.post('/v1/sync/push', requireSyncAuth, syncRateLimit, async (req, res) => {
  const { entity, operation, payload } = req.body;
  const business_id = req.business_id;

  if (!entity || !operation || !payload) {
    return res.status(400).json({ success: false, message: 'Invalid payload structure' });
  }

  const client = await pool.connect();
  try {
    console.log(`[Sync] Pushing ${entity} (${operation}) for business: ${obfuscateKey(business_id)}`);

    await client.query('BEGIN');

    // Use ON CONFLICT DO NOTHING to skip duplicates for transactions (they have a unique index on receipt_number)
    await client.query(
      'INSERT INTO synced_data (business_id, entity, operation, payload) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [business_id, entity, operation, JSON.stringify(payload)]
    );

    // Also keep a normalized replica of the local payload for portal queries
    await replicatePayloadToReplicaTables(business_id, entity, operation, payload, client);

    await client.query('COMMIT');

    res.json({ success: true, message: 'Synced to cloud' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[Sync Error] Entity: ${entity}, Operation: ${operation}, Business: ${obfuscateKey(business_id)}`);
    console.error(`[Sync Error Message]:`, err.message);
    if (err.detail) console.error(`[Sync Error Detail]:`, err.detail);

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      debug: err.message
    });
  } finally {
    client.release();
  }
});

// Pull Endpoint (For Data Recovery)
app.get('/v1/sync/pull', requireSyncAuth, async (req, res) => {
  const business_id = req.business_id;

  if (!business_id) return res.status(400).json({ success: false, message: 'business_id is required' });

  try {
    const result = await pool.query(
      'SELECT entity, payload FROM synced_data WHERE business_id = $1 ORDER BY received_at ASC',
      [business_id]
    );

    // Group items by entity to make it easier for the client to process
    const recoveryData = result.rows.reduce((acc, row) => {
      if (!acc[row.entity]) acc[row.entity] = [];
      acc[row.entity].push(row.payload);
      return acc;
    }, {});

    console.log('[Recovery] Serving ' + result.rows.length + ' items for business: ' + obfuscateKey(business_id));
    res.json({ success: true, data: recoveryData });
  } catch (err) {
    console.error('[Recovery Error]:', err.message);
    res.status(500).json({ success: false, message: 'Recovery failed on server' });
  }
});

// Sync-Down: Get latest customer balances
app.get('/v1/sync/customers', requireSyncAuth, async (req, res) => {
  const business_id = req.business_id;
  try {
    const result = await pool.query(
      'SELECT id, local_id, credit_balance, credit_limit, loyalty_points, total_spent, updated_at FROM customers WHERE business_id = $1',
      [business_id]
    );

    // Also fetch recent payments (last 30 days) to sync down
    const paymentsResult = await pool.query(
      `SELECT id, local_id, customer_id, amount, payment_method, note, created_at
       FROM credit_payments
       WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [business_id]
    );

    console.log(`[Sync API] Returning ${result.rows.length} customers, ${paymentsResult.rows.length} payments for business ${obfuscateKey(business_id)}`);

    res.json({
      success: true,
      data: {
        customers: result.rows,
        payments: paymentsResult.rows
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch customer balances' });
  }
});

// Activate a License Key (Multi-device support)
app.post('/v1/licenses/activate', rateLimit, async (req, res) => {
  const { license_key, machine_id, machine_name } = req.body;

  try {
    const result = await pool.query('SELECT * FROM licenses WHERE license_key = $1', [license_key]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid License Key' });
    }

    const license = result.rows[0];

    // Check if this machine is already activated
    const machineCheck = await pool.query(
      'SELECT * FROM license_machines WHERE license_id = $1 AND machine_id = $2',
      [license.id, machine_id]
    );

    if (machineCheck.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Already activated on this device',
        business_name: license.business_name,
        business_address: license.business_address,
        business_phone: license.business_phone,
        business_logo: license.business_logo,
        license_key: license.license_key
      });
    }

    // Check machine limit (max 5 devices per license)
    const machineCount = await pool.query(
      'SELECT COUNT(*) FROM license_machines WHERE license_id = $1',
      [license.id]
    );

    if (parseInt(machineCount.rows[0].count) >= 5) {
      return res.status(403).json({
        success: false,
        message: 'Maximum device limit reached (5 devices per license)'
      });
    }

    // Activate this machine
    await pool.query(
      'INSERT INTO license_machines (license_id, machine_id, machine_name) VALUES ($1, $2, $3)',
      [license.id, machine_id, machine_name || 'Unknown Device']
    );

    // Update license status if not already active
    if (license.status !== 'active') {
      await pool.query(
        'UPDATE licenses SET status = $1, activated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['active', license.id]
      );
    }

    res.json({
      success: true,
      message: 'Activation successful',
      business_name: license.business_name,
      business_address: license.business_address,
      business_phone: license.business_phone,
      business_logo: license.business_logo,
      license_key: license.license_key
    });
  } catch (err) {
    console.error('[Activation Error]:', err);
    res.status(500).json({ success: false, message: 'Activation failed' });
  }
});

// Update Business Name for a License
app.post('/v1/licenses/update-name', requireSyncAuth, async (req, res) => {
  const business_id = req.business_id;
  const { business_name } = req.body;

  if (!business_id || !business_name) {
    return res.status(400).json({ success: false, message: 'License key and business name are required' });
  }

  try {
    const result = await pool.query(
      "UPDATE licenses SET business_name = $1, status = 'active', activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP) WHERE license_key = $2",
      [business_name, business_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'License key not found in cloud database' });
    }

    console.log(`[License] Updated name for ${business_id}: ${business_name}`);
    res.json({ success: true, message: 'Business name updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update business name' });
  }
});

// Clear all inventory for a business (Cloud + Sync)
app.post('/v1/inventory/clear', requireSyncAuth, async (req, res) => {
  const business_id = req.business_id;

  if (!business_id) {
    return res.status(400).json({ success: false, message: 'business_id is required' });
  }

  try {
    // Delete all product sync data for this business
    await pool.query(
      "DELETE FROM synced_data WHERE business_id = $1 AND entity = 'product'",
      [business_id]
    );

    // Also add a 'clear' operation to sync queue so devices can know to clear local inventory
    await pool.query(
      "INSERT INTO synced_data (business_id, entity, operation, payload) VALUES ($1, 'product', 'clear_all', $2)",
      [business_id, JSON.stringify({ cleared_at: new Date().toISOString(), action: 'clear_all' })]
    );

    console.log('[Inventory Clear] All products cleared for business: ' + business_id);
    res.json({ success: true, message: 'All inventory cleared from cloud' });
  } catch (err) {
    console.error('[Inventory Clear Error]:', err.message);
    res.status(500).json({ success: false, message: 'Failed to clear inventory' });
  }
});


// --- PORTAL APIs ---

// Portal Login
app.post('/api/portal/login', rateLimit, async (req, res) => {
  const { storeName, password } = req.body;

  if (!storeName || !password) {
    return res.status(400).json({ error: 'Store Name and PIN/Password are required' });
  }

  // --- 1. SUPER ADMIN CHECK ---
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');

  try {
    const adminResult = await pool.query('SELECT * FROM super_admins WHERE LOWER(email) = LOWER($1) AND password_hash = $2', [storeName, inputHash]);
    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      const token = signToken({ role: 'admin', adminId: admin.id, name: admin.name });
      return res.json({ success: true, role: 'admin', token, name: admin.name });
    }
  } catch (err) {
    console.error('Super admin DB check failed:', err);
  }

  // Fallback to env var if DB fails or isn't seeded properly
  if (storeName.toLowerCase() === ADMIN_USER.toLowerCase() && inputHash === ADMIN_PASS_HASH) {
    const token = signToken({ role: 'admin' });
    return res.json({ success: true, role: 'admin', token });
  }

  // If it matches ADMIN_USER but bad password, reject early
  if (storeName.toLowerCase() === ADMIN_USER.toLowerCase()) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  // --- 2. BUSINESS OWNER CHECK ---
  try {
    let license = null;
    let businessId = null;
    let businessName = storeName;

    if (global.DB_OFFLINE) {
      // In offline mode, accept any store name
      license = { license_key: 'mock-offline', business_name: storeName };
      businessId = 'mock-offline';
    } else {
      const licenseResult = await pool.query('SELECT * FROM licenses WHERE TRIM(LOWER(business_name)) = TRIM(LOWER($1))', [storeName]);
      if (licenseResult.rows.length === 0) {
        return res.status(401).json({ error: 'Store not found. Please sync your store name from the SikaPOS app settings.' });
      }
      license = licenseResult.rows[0];
      businessId = license.license_key;
      businessName = license.business_name;
    }

    if (global.DB_OFFLINE && password === 'TEST') {
      const token = signToken({ role: 'business', businessId: 'mock-123', businessName });
      return res.json({ success: true, role: 'business', businessId: 'mock-123', businessName, token });
    }

    // Handle offline mode - create mock admin user
    if (global.DB_OFFLINE) {
      const mockAdmin = {
        id: 1,
        name: 'Admin',
        pin: crypto.createHash('sha256').update(password + PIN_SALT).digest('hex'),
        role: 'admin'
      };
      const token = signToken({ role: 'business', businessId, businessName });
      return res.json({ success: true, role: 'business', businessId, businessName, token });
    }

    const userResult = await pool.query(
      "SELECT payload FROM synced_data WHERE business_id = $1 AND entity = 'users' ORDER BY received_at DESC LIMIT 1",
      [businessId]
    );

    let users = [];
    if (userResult.rows.length === 0) {
      // No users synced yet - create a default admin user for first login
      const defaultAdmin = {
        id: 1,
        name: 'Admin',
        pin: crypto.createHash('sha256').update(password + PIN_SALT).digest('hex'),
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Insert into synced_data for consistency
      await pool.query(
        "INSERT INTO synced_data (business_id, entity, operation, payload) VALUES ($1, 'users', 'push', $2)",
        [businessId, JSON.stringify([defaultAdmin])]
      );

      // Also insert into replica table
      await replicatePayloadToReplicaTables(businessId, 'users', 'push', [defaultAdmin]);

      users = [defaultAdmin];
      console.log('[Login] Created default admin user for business: ' + businessId);
    } else {
      users = parsePayload(userResult.rows[0]) || [];
      if (!Array.isArray(users)) users = [];
    }

    const adminUser = users.find(u => u.role === 'admin');

    if (!adminUser) {
      return res.status(401).json({ error: 'No Admin user found for this store' });
    }

    const inputHashedPin = crypto.createHash('sha256').update(password + PIN_SALT).digest('hex');
    if (inputHashedPin === adminUser.pin) {
      const token = signToken({ role: 'business', businessId, businessName: license.business_name, userName: adminUser.name });
      return res.json({ 
        success: true, 
        role: 'business', 
        businessId, 
        businessName: license.business_name, 
        businessAddress: license.business_address || null,
        businessPhone: license.business_phone || null,
        businessLogo: license.business_logo || null,
        userName: adminUser.name,
        token 
      });
    }

    return res.status(401).json({ error: 'Invalid PIN' });
  } catch (err) {
    console.error('[Login Error]:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get Licenses
app.get('/api/portal/admin/licenses', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  if (global.DB_OFFLINE) {
    return res.json([
      { id: 1, license_key: 'SIKA-DEMO-1234', business_name: 'Offline Shop A', status: 'active', machine_id: 'mac-111', activated_at: new Date().toISOString() },
      { id: 2, license_key: 'SIKA-TEST-5678', business_name: null, status: 'inactive', machine_id: null, activated_at: null }
    ]);
  }
  try {
    const result = await pool.query('SELECT * FROM licenses ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch licenses' });
  }
});

// Admin: Generate License
app.post('/api/portal/admin/licenses/generate', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const randomPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  const key = `SIKA-${randomPart()}-${randomPart()}-${randomPart()}`;
  if (global.DB_OFFLINE) {
    return res.json({ success: true, license_key: key });
  }
  try {
    await pool.query('INSERT INTO licenses (license_key, business_name) VALUES ($1, $2)', [key, '']);
    res.json({ success: true, license_key: key });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate key' });
  }
});

// Admin: Delete License
app.delete('/api/portal/admin/licenses/:id', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM licenses WHERE id = $1', [id]);
    res.json({ success: true, message: 'License deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete license' });
  }
});

// Admin: Purge Duplicate Transactions
app.post('/api/portal/admin/purge-duplicates', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  if (global.DB_OFFLINE) {
    return res.json({ success: true, deleted: 0, message: 'Offline mode - nothing to purge' });
  }
  try {
    const result = await pool.query(`
      DELETE FROM synced_data
      WHERE entity = 'transaction'
      AND id NOT IN (
        SELECT MIN(id)
        FROM synced_data
        WHERE entity = 'transaction'
        GROUP BY (payload->>'receipt_number')
      )
    `);
    const deleted = result.rowCount;
    console.log('[Admin] Purged ' + deleted + ' duplicate transaction rows.');
    res.json({ success: true, deleted, message: `Removed ${deleted} duplicate transaction(s).` });
  } catch (err) {
    console.error('[Purge Error]:', err.message);
    res.status(500).json({ success: false, message: 'Failed to purge duplicates' });
  }
});

// Helper to parse date-only string (YYYY-MM-DD) to Date object in local timezone
function parseDateOnly(dateStr) {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // month is 0-indexed
}

// Business: Dashboard Summary
app.get('/api/portal/dashboard/summary', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  if (!businessId) return res.status(400).json({ error: 'Business ID required' });

  const fromDate = req.query.from ? parseDateOnly(req.query.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const toDate = req.query.to ? parseDateOnly(req.query.to) : new Date();

  // Set date boundaries once
  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(23, 59, 59, 999);

  if (global.DB_OFFLINE) {
    return res.json({
      totalSales: 4500.50,
      transactionCount: 24,
      totalProducts: 120,
      lowStockCount: 8,
      recentTx: [
        { receipt_number: 'TX-OFFLINE-1', created_at: new Date().toISOString(), cashier_name: 'Demo Cashier', grand_total: 120.50, payment_method: 'cash' },
        { receipt_number: 'TX-OFFLINE-2', created_at: new Date(Date.now() - 3600000).toISOString(), cashier_name: 'Demo Cashier', grand_total: 45.00, payment_method: 'momo' }
      ],
      chartData: [
        { date: 'Mon', sales: 400 }, { date: 'Tue', sales: 600 }, { date: 'Wed', sales: 350 },
        { date: 'Thu', sales: 800 }, { date: 'Fri', sales: 1200 }, { date: 'Sat', sales: 900 }, { date: 'Sun', sales: 250 }
      ]
    });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE business_id = $1 ORDER BY created_at ASC",
      [businessId]
    );

    console.log('[Dashboard] Total transactions in DB:', result.rows.length);
    console.log('[Dashboard] Date filter from:', fromDate, 'to:', toDate);

    let totalSales = 0;
    let totalCredit = 0;
    const recentTx = [];
    const salesByDate = {};
    let totalTransactions = 0;

    // Revenue Calculation Logic:
    // Total Revenue = SUM(paid_amount) for all transactions created in the period.
    // This attributes payments back to the original borrowing date as requested.
    result.rows.forEach(tx => {
      if (!tx || !tx.receipt_number) return;

      const status = (tx.status || '').trim().toLowerCase();
      if (status !== 'completed' && status !== 'debt') return;

      const txDateStr = tx.created_at || tx.updated_at;
      if (!txDateStr) return;

      const txDate = new Date(txDateStr);
      if (isNaN(txDate.getTime())) return;

      if (txDate < fromDate || txDate > toDate) return;

      const grandTotal = parseFloat(tx.grand_total || 0);
      const paidAmount = parseFloat(tx.paid_amount || 0);
      
      // Total Sales for the period is the realized revenue (paid_amount)
      totalSales += paidAmount;
      
      const date = txDate.toISOString().split('T')[0];
      salesByDate[date] = (salesByDate[date] || 0) + paidAmount;

      // Track credit issued in this period (unpaid portion)
      if (tx.payment_method === 'credit') {
        totalCredit += (grandTotal - paidAmount);
      }
      
      totalTransactions++;

      recentTx.push({
        id: tx.id,
        receipt_number: tx.receipt_number,
        grand_total: grandTotal,
        paid_amount: paidAmount,
        created_at: txDate.toISOString(),
        cashier_name: tx.cashier_name || 'Admin',
        payment_method: tx.payment_method,
        status: tx.status
      });
    });

    // 2. Fetch Global Customer Debt

    // Calculate total outstanding customer debt (sum of all customer credit balances)
    let totalOutstandingDebt = 0;
    try {
      const debtResult = await pool.query(
        "SELECT COALESCE(SUM(credit_balance), 0) as total FROM customers WHERE business_id = $1",
        [businessId]
      );
      totalOutstandingDebt = parseFloat(debtResult.rows[0]?.total || 0);
    } catch (err) {
      console.error('[Dashboard] Error fetching total debt:', err.message);
    }

    console.log(`[Dashboard API DEBUG] Final Total Revenue: ${totalSales}, Transactions: ${totalTransactions}, OutstandingDebt: ${totalOutstandingDebt}`);

    recentTx.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const chartData = Object.entries(salesByDate)
      .map(([date, sales]) => ({ date, sales }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    if (chartData.length === 0) {
      chartData.push({ date: new Date().toISOString().split('T')[0], sales: totalSales });
    }

    let totalProducts = 0;
    let lowStockCount = 0;
    try {
      const productResult = await pool.query(
        "SELECT * FROM products WHERE business_id = $1 AND is_active = TRUE",
        [businessId]
      );
      productResult.rows.forEach(product => {
        totalProducts++;
        const stock = parseInt(product.stock_qty || 0);
        const threshold = parseInt(product.low_stock_threshold || 0);
        if (stock <= threshold && threshold > 0) {
          lowStockCount++;
        }
      });
    } catch (err) {
      console.error('Product count error:', err.message || err);
    }

    res.json({
      totalSales,
      totalCredit: totalOutstandingDebt,
      transactionCount: totalTransactions,
      totalProducts,
      lowStockCount,
      recentTx: recentTx.slice(0, 100),
      chartData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// Business: Inventory List (paginated + server-side search)
app.get('/api/portal/inventory', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const search = (req.query.search || '').trim();
  const offset = (page - 1) * limit;

  try {
    const params = [businessId];
    const filters = ["business_id = $1", "is_active = TRUE"];
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      params.push(q, q, q);
      filters.push("(LOWER(name) LIKE $2 OR LOWER(barcode) LIKE $3 OR LOWER(category) LIKE $4)");
    }
    const filterClause = filters.join(' AND ');

    const dataResult = await pool.query(
      `SELECT * FROM products WHERE ${filterClause} ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products WHERE ${filterClause}`,
      params
    );

    const products = dataResult.rows.map(p => ({
      ...p,
      is_active: p.is_active,
      stock_qty: p.stock_qty,
      low_stock_threshold: p.low_stock_threshold
    }));

    const total = parseInt(countResult.rows[0].count) || products.length;
    res.json({
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Business: Sales History (paginated, date range)
app.get('/api/portal/sales', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const from = req.query.from || '';
  const to = req.query.to || '';
  const includeItems = req.query.includeItems === 'true';

  if (global.DB_OFFLINE) {
    return res.json({
      transactions: [
        { id: 1, receipt_number: 'TX-OFFLINE-1', created_at: new Date().toISOString(), cashier_name: 'Demo Cashier', customer_name: null, grand_total: 120.50, payment_method: 'cash', status: 'completed', item_count: 3 },
        { id: 2, receipt_number: 'TX-OFFLINE-2', created_at: new Date(Date.now() - 3600000).toISOString(), cashier_name: 'Demo Cashier', customer_name: 'John Doe', grand_total: 45.00, payment_method: 'momo', status: 'completed', item_count: 1 }
      ],
      summary: { total_revenue: 4500.50, transaction_count: 24, avg_basket: 187.52, cash_total: 3200, momo_total: 900, card_total: 300.50, credit_total: 100 },
      pagination: { page: 1, limit: 50, total: 24, pages: 1 }
    });
  }

  try {
    // Build SQL query with date filtering at the database level
    const params = [businessId];
    let dateFilter = '';
    
    if (from) {
      params.push(from);
      dateFilter += ` AND DATE(created_at) >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND DATE(created_at) <= $${params.length}`;
    }

    console.log(`[Sales API] business=${obfuscateKey(businessId)} range=${from || 'all'}..${to || 'all'}`);
    const result = await pool.query(
      `SELECT *, (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = transactions.id) as item_count 
       FROM transactions 
       WHERE business_id = $1 AND status NOT IN ('voided', 'reversed') ${dateFilter} 
       ORDER BY created_at DESC`,
      params
    );

    const transactions = result.rows;

    const total = transactions.length;
    const offset = (page - 1) * limit;
    const paginatedTransactions = transactions.slice(offset, offset + limit);

    const paymentsRes = await pool.query(
      `SELECT * FROM credit_payments WHERE business_id = $1 ${dateFilter.replace(/created_at/g, 'created_at')}`,
      params
    );
    const debtPaymentsTotal = paymentsRes.rows.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    

    let cashTotal = 0, momoTotal = 0, cardTotal = 0, creditTotal = 0;
    transactions.forEach(tx => {
      const t = parseFloat(tx.grand_total || 0);
      const method = (tx.payment_method || 'cash').trim().toLowerCase();
      
      if (method === 'cash') cashTotal += t;
      else if (method === 'momo') momoTotal += t;
      else if (method === 'card') cardTotal += t;
      else if (method === 'credit') creditTotal += t;
    });

    // REVENUE CALCULATION: Realized Money = (Non-Credit Sales) + (Debt Payments Received)
    const realizedSales = cashTotal + momoTotal + cardTotal;
    const totalRevenue = realizedSales + debtPaymentsTotal;


    // Credit Summary: Issued in period - Paid in period
    const netCreditTotal = Math.max(0, creditTotal - debtPaymentsTotal);

    // Fetch items for paginated transactions if requested
    let transactionsWithItems = paginatedTransactions;
    if (includeItems && paginatedTransactions.length > 0) {
      const txIds = paginatedTransactions.map(t => t.id);
      const itemsRes = await pool.query(
        'SELECT * FROM transaction_items WHERE transaction_id = ANY($1)',
        [txIds]
      );
      const itemsMap = new Map();
      itemsRes.rows.forEach(item => {
        if (!itemsMap.has(item.transaction_id)) itemsMap.set(item.transaction_id, []);
        itemsMap.get(item.transaction_id).push(item);
      });
      transactionsWithItems = paginatedTransactions.map(t => ({
        ...t,
        items: itemsMap.get(t.id) || []
      }));
    }

    res.json({
      transactions: transactionsWithItems.map(tx => ({
        id: tx.id,
        receipt_number: tx.receipt_number || 'N/A',
        created_at: tx.created_at || tx.updated_at || new Date().toISOString(),
        cashier_name: tx.cashier_name || 'Admin',
        customer_name: tx.customer_name || null,
        grand_total: parseFloat(tx.grand_total || 0),
        payment_method: tx.payment_method || 'cash',
        status: tx.status || 'completed',
        item_count: parseInt(tx.item_count || 0),
        ...(tx.items ? { items: tx.items } : {})
      })),
      summary: {
        total_revenue: totalRevenue,
        transaction_count: total,
        avg_basket: total > 0 ? totalRevenue / total : 0,
        cash_total: cashTotal,
        momo_total: momoTotal,
        card_total: cardTotal,
        credit_total: netCreditTotal,
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// Business: Inventory Overview (stock summary, category breakdown)
app.get('/api/portal/inventory/overview', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;

  if (global.DB_OFFLINE) {
    return res.json({
      totals: { total_items: 120, total_stock: 8450, total_value_selling: 45600, total_value_cost: 28900 },
      categories: [
        { category: 'Beverages', item_count: 35, total_stock: 2400, total_value: 12800 },
        { category: 'Food', item_count: 28, total_stock: 1800, total_value: 9400 },
        { category: 'General', item_count: 57, total_stock: 4250, total_value: 23400 }
      ]
    });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM products WHERE business_id = $1 AND is_active = TRUE",
      [businessId]
    );
    const products = result.rows.map(p => ({
      ...p,
      id: p.local_id || p.id,
      barcode: p.barcode,
      name: p.name,
      category: p.category,
      stock_qty: p.stock_qty,
      low_stock_threshold: p.low_stock_threshold
    }));
    let totalStock = 0, totalValueSelling = 0, totalValueCost = 0;
    const catMap = new Map();

    products.forEach(p => {
      const stock = parseInt(p.stock_qty || p.stock || 0);
      const sellPrice = parseFloat(p.unit_price || p.price || 0);
      const costPrice = parseFloat(p.cost_price || 0);
      const cat = p.category || 'General';

      totalStock += stock;
      totalValueSelling += stock * sellPrice;
      totalValueCost += stock * costPrice;

      if (!catMap.has(cat)) catMap.set(cat, { category: cat, item_count: 0, total_stock: 0, total_value: 0 });
      const c = catMap.get(cat);
      c.item_count++;
      c.total_stock += stock;
      c.total_value += stock * sellPrice;
    });

    res.json({
      totals: { total_items: products.length, total_stock: totalStock, total_value_selling: totalValueSelling, total_value_cost: totalValueCost },
      categories: Array.from(catMap.values()).sort((a, b) => b.total_value - a.total_value)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch inventory overview' });
  }
});

// Business: Comprehensive Reports
app.get('/api/portal/sales/:id', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const { id } = req.params;

  try {
    const txRes = await pool.query(
      'SELECT * FROM transactions WHERE business_id = $1 AND id = $2',
      [businessId, id]
    );

    if (txRes.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = txRes.rows[0];
    const itemsRes = await pool.query(
      'SELECT * FROM transaction_items WHERE transaction_id = $1',
      [tx.id]
    );

    res.json({
      ...tx,
      items: itemsRes.rows,
      grand_total: parseFloat(tx.grand_total || 0),
      subtotal: parseFloat(tx.subtotal || 0),
      discount_amount: parseFloat(tx.discount_amount || 0),
      total_tax: parseFloat(tx.total_tax || 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transaction details' });
  }
});

app.get('/api/portal/reports', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const days = parseInt(req.query.days) || 30;
  const fromDate = req.query.from ? parseDateOnly(req.query.from) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const toDate = req.query.to ? parseDateOnly(req.query.to) : new Date();

  if (global.DB_OFFLINE) {
    return res.json({
      summary: { totalRevenue: 0, totalTransactions: 0, totalProducts: 0, averageOrderValue: 0, uniqueCustomers: 0 },
      salesByDay: [],
      salesByPayment: [],
      topProducts: [],
      salesByCategory: [],
      hourlySales: []
    });
  }

  try {
    // Get all transactions (filter by created_at in memory)
    const txResult = await pool.query(
      `SELECT * FROM transactions WHERE business_id = $1`,
      [businessId]
    );
    const itemResult = await pool.query(
      `SELECT * FROM transaction_items WHERE business_id = $1`,
      [businessId]
    );
    const paymentResult = await pool.query(
      `SELECT * FROM credit_payments WHERE business_id = $1`,
      [businessId]
    );
    const customerBalanceResult = await pool.query(
      `SELECT COALESCE(SUM(credit_balance), 0) as total FROM customers WHERE business_id = $1`,
      [businessId]
    );

    const transactions = txResult.rows.filter(Boolean);
    const totalOutstandingDebt = parseFloat(customerBalanceResult.rows[0].total || 0);
    console.log(`[Reports API] business=${businessId} rawTx=${txResult.rows.length} rawPayments=${paymentResult.rows.length}`);

    const filteredPayments = paymentResult.rows.filter(p => {
      const createdAt = p.created_at;
      if (!createdAt) return false;
      const dateObj = new Date(createdAt);
      
      // Use localized start/end for the selected period
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      
      const match = dateObj >= start && dateObj <= end;
      return match;
    });

    console.log(`[Reports API] filteredPayments=${filteredPayments.length}`);
    const filteredTransactions = transactions.filter(t => {
      const createdAt = t.created_at || t.updated_at;
      if (!createdAt) return false;
      const dateObj = new Date(createdAt);
      if (isNaN(dateObj.getTime())) return false;
      
      // Full day range handling
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      
      return dateObj >= start && dateObj <= end;
    });

    console.log(`[Reports API] filteredTransactions=${filteredTransactions.length}`);
    filteredTransactions.forEach(t => {
        console.log(`  - TX: ${t.receipt_number}, method: "${t.payment_method}", total: ${t.grand_total}, status: ${t.status}`);
    });

    const uniqueCustomers = new Set(filteredTransactions.filter(t => t.customer_id).map(t => t.customer_id)).size;
    
    // Realized Revenue = (Non-Credit Sales) + (Debt Payments Received)
    const realizedSales = filteredTransactions
      .filter(t => {
          const method = (t.payment_method || 'cash').trim().toLowerCase();
          return method !== 'credit';
      })
      .reduce((sum, t) => sum + (parseFloat(t.grand_total) || 0), 0);
    const totalPaymentsReceived = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalRevenue = realizedSales + totalPaymentsReceived;

    console.log(`[Reports API] realizedSales=${realizedSales} totalPayments=${totalPaymentsReceived} totalRevenue=${totalRevenue}`);

    const salesByDayMap = new Map();
    filteredTransactions.forEach(t => {
      const createdAt = t.created_at || t.updated_at;
      const dateObj = new Date(createdAt);
      const date = dateObj.toISOString().split('T')[0];
      if (!salesByDayMap.has(date)) salesByDayMap.set(date, { date, revenue: 0, transactions: 0 });
      const day = salesByDayMap.get(date);
      const method = (t.payment_method || 'cash').trim().toLowerCase();
      day.revenue += (method === 'credit') ? 0 : parseFloat(t.grand_total) || 0;
      day.transactions++;
    });

    // Add payments to salesByDayMap
    filteredPayments.forEach(p => {
      const date = new Date(p.created_at).toISOString().split('T')[0];
      if (!salesByDayMap.has(date)) salesByDayMap.set(date, { date, revenue: 0, transactions: 0 });
      const day = salesByDayMap.get(date);
      day.revenue += parseFloat(p.amount) || 0;
    });

    const paymentMap = new Map();
    filteredTransactions.forEach(t => {
      const method = (t.payment_method || 'cash').toLowerCase();
      if (!paymentMap.has(method)) paymentMap.set(method, { method: t.payment_method || 'cash', amount: 0, count: 0 });
      const p = paymentMap.get(method);
      p.amount += parseFloat(t.grand_total) || 0;
      p.count++;
    });

    // Summary Card: Credit = (New Credit Issued in Period) - (Debt Payments Received in Period)
    // This reflects the NET debt change for the selected timeframe.
    const creditSalesInPeriod = filteredTransactions
      .filter(t => (t.payment_method || 'cash').toLowerCase() === 'credit')
      .reduce((sum, t) => sum + (parseFloat(t.grand_total) || 0), 0);
    
    const summary = {
      total_revenue: totalRevenue,
      transaction_count: filteredTransactions.length,
      avg_basket: filteredTransactions.length > 0 ? totalRevenue / filteredTransactions.length : 0,
      cash_total: (paymentMap.get('cash')?.amount || 0),
      momo_total: (paymentMap.get('momo')?.amount || 0),
      card_total: (paymentMap.get('card')?.amount || 0),
      credit_total: Math.max(0, creditSalesInPeriod - totalPaymentsReceived)
    };

    const items = [];
    filteredTransactions.forEach(t => {
      const matchedItems = itemResult.rows.filter(item => item.transaction_id === t.id);
      matchedItems.forEach(item => {
        items.push({ ...item, received_at: t.created_at || t.updated_at });
      });
    });

    const productMap = new Map();
    items.forEach(i => {
      const name = i.product_name || 'Unknown';
      if (!productMap.has(name)) productMap.set(name, { name, quantity: 0, revenue: 0 });
      const p = productMap.get(name);
      p.quantity += parseInt(i.quantity || 0);
      p.revenue += parseFloat(i.line_total) || 0;
    });

    const categoryMap = new Map();
    items.forEach(i => {
      const cat = i.category || 'General';
      if (!categoryMap.has(cat)) categoryMap.set(cat, { category: cat, revenue: 0, percentage: 0 });
      categoryMap.get(cat).revenue += parseFloat(i.line_total) || 0;
    });

    const totalCategoryRevenue = Array.from(categoryMap.values()).reduce((s, c) => s + c.revenue, 0);
    categoryMap.forEach(c => c.percentage = Math.round((c.revenue / totalCategoryRevenue) * 100) || 0);

    const hourlyMap = new Map();
    for (let i = 0; i < 24; i++) hourlyMap.set(i, { hour: i, revenue: 0 });
    filteredTransactions.forEach(t => {
      const createdAt = t.created_at || t.updated_at;
      if (!createdAt) return;
      const dateObj = new Date(createdAt);
      if (isNaN(dateObj.getTime())) return;
      const hour = dateObj.getHours();
      hourlyMap.get(hour).revenue += parseFloat(t.grand_total) || 0;
    });

    res.json({
      summary: {
        ...summary,
        totalProducts: productMap.size,
        uniqueCustomers
      },
      salesByDay: Array.from(salesByDayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      salesByPayment: Array.from(paymentMap.values()).sort((a, b) => b.amount - a.amount),
      topProducts: Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue),
      salesByCategory: Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue),
      hourlySales: Array.from(hourlyMap.values())
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ── Customer & Credit API ──

// List Customers
app.get('/api/portal/customers', requireAuth, async (req, res) => {
  const business_id = req.auth.businessId;
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE business_id = $1 ORDER BY credit_balance DESC, name ASC',
      [business_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Pay Debt (Portal)
app.post('/api/portal/customers/:id/pay', requireAuth, async (req, res) => {
  const business_id = req.auth.businessId;
  const { id } = req.params;
  const { amount, method, note } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update customer balance
    const updated = await client.query(
      'UPDATE customers SET credit_balance = GREATEST(0, credit_balance - $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND business_id = $3 RETURNING *',
      [amount, id, business_id]
    );

    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Record payment
    await client.query(
      'INSERT INTO credit_payments (business_id, customer_id, amount, payment_method, note) VALUES ($1, $2, $3, $4, $5)',
      [business_id, id, amount, method || 'cash', note || 'Portal payment']
    );

    await client.query('COMMIT');
    res.json({ success: true, customer: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment' });
  } finally {
    client.release();
  }
});

// --- SUPER ADMIN MANAGEMENT API ---

app.get('/api/portal/admin/super-admins', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query('SELECT id, email, name, created_at FROM super_admins ORDER BY created_at DESC');
    res.json({ success: true, admins: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch super admins' });
  }
});

app.post('/api/portal/admin/super-admins', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name are required' });

  try {
    const password_hash = crypto.createHash('sha256').update(password).digest('hex');
    const result = await pool.query(
      'INSERT INTO super_admins (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email, password_hash, name]
    );
    res.json({ success: true, admin: result.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to create super admin' });
  }
});

app.delete('/api/portal/admin/super-admins/:id', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query('DELETE FROM super_admins WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Admin not found' });
    res.json({ success: true, message: 'Super admin deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete super admin' });
  }
});

// Serve Portal SPA Assets
// Optional: host small update metadata only (installers go on GitHub Releases)
app.use('/updates', express.static(path.join(__dirname, 'updates'), {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.use(express.static(path.join(__dirname, 'portal', 'dist')));

// SPA Catch-all (Must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'portal', 'dist', 'index.html'));
});

if (cluster.isPrimary) {
  console.log(`🚀 Primary cluster process ${process.pid} is running`);
  
  // 1. Initialize Database (only done by primary)
  initDb().then(() => {
    // 2. Data Retention Policy: cleanup synced_data older than 30 days
    // Runs once a day
    setInterval(async () => {
      try {
        const res = await pool.query(`DELETE FROM synced_data WHERE received_at < NOW() - INTERVAL '30 days'`);
        if (res.rowCount > 0) {
          console.log(`[Retention Policy] Cleaned up ${res.rowCount} old synced_data records.`);
        }
      } catch (err) {
        console.error('[Retention Policy Error]', err.message);
      }
    }, 24 * 60 * 60 * 1000); 

    // 3. Fork workers
    // Use up to 4 workers by default, or the number of CPUs if fewer
    const numCPUs = os.cpus().length;
    const workers = Math.min(numCPUs, 4);
    
    console.log(`🚀 Forking ${workers} worker processes...`);
    for (let i = 0; i < workers; i++) {
      cluster.fork();
    }
  }).catch((err) => {
    console.error('❌ Database init failed — check DATABASE_URL on Railway:', err.message);
    process.exit(1);
  });

  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // Worker processes handle the actual HTTP requests
  app.listen(port, '0.0.0.0', () => {
    console.log(`✅ SikaPOS Worker ${process.pid} listening on port ${port}`);
  });
}
