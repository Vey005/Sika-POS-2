const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const crypto = require('crypto');

const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Secrets from environment
const PIN_SALT = process.env.PIN_SALT || 'sikapos-gha-pin-v1-d4nn1t3ch';
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USER = process.env.PORTAL_ADMIN_USER || 'big admin';
const ADMIN_PASS_HASH = process.env.PORTAL_ADMIN_PASS_HASH;

if (!JWT_SECRET || !ADMIN_PASS_HASH) {
  console.warn('⚠️ WARNING: JWT_SECRET or PORTAL_ADMIN_PASS_HASH not set in environment!');
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ CRITICAL: Secrets must be set in production. Exiting.');
    process.exit(1);
  }
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
  if (!val || typeof val !== 'object') return null;
  return { ...val, received_at: row.received_at };
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

// Serve Portal SPA
app.use(express.static(path.join(__dirname, 'portal', 'dist')));

// DB Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sikapos123@db:5432/sikapos_cloud'
});

// Initialize DB Tables with Retry
async function initDb() {
  let retries = 3;
  console.log('⏳ Waiting for database to be ready...');
  
  while (retries > 0) {
    try {
      // 1. Create base tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS synced_data (
          id SERIAL PRIMARY KEY,
          entity VARCHAR(50) NOT NULL,
          operation VARCHAR(20) NOT NULL,
          payload JSONB NOT NULL,
          received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS licenses (
          id SERIAL PRIMARY KEY,
          license_key VARCHAR(50) UNIQUE NOT NULL,
          business_name VARCHAR(100),
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
      `);

      // 2. Safely add business_id if missing (migration)
      try {
        await pool.query(`ALTER TABLE synced_data ADD COLUMN IF NOT EXISTS business_id VARCHAR(100);`);
      } catch(err) { /* ignore */ }

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
      } catch(err) { console.error('Failed to purge duplicates during init:', err.message); }

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
      } catch(err) { /* ignore */ }

      console.log('✅ Database tables initialized');
      global.DB_OFFLINE = false;
      return;
    } catch (err) {
      console.error('Database init error:', err.message);
      retries--;
      if (retries === 0) {
        console.log('⚠️ Could not connect to database. Starting in OFFLINE mock mode so you can test the frontend.');
        global.DB_OFFLINE = true;
        return;
      }
      console.log(`🔄 Retrying in 2 seconds... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

initDb();

// Sync Endpoint
app.post('/v1/sync/push', requireSyncAuth, async (req, res) => {
  const { entity, operation, payload } = req.body;
  const business_id = req.business_id;

  if (!entity || !operation || !payload) {
    return res.status(400).json({ success: false, message: 'Invalid payload structure' });
  }

  try {
    // Use ON CONFLICT DO NOTHING to skip duplicates for transactions (they have a unique index on receipt_number)
    await pool.query(
      'INSERT INTO synced_data (business_id, entity, operation, payload) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [business_id, entity, operation, payload]
    );
    res.json({ success: true, message: 'Synced to cloud' });
  } catch (err) {
    console.error('[Sync Error]:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error'
    });
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

    console.log(`[Recovery] Serving ${result.rows.length} items for business: ${business_id}`);
    res.json({ success: true, data: recoveryData });
  } catch (err) {
    console.error('[Recovery Error]:', err.message);
    res.status(500).json({ success: false, message: 'Recovery failed on server' });
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

  if (!license_key || !business_name) {
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

    console.log(`[Inventory Clear] All products cleared for business: ${business_id}`);
    res.json({ success: true, message: 'All inventory cleared from cloud' });
  } catch (err) {
    console.error('[Inventory Clear Error]:', err.message);
    res.status(500).json({ success: false, message: 'Failed to clear inventory' });
  }
});

// Health Check
app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date() }));

// --- PORTAL APIs ---

// Portal Login
app.post('/api/portal/login', rateLimit, async (req, res) => {
  const { storeName, password } = req.body;

  if (!storeName || !password) {
    return res.status(400).json({ error: 'Store Name and PIN/Password are required' });
  }

  // --- 1. SUPER ADMIN CHECK ---
  if (storeName.toLowerCase() === ADMIN_USER.toLowerCase()) {
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    if (inputHash === ADMIN_PASS_HASH) {
      const token = signToken({ role: 'admin' });
      return res.json({ success: true, role: 'admin', token });
    }
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  // --- 2. BUSINESS OWNER CHECK ---
  try {
    const licenseResult = await pool.query('SELECT * FROM licenses WHERE TRIM(LOWER(business_name)) = TRIM(LOWER($1))', [storeName]);
    if (licenseResult.rows.length === 0) {
      return res.status(401).json({ error: 'Store not found. Please sync your store name from the SikaPOS app settings.' });
    }

    const license = licenseResult.rows[0];
    const businessId = license.license_key;

    if (global.DB_OFFLINE && password === 'TEST') {
      const token = signToken({ role: 'business', businessId: 'mock-123', businessName: license.business_name });
      return res.json({ success: true, role: 'business', businessId: 'mock-123', businessName: license.business_name, token });
    }

    const userResult = await pool.query(
      "SELECT payload FROM synced_data WHERE business_id = $1 AND entity = 'users' ORDER BY received_at DESC LIMIT 1",
      [businessId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Authentication not yet synced from SikaPOS App' });
    }

    let users = parsePayload(userResult.rows[0]) || [];
    if (!Array.isArray(users)) users = [];
    const adminUser = users.find(u => u.role === 'admin');

    if (!adminUser) {
      return res.status(401).json({ error: 'No Admin user found for this store' });
    }

    const inputHashedPin = crypto.createHash('sha256').update(password + PIN_SALT).digest('hex');
    if (inputHashedPin === adminUser.pin) {
      const token = signToken({ role: 'business', businessId, businessName: license.business_name });
      return res.json({ success: true, role: 'business', businessId, businessName: license.business_name, token });
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
    console.log(`[Admin] Purged ${deleted} duplicate transaction rows.`);
    res.json({ success: true, deleted, message: `Removed ${deleted} duplicate transaction(s).` });
  } catch (err) {
    console.error('[Purge Error]:', err.message);
    res.status(500).json({ success: false, message: 'Failed to purge duplicates' });
  }
});

// Business: Dashboard Summary
app.get('/api/portal/dashboard/summary', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  if (!businessId) return res.status(400).json({ error: 'Business ID required' });

  const fromDate = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const toDate = req.query.to ? new Date(req.query.to) : new Date();

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
      "SELECT payload, received_at FROM synced_data WHERE business_id = $1 AND entity = 'transaction' AND received_at >= $2 AND received_at <= $3",
      [businessId, fromDate.toISOString(), toDate.toISOString()]
    );

    let totalSales = 0;
    const recentTx = [];
    const salesByDate = {};
    let totalTransactions = 0;
    const processedIds = new Set();

    result.rows.forEach(row => {
      const payload = parsePayload(row);
      if (!payload) return;

      const processTx = (tx) => {
        const txId = tx.id || tx.transactionId || tx.receipt_number;
        if (txId && processedIds.has(txId)) return;
        if (txId) processedIds.add(txId);

        const total = parseFloat(tx.grand_total || tx.total || 0);
        totalSales += total;
        totalTransactions++;

        recentTx.push({
          receipt_number: tx.receipt_number || tx.receiptNumber || tx.id || 'N/A',
          grand_total: total,
          created_at: tx.created_at || tx.date || tx.timestamp || tx.dateTime || row.received_at || new Date().toISOString(),
          cashier_name: tx.cashier_name || tx.cashier || tx.cashierName || tx.staff || tx.staff_name || tx.user || tx.operator || 'Admin'
        });

        const dateStr = tx.created_at || tx.date || tx.timestamp || tx.dateTime || row.received_at || new Date().toISOString();
        const date = typeof dateStr === 'string' ? dateStr.split('T')[0] : new Date(dateStr).toISOString().split('T')[0];
        salesByDate[date] = (salesByDate[date] || 0) + total;
      };

      if (Array.isArray(payload)) {
        payload.forEach(processTx);
      } else {
        processTx(payload);
      }
    });

    recentTx.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const chartData = Object.entries(salesByDate)
      .map(([date, sales]) => ({ date, sales }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    if (chartData.length === 0) {
      chartData.push({ date: new Date().toISOString().split('T')[0], sales: totalSales });
    }

    // Get product count and low stock count
    let totalProducts = 0;
    let lowStockCount = 0;
    try {
      const productResult = await pool.query(
        "SELECT payload FROM synced_data WHERE business_id = $1 AND entity = 'product'",
        [businessId]
      );
      
      productResult.rows.forEach(row => {
        const product = parsePayload(row);
        if (product && product.is_active) {
          totalProducts++;
          const stock = parseInt(product.stock_qty || product.stock || 0);
          const threshold = parseInt(product.low_stock_threshold || 0);
          if (stock <= threshold && threshold > 0) {
            lowStockCount++;
          }
        }
      });
    } catch (err) {
      console.error('Product count error:', err);
    }

    res.json({
      totalSales,
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
    const [countResult, dataResult] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) FROM synced_data WHERE business_id = $1 AND entity = 'product'",
        [businessId]
      ),
      pool.query(
        "SELECT payload FROM synced_data WHERE business_id = $1 AND entity = 'product' ORDER BY received_at DESC LIMIT $2 OFFSET $3",
        [businessId, limit, offset]
      ),
    ]);

    const productsMap = new Map();
    dataResult.rows.forEach(row => {
      const p = parsePayload(row);
      if (!p) return;
      const id = p.id || p.barcode;
      if (!id) return;
      productsMap.set(id, p);
    });

    let products = Array.from(productsMap.values()).filter(p => p.is_active !== 0);

    if (search) {
      const q = search.toLowerCase();
      products = products.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    }

    products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
    // Fetch all transactions for this business (we'll sort/filter in memory)
    const result = await pool.query(
      "SELECT payload FROM synced_data WHERE business_id = $1 AND entity = 'transaction'",
      [businessId]
    );

    const txMap = new Map();
    result.rows.forEach(row => {
      const tx = parsePayload(row);
      if (!tx) return;
      const txId = tx.id || tx.receipt_number;
      if (!txId) return;
      // Deduplicate by receipt_number (keep latest)
      const existing = txMap.get(txId);
      if (!existing || new Date(tx.created_at || tx.timestamp || 0) > new Date(existing.created_at || existing.timestamp || 0)) {
        txMap.set(txId, tx);
      }
    });

    let transactions = Array.from(txMap.values())
      .filter(tx => tx.status !== 'voided' && tx.status !== 'reversed')
      .filter(tx => {
        // Filter by transaction created_at date (not sync time)
        const txDateStr = tx.created_at || tx.timestamp;
        if (!txDateStr) return true;
        
        // Extract just the date part (YYYY-MM-DD) from the transaction
        const txDateObj = new Date(txDateStr);
        if (isNaN(txDateObj.getTime())) return true; // Invalid date, include it
        
        // Format as YYYY-MM-DD for comparison (avoids timezone issues)
        const txYear = txDateObj.getFullYear();
        const txMonth = String(txDateObj.getMonth() + 1).padStart(2, '0');
        const txDay = String(txDateObj.getDate()).padStart(2, '0');
        const txDateKey = `${txYear}-${txMonth}-${txDay}`;
        
        // Filter from date (inclusive)
        if (from) {
          const fromKey = from; // Already in YYYY-MM-DD format
          if (txDateKey < fromKey) return false;
        }
        
        // Filter to date (inclusive)
        if (to) {
          const toKey = to; // Already in YYYY-MM-DD format
          if (txDateKey > toKey) return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        // Sort by transaction created_at descending (newest first)
        const aTime = new Date(a.created_at || a.timestamp || 0).getTime();
        const bTime = new Date(b.created_at || b.timestamp || 0).getTime();
        return bTime - aTime;
      });

    const total = transactions.length;
    const offset = (page - 1) * limit;
    const paginatedTransactions = transactions.slice(offset, offset + limit);

    let totalRevenue = 0, cashTotal = 0, momoTotal = 0, cardTotal = 0, creditTotal = 0;
    transactions.forEach(tx => {
      const t = parseFloat(tx.grand_total || tx.total || 0);
      totalRevenue += t;
      const method = (tx.payment_method || 'cash').toLowerCase();
      if (method === 'cash') cashTotal += t;
      else if (method === 'momo') momoTotal += t;
      else if (method === 'card') cardTotal += t;
      else if (method === 'credit') creditTotal += t;
    });
    const count = transactions.length;

    res.json({
      transactions: paginatedTransactions.map(tx => ({
        id: tx.id,
        receipt_number: tx.receipt_number || tx.receiptNumber || tx.id || 'N/A',
        created_at: tx.created_at || tx.date || tx.dateTime || new Date().toISOString(),
        cashier_name: tx.cashier_name || tx.cashier || tx.cashierName || tx.staff || 'Admin',
        customer_name: tx.customer_name || tx.customer || null,
        grand_total: parseFloat(tx.grand_total || tx.total || 0),
        payment_method: tx.payment_method || 'cash',
        status: tx.status || 'completed',
        item_count: Array.isArray(tx.items) ? tx.items.length : (tx.item_count || 0),
      })),
      summary: {
        total_revenue: totalRevenue,
        transaction_count: count,
        avg_basket: count > 0 ? totalRevenue / count : 0,
        cash_total: cashTotal,
        momo_total: momoTotal,
        card_total: cardTotal,
        credit_total: creditTotal,
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
      "SELECT payload FROM synced_data WHERE business_id = $1 AND entity = 'product'",
      [businessId]
    );

    const productsMap = new Map();
    result.rows.forEach(row => {
      const p = parsePayload(row);
      if (!p || p.is_active === 0) return;
      const id = p.id || p.barcode;
      if (!id) return;
      productsMap.set(id, p);
    });

    const products = Array.from(productsMap.values());
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
app.get('/api/portal/reports', requireAuth, async (req, res) => {
  const businessId = req.auth.businessId;
  const days = parseInt(req.query.days) || 30;
  const fromDate = req.query.from ? new Date(req.query.from) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const toDate = req.query.to ? new Date(req.query.to) : new Date();

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
    // Get all transactions for the date range
    const txResult = await pool.query(
      `SELECT payload FROM synced_data 
       WHERE business_id = $1 AND entity = 'transaction' 
       AND received_at >= $2 AND received_at <= $3`,
      [businessId, fromDate.toISOString(), toDate.toISOString()]
    );

    const transactions = txResult.rows.map(r => parsePayload(r)).filter(Boolean);
    const uniqueCustomers = new Set(transactions.filter(t => t.customer_id).map(t => t.customer_id)).size;
    const totalRevenue = transactions.reduce((sum, t) => sum + (parseFloat(t.grand_total) || 0), 0);

    // Sales by day
    const salesByDayMap = new Map();
    transactions.forEach(t => {
      // Try multiple possible date fields
      const createdAt = t.created_at || t.date || t.timestamp || t.dateTime || t.received_at;
      if (!createdAt) return;
      
      const dateObj = new Date(createdAt);
      if (isNaN(dateObj.getTime())) return;
      
      const date = dateObj.toISOString().split('T')[0];
      if (!salesByDayMap.has(date)) salesByDayMap.set(date, { date, revenue: 0, transactions: 0 });
      const day = salesByDayMap.get(date);
      day.revenue += parseFloat(t.grand_total) || 0;
      day.transactions++;
    });

    // Sales by payment method
    const paymentMap = new Map();
    transactions.forEach(t => {
      const method = t.payment_method || 'cash';
      if (!paymentMap.has(method)) paymentMap.set(method, { method, amount: 0, count: 0 });
      const p = paymentMap.get(method);
      p.amount += parseFloat(t.grand_total) || 0;
      p.count++;
    });

    // Extract items from transactions for product analysis
    const items = [];
    transactions.forEach(t => {
      if (t.items && Array.isArray(t.items)) {
        t.items.forEach(item => {
          // Attach timestamp from parent if missing
          items.push({ ...item, received_at: t.received_at });
        });
      }
    });
    
    // Top products
    const productMap = new Map();
    items.forEach(i => {
      const name = i.product_name || 'Unknown';
      if (!productMap.has(name)) productMap.set(name, { name, quantity: 0, revenue: 0 });
      const p = productMap.get(name);
      p.quantity += parseInt(i.quantity) || 0;
      p.revenue += parseFloat(i.line_total) || 0;
    });

    // Sales by category
    const categoryMap = new Map();
    items.forEach(i => {
      const cat = i.category || 'General';
      if (!categoryMap.has(cat)) categoryMap.set(cat, { category: cat, revenue: 0, percentage: 0 });
      categoryMap.get(cat).revenue += parseFloat(i.line_total) || 0;
    });

    const totalCategoryRevenue = Array.from(categoryMap.values()).reduce((s, c) => s + c.revenue, 0);
    categoryMap.forEach(c => c.percentage = Math.round((c.revenue / totalCategoryRevenue) * 100) || 0);

    // Hourly sales
    const hourlyMap = new Map();
    for (let i = 0; i < 24; i++) hourlyMap.set(i, { hour: i, revenue: 0 });
    transactions.forEach(t => {
      // Try multiple possible date fields
      const createdAt = t.created_at || t.date || t.timestamp || t.dateTime || t.received_at;
      if (!createdAt) return;
      
      const dateObj = new Date(createdAt);
      if (isNaN(dateObj.getTime())) return;
      
      const hour = dateObj.getHours();
      hourlyMap.get(hour).revenue += parseFloat(t.grand_total) || 0;
    });

    res.json({
      summary: {
        totalRevenue,
        totalTransactions: transactions.length,
        totalProducts: productMap.size,
        averageOrderValue: transactions.length ? totalRevenue / transactions.length : 0,
        uniqueCustomers
      },
      salesByDay: Array.from(salesByDayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      salesByPayment: Array.from(paymentMap.values()).sort((a, b) => b.amount - a.amount),
      topProducts: Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
      salesByCategory: Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue),
      hourlySales: Array.from(hourlyMap.values())
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// SPA Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'portal', 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 SikaPOS Cloud Sync Server running on port ${port}`);
});
