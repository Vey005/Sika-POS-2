import { BrowserWindow } from 'electron';
import axios from 'axios';
import { getDb } from '../db/database';

import { SecureStore } from '../store/secure-store';

// Configuration
// In a real application, this would be fetched from settings (e.g. electron-store)
// For this MVP, we use a mock endpoint
const API_BASE_URL = process.env.API_BASE_URL || 'https://sikapos-api-production.up.railway.app';
const SYNC_INTERVAL_MS = 30000; // 30 seconds
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds
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
    
    // Backfill any historical transactions not yet in sync_queue
    setTimeout(() => this.backfillHistoricalTransactions(), 8000);

    // Backfill any historical products not yet in sync_queue
    setTimeout(() => this.backfillHistoricalInventory(), 10000);
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
      // Find all transactions whose receipt_number is NOT already in the sync_queue
      const unsynced = db.prepare(`
        SELECT t.*, t.cashier_name, t.created_at
        FROM transactions t
        WHERE t.receipt_number NOT IN (
          SELECT json_extract(payload, '$.receipt_number') FROM sync_queue WHERE entity = 'transaction'
        )
        AND t.status = 'completed'
      `).all() as any[];

      if (unsynced.length === 0) {
        console.log('[SyncManager] No historical transactions to backfill.');
        return;
      }

      console.log(`[SyncManager] Backfilling ${unsynced.length} historical transactions...`);

      const insert = db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status)
        VALUES ('transaction', 'create', ?, 'pending')
      `);

      const insertAll = db.transaction(() => {
        for (const tx of unsynced) {
          const payload = JSON.stringify({
            id: tx.id,
            receipt_number: tx.receipt_number,
            customer_name: tx.customer_name || null,
            cashier_name: tx.cashier_name || 'Staff',
            payment_method: tx.payment_method,
            grand_total: tx.grand_total,
            subtotal: tx.subtotal || tx.grand_total,
            discount_amount: tx.discount_amount || 0,
            tax: { totalTax: tx.total_tax || 0 },
            created_at: tx.created_at,
          });
          insert.run(payload);
        }
      });

      insertAll();
      console.log(`[SyncManager] Backfill complete. ${unsynced.length} transactions queued.`);
    } catch (err: any) {
      console.error('[SyncManager] Backfill failed:', err.message);
    }
  }

  private backfillHistoricalInventory() {
    const db = getDb();
    try {
      // Find all active products whose id is NOT already in the sync_queue as a 'product' entity
      // We check for the id in the payload
      const unsynced = db.prepare(`
        SELECT p.*
        FROM products p
        WHERE p.id NOT IN (
          SELECT json_extract(payload, '$.id') FROM sync_queue WHERE entity = 'product'
        )
        AND p.is_active = 1
      `).all() as any[];

      if (unsynced.length === 0) {
        console.log('[SyncManager] No historical products to backfill.');
        return;
      }

      console.log(`[SyncManager] Backfilling ${unsynced.length} historical products...`);

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
      console.log(`[SyncManager] Backfill complete. ${unsynced.length} products queued.`);
    } catch (err: any) {
      console.error('[SyncManager] Product backfill failed:', err.message);
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
    console.log(`[SyncManager] Sync started. ${pendingCount} items pending.`);

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

      for (const item of items) {
        try {
          // Attempt to push to the cloud API
          const payload = JSON.parse(item.payload);
          
          await axios.post(`${API_BASE_URL}/v1/sync/push`, {
            entity: item.entity,
            operation: item.operation,
            payload: payload
          }, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
              Authorization: `Bearer ${businessId}`
            }
          });

          // Mark as synced
          db.prepare(`UPDATE sync_queue SET status = 'synced', updated_at = datetime('now') WHERE id = ?`).run(item.id);
        } catch (err: any) {
          const isOffline = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
          const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');

          if (isOffline || isTimeout) {
            // Server unreachable or slow — expected in offline/dev mode. Stop trying for this cycle.
            if (isTimeout) {
              console.warn(`[SyncManager] Sync server timed out after ${REQUEST_TIMEOUT_MS}ms. Will retry next cycle.`);
            } else {
              console.warn(`[SyncManager] Sync server unreachable (${API_BASE_URL}). Running in offline mode.`);
            }
            this.setStatus('error');
            return;
          }

          // Increment retry count for this item
          db.prepare(`
            UPDATE sync_queue 
            SET retry_count = COALESCE(retry_count, 0) + 1, updated_at = datetime('now')
            WHERE id = ?
          `).run(item.id);

          console.error(`[SyncManager] Failed to sync item ${item.id}:`, err.response?.data?.debug || err.response?.data?.message || err.message);
          
          if (err.response) {
            db.prepare(`
              UPDATE sync_queue SET status = 'error', error_message = ?, updated_at = datetime('now') 
              WHERE id = ?
            `).run(err.response.data?.debug || err.response.data?.message || err.message, item.id);
          } else {
            throw err; 
          }
        }
      }
      
      this.setStatus('synced');
      console.log('[SyncManager] Sync completed successfully.');
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
      console.log('[SyncManager] Starting full cloud data recovery...');
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
            totalRestored++;
          }
        }

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
            totalRestored++;
          }
        }
      });

      restoreTransaction();
      
      this.setStatus('synced');
      console.log(`[SyncManager] Recovery complete. ${totalRestored} items restored.`);
      return { success: true, count: totalRestored };
    } catch (err: any) {
      console.error('[SyncManager] Cloud recovery failed:', err.message);
      this.setStatus('error');
      throw err;
    }
  }
}
