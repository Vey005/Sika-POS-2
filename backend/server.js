const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const compression = require('compression');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

// Updates upload directory setup
const updatesDir = path.join(__dirname, 'updates');
const releasesArchiveDir = path.join(updatesDir, 'releases');
if (!fs.existsSync(updatesDir)) {
  fs.mkdirSync(updatesDir, { recursive: true });
}
if (!fs.existsSync(releasesArchiveDir)) {
  fs.mkdirSync(releasesArchiveDir, { recursive: true });
}

const lastInstallerMetaPath = path.join(updatesDir, '.last-installer.json');

function parseLatestYml(content) {
  const versionMatch = content.match(/^version:\s*['"]?([^'"\n]+)['"]?/m);
  const pathMatch = content.match(/^path:\s*['"]?([^'"\n]+)['"]?/m);
  const shaMatch = content.match(/^sha512:\s*([A-Za-z0-9+/=]+)/m);
  return {
    version: versionMatch ? versionMatch[1].trim() : null,
    path: pathMatch ? pathMatch[1].trim() : null,
    sha512: shaMatch ? shaMatch[1].trim() : null,
  };
}

/** electron-updater expects URL-safe installer names (spaces → hyphens). */
function toUpdateSafeFilename(name) {
  return String(name || '').replace(/\s+/g, '-');
}

function sha512Base64OfFile(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

/** Build latest.yml from the installer on disk so sha512/size always match the hosted .exe */
function buildLatestYmlFromInstaller({ version, installerPath, installerFilename }) {
  const safeName = toUpdateSafeFilename(installerFilename);
  const stat = fs.statSync(installerPath);
  const sha512 = sha512Base64OfFile(installerPath);
  const releaseDate = new Date().toISOString();
  return {
    safeName,
    sha512,
    size: stat.size,
    content: `version: ${version}
files:
  - url: ${safeName}
    sha512: ${sha512}
    size: ${stat.size}
path: ${safeName}
sha512: ${sha512}
releaseDate: '${releaseDate}'
`,
  };
}

function resolveInstallerFile(updatesRoot, ymlPath, fallbackSafeName) {
  const candidates = new Set();
  if (ymlPath) {
    candidates.add(ymlPath);
    candidates.add(ymlPath.replace(/\s+/g, '-'));
    candidates.add(ymlPath.replace(/-/g, ' '));
  }
  if (fallbackSafeName) {
    candidates.add(fallbackSafeName);
    candidates.add(fallbackSafeName.replace(/\s+/g, '-'));
  }
  for (const name of candidates) {
    const full = path.join(updatesRoot, name);
    if (fs.existsSync(full)) return { full, filename: path.basename(full) };
  }
  return null;
}

async function saveAppReleaseRecord({ version, installerFilename, installerPath, installerSize, ymlPath, uploadedBy }) {
  await pool.query('UPDATE app_releases SET is_current = false WHERE is_current = true');
  const result = await pool.query(
    `INSERT INTO app_releases (version, installer_filename, installer_path, installer_size, yml_path, is_current, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, true, $6)
     RETURNING id, version, installer_filename, installer_size, is_current, created_at`,
    [version, installerFilename, installerPath, installerSize, ymlPath, uploadedBy || null]
  );
  return result.rows[0];
}

// Multer config for app updates
const updatesStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, updatesDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const uploadUpdate = multer({ storage: updatesStorage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max per chunk

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
app.use(compression());
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
      const insertUser = `INSERT INTO users (business_id, local_id, name, pin, role, cashier_nav_visibility, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (business_id, local_id) DO UPDATE SET
          name = EXCLUDED.name,
          pin = EXCLUDED.pin,
          role = EXCLUDED.role,
          cashier_nav_visibility = EXCLUDED.cashier_nav_visibility,
          updated_at = EXCLUDED.updated_at`;

      for (const userPayload of users) {
        await q.query(insertUser, [
          businessId,
          userPayload.id ?? null,
          userPayload.name || 'User',
          userPayload.pin || '',
          userPayload.role || 'cashier',
          userPayload.cashier_nav_visibility ?? null,
          userPayload.created_at ? new Date(userPayload.created_at) : now,
          userPayload.updated_at ? new Date(userPayload.updated_at) : now
        ]);
      }
      console.log(`[Replicate Users] Successfully synced ${users.length} users for business ${obfuscateKey(businessId)}`);
      return;
    }
    case 'attendance': {
      const records = Array.isArray(payload) ? payload : [payload];
      const insertRecord = `
        INSERT INTO attendance (business_id, local_id, user_id, type, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (business_id, local_id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          type = EXCLUDED.type,
          created_at = EXCLUDED.created_at
      `;
      for (const rec of records) {
        await q.query(insertRecord, [
          businessId,
          rec.local_id ?? rec.id,
          rec.user_id,
          rec.type,
          rec.created_at ? new Date(rec.created_at) : now
        ]);
      }
      console.log(`[Replicate Attendance] Successfully synced ${records.length} logs for business ${obfuscateKey(businessId)}`);
      return;
    }
    case 'restock_invoice': {
      const itemsJson = JSON.stringify(payload.items || []);
      // Delete existing to avoid duplication, then insert (bypasses ON CONFLICT constraint requirement)
      await q.query(
        `DELETE FROM cloud_restock_orders WHERE business_id = $1 AND invoice_number = $2`,
        [businessId, payload.invoice_number]
      );
      await q.query(
        `INSERT INTO cloud_restock_orders (business_id, invoice_number, supplier_name, notes, is_paid, created_by, status, items, new_products, created_at, applied_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'applied', $7, '[]'::jsonb, $8, $8)`,
        [
          businessId,
          payload.invoice_number,
          payload.supplier_name || null,
          payload.notes || null,
          payload.is_paid ? true : false,
          payload.created_by || 'POS Cashier',
          itemsJson,
          payload.created_at || now
        ]
      );
      return;
    }
    case 'transaction': {
      if (operation === 'update' && localId != null && payload.status) {
        const voidReason = payload.reason || payload.void_reason || null;
        const status = String(payload.status).toLowerCase();
        const zeroPaid = status === 'voided' || status === 'reversed';
        const updateParams = zeroPaid
          ? [businessId, localId, status, voidReason, now, 0]
          : [businessId, localId, status, voidReason, now];
        const paidClause = zeroPaid ? ', paid_amount = $6' : '';

        let updateResult = await q.query(
          `UPDATE transactions SET status = $3, void_reason = COALESCE($4, void_reason), updated_at = $5${paidClause}
           WHERE business_id = $1 AND local_id = $2`,
          updateParams
        );

        const receiptNumber = payload.receipt_number || payload.receiptNumber;
        if (updateResult.rowCount === 0 && receiptNumber) {
          updateResult = await q.query(
            `UPDATE transactions SET status = $3, void_reason = COALESCE($4, void_reason), updated_at = $5${paidClause}
             WHERE business_id = $1 AND receipt_number = $2`,
            zeroPaid
              ? [businessId, receiptNumber, status, voidReason, now, 0]
              : [businessId, receiptNumber, status, voidReason, now]
          );
        }

        if (updateResult.rowCount > 0) {
          console.log(`[Replicate Transaction] Updated ${updateResult.rowCount} row(s) to status=${status} local_id=${localId}`);
        } else {
          console.warn(`[Replicate Transaction] Update missed: business=${obfuscateKey(businessId)} local_id=${localId} receipt=${receiptNumber || 'n/a'}`);
        }
        return;
      }

      const txResult = await q.query(
        `INSERT INTO transactions (business_id, local_id, receipt_number, customer_id, customer_name, cashier_name, status, payment_method, subtotal, discount_amount, discount_type, tax_vat, tax_nhil, tax_getfund, tax_covid, total_tax, grand_total, amount_tendered, change_given, momo_reference, void_reason, notes, paid_amount, split_cash, split_momo, created_at, updated_at)
         VALUES ($1::varchar, $2::integer, $3::varchar, $4::integer, $5::varchar, $6::varchar, $7::varchar, $8::varchar, $9::float, $10::float, $11::varchar, $12::float, $13::float, $14::float, $15::float, $16::float, $17::float, $18::float, $19::float, $20::varchar, $21::text, $22::text, $23::float, $24::float, $25::float, $26::timestamp, $27::timestamp)
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
           split_cash = EXCLUDED.split_cash,
           split_momo = EXCLUDED.split_momo,
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
          parseFloat(payload.split_cash ?? 0),
          parseFloat(payload.split_momo ?? 0),
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

const maxPoolSize = process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 10;

/** Payment breakdown SQL (matches POS: split allocates cash + MoMo portions). */
const SQL_TX_CASH_TOTAL = `COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total WHEN payment_method = 'split' THEN GREATEST(0, COALESCE(split_cash, 0) - COALESCE(change_given, 0)) ELSE 0 END), 0)::double precision`;
const SQL_TX_MOMO_TOTAL = `COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN grand_total WHEN payment_method = 'split' THEN COALESCE(split_momo, 0) ELSE 0 END), 0)::double precision`;
const pool = new Pool({
  ...poolConfig,
  max: maxPoolSize,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('[Postgres Pool Error]:', err);
});

// Pool health: log only when stressed or when POOL_MONITOR=1 (avoid noisy production logs)
const poolMonitorVerbose = process.env.POOL_MONITOR === '1' || process.env.POOL_MONITOR === 'true';
setInterval(() => {
  const stats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    maxLimit: maxPoolSize,
  };
  const underPressure =
    stats.waiting > 0 ||
    stats.total >= Math.max(1, Math.floor(maxPoolSize * 0.85));
  if (poolMonitorVerbose) {
    console.log('[Pool Monitor]', stats);
  } else if (underPressure) {
    console.warn('[Pool Monitor] Connection pool under pressure:', stats);
  }
}, 60000);

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
          cashier_nav_visibility TEXT,
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

        CREATE TABLE IF NOT EXISTS business_owners (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS owner_stores (
          id SERIAL PRIMARY KEY,
          owner_id INTEGER NOT NULL REFERENCES business_owners(id) ON DELETE CASCADE,
          license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(owner_id, license_id)
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
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS cashier_nav_visibility TEXT;');

        // Migration: Add credit_limit to customers table
        await pool.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit REAL NOT NULL DEFAULT 0;');
        await pool.query('UPDATE customers SET credit_limit = 0 WHERE credit_limit IS NULL;');

        // Migration: Add paid_amount to transactions
        await pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount REAL NOT NULL DEFAULT 0;');
        await pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_cash REAL NOT NULL DEFAULT 0;');
        await pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_momo REAL NOT NULL DEFAULT 0;');
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

          CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            business_id VARCHAR(100) NOT NULL,
            local_id INTEGER,
            user_id INTEGER,
            type VARCHAR(20) NOT NULL,
            created_at TIMESTAMP,
            UNIQUE(business_id, local_id)
          );

          CREATE TABLE IF NOT EXISTS app_releases (
            id SERIAL PRIMARY KEY,
            version VARCHAR(50) NOT NULL,
            installer_filename VARCHAR(255) NOT NULL,
            installer_path TEXT NOT NULL,
            installer_size BIGINT,
            yml_path TEXT,
            is_current BOOLEAN DEFAULT false,
            uploaded_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        try {
          await pool.query('CREATE INDEX IF NOT EXISTS idx_app_releases_created ON app_releases(created_at DESC);');
        } catch (e) { /* ignore */ }

        // Ensure unique constraints exist (Postgres doesn't add them automatically with CREATE TABLE IF NOT EXISTS if table exists)
        try { await pool.query('ALTER TABLE credit_payments ADD CONSTRAINT uniq_cp_biz_local UNIQUE(business_id, local_id);'); } catch (e) {}
        try { await pool.query('ALTER TABLE transactions ADD CONSTRAINT uniq_tx_biz_receipt UNIQUE(business_id, receipt_number);'); } catch (e) {}
        try { await pool.query('ALTER TABLE customers ADD CONSTRAINT uniq_cust_biz_local UNIQUE(business_id, local_id);'); } catch (e) {}
        try { await pool.query('ALTER TABLE attendance ADD CONSTRAINT uniq_attendance_biz_local UNIQUE(business_id, local_id);'); } catch (e) {}

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
        
        -- Business-scoped lookups for high performance at scale
        CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_transactions_business ON transactions(business_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_business_date ON transactions(business_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_transactions_business_status ON transactions(business_id, status);
        CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
        CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
        CREATE INDEX IF NOT EXISTS idx_credit_payments_business ON credit_payments(business_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_transaction_items_txid ON transaction_items(transaction_id);
        CREATE INDEX IF NOT EXISTS idx_transaction_items_business ON transaction_items(business_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_business ON attendance(business_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_business_date ON attendance(business_id, created_at DESC);
      `);

      // Cloud Restock Orders table (portal → desktop sync)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS cloud_restock_orders (
          id SERIAL PRIMARY KEY,
          business_id VARCHAR(100) NOT NULL,
          invoice_number VARCHAR(100),
          supplier_name VARCHAR(255),
          notes TEXT,
          is_paid BOOLEAN DEFAULT FALSE,
          created_by VARCHAR(255),
          status VARCHAR(50) DEFAULT 'pending',
          items JSONB NOT NULL DEFAULT '[]',
          new_products JSONB DEFAULT '[]',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          applied_at TIMESTAMP,
          CONSTRAINT unique_business_invoice UNIQUE (business_id, invoice_number)
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_restock_business ON cloud_restock_orders(business_id, status);
      `);

      // Migration: Alter existing cloud_restock_orders table to add the unique constraint if not present
      try {
        await pool.query(`
          ALTER TABLE cloud_restock_orders ADD CONSTRAINT unique_business_invoice UNIQUE (business_id, invoice_number);
        `);
      } catch (err) {
        // Ignore if constraint already exists
      }

      // 5. Migration: Mark any license with a synced business_name as active
      try {
        await pool.query(`
          UPDATE licenses 
          SET status = 'active', activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP) 
          WHERE business_name IS NOT NULL AND business_name != '' AND status != 'active'
        `);
      } catch (err) { /* ignore */ }

      // Backfill voided/reversed status from sync history (fixes portal showing reversed as completed)
      try {
        const backfill = await pool.query(`
          UPDATE transactions t
          SET
            status = LOWER(sd.payload->>'status'),
            void_reason = COALESCE(sd.payload->>'reason', sd.payload->>'void_reason', t.void_reason),
            paid_amount = 0,
            updated_at = GREATEST(t.updated_at, sd.received_at)
          FROM synced_data sd
          WHERE sd.entity = 'transaction'
            AND sd.operation = 'update'
            AND sd.business_id = t.business_id
            AND t.local_id = (sd.payload->>'id')::integer
            AND LOWER(sd.payload->>'status') IN ('voided', 'reversed')
            AND LOWER(COALESCE(t.status, 'completed')) NOT IN ('voided', 'reversed')
        `);
        if (backfill.rowCount > 0) {
          console.log(`[Migration] Backfilled ${backfill.rowCount} reversed/voided transaction(s) from sync history`);
        }
      } catch (err) { /* ignore if synced_data schema differs */ }

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

// Pull Endpoint (For Data Recovery, supporting pagination)
app.get('/v1/sync/pull', requireSyncAuth, async (req, res) => {
  const business_id = req.business_id;

  if (!business_id) return res.status(400).json({ success: false, message: 'business_id is required' });

  const page = req.query.page ? Math.max(1, parseInt(req.query.page) || 1) : null;
  const limit = req.query.limit ? Math.min(5000, Math.max(1, parseInt(req.query.limit) || 500)) : null;

  try {
    let result;
    if (page && limit) {
      const offset = (page - 1) * limit;
      result = await pool.query(
        'SELECT entity, payload FROM synced_data WHERE business_id = $1 ORDER BY received_at ASC LIMIT $2 OFFSET $3',
        [business_id, limit, offset]
      );
    } else {
      // Backward compatibility: fetch all up to a large safety cap (e.g. 100,000 items)
      result = await pool.query(
        'SELECT entity, payload FROM synced_data WHERE business_id = $1 ORDER BY received_at ASC LIMIT 100000',
        [business_id]
      );
    }

    // Group items by entity to make it easier for the client to process
    const recoveryData = result.rows.reduce((acc, row) => {
      if (!acc[row.entity]) acc[row.entity] = [];
      acc[row.entity].push(row.payload);
      return acc;
    }, {});

    const hasMore = page && limit ? result.rows.length === limit : false;

    console.log('[Recovery] Serving ' + result.rows.length + ' items for business: ' + obfuscateKey(business_id));
    res.json({ success: true, data: recoveryData, hasMore });
  } catch (err) {
    console.error('[Recovery Error]:', err.message);
    res.status(500).json({ success: false, message: 'Recovery failed on server' });
  }
});

// Sync-Down: Get latest customer balances (supporting incremental sync)
app.get('/v1/sync/customers', requireSyncAuth, async (req, res) => {
  const business_id = req.business_id;
  const since = req.query.since || '';

  try {
    let customerQuery = 'SELECT id, local_id, credit_balance, credit_limit, loyalty_points, total_spent, updated_at FROM customers WHERE business_id = $1';
    let paymentsQuery = `SELECT id, local_id, customer_id, amount, payment_method, note, created_at
                         FROM credit_payments
                         WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`;
    const params = [business_id];

    if (since) {
      params.push(new Date(since));
      customerQuery += ' AND (updated_at >= $2 OR created_at >= $2)';
      paymentsQuery += ' AND created_at >= $2';
    }

    const result = await pool.query(customerQuery, params);
    const paymentsResult = await pool.query(paymentsQuery, params);

    console.log(`[Sync API] Returning ${result.rows.length} customers, ${paymentsResult.rows.length} payments for business ${obfuscateKey(business_id)} since ${since || 'beginning'}`);

    res.json({
      success: true,
      data: {
        customers: result.rows,
        payments: paymentsResult.rows
      }
    });
  } catch (err) {
    console.error('[Sync Customers Error]:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch customer balances' });
  }
});

// Sync Users: Pull all users (with hashed pins and cashier visibility) to the local POS
app.get('/v1/sync/users', requireSyncAuth, async (req, res) => {
  const businessId = req.business_id;
  try {
    const result = await pool.query(
      `SELECT id, local_id, name, pin, role, cashier_nav_visibility, created_at, updated_at 
       FROM users 
       WHERE business_id = $1`,
      [businessId]
    );

    res.json({
      success: true,
      data: {
        users: result.rows
      }
    });
  } catch (err) {
    console.error('[Sync Users Error]:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch user updates' });
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

function hashOwnerPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function licenseToStoreDto(license) {
  return {
    businessId: license.license_key,
    businessName: license.business_name || 'Unnamed Store',
    businessAddress: license.business_address || null,
    businessPhone: license.business_phone || null,
    businessLogo: license.business_logo || null,
    status: license.status || 'inactive',
  };
}

async function fetchOwnerStores(ownerId) {
  const result = await pool.query(
    `SELECT l.* FROM licenses l
     INNER JOIN owner_stores os ON os.license_id = l.id
     WHERE os.owner_id = $1
     ORDER BY COALESCE(l.business_name, l.license_key) ASC`,
    [ownerId]
  );
  return result.rows.map(licenseToStoreDto);
}

async function verifyStoreAdminPin(businessId, password) {
  const userResult = await pool.query(
    "SELECT payload FROM synced_data WHERE business_id = $1 AND entity = 'users' ORDER BY received_at DESC LIMIT 1",
    [businessId]
  );
  if (userResult.rows.length === 0) return null;
  let users = parsePayload(userResult.rows[0]) || [];
  if (!Array.isArray(users)) users = [];
  const adminUser = users.find((u) => u.role === 'admin');
  if (!adminUser) return null;
  const inputHashedPin = crypto.createHash('sha256').update(password + PIN_SALT).digest('hex');
  if (inputHashedPin !== adminUser.pin) return null;
  return adminUser;
}

function businessTokenForLicense(license, userName, ownerId) {
  return signToken({
    role: 'business',
    businessId: license.license_key,
    businessName: license.business_name,
    userName: userName || 'Owner',
    ownerId: ownerId || undefined,
  });
}

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

// --- Multi-store owner accounts ---

app.post('/api/portal/owners/register', rateLimit, async (req, res) => {
  const { email, password, name } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (global.DB_OFFLINE) {
    return res.json({ success: true, owner: { id: 1, email: normalizedEmail, name: name || 'Owner' } });
  }
  try {
    const result = await pool.query(
      `INSERT INTO business_owners (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [normalizedEmail, hashOwnerPassword(password), name?.trim() || normalizedEmail.split('@')[0]]
    );
    return res.json({ success: true, owner: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('[Owner Register]', err);
    return res.status(500).json({ error: 'Could not create owner account' });
  }
});

app.post('/api/portal/owners/login', rateLimit, async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (global.DB_OFFLINE) {
    const token = signToken({ role: 'owner', ownerId: 1, email: normalizedEmail, name: 'Demo Owner' });
    return res.json({
      success: true,
      role: 'owner',
      token,
      ownerName: 'Demo Owner',
      stores: [
        { businessId: 'mock-123', businessName: 'Demo Store A', status: 'active' },
        { businessId: 'mock-456', businessName: 'Demo Store B', status: 'active' },
      ],
    });
  }
  try {
    const ownerResult = await pool.query(
      'SELECT * FROM business_owners WHERE LOWER(email) = LOWER($1) AND password_hash = $2',
      [normalizedEmail, hashOwnerPassword(password)]
    );
    if (ownerResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const owner = ownerResult.rows[0];
    const stores = await fetchOwnerStores(owner.id);
    const token = signToken({
      role: 'owner',
      ownerId: owner.id,
      email: owner.email,
      name: owner.name,
    });
    return res.json({
      success: true,
      role: 'owner',
      token,
      ownerName: owner.name,
      stores,
    });
  } catch (err) {
    console.error('[Owner Login]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/portal/owners/stores', requireAuth, async (req, res) => {
  const ownerId = req.auth.role === 'owner' ? req.auth.ownerId : req.auth.ownerId;
  if (!ownerId) return res.status(403).json({ error: 'Owner access required' });
  if (global.DB_OFFLINE) {
    return res.json({
      stores: [
        { businessId: 'mock-123', businessName: 'Demo Store A', status: 'active' },
        { businessId: 'mock-456', businessName: 'Demo Store B', status: 'active' },
      ],
    });
  }
  try {
    const stores = await fetchOwnerStores(ownerId);
    return res.json({ stores });
  } catch (err) {
    console.error('[Owner Stores]', err);
    return res.status(500).json({ error: 'Could not load stores' });
  }
});

app.post('/api/portal/owners/link-store', requireAuth, async (req, res) => {
  if (req.auth.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const { licenseKey, adminPin } = req.body || {};
  if (!licenseKey || !adminPin) {
    return res.status(400).json({ error: 'License key and store admin PIN are required' });
  }
  if (global.DB_OFFLINE) {
    return res.json({
      success: true,
      stores: [
        { businessId: 'mock-123', businessName: 'Demo Store A', status: 'active' },
        { businessId: String(licenseKey), businessName: 'Linked Store', status: 'active' },
      ],
    });
  }
  try {
    const licenseResult = await pool.query(
      'SELECT * FROM licenses WHERE UPPER(TRIM(license_key)) = UPPER(TRIM($1))',
      [licenseKey]
    );
    if (licenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'License key not found' });
    }
    const license = licenseResult.rows[0];
    const adminUser = await verifyStoreAdminPin(license.license_key, adminPin);
    if (!adminUser) {
      return res.status(401).json({ error: 'Invalid admin PIN for this store' });
    }
    await pool.query(
      `INSERT INTO owner_stores (owner_id, license_id) VALUES ($1, $2)
       ON CONFLICT (owner_id, license_id) DO NOTHING`,
      [req.auth.ownerId, license.id]
    );
    const stores = await fetchOwnerStores(req.auth.ownerId);
    return res.json({ success: true, stores });
  } catch (err) {
    console.error('[Owner Link Store]', err);
    return res.status(500).json({ error: 'Could not link store' });
  }
});

app.post('/api/portal/owners/switch-store', requireAuth, async (req, res) => {
  const ownerId = req.auth.ownerId;
  if (!ownerId) {
    return res.status(403).json({ error: 'Multi-store owner session required' });
  }
  const { businessId } = req.body || {};
  if (!businessId) {
    return res.status(400).json({ error: 'businessId is required' });
  }
  if (global.DB_OFFLINE) {
    const token = signToken({
      role: 'business',
      businessId,
      businessName: 'Demo Store',
      userName: req.auth.name || 'Owner',
      ownerId,
    });
    return res.json({
      success: true,
      role: 'business',
      token,
      businessId,
      businessName: 'Demo Store',
      userName: req.auth.name || 'Owner',
    });
  }
  try {
    const access = await pool.query(
      `SELECT l.* FROM licenses l
       INNER JOIN owner_stores os ON os.license_id = l.id AND os.owner_id = $1
       WHERE l.license_key = $2`,
      [ownerId, businessId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'This store is not linked to your account' });
    }
    const license = access.rows[0];
    const token = businessTokenForLicense(license, req.auth.name || req.auth.userName, ownerId);
    return res.json({
      success: true,
      role: 'business',
      token,
      businessId: license.license_key,
      businessName: license.business_name,
      businessAddress: license.business_address || null,
      businessPhone: license.business_phone || null,
      businessLogo: license.business_logo || null,
      userName: req.auth.name || 'Owner',
    });
  } catch (err) {
    console.error('[Owner Switch Store]', err);
    return res.status(500).json({ error: 'Could not switch store' });
  }
});

app.post('/api/portal/admin/owners/link-license', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { ownerEmail, licenseId } = req.body || {};
  if (!ownerEmail || !licenseId) {
    return res.status(400).json({ error: 'ownerEmail and licenseId are required' });
  }
  try {
    const ownerResult = await pool.query(
      'SELECT id FROM business_owners WHERE LOWER(email) = LOWER($1)',
      [ownerEmail.trim()]
    );
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Owner account not found' });
    }
    await pool.query(
      `INSERT INTO owner_stores (owner_id, license_id) VALUES ($1, $2)
       ON CONFLICT (owner_id, license_id) DO NOTHING`,
      [ownerResult.rows[0].id, licenseId]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[Admin Link Owner Store]', err);
    return res.status(500).json({ error: 'Could not link store to owner' });
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
    // 1-5. Fetch all summary metrics and recent transactions in parallel
    const [productCountResult, debtResult, txSummaryResult, recentTxResult, chartDataResult] = await Promise.all([
      pool.query(
        "SELECT COUNT(*)::integer as total, COUNT(*) FILTER (WHERE stock_qty <= low_stock_threshold AND low_stock_threshold > 0)::integer as low_stock FROM products WHERE business_id = $1 AND is_active = TRUE",
        [businessId]
      ),
      pool.query(
        "SELECT COALESCE(SUM(credit_balance), 0)::double precision as total FROM customers WHERE business_id = $1",
        [businessId]
      ),
      pool.query(
        `SELECT 
           COUNT(*)::integer as total_transactions,
           COALESCE(SUM(paid_amount), 0)::double precision as total_sales
         FROM transactions 
         WHERE business_id = $1 
           AND status IN ('completed', 'debt') 
           AND created_at >= $2 
           AND created_at <= $3`,
        [businessId, fromDate, toDate]
      ),
      pool.query(
        `SELECT id, receipt_number, grand_total, paid_amount, created_at, cashier_name, payment_method,
                split_cash, split_momo, change_given, status
         FROM transactions
         WHERE business_id = $1
           AND status IN ('completed', 'debt')
         ORDER BY created_at DESC
         LIMIT 100`,
        [businessId]
      ),
      pool.query(
        `SELECT 
           TO_CHAR(created_at, 'YYYY-MM-DD') as date,
           SUM(paid_amount)::double precision as sales
         FROM transactions
         WHERE business_id = $1
           AND status IN ('completed', 'debt')
           AND created_at >= $2
           AND created_at <= $3
         GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
         ORDER BY date ASC`,
        [businessId, fromDate, toDate]
      )
    ]);

    const totalProducts = productCountResult.rows[0]?.total || 0;
    const lowStockCount = productCountResult.rows[0]?.low_stock || 0;
    const totalOutstandingDebt = parseFloat(debtResult.rows[0]?.total || 0);
    const totalTransactions = txSummaryResult.rows[0]?.total_transactions || 0;
    const totalSales = txSummaryResult.rows[0]?.total_sales || 0;

    const recentTx = recentTxResult.rows.map(tx => ({
      id: tx.id,
      receipt_number: tx.receipt_number,
      grand_total: parseFloat(tx.grand_total || 0),
      paid_amount: parseFloat(tx.paid_amount || 0),
      created_at: tx.created_at ? new Date(tx.created_at).toISOString() : new Date().toISOString(),
      cashier_name: tx.cashier_name || 'Admin',
      payment_method: tx.payment_method,
      split_cash: parseFloat(tx.split_cash || 0),
      split_momo: parseFloat(tx.split_momo || 0),
      change_given: parseFloat(tx.change_given || 0),
      status: tx.status
    }));
    let chartData = chartDataResult.rows.map(row => ({
      date: row.date,
      sales: parseFloat(row.sales || 0)
    }));

    if (chartData.length === 0) {
      chartData.push({ date: new Date().toISOString().split('T')[0], sales: totalSales });
    } else {
      chartData = chartData.slice(-7);
    }

    console.log(`[Dashboard API] Final Total Sales: ${totalSales}, Transactions: ${totalTransactions}, OutstandingDebt: ${totalOutstandingDebt}`);

    res.json({
      totalSales,
      totalCredit: totalOutstandingDebt,
      transactionCount: totalTransactions,
      totalProducts,
      lowStockCount,
      recentTx,
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

// ─── PORTAL RESTOCK ───────────────────────────────────────────────

// Product search for restock modal (lightweight, returns id + name + stock)
app.get('/api/portal/inventory/search', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ products: [] });
  try {
    const result = await pool.query(
      `SELECT local_id, name, barcode, category, unit_price, cost_price, stock_qty, is_pharmacy,
              expiry_date, batch_number
       FROM products
       WHERE business_id = $1 AND is_active = TRUE
         AND (LOWER(name) LIKE $2 OR LOWER(barcode) LIKE $2)
       ORDER BY name ASC LIMIT 20`,
      [businessId, `%${q.toLowerCase()}%`]
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('[Portal Restock Search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get categories for the new-product dropdown
app.get('/api/portal/inventory/categories', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM products WHERE business_id = $1 AND is_active = TRUE ORDER BY category`,
      [businessId]
    );
    res.json({ categories: result.rows.map(r => r.category) });
  } catch (err) {
    console.error('[Portal Categories]', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create a restock order from the portal
app.post('/api/portal/restock', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const { supplier_name, notes, is_paid, items, new_products } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required.' });
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const invoiceNumber = `PRT-${dateStr}-${rand}`;

  try {
    const result = await pool.query(
      `INSERT INTO cloud_restock_orders (business_id, invoice_number, supplier_name, notes, is_paid, created_by, items, new_products)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, invoice_number, status, created_at`,
      [
        businessId,
        invoiceNumber,
        supplier_name || null,
        notes || null,
        is_paid || false,
        req.auth.userName || req.auth.name || 'Portal User',
        JSON.stringify(items),
        JSON.stringify(new_products || [])
      ]
    );

    console.log(`[Portal Restock] Created order ${invoiceNumber} for business ${businessId} with ${items.length} items`);
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error('[Portal Restock Create]', err);
    res.status(500).json({ error: 'Failed to create restock order.' });
  }
});

// List restock orders for portal display
app.get('/api/portal/restock', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  try {
    const result = await pool.query(
      `SELECT id, invoice_number, supplier_name, notes, is_paid, created_by, status, items, new_products, created_at, applied_at
       FROM cloud_restock_orders
       WHERE business_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [businessId]
    );

    const orders = result.rows.map(o => ({
      ...o,
      items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
      new_products: typeof o.new_products === 'string' ? JSON.parse(o.new_products) : o.new_products,
      total_items: (typeof o.items === 'string' ? JSON.parse(o.items) : o.items || []).reduce((s, i) => s + (i.quantity || 0), 0),
      total_cost: (typeof o.items === 'string' ? JSON.parse(o.items) : o.items || []).reduce((s, i) => s + (i.quantity || 0) * (i.cost_price || 0), 0),
    }));

    res.json({ orders });
  } catch (err) {
    console.error('[Portal Restock List]', err);
    res.status(500).json({ error: 'Failed to list restock orders.' });
  }
});

// Desktop pulls pending restock orders
app.get('/v1/sync/pull-restocks', requireSyncAuth, async (req, res) => {
  const businessId = req.business_id;
  try {
    const result = await pool.query(
      `SELECT id, invoice_number, supplier_name, notes, is_paid, created_by, items, new_products, created_at
       FROM cloud_restock_orders
       WHERE business_id = $1 AND status = 'pending'
       ORDER BY created_at ASC`,
      [businessId]
    );

    const orders = result.rows.map(o => ({
      ...o,
      items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
      new_products: typeof o.new_products === 'string' ? JSON.parse(o.new_products) : o.new_products,
    }));

    res.json({ success: true, orders });
  } catch (err) {
    console.error('[Sync Pull Restocks]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch pending restocks.' });
  }
});

// Desktop acknowledges applied restock orders
app.post('/v1/sync/ack-restock', requireSyncAuth, async (req, res) => {
  const businessId = req.business_id;
  const { order_ids } = req.body;

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'order_ids required' });
  }

  try {
    await pool.query(
      `UPDATE cloud_restock_orders SET status = 'applied', applied_at = CURRENT_TIMESTAMP
       WHERE business_id = $1 AND id = ANY($2::int[])`,
      [businessId, order_ids]
    );
    console.log(`[Sync] ACK restock orders ${order_ids.join(',')} for business ${businessId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Sync ACK Restock]', err);
    res.status(500).json({ success: false, error: 'Failed to acknowledge.' });
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
  const paymentMethod = (req.query.payment || '').trim().toLowerCase();

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
    const params = [businessId];
    let dateFilter = '';
    
    if (from) {
      const fromDate = parseDateOnly(from);
      fromDate.setHours(0, 0, 0, 0);
      params.push(fromDate);
      dateFilter += ` AND created_at >= $${params.length}`;
    }
    if (to) {
      const toDate = parseDateOnly(to);
      toDate.setHours(23, 59, 59, 999);
      params.push(toDate);
      dateFilter += ` AND created_at <= $${params.length}`;
    }
    let paymentFilter = '';
    if (paymentMethod) {
      params.push(paymentMethod);
      paymentFilter = ` AND payment_method = $${params.length}`;
    }

    console.log(`[Sales API] business=${obfuscateKey(businessId)} range=${from || 'all'}..${to || 'all'} payment=${paymentMethod || 'all'}`);
    
    // 1. Fetch count and payment totals in one query
    const summaryRes = await pool.query(
      `SELECT
         COUNT(*)::integer as total_count,
         ${SQL_TX_CASH_TOTAL} as cash_total,
         ${SQL_TX_MOMO_TOTAL} as momo_total,
         COALESCE(SUM(CASE WHEN payment_method = 'card' THEN grand_total ELSE 0 END), 0)::double precision as card_total,
         COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total ELSE 0 END), 0)::double precision as credit_total
       FROM transactions
       WHERE business_id = $1 AND status NOT IN ('voided', 'reversed') ${dateFilter}${paymentFilter}`,
      params
    );

    const total = summaryRes.rows[0]?.total_count || 0;
    const cashTotal = summaryRes.rows[0]?.cash_total || 0;
    const momoTotal = summaryRes.rows[0]?.momo_total || 0;
    const cardTotal = summaryRes.rows[0]?.card_total || 0;
    const creditTotal = summaryRes.rows[0]?.credit_total || 0;

    // 2. Fetch debt payments in period
    const paymentsRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::double precision as total_paid 
       FROM credit_payments 
       WHERE business_id = $1 ${dateFilter}`,
      params
    );
    const debtPaymentsTotal = paymentsRes.rows[0]?.total_paid || 0;

    // 3. Fetch paginated transactions
    const offset = (page - 1) * limit;
    const dataParams = [...params, limit, offset];
    
    const dataRes = await pool.query(
      `SELECT *, 
         (SELECT COUNT(*)::integer FROM transaction_items WHERE transaction_id = transactions.id) as item_count 
       FROM transactions 
       WHERE business_id = $1 AND status NOT IN ('voided', 'reversed') ${dateFilter}${paymentFilter} 
       ORDER BY created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const paginatedTransactions = dataRes.rows;

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
        split_cash: parseFloat(tx.split_cash || 0),
        split_momo: parseFloat(tx.split_momo || 0),
        change_given: parseFloat(tx.change_given || 0),
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
    // 1. Fetch totals
    const totalsRes = await pool.query(
      `SELECT 
         COUNT(*)::integer as total_items,
         COALESCE(SUM(stock_qty), 0)::integer as total_stock,
         COALESCE(SUM(stock_qty * unit_price), 0)::double precision as total_value_selling,
         COALESCE(SUM(stock_qty * cost_price), 0)::double precision as total_value_cost
       FROM products
       WHERE business_id = $1 AND is_active = TRUE`,
      [businessId]
    );

    // 2. Fetch category breakdown
    const categoriesRes = await pool.query(
      `SELECT 
         COALESCE(category, 'General') as category,
         COUNT(*)::integer as item_count,
         COALESCE(SUM(stock_qty), 0)::integer as total_stock,
         COALESCE(SUM(stock_qty * unit_price), 0)::double precision as total_value
       FROM products
       WHERE business_id = $1 AND is_active = TRUE
       GROUP BY COALESCE(category, 'General')
       ORDER BY total_value DESC`,
      [businessId]
    );

    res.json({
      totals: totalsRes.rows[0] || { total_items: 0, total_stock: 0, total_value_selling: 0, total_value_cost: 0 },
      categories: categoriesRes.rows
    });
  } catch (err) {
    console.error('[Inventory Overview Error]:', err.message);
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

app.get('/api/portal/reports/attendance', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const days = parseInt(req.query.days) || 30;
  const fromDate = req.query.from ? parseDateOnly(req.query.from) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const toDate = req.query.to ? parseDateOnly(req.query.to) : new Date();

  // Set time limits for strict date matching
  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(23, 59, 59, 999);

  if (global.DB_OFFLINE) {
    return res.json([]);
  }

  try {
    const query = `
      SELECT 
        a.id,
        a.user_id,
        u.name as user_name,
        a.created_at as clock_in,
        (
          SELECT a2.created_at 
          FROM attendance a2 
          WHERE a2.business_id = a.business_id
            AND a2.user_id = a.user_id 
            AND a2.type = 'out' 
            AND a2.created_at > a.created_at 
          ORDER BY a2.created_at ASC 
          LIMIT 1
        ) as clock_out
      FROM attendance a
      JOIN users u ON a.business_id = u.business_id AND a.user_id = u.local_id
      WHERE a.business_id = $1 
        AND a.type = 'in'
        AND a.created_at >= $2
        AND a.created_at <= $3
      ORDER BY a.created_at DESC
    `;
    const result = await pool.query(query, [businessId, fromDate, toDate]);
    res.json(result.rows);
  } catch (err) {
    console.error('[Portal Attendance Report]', err);
    res.status(500).json({ error: 'Failed to fetch attendance logs' });
  }
});

app.get('/api/portal/reports/attendance/:id/sales', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const attendanceId = req.params.id;
  const includeItems = req.query.includeItems === 'true';
  const cashierNameHint = typeof req.query.cashierName === 'string' ? req.query.cashierName.trim() : '';

  if (global.DB_OFFLINE) {
    return res.json({ shift: null, transactions: [], summary: null, itemSummary: [] });
  }

  try {
    const attResult = await pool.query(
      `SELECT 
         a.id,
         a.user_id,
         COALESCE(u.name, $3) as user_name,
         a.created_at as clock_in,
         (
           SELECT a2.created_at 
           FROM attendance a2 
           WHERE a2.business_id = a.business_id
             AND a2.user_id = a.user_id 
             AND a2.type = 'out' 
             AND a2.created_at > a.created_at 
           ORDER BY a2.created_at ASC 
           LIMIT 1
         ) as clock_out
       FROM attendance a
       LEFT JOIN users u ON a.business_id = u.business_id AND a.user_id = u.local_id
       WHERE a.business_id = $1
         AND a.type = 'in'
         AND (a.id::text = $2::text OR a.local_id::text = $2::text)`,
      [businessId, String(attendanceId), cashierNameHint || null]
    );

    if (attResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance log not found' });
    }

    const shift = attResult.rows[0];
    const cashierName = (cashierNameHint || shift.user_name || '').trim();
    if (!cashierName) {
      return res.status(400).json({ error: 'Could not resolve cashier name for this shift' });
    }

    const clockIn = new Date(shift.clock_in);
    const clockOut = shift.clock_out ? new Date(shift.clock_out) : new Date();

    // Case-insensitive cashier match (names can differ slightly after sync)
    const shiftWhere = `
      t.business_id = $1
      AND TRIM(LOWER(t.cashier_name)) = TRIM(LOWER($2))
      AND t.created_at >= $3
      AND t.created_at <= $4
      AND t.status IN ('completed', 'debt')
    `;
    const shiftParams = [businessId, cashierName, clockIn, clockOut];

    const txResult = await pool.query(
      `SELECT 
         t.id,
         t.receipt_number,
         t.created_at,
         t.grand_total,
         t.payment_method,
         t.split_cash,
         t.split_momo,
         t.change_given,
         t.status,
         (SELECT COUNT(*)::integer FROM transaction_items WHERE transaction_id = t.id) as item_count
       FROM transactions t
       WHERE ${shiftWhere}
       ORDER BY t.created_at DESC`,
      shiftParams
    );

    let transactions = txResult.rows;

    if (includeItems && transactions.length > 0) {
      const txIds = transactions.map((t) => t.id);
      const itemsResult = await pool.query(
        `SELECT * FROM transaction_items
         WHERE transaction_id = ANY($1::int[])
         ORDER BY transaction_id, id`,
        [txIds]
      );
      const itemsByTx = new Map();
      for (const item of itemsResult.rows) {
        const list = itemsByTx.get(item.transaction_id) || [];
        list.push(item);
        itemsByTx.set(item.transaction_id, list);
      }
      transactions = transactions.map((t) => ({
        ...t,
        items: itemsByTx.get(t.id) || [],
      }));
    }

    const summaryResult = await pool.query(
      `SELECT 
         COUNT(*)::integer as transaction_count,
         COALESCE(SUM(paid_amount), 0)::double precision as total_revenue,
         ${SQL_TX_CASH_TOTAL} as cash_total,
         ${SQL_TX_MOMO_TOTAL} as momo_total,
         COALESCE(SUM(CASE WHEN payment_method = 'card' THEN grand_total ELSE 0 END), 0)::double precision as card_total,
         COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total ELSE 0 END), 0)::double precision as credit_total
       FROM transactions t
       WHERE ${shiftWhere}`,
      shiftParams
    );

    const itemSummaryResult = await pool.query(
      `SELECT 
         ti.product_name,
         SUM(ti.quantity)::double precision as total_qty
       FROM transaction_items ti
       INNER JOIN transactions t ON t.id = ti.transaction_id
       WHERE ${shiftWhere}
       GROUP BY ti.product_name
       ORDER BY total_qty DESC`,
      shiftParams
    );

    const paymentsResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::double precision as total
       FROM credit_payments
       WHERE business_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [businessId, clockIn, clockOut]
    );

    const summaryRow = summaryResult.rows[0] || {};
    const summary = {
      transaction_count: summaryRow.transaction_count || 0,
      total_revenue: parseFloat(summaryRow.total_revenue || 0),
      cash_total: parseFloat(summaryRow.cash_total || 0),
      momo_total: parseFloat(summaryRow.momo_total || 0),
      card_total: parseFloat(summaryRow.card_total || 0),
      credit_total: parseFloat(summaryRow.credit_total || 0),
      debt_recovered: parseFloat(paymentsResult.rows[0]?.total || 0),
    };

    res.json({
      shift: {
        id: shift.id,
        user_name: cashierName,
        clock_in: shift.clock_in,
        clock_out: shift.clock_out,
      },
      transactions,
      summary,
      itemSummary: itemSummaryResult.rows.map((r) => ({
        product_name: r.product_name,
        total_qty: parseFloat(r.total_qty || 0),
      })),
    });
  } catch (err) {
    console.error('[Portal Attendance Sales]', err);
    res.status(500).json({ error: 'Failed to fetch sales for shift' });
  }
});

app.get('/api/portal/reports', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const days = parseInt(req.query.days) || 30;
  const fromDate = req.query.from ? parseDateOnly(req.query.from) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const toDate = req.query.to ? parseDateOnly(req.query.to) : new Date();
  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(23, 59, 59, 999);

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
    const params = [businessId, fromDate, toDate];

    // 1-8. Fetch all report query results in parallel to eliminate sequential database latency
    const [
      txSummaryResult,
      paymentsSummaryResult,
      uniqueProductsResult,
      salesByDayResult,
      topProductsResult,
      salesByCategoryResult,
      hourlySalesResult,
      splitSalesResult
    ] = await Promise.all([
      // 1. Transaction summary (sales and customer counts)
      pool.query(
        `SELECT
           COUNT(*)::integer as transaction_count,
           COUNT(DISTINCT customer_id)::integer as unique_customers,
           ${SQL_TX_CASH_TOTAL} as cash_total,
           ${SQL_TX_MOMO_TOTAL} as momo_total,
           COALESCE(SUM(CASE WHEN payment_method = 'card' THEN grand_total ELSE 0 END), 0)::double precision as card_total,
           COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN grand_total ELSE 0 END), 0)::double precision as credit_total
         FROM transactions
         WHERE business_id = $1 
           AND status NOT IN ('voided', 'reversed')
           AND created_at >= $2 
           AND created_at <= $3`,
        params
      ),
      // 2. Outstanding debt payments received
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::double precision as total_paid
         FROM credit_payments
         WHERE business_id = $1
           AND created_at >= $2
           AND created_at <= $3`,
        params
      ),
      // 3. Unique products count
      pool.query(
        `SELECT COUNT(DISTINCT product_name)::integer as total_products
         FROM transaction_items ti
         JOIN transactions t ON t.id = ti.transaction_id
         WHERE t.business_id = $1
           AND t.status NOT IN ('voided', 'reversed')
           AND t.created_at >= $2
           AND t.created_at <= $3`,
        params
      ),
      // 4. Sales by Day (realized sales + debt payments)
      pool.query(
        `SELECT date, SUM(revenue)::double precision as revenue, SUM(transactions)::integer as transactions
         FROM (
           SELECT 
             TO_CHAR(created_at, 'YYYY-MM-DD') as date,
             SUM(CASE WHEN payment_method != 'credit' THEN grand_total ELSE 0 END) as revenue,
             COUNT(*) as transactions
           FROM transactions
           WHERE business_id = $1
             AND status NOT IN ('voided', 'reversed')
             AND created_at >= $2
             AND created_at <= $3
           GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
           
           UNION ALL
           
           SELECT 
             TO_CHAR(created_at, 'YYYY-MM-DD') as date,
             SUM(amount) as revenue,
             0 as transactions
           FROM credit_payments
           WHERE business_id = $1
             AND created_at >= $2
             AND created_at <= $3
           GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
         ) combined
         GROUP BY date
         ORDER BY date ASC`,
        params
      ),
      // 5. Top Products
      pool.query(
        `SELECT 
           product_name as name,
           SUM(quantity)::integer as quantity,
           SUM(line_total)::double precision as revenue
         FROM transaction_items ti
         JOIN transactions t ON t.id = ti.transaction_id
         WHERE t.business_id = $1
           AND t.status NOT IN ('voided', 'reversed')
           AND t.created_at >= $2
           AND t.created_at <= $3
         GROUP BY product_name
         ORDER BY revenue DESC`,
        params
      ),
      // 6. Sales by Category
      pool.query(
        `SELECT 
           COALESCE(category, 'General') as category,
           SUM(line_total)::double precision as revenue
         FROM transaction_items ti
         JOIN transactions t ON t.id = ti.transaction_id
         WHERE t.business_id = $1
           AND t.status NOT IN ('voided', 'reversed')
           AND t.created_at >= $2
           AND t.created_at <= $3
         GROUP BY COALESCE(category, 'General')
         ORDER BY revenue DESC`,
        params
      ),
      // 7. Hourly Sales
      pool.query(
        `SELECT 
           EXTRACT(HOUR FROM created_at)::integer as hour,
           SUM(grand_total)::double precision as revenue
         FROM transactions
         WHERE business_id = $1
           AND status NOT IN ('voided', 'reversed')
           AND created_at >= $2
           AND created_at <= $3
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY hour ASC`,
        params
      ),
      // 8. Split Sales
      pool.query(
        `SELECT COALESCE(SUM(grand_total), 0)::double precision as amount, COUNT(*)::integer as count
         FROM transactions
         WHERE business_id = $1 AND payment_method = 'split' AND status NOT IN ('voided', 'reversed')
           AND created_at >= $2 AND created_at <= $3`,
        params
      )
    ]);

    const txSummary = txSummaryResult.rows[0] || {};
    const transactionCount = txSummary.transaction_count || 0;
    const uniqueCustomers = txSummary.unique_customers || 0;
    const cashTotal = txSummary.cash_total || 0;
    const momoTotal = txSummary.momo_total || 0;
    const cardTotal = txSummary.card_total || 0;
    const creditTotal = txSummary.credit_total || 0;

    const debtPaymentsTotal = paymentsSummaryResult.rows[0]?.total_paid || 0;
    const totalProducts = uniqueProductsResult.rows[0]?.total_products || 0;

    const totalCategoryRevenue = salesByCategoryResult.rows.reduce((s, c) => s + c.revenue, 0);
    const salesByCategory = salesByCategoryResult.rows.map(c => ({
      category: c.category,
      revenue: c.revenue,
      percentage: totalCategoryRevenue > 0 ? Math.round((c.revenue / totalCategoryRevenue) * 100) : 0
    }));

    const hourlyMap = new Map();
    for (let i = 0; i < 24; i++) hourlyMap.set(i, { hour: i, revenue: 0 });
    hourlySalesResult.rows.forEach(r => {
      if (hourlyMap.has(r.hour)) {
        hourlyMap.get(r.hour).revenue = r.revenue;
      }
    });

    const realizedSales = cashTotal + momoTotal + cardTotal;
    const totalRevenue = realizedSales + debtPaymentsTotal;

    const summary = {
      total_revenue: totalRevenue,
      transaction_count: transactionCount,
      avg_basket: transactionCount > 0 ? totalRevenue / transactionCount : 0,
      cash_total: cashTotal,
      momo_total: momoTotal,
      card_total: cardTotal,
      credit_total: Math.max(0, creditTotal - debtPaymentsTotal),
      totalProducts,
      uniqueCustomers
    };

    const splitAmount = parseFloat(splitSalesResult.rows[0]?.amount || 0);
    const splitCount = splitSalesResult.rows[0]?.count || 0;

    const paymentMap = [
      { method: 'cash', amount: cashTotal, count: 0 },
      { method: 'momo', amount: momoTotal, count: 0 },
      { method: 'split', amount: splitAmount, count: splitCount },
      { method: 'card', amount: cardTotal, count: 0 },
      { method: 'credit', amount: creditTotal, count: 0 }
    ].filter(p => p.amount > 0 || p.count > 0).sort((a, b) => b.amount - a.amount);

    res.json({
      summary,
      salesByDay: salesByDayResult.rows,
      salesByPayment: paymentMap,
      topProducts: topProductsResult.rows,
      salesByCategory,
      hourlySales: Array.from(hourlyMap.values())
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ── Customer & Credit API ──

// List Customers (paginated + server-side search)
app.get('/api/portal/customers', requireAuth, async (req, res) => {
  const business_id = req.auth.businessId;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const search = (req.query.search || '').trim();

  try {
    const params = [business_id];
    let searchQuery = '';
    
    if (search) {
      params.push(`%${search}%`);
      searchQuery = ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
    }

    // 1. Get total count
    const countRes = await pool.query(
      `SELECT COUNT(*)::integer FROM customers WHERE business_id = $1${searchQuery}`,
      params
    );
    const total = countRes.rows[0]?.count || 0;

    // 2. Get paginated data
    const offset = (page - 1) * limit;
    const dataParams = [...params, limit, offset];
    const dataRes = await pool.query(
      `SELECT * FROM customers 
       WHERE business_id = $1${searchQuery} 
       ORDER BY credit_balance DESC, name ASC 
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const debtRes = await pool.query(
      `SELECT COALESCE(SUM(credit_balance), 0)::double precision as total FROM customers WHERE business_id = $1`,
      [business_id]
    );
    const totalDebt = debtRes.rows[0]?.total || 0;

    res.json({
      customers: dataRes.rows,
      totalDebt,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('[Customers API Error]:', err.message);
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

// Upload app updates - Chunked Installer (Super Admin only)
app.post('/api/portal/admin/updates/upload-chunk', requireAuth, uploadUpdate.single('chunk'), async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const chunkIndex = parseInt(req.body.chunkIndex, 10);
    const totalChunks = parseInt(req.body.totalChunks, 10);
    const originalname = req.body.originalname;
    
    if (!req.file || isNaN(chunkIndex) || isNaN(totalChunks) || !originalname) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing chunk data' });
    }

    // Convert spaces to hyphens to match electron-builder's URL format in latest.yml
    const safeName = originalname.replace(/\s+/g, '-');

    const tempFilePath = path.join(updatesDir, `${safeName}.part`);
    const chunkFilePath = req.file.path; // Saved by multer

    // Append chunk to the temp file
    if (chunkIndex === 0 && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath); // clean up any incomplete uploads
    }

    const chunkData = fs.readFileSync(chunkFilePath);
    fs.appendFileSync(tempFilePath, chunkData);
    fs.unlinkSync(chunkFilePath); // delete the uploaded chunk piece

    // If last chunk, rename it to the final installer name
    if (chunkIndex === totalChunks - 1) {
      const finalPath = path.join(updatesDir, safeName);
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      fs.renameSync(tempFilePath, finalPath);

      const stat = fs.statSync(finalPath);
      fs.writeFileSync(
        lastInstallerMetaPath,
        JSON.stringify({
          safeName,
          originalname,
          size: stat.size,
          uploadedAt: new Date().toISOString(),
        })
      );
    }

    res.json({ success: true, message: `Chunk ${chunkIndex + 1}/${totalChunks} uploaded` });
  } catch (err) {
    console.error('Chunk Upload Error:', err);
    res.status(500).json({ error: 'Failed to process chunk' });
  }
});

// Upload latest.yml (Super Admin only)
app.post('/api/portal/admin/updates/upload-latest', requireAuth, uploadUpdate.single('latestYml'), async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    if (!req.file) return res.status(400).json({ error: 'latest.yml is required' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.yml' && ext !== '.yaml') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File must be a .yml or .yaml file' });
    }
    
    const currentPath = req.file.path;
    const newPath = path.join(updatesDir, 'latest.yml');
    
    if (currentPath !== newPath) {
      if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
      fs.renameSync(currentPath, newPath);
    }

    const ymlContent = fs.readFileSync(newPath, 'utf8');
    const parsed = parseLatestYml(ymlContent);
    let lastMeta = null;
    if (fs.existsSync(lastInstallerMetaPath)) {
      try {
        lastMeta = JSON.parse(fs.readFileSync(lastInstallerMetaPath, 'utf8'));
      } catch {
        lastMeta = null;
      }
    }

    const resolved = resolveInstallerFile(updatesDir, parsed.path, lastMeta?.safeName);
    if (!resolved) {
      return res.status(400).json({
        error: 'Installer .exe not found. Upload the installer before latest.yml, and ensure path in latest.yml matches the file name.',
      });
    }

    const version = parsed.version || path.basename(resolved.filename, '.exe').replace(/^SikaPOS[- ]Setup[- ]?/i, '') || '0.0.0';
    const built = buildLatestYmlFromInstaller({
      version,
      installerPath: resolved.full,
      installerFilename: resolved.filename,
    });

    let ymlMismatchWarning = null;
    if (parsed.sha512 && parsed.sha512 !== built.sha512) {
      ymlMismatchWarning =
        'The uploaded latest.yml sha512 did not match the installer on the server. Published feed was regenerated from the installer file.';
      console.warn('[Updates]', ymlMismatchWarning, {
        ymlSha512: parsed.sha512,
        fileSha512: built.sha512,
        file: resolved.filename,
      });
    }

    fs.writeFileSync(newPath, built.content, 'utf8');

    const publishName = built.safeName;
    const publishInstallerPath = path.join(updatesDir, publishName);
    if (path.resolve(resolved.full) !== path.resolve(publishInstallerPath)) {
      fs.copyFileSync(resolved.full, publishInstallerPath);
    }

    const releaseDir = path.join(releasesArchiveDir, `${version}-${Date.now()}`);
    fs.mkdirSync(releaseDir, { recursive: true });

    const archivedInstaller = path.join(releaseDir, publishName);
    const archivedYml = path.join(releaseDir, 'latest.yml');
    fs.copyFileSync(publishInstallerPath, archivedInstaller);
    fs.copyFileSync(newPath, archivedYml);

    const blockmapCandidates = [
      `${resolved.full}.blockmap`,
      `${publishInstallerPath}.blockmap`,
      path.join(updatesDir, `${publishName}.blockmap`),
    ];
    for (const blockmapSrc of blockmapCandidates) {
      if (fs.existsSync(blockmapSrc)) {
        fs.copyFileSync(blockmapSrc, path.join(releaseDir, `${publishName}.blockmap`));
        fs.copyFileSync(blockmapSrc, path.join(updatesDir, `${publishName}.blockmap`));
        break;
      }
    }

    // Live update feed at /updates/ (electron-updater)
    fs.copyFileSync(newPath, path.join(updatesDir, 'latest.yml'));

    const stat = fs.statSync(archivedInstaller);
    const release = await saveAppReleaseRecord({
      version,
      installerFilename: publishName,
      installerPath: archivedInstaller,
      installerSize: stat.size,
      ymlPath: archivedYml,
      uploadedBy: req.auth.name || req.auth.email || 'admin',
    });

    res.json({
      success: true,
      message: `Release v${version} saved and published.`,
      warning: ymlMismatchWarning,
      published: {
        version,
        installer: publishName,
        sha512: built.sha512,
        size: built.size,
      },
      release: {
        id: release.id,
        version: release.version,
        installer_filename: release.installer_filename,
        installer_size: release.installer_size,
        is_current: release.is_current,
        created_at: release.created_at,
      },
    });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: 'Failed to process latest.yml' });
  }
});

// List saved app releases (Super Admin)
app.get('/api/portal/admin/releases', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query(
      `SELECT id, version, installer_filename, installer_size, is_current, created_at, uploaded_by
       FROM app_releases
       ORDER BY created_at DESC`
    );
    res.json({ success: true, releases: result.rows });
  } catch (err) {
    console.error('[Releases List]', err);
    res.status(500).json({ error: 'Failed to list releases' });
  }
});

// Download a saved release installer (Super Admin)
app.get('/api/portal/admin/releases/:id/download', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query(
      'SELECT installer_path, installer_filename FROM app_releases WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Release not found' });
    const row = result.rows[0];
    if (!row.installer_path || !fs.existsSync(row.installer_path)) {
      return res.status(404).json({ error: 'Installer file missing on server. Re-upload this release.' });
    }
    res.download(row.installer_path, row.installer_filename);
  } catch (err) {
    console.error('[Release Download]', err);
    res.status(500).json({ error: 'Failed to download release' });
  }
});

// Download latest.yml for a saved release (Super Admin)
app.get('/api/portal/admin/releases/:id/download-yml', requireAuth, async (req, res) => {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query('SELECT yml_path, version FROM app_releases WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Release not found' });
    const row = result.rows[0];
    if (!row.yml_path || !fs.existsSync(row.yml_path)) {
      return res.status(404).json({ error: 'latest.yml missing for this release' });
    }
    res.download(row.yml_path, `latest-${row.version || req.params.id}.yml`);
  } catch (err) {
    console.error('[Release YML Download]', err);
    res.status(500).json({ error: 'Failed to download latest.yml' });
  }
});

// --- User Management Portal APIs ---

// 1. Get all staff users for the business
app.get('/api/portal/users', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  if (!businessId) return res.status(400).json({ error: 'Business account required' });

  if (global.DB_OFFLINE) {
    return res.json({
      success: true,
      users: [
        { id: 1, local_id: 1, name: 'Admin', role: 'admin', cashier_nav_visibility: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 2, local_id: 2, name: 'Cashier A', role: 'cashier', cashier_nav_visibility: JSON.stringify({ pos: true, customers: true, dashboard: true }), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      ]
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, local_id, name, role, cashier_nav_visibility, created_at, updated_at 
       FROM users 
       WHERE business_id = $1 
       ORDER BY name ASC`,
      [businessId]
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('[Portal Users Get]', err);
    res.status(500).json({ error: 'Failed to retrieve staff users' });
  }
});

// 2. Create a staff user
app.post('/api/portal/users', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  if (!businessId) return res.status(400).json({ error: 'Business account required' });

  const { name, pin, role, cashier_nav_visibility } = req.body || {};
  
  if (!name || !name.trim()) return res.status(400).json({ error: 'Staff name is required' });
  if (!pin || pin.trim().length < 4) return res.status(400).json({ error: 'PIN/Password must be at least 4 characters' });
  if (!['cashier', 'manager', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  if (global.DB_OFFLINE) {
    return res.json({ success: true, user: { id: Date.now(), local_id: Date.now(), name, role, cashier_nav_visibility } });
  }

  try {
    // Generate new local_id scoped to the business
    const maxResult = await pool.query(
      'SELECT COALESCE(MAX(local_id), 0) + 1 AS next_id FROM users WHERE business_id = $1',
      [businessId]
    );
    const localId = maxResult.rows[0].next_id;

    // Hash the PIN
    const hashedPin = crypto.createHash('sha256').update(pin.trim() + PIN_SALT).digest('hex');

    const result = await pool.query(
      `INSERT INTO users (business_id, local_id, name, pin, role, cashier_nav_visibility, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, local_id, name, role, cashier_nav_visibility, created_at, updated_at`,
      [businessId, localId, name.trim(), hashedPin, role, cashier_nav_visibility || null]
    );

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[Portal Users Create]', err);
    res.status(500).json({ error: 'Failed to create staff user' });
  }
});

// 3. Update a staff user
app.put('/api/portal/users/:id', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  if (!businessId) return res.status(400).json({ error: 'Business account required' });

  const userId = parseInt(req.params.id);
  const { name, pin, role, cashier_nav_visibility } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: 'Staff name is required' });
  if (!['cashier', 'manager', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  if (global.DB_OFFLINE) {
    return res.json({ success: true, user: { id: userId, name, role, cashier_nav_visibility } });
  }

  try {
    let result;
    if (pin && pin.trim().length >= 4) {
      // Hash the new PIN
      const hashedPin = crypto.createHash('sha256').update(pin.trim() + PIN_SALT).digest('hex');
      result = await pool.query(
        `UPDATE users
         SET name = $1, pin = $2, role = $3, cashier_nav_visibility = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 AND business_id = $6
         RETURNING id, local_id, name, role, cashier_nav_visibility, created_at, updated_at`,
        [name.trim(), hashedPin, role, cashier_nav_visibility || null, userId, businessId]
      );
    } else {
      result = await pool.query(
        `UPDATE users
         SET name = $1, role = $2, cashier_nav_visibility = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND business_id = $5
         RETURNING id, local_id, name, role, cashier_nav_visibility, created_at, updated_at`,
        [name.trim(), role, cashier_nav_visibility || null, userId, businessId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[Portal Users Update]', err);
    res.status(500).json({ error: 'Failed to update staff user' });
  }
});

// 4. Delete a staff user
app.delete('/api/portal/users/:id', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  if (!businessId) return res.status(400).json({ error: 'Business account required' });

  const userId = parseInt(req.params.id);

  if (global.DB_OFFLINE) {
    return res.json({ success: true });
  }

  try {
    // Check if the user is an admin, and if so, check if they are the last admin
    const userCheck = await pool.query(
      'SELECT role FROM users WHERE id = $1 AND business_id = $2',
      [userId, businessId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userCheck.rows[0].role === 'admin') {
      const adminCountResult = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE business_id = $1 AND role = 'admin'",
        [businessId]
      );
      if (adminCountResult.rows[0].count <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user.' });
      }
    }

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND business_id = $2 RETURNING id',
      [userId, businessId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Portal Users Delete]', err);
    res.status(500).json({ error: 'Failed to delete staff user' });
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
    // Use configured worker count, or up to 4 workers by default (or number of CPUs if fewer)
    const numCPUs = os.cpus().length;
    const envWorkers = process.env.CLUSTER_WORKERS || process.env.WEB_CONCURRENCY;
    const workers = envWorkers ? parseInt(envWorkers, 10) : Math.min(numCPUs, 4);
    
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
