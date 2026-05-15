import { BrowserWindow } from 'electron';
import axios from 'axios';
import { getDb } from '../db/database';

import { SecureStore } from '../store/secure-store';

// Configuration
// In a real application, this would be fetched from settings (e.g. electron-store)
// For this MVP, we use a mock endpoint
const RAW_API_URL = process.env.API_BASE_URL || 'https://sikapos-api-production.up.railway.app';
const API_BASE_URL = RAW_API_URL.replace(/\/$/, ''); // Remove trailing slash
const SYNC_INTERVAL_MS = 30000; // 30 seconds
const REQUEST_TIMEOUT_MS = 15000; // 15 seconds
const MAX_RETRIES = 5; // give up after 5 failed attempts per item

export class SyncManager {
  private mainWindow: BrowserWindow | null;
  private secureStore: SecureStore;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;

  constructor(mainWindow: BrowserWindow | null, secureStore: SecureStore) {
    this.mainWindow = mainWindow;
    this.secureStore = secureStore;
  }

  public start() {
    if (this.syncTimer) return;

    console.log('[SyncManager] Starting background sync engine...');
    this.syncTimer = setInterval(() => this.runSync(), SYNC_INTERVAL_MS);

    // Run initial sync shortly after startup
    setTimeout(() => this.runSync(), 5000);

    // Sequential startup backfill — runs one after another so we never
    // delete pending items that were queued by the running app.
    setTimeout(async () => {
      await this.backfillHistoricalTransactions();
      await this.backfillHistoricalInventory();
      await this.backfillBusinessInfo();
      await this.backfillHistoricalCustomers();
      await this.backfillHistoricalCreditLogs();
      await this.backfillUsers();
    }, 8000);

    // PERIODIC PULL: Sync updated customer balances from cloud back to POS
    // Run every 1 hour (3600000 ms) since the portal isn't used frequently
    setInterval(() => this.pullUpdatedCustomers(), 60 * 60 * 1000);
  }

  private async backfillUsers() {
    const db = getDb();
    try {
      console.log('[Sync] Queuing users for portal sync.');
      // We push all users as a single 'users' entity payload including hashed PINs
      const allUsers = db.prepare('SELECT id, name, pin, role, created_at, updated_at FROM users').all();
      
      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('users', 'push', ?, 'pending', 10)
      `).run(JSON.stringify(allUsers));
    } catch (err: any) {
      console.error('[SyncManager] Users backfill failed:', err.message);
    }
  }

  private async backfillBusinessInfo() {
    const db = getDb();
    try {
      const bizName = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).pluck().get() as string;
      const bizAddress = db.prepare(`SELECT value FROM settings WHERE key = 'business_address'`).pluck().get() as string;
      const bizPhone = db.prepare(`SELECT value FROM settings WHERE key = 'business_phone'`).pluck().get() as string;
      const bizLogo = await this.secureStore.get('business_logo');

      console.log('[Sync] Queuing business info for sync.');

      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('business_info', 'update', ?, 'pending', 2)
      `).run(JSON.stringify({
        business_name: bizName || 'SikaPOS Shop',
        business_address: bizAddress || null,
        business_phone: bizPhone || null,
        business_logo: bizLogo || null
      }));
    } catch (err: any) {
      console.error('[SyncManager] Business info backfill failed:', err.message);
    }
  }

  public stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  public async forceSync() {
    return this.runSync();
  }

  private backfillHistoricalTransactions() {
    const db = getDb();
    try {
      // Re-sync ALL transactions (completed + debt) to ensure cloud data is accurate.
      // The server uses ON CONFLICT DO UPDATE, so re-syncing is safe and will
      // correct any previously-incorrect grand_total or tax values.
      // Including 'debt' status ensures credit sales appear on the portal.
      const lastSyncRow = db.prepare(`
        SELECT MAX(updated_at) as last_ts 
        FROM sync_queue 
        WHERE entity = 'transaction' AND status = 'synced'
      `).get() as { last_ts: string | null };

      const lastSyncTs = lastSyncRow?.last_ts || '2000-01-01 00:00:00';

      const allTx = db.prepare(`
        SELECT t.*
        FROM transactions t
        WHERE t.status IN ('completed', 'debt')
          AND t.updated_at > ?
      `).all(lastSyncTs) as any[];

      if (allTx.length === 0) {
        console.log('[SyncManager] No transactions to backfill.');
        return;
      }

      // Clear any existing pending transaction items in the queue to avoid duplicates
      db.prepare(`DELETE FROM sync_queue WHERE entity = 'transaction' AND status = 'pending'`).run();

      console.log('[Sync] Re-syncing transactions for data accuracy.');

      const insert = db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('transaction', 'create', ?, 'pending', 1)
      `);

      // Also get items for each transaction
      const getItems = db.prepare(`
        SELECT product_id, product_name, product_barcode, product_size, category,
               quantity, unit_price, cost_price, line_total, tax_category
        FROM transaction_items WHERE transaction_id = ?
      `);

      const insertAll = db.transaction(() => {
        for (const tx of allTx) {
          const items = getItems.all(tx.id) as any[];
          const payload = JSON.stringify({
            id: tx.id,
            receipt_number: tx.receipt_number,
            customer_id: tx.customer_id || null,
            customer_name: tx.customer_name || null,
            cashier_name: tx.cashier_name || 'Staff',
            status: tx.status || 'completed',
            payment_method: tx.payment_method,
            subtotal: tx.subtotal || tx.grand_total,
            discount_amount: tx.discount_amount || 0,
            discount_type: tx.discount_type || null,
            tax_vat: tx.tax_vat || 0,
            tax_nhil: tx.tax_nhil || 0,
            tax_getfund: tx.tax_getfund || 0,
            tax_covid: tx.tax_covid || 0,
            total_tax: tx.total_tax || 0,
            grand_total: tx.grand_total,
            amount_tendered: tx.amount_tendered || tx.grand_total,
            change_given: tx.change_given || 0,
            momo_reference: tx.momo_reference || null,
            created_at: tx.created_at,
            updated_at: tx.updated_at || tx.created_at,
            items: items.map(i => ({
              product_name: i.product_name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              line_total: i.line_total,
            })),
          });
          insert.run(payload);
        }
      });

      insertAll();
      console.log('[Sync] Transaction re-sync complete.');
    } catch (err: any) {
      console.error('[SyncManager] Backfill failed:', err.message);
    }
  }

  private backfillHistoricalInventory() {
    const db = getDb();
    try {
      // Find all active products whose id is NOT already in the sync_queue as a 'product' entity
      const lastSyncRow = db.prepare(`
        SELECT MAX(updated_at) as last_ts 
        FROM sync_queue 
        WHERE entity = 'product' AND status = 'synced'
      `).get() as { last_ts: string | null };

      const lastSyncTs = lastSyncRow?.last_ts || '2000-01-01 00:00:00';

      const unsynced = db.prepare(`
        SELECT p.*
        FROM products p
        WHERE p.updated_at > ?
        AND p.is_active = 1
      `).all(lastSyncTs) as any[];

      if (unsynced.length === 0) {
        console.log('[SyncManager] No historical products to backfill.');
        return;
      }

      console.log('[Sync] Backfilling historical products.');

      const insert = db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status)
        VALUES ('product', 'create', ?, 'pending')
      `);

      const insertAll = db.transaction(() => {
        for (const p of unsynced) {
          insert.run(JSON.stringify(p));
        }
      });

      insertAll();
      console.log('[Sync] Product backfill complete.');
    } catch (err: any) {
      console.error('[SyncManager] Product backfill failed:', err.message);
    }
  }

  private backfillHistoricalCustomers() {
    const db = getDb();
    try {
      const lastSyncRow = db.prepare(`
        SELECT MAX(updated_at) as last_ts 
        FROM sync_queue 
        WHERE entity = 'customer' AND status = 'synced'
      `).get() as { last_ts: string | null };

      const lastSyncTs = lastSyncRow?.last_ts || '2000-01-01 00:00:00';

      const allCustomers = db.prepare(`
        SELECT * FROM customers 
        WHERE updated_at > ?
      `).all(lastSyncTs) as any[];
      if (allCustomers.length === 0) return;

      console.log('[Sync] Backfilling customers.');
      const insert = db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('customer', 'update', ?, 'pending', 10)
      `);

      db.transaction(() => {
        for (const c of allCustomers) {
          insert.run(JSON.stringify({ ...c, local_id: c.id }));
        }
      })();
    } catch (err: any) {
      console.error('[SyncManager] Customer backfill failed:', err.message);
    }
  }

  private backfillHistoricalCreditLogs() {
    const db = getDb();
    try {
      const lastSyncRow = db.prepare(`
        SELECT MAX(updated_at) as last_ts 
        FROM sync_queue 
        WHERE entity = 'credit_payment' AND status = 'synced'
      `).get() as { last_ts: string | null };

      const lastSyncTs = lastSyncRow?.last_ts || '2000-01-01 00:00:00';

      const allLogs = db.prepare(`
        SELECT * FROM credit_payments 
        WHERE created_at > ?
      `).all(lastSyncTs) as any[];
      if (allLogs.length === 0) return;

      console.log('[Sync] Backfilling credit payments.');
      const insert = db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('credit_payment', 'create', ?, 'pending', 10)
      `);

      db.transaction(() => {
        for (const l of allLogs) {
          insert.run(JSON.stringify({ ...l, local_id: l.id }));
        }
      })();
    } catch (err: any) {
      console.error('[SyncManager] Credit payment backfill failed:', err.message);
    }
  }

  private async pullUpdatedCustomers() {
    const licenseKey = await this.secureStore.get('license_key');
    const safeKey = licenseKey ? (licenseKey.length > 8 ? `${licenseKey.substring(0, 4)}****${licenseKey.substring(licenseKey.length - 4)}` : '***') : 'undefined';
    // Pull check — no data logged for privacy
    if (!licenseKey || this.isSyncing) return;

    try {
      console.log('[Sync] Pulling customer updates from cloud.');
      const response = await axios.get(`${API_BASE_URL}/v1/sync/customers`, {
        headers: { Authorization: `Bearer ${licenseKey}` }
      });

      if (response.data.success && response.data.data.customers) {
        const cloudCustomers = response.data.data.customers as any[];
        const db = getDb();

        db.transaction(() => {
          // 1. Update customer balances and credit limit ONLY if cloud data is newer
          // Get local customer's updated_at for comparison
          const getLocal = db.prepare('SELECT id, credit_balance, updated_at FROM customers WHERE id = ?');
          const update = db.prepare(`
            UPDATE customers
            SET credit_balance = ?, credit_limit = ?, loyalty_points = ?, total_spent = ?, updated_at = ?
            WHERE id = ?
          `);
          for (const cc of cloudCustomers) {
            if (cc.local_id) {
              // Compare cloud updated_at with local updated_at
              const localRow = getLocal.get(cc.local_id) as { id: number; credit_balance: number; updated_at: string } | undefined;
              const localTime = localRow?.updated_at ? new Date(localRow.updated_at).getTime() : 0;
              const cloudTime = cc.updated_at ? new Date(cc.updated_at).getTime() : Date.now();

              // console.log(`[SyncManager] Checking customer ${cc.local_id} sync times...`);

              // Only update if cloud data is newer than local
              if (cloudTime > localTime) {
                update.run(cc.credit_balance, cc.credit_limit || 0, cc.loyalty_points, cc.total_spent, cc.updated_at, cc.local_id);
                // Customer updated from cloud
              } else {
                // Local data is newer, skipped
              }
            }
          }

          // 2. Insert missing payments from cloud
          if (response.data.data.payments && Array.isArray(response.data.data.payments)) {
            const cloudPayments = response.data.data.payments as any[];
            const insertPay = db.prepare(`
              INSERT OR IGNORE INTO credit_payments (cloud_id, customer_id, amount, payment_method, note, created_at)
              VALUES (?, (SELECT id FROM customers WHERE id = ?), ?, ?, ?, ?)
            `);
            for (const cp of cloudPayments) {
              // If local_id exists, it means POS created it. But if we pull it back from cloud, cloud_id is the primary key for sync.
              // Note: created_at from cloud is ISO string, SQLite handle datetime correctly.
              insertPay.run(cp.id, cp.customer_id, cp.amount, cp.payment_method, cp.note, cp.created_at);
            }
          }
        })();
        console.log('[Sync] Cloud pull complete.');
      }
    } catch (err: any) {
      console.error('[SyncManager] Pull customers failed:', err.message);
    }
  }

  private setStatus(status: 'synced' | 'syncing' | 'error') {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('sync:statusChanged', status);
    }
  }

  private async runSync() {
    if (this.isSyncing) return;

    const db = getDb();

    // Check if there are pending items
    const pendingCount = db.prepare(`SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'`).pluck().get() as number;

    if (pendingCount === 0) {
      // Nothing to push. Let's do a quick pull if we want, but for now we just mark synced.
      this.setStatus('synced');
      return;
    }

    this.isSyncing = true;
    this.setStatus('syncing');
    console.log('[Sync] Sync cycle started.');

    try {
      // Sync by priority: lower number = higher priority (1 = transactions, 5 = products, 10 = others)
      const items = db.prepare(`
        SELECT * FROM sync_queue 
        WHERE status = 'pending' AND (retry_count IS NULL OR retry_count < ${MAX_RETRIES}) 
        ORDER BY priority ASC, created_at ASC 
        LIMIT 50
      `).all() as any[];

      // We use the license_key as the unique identifier for the cloud API
      const businessId = this.secureStore.get('license_key') || 'default_shop';

      if (items.length > 0) {
        try {
          const batchItems = items.map(item => ({
            id: item.id, // For debugging
            entity: item.entity,
            operation: item.operation,
            payload: JSON.parse(item.payload)
          }));

          await axios.post(`${API_BASE_URL}/v1/sync/push-batch`, {
            items: batchItems
          }, {
            timeout: REQUEST_TIMEOUT_MS * 2, // Batch might take a bit longer
            headers: {
              Authorization: `Bearer ${businessId}`
            }
          });

          // Mark all as synced
          db.transaction(() => {
            const updateStmt = db.prepare(`UPDATE sync_queue SET status = 'synced', updated_at = datetime('now') WHERE id = ?`);
            for (const item of items) {
              updateStmt.run(item.id);
            }
          })();
        } catch (err: any) {
          const isOffline = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
          const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');

          if (isOffline || isTimeout) {
            // Server unreachable or slow — expected in offline/dev mode. Stop trying for this cycle.
            if (isTimeout) {
              console.warn(`[SyncManager] Sync server timed out after ${REQUEST_TIMEOUT_MS * 2}ms. Will retry next cycle.`);
            } else {
              console.warn(`[SyncManager] Sync server unreachable (${API_BASE_URL}). Running in offline mode.`);
            }
            this.setStatus('error');
            return;
          }

          // Increment retry count for all items in this batch
          db.transaction(() => {
            const retryStmt = db.prepare(`
              UPDATE sync_queue 
              SET retry_count = COALESCE(retry_count, 0) + 1, updated_at = datetime('now')
              WHERE id = ?
            `);
            for (const item of items) {
              retryStmt.run(item.id);
            }
          })();

          const errorDetail = err.response?.data?.debug || err.response?.data?.message || err.message;
          console.error(`[SyncManager] Failed to sync batch of ${items.length} items:`, errorDetail);

          if (err.response?.status === 405) {
            console.error(`[SyncManager] CRITICAL: 405 Method Not Allowed. Check server route ${API_BASE_URL}/v1/sync/push-batch`);
          }

          if (err.response) {
            db.transaction(() => {
              const errorStmt = db.prepare(`
                UPDATE sync_queue SET status = 'error', error_message = ?, updated_at = datetime('now') 
                WHERE id = ?
              `);
              for (const item of items) {
                errorStmt.run(errorDetail, item.id);
              }
            })();
          } else {
            throw err;
          }
        }
      }

      this.setStatus('synced');
      console.log('[Sync] Sync completed.');
    } catch (err: any) {
      if (err.code !== 'ENOTFOUND' && err.code !== 'ECONNREFUSED') {
        console.error('[SyncManager] Sync process aborted due to error:', err.message);
        this.setStatus('error');
      } else {
        this.setStatus('synced');
      }
    } finally {
      this.isSyncing = false;
    }
  }

  public async restoreFromCloud() {
    const db = getDb();
    this.setStatus('syncing');

    try {
      console.log('[Sync] Starting cloud data recovery.');
      const businessId = this.secureStore.get('license_key') || 'default_shop';
      const response = await axios.get(`${API_BASE_URL}/v1/sync/pull`, {
        headers: {
          Authorization: `Bearer ${businessId}`
        }
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Server error during recovery');
      }

      const { data } = response.data;
      let totalRestored = 0;

<<<<<<< HEAD
      const toObj = (v: any) => {
        if (!v) return null;
        if (typeof v === 'string') {
          try { return JSON.parse(v); } catch { return null; }
        }
        return v;
      };

      const flatten = (arr: any[]) => {
        const out: any[] = [];
        for (const x of arr) {
          const val = toObj(x);
          if (!val) continue;
          if (Array.isArray(val)) out.push(...val);
          else out.push(val);
        }
        return out;
      };

      // Wrap in transaction for atomicity and performance
      const restoreTransaction = db.transaction(() => {
        // Cloud groups by entity names used by sync push:
        // 'product', 'customer', 'transaction', 'users', 'business_info', 'credit_payment'

        // 1) Products
        if (data.product && Array.isArray(data.product)) {
          const products = flatten(data.product);
          const insertProd = db.prepare(`
            INSERT OR REPLACE INTO products (
              id, name, barcode, category, unit_price, cost_price, stock_qty, low_stock_threshold,
              tax_category, is_active, is_pharmacy, expiry_date, batch_number, nafdac_number,
              unit, pack_size, pack_price, pack_label, image_path, is_inventory, size, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `);
          for (const p of products) {
            if (!p || !p.id) continue;
            insertProd.run(
              p.id,
              p.name || 'Product',
              p.barcode || null,
              p.category || 'General',
              Number(p.unit_price ?? p.price ?? 0),
              Number(p.cost_price ?? 0),
              Number(p.stock_qty ?? p.stock ?? 0),
              Number(p.low_stock_threshold ?? 5),
              p.tax_category || 'standard',
              Number(p.is_active ?? 1),
              Number(p.is_pharmacy ?? 0),
              p.expiry_date || null,
              p.batch_number || null,
              p.nafdac_number || null,
              p.unit || 'each',
              Math.max(1, Number(p.pack_size || 1)),
              p.pack_price ?? null,
              p.pack_label || 'Box',
              p.image_path || null,
              Number(p.is_inventory ?? 1),
              p.size || null,
              p.created_at || null,
              p.updated_at || null
            );
=======
      // Wrap in transaction for atomicity and performance
      const restoreTransaction = db.transaction(() => {
        // 1. Restore Products
        if (data.products && Array.isArray(data.products)) {
          const insertProd = db.prepare(`
            INSERT OR REPLACE INTO products (id, name, sku, price, stock, category, is_inventory, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const p of data.products) {
            insertProd.run(p.id, p.name, p.sku, p.price, p.stock, p.category, p.is_inventory ? 1 : 0, p.created_at);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
            totalRestored++;
          }
        }

<<<<<<< HEAD
        // 2) Customers
        if (data.customer && Array.isArray(data.customer)) {
          const customers = flatten(data.customer);
          const insertCust = db.prepare(`
            INSERT OR REPLACE INTO customers (
              id, name, phone, email, credit_balance, credit_limit, loyalty_points, total_spent, notes,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const c of customers) {
            if (!c) continue;
            const id = Number(c.local_id ?? c.id);
            if (!id) continue;
            insertCust.run(
              id,
              c.name || 'Customer',
              c.phone || null,
              c.email || null,
              Number(c.credit_balance ?? 0),
              Number(c.credit_limit ?? 0),
              Number(c.loyalty_points ?? 0),
              Number(c.total_spent ?? 0),
              c.notes || null,
              c.created_at || null,
              c.updated_at || null
            );
            totalRestored++;
          }
        }

        // 3) Users (staff)
        if (data.users && Array.isArray(data.users)) {
          const users = flatten(data.users);
          const insertUser = db.prepare(`
            INSERT OR REPLACE INTO users (id, name, pin, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const u of users) {
            if (!u) continue;
            const id = Number(u.local_id ?? u.id);
            if (!id) continue;
            insertUser.run(
              id,
              u.name || 'User',
              u.pin || '',
              u.role || 'cashier',
              u.created_at || null,
              u.updated_at || null
            );
            totalRestored++;
          }
        }

        // 4) Transactions + items
        if (data.transaction && Array.isArray(data.transaction)) {
          const txs = flatten(data.transaction);
          const insertTx = db.prepare(`
            INSERT OR REPLACE INTO transactions (
              id, receipt_number, customer_id, customer_name, cashier_name, status, payment_method,
              subtotal, discount_amount, discount_type,
              tax_vat, tax_nhil, tax_getfund, tax_covid, total_tax,
              grand_total, amount_tendered, change_given, momo_reference, paid_amount,
              created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?
            )
          `);

          const deleteItems = db.prepare(`DELETE FROM transaction_items WHERE transaction_id = ?`);
          const insertItem = db.prepare(`
            INSERT INTO transaction_items (
              transaction_id, product_id, product_name, product_barcode, product_size, category,
              quantity, unit_price, cost_price, line_total, tax_category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const t of txs) {
            if (!t || !t.receipt_number) continue;

            const id = Number(t.local_id ?? t.id) || undefined;
            const taxObj = (t.tax && typeof t.tax === 'object') ? t.tax : {};

            const taxVat = Number(t.tax_vat ?? taxObj.vat ?? 0);
            const taxNhil = Number(t.tax_nhil ?? taxObj.nhil ?? 0);
            const taxGetfund = Number(t.tax_getfund ?? taxObj.getfund ?? 0);
            const taxCovid = Number(t.tax_covid ?? taxObj.covid ?? 0);
            const totalTax = Number(t.total_tax ?? taxObj.totalTax ?? 0);

            insertTx.run(
              id ?? null,
              t.receipt_number,
              t.customer_id ?? null,
              t.customer_name ?? null,
              t.cashier_name || 'Cashier',
              t.status || (t.payment_method === 'credit' ? 'debt' : 'completed'),
              t.payment_method || 'cash',
              Number(t.subtotal ?? (t.grand_total ?? 0)),
              Number(t.discount_amount ?? 0),
              t.discount_type ?? null,
              taxVat, taxNhil, taxGetfund, taxCovid, totalTax,
              Number(t.grand_total ?? 0),
              Number(t.amount_tendered ?? (t.grand_total ?? 0)),
              Number(t.change_given ?? 0),
              t.momo_reference ?? null,
              Number(t.paid_amount ?? 0),
              t.created_at ?? null,
              t.updated_at ?? null
            );

            // Find the transaction_id we just wrote (if id wasn't provided)
            const txRow = db.prepare(`SELECT id FROM transactions WHERE receipt_number = ?`).get(t.receipt_number) as { id: number } | undefined;
            const txId = txRow?.id;
            if (!txId) continue;

            deleteItems.run(txId);
            if (Array.isArray(t.items)) {
              for (const it of t.items) {
                if (!it) continue;
                insertItem.run(
                  txId,
                  it.product_id ?? null,
                  it.product_name || it.name || 'Item',
                  it.product_barcode || it.barcode || null,
                  it.product_size || null,
                  it.category || 'General',
                  Number(it.quantity ?? 1),
                  Number(it.unit_price ?? it.price ?? 0),
                  Number(it.cost_price ?? 0),
                  Number(it.line_total ?? ((it.quantity ?? 1) * (it.unit_price ?? it.price ?? 0))),
                  it.tax_category || 'standard'
                );
              }
            }

            totalRestored++;
          }
        }

        // 5) Business profile → settings + secureStore
        if (data.business_info && Array.isArray(data.business_info)) {
          const bizInfos = flatten(data.business_info);
          const latest = bizInfos[bizInfos.length - 1];
          if (latest) {
            const upsertSetting = db.prepare(`
              INSERT INTO settings (key, value, updated_at)
              VALUES (?, ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            `);
            if (latest.business_name) upsertSetting.run('business_name', String(latest.business_name));
            if (latest.business_address !== undefined) upsertSetting.run('business_address', String(latest.business_address || ''));
            if (latest.business_phone !== undefined) upsertSetting.run('business_phone', String(latest.business_phone || ''));
            totalRestored++;

            try {
              if (latest.business_logo) {
                this.secureStore.set('business_logo', latest.business_logo);
              }
            } catch {
              // ignore
            }
          }
        }

        // 6) Credit payments
        if (data.credit_payment && Array.isArray(data.credit_payment)) {
          const pays = flatten(data.credit_payment);
          const insertPay = db.prepare(`
            INSERT OR IGNORE INTO credit_payments (cloud_id, customer_id, amount, payment_method, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const p of pays) {
            if (!p) continue;
            const cloudId = Number(p.cloud_id ?? p.id);
            const customerId = Number(p.customer_id);
            if (!cloudId || !customerId) continue;
            insertPay.run(
              cloudId,
              customerId,
              Number(p.amount ?? 0),
              p.payment_method || 'cash',
              p.note || null,
              p.created_at || null
            );
=======
        // 2. Restore Sales
        if (data.sales && Array.isArray(data.sales)) {
          const insertSale = db.prepare(`
            INSERT OR REPLACE INTO sales (id, receipt_number, cashier_id, total_amount, discount, grand_total, payment_method, order_type, order_note, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const s of data.sales) {
            insertSale.run(s.id, s.receipt_number, s.cashier_id, s.total_amount, s.discount, s.grand_total, s.payment_method, s.order_type, s.order_note, s.status, s.created_at);
            totalRestored++;
          }
        }

        // 3. Restore Customers
        if (data.customers && Array.isArray(data.customers)) {
          const insertCust = db.prepare(`
            INSERT OR REPLACE INTO customers (id, name, phone, email, points, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const c of data.customers) {
            insertCust.run(c.id, c.name, c.phone, c.email, c.points, c.created_at);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
            totalRestored++;
          }
        }
      });

      restoreTransaction();

      this.setStatus('synced');
      console.log('[Sync] Recovery complete.');
      return { success: true, count: totalRestored };
    } catch (err: any) {
      console.error('[SyncManager] Cloud recovery failed:', err.message);
      this.setStatus('error');
      throw err;
    }
  }
}
