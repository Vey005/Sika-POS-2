import { ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getDb } from '../db/database';
import { depleteStockFEFO, restoreStockToLatestBatch, setProductStockQuantity } from '../db/batch-helpers';
import {
  INVENTORY_TEMPLATE_SAMPLE,
  parseImportItem,
  productToExportRow,
  rowsToCsv,
} from '../utils/inventory-import-export';

export interface Product {
  id?: number;
  name: string;
  barcode?: string;
  category: string;
  unit_price: number;
  cost_price: number;
  stock_qty: number;
  low_stock_threshold: number;
  tax_category: 'standard' | 'zero_rated' | 'exempt';
  is_active?: number;
  is_pharmacy?: number;
  is_inventory?: number;
  expiry_date?: string;
  batch_number?: string;
  nafdac_number?: string;
  unit: string;
  pack_size?: number;
  pack_price?: number | null;
  pack_label?: string;
  stock_unit?: 'single' | 'pack';
  size?: string;
  image_path?: string;
  expiry_alert_months?: number | null;
  created_at?: string;
  updated_at?: string;
}

function isFileLockedError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number };
  return e?.code === 'EBUSY' || e?.code === 'EPERM' || e?.errno === -4082;
}

/** Avoid EBUSY when Excel/other apps have the target file open. */
function writeFileSafe(
  filePath: string,
  write: (targetPath: string) => void
): { success: boolean; filePath: string; message?: string } {
  try {
    write(filePath);
    return { success: true, filePath };
  } catch (err) {
    if (!isFileLockedError(err)) throw err;
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const altPath = path.join(dir, `${base}_${Date.now()}${ext}`);
    try {
      write(altPath);
      return {
        success: true,
        filePath: altPath,
        message:
          'That file is open in another program (e.g. Excel). Saved under a new name instead. Close the old file before overwriting it.',
      };
    } catch (err2) {
      if (!isFileLockedError(err2)) throw err2;
      return {
        success: false,
        filePath,
        message:
          'Could not save — the file is in use. Close it in Excel or another app, then try again (or pick a different file name).',
      };
    }
  }
}

function getDefaultExpiryAlertMonths(db: ReturnType<typeof getDb>): number {
  const raw = db.prepare(`SELECT value FROM settings WHERE key = 'expiry_alert_months_default'`).pluck().get() as string | undefined;
  const n = parseInt(String(raw ?? '3'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/** Products with expiry_date within each product's alert window (or shop default). */
const EXPIRING_WHERE = `
  AND is_pharmacy = 1
  AND expiry_date IS NOT NULL AND trim(expiry_date) != ''
  AND date(expiry_date) <= date('now', '+' || CAST(COALESCE(expiry_alert_months, ?) AS TEXT) || ' months')
`;

export function registerInventoryHandlers() {
  const db = getDb();

  ipcMain.handle('inventory:getAll', (_event, filters?: {
    search?: string;
    category?: string;
    limit?: number;
    lowStock?: boolean;
    expiring?: boolean;
  }) => {
    let sql = `SELECT * FROM products WHERE is_active = 1`;
    const params: any[] = [];

    if (filters?.lowStock) {
      sql += ` AND stock_qty <= low_stock_threshold AND is_inventory = 1`;
    }

    if (filters?.expiring) {
      const defaultMonths = getDefaultExpiryAlertMonths(db);
      sql += EXPIRING_WHERE;
      params.push(defaultMonths);
    }

    if (filters?.category && filters.category !== 'All') {
      sql += ` AND category = ?`;
      params.push(filters.category);
    }

    if (filters?.search) {
      const q = `%${filters.search}%`;
      sql += ` AND (name LIKE ? OR barcode LIKE ?)`;
      params.push(q, q);
    }

    sql += ` ORDER BY name`;

    // Default to 100 if no limit provided to prevent crashing with 5000+ items
    const limit = filters?.limit || 100;
    sql += ` LIMIT ?`;
    params.push(limit);

    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('inventory:search', (_event, query: string) => {
    const q = `%${query}%`;
    return db.prepare(`
      SELECT * FROM products
      WHERE is_active = 1 AND (name LIKE ? OR barcode LIKE ? OR category LIKE ?)
      ORDER BY name LIMIT 50
    `).all(q, q, q);
  });

  ipcMain.handle('inventory:getByBarcode', (_event, barcode: string) => {
    return db.prepare(`
      SELECT * FROM products WHERE barcode = ? AND is_active = 1
    `).get(barcode) || null;
  });

  ipcMain.handle('inventory:getById', (_event, id: number) => {
    return db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) || null;
  });

  ipcMain.handle('inventory:getStockLevels', (_event, ids: number[]) => {
    const uniqueIds = [...new Set((ids || []).map(Number).filter(id => id > 0))];
    if (uniqueIds.length === 0) return [];
    const placeholders = uniqueIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT id, name, barcode, category, unit_price, cost_price, stock_qty,
             is_inventory, stock_unit, size, pack_size, pack_price, pack_label, tax_category
      FROM products
      WHERE is_active = 1 AND id IN (${placeholders})
    `).all(...uniqueIds);
  });

  ipcMain.handle('inventory:getLowStockCount', (_event) => {
    return (db.prepare(`
      SELECT COUNT(*) as count FROM products 
      WHERE is_active = 1 AND stock_qty <= low_stock_threshold AND stock_qty > 0
    `).get() as { count: number }).count;
  });

  ipcMain.handle('inventory:getExpiringCount', (_event) => {
    const defaultMonths = getDefaultExpiryAlertMonths(db);
    return (db.prepare(`
      SELECT COUNT(*) as count FROM products
      WHERE is_active = 1
      ${EXPIRING_WHERE}
    `).get(defaultMonths) as { count: number }).count;
  });

  ipcMain.handle('inventory:save', (_event, product: Product) => {
    try {
      if (product.id) {
        // Update
        db.prepare(`
          UPDATE products SET
            name = ?, barcode = ?, category = ?, unit_price = ?, cost_price = ?,
            stock_qty = ?, low_stock_threshold = ?, tax_category = ?,
            is_pharmacy = ?, is_inventory = ?, expiry_date = ?, batch_number = ?, nafdac_number = ?, unit = ?,
            pack_size = ?, pack_price = ?, pack_label = ?, stock_unit = ?, size = ?, image_path = ?,
            expiry_alert_months = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          product.name, product.barcode || null, product.category,
          product.unit_price, product.cost_price, product.stock_qty,
          product.low_stock_threshold, product.tax_category,
          product.is_pharmacy || 0, product.is_inventory ?? 1, product.expiry_date || null,
          product.batch_number || null, product.nafdac_number || null,
          product.unit || 'each',
          Math.max(1, Number(product.pack_size || 1)),
          product.pack_price ?? null,
          product.pack_label || 'Box',
          product.stock_unit || 'single',
          product.size || null, product.image_path || null,
          product.expiry_alert_months ?? null,
          product.id
        );

        setProductStockQuantity(db, product.id, product.stock_qty, product.cost_price);
        
        // Push to sync queue (priority 5 for products)
        const updatedProduct = db.prepare(`SELECT * FROM products WHERE id = ?`).get(product.id);
        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('product', 'update', ?, 'pending', 5)
        `).run(JSON.stringify(updatedProduct));

        return { id: product.id, success: true };
      } else {
        // Insert
        const result = db.prepare(`
          INSERT INTO products (
            name, barcode, category, unit_price, cost_price, stock_qty, low_stock_threshold, tax_category,
            is_pharmacy, is_inventory, expiry_date, batch_number, nafdac_number, unit,
            pack_size, pack_price, pack_label, stock_unit, size, image_path, expiry_alert_months
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          product.name, product.barcode || null, product.category,
          product.unit_price, product.cost_price, product.stock_qty,
          product.low_stock_threshold, product.tax_category,
          product.is_pharmacy || 0, product.is_inventory ?? 1, product.expiry_date || null,
          product.batch_number || null, product.nafdac_number || null,
          product.unit || 'each',
          Math.max(1, Number(product.pack_size || 1)),
          product.pack_price ?? null,
          product.pack_label || 'Box',
          product.stock_unit || 'single',
          product.size || null, product.image_path || null,
          product.expiry_alert_months ?? null
        );
        const productId = Number(result.lastInsertRowid);

        if (product.stock_qty > 0) {
          setProductStockQuantity(db, productId, product.stock_qty, product.cost_price);
        }
        
        // Push to sync queue (priority 5 for products)
        const newProduct = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId);
        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('product', 'create', ?, 'pending', 5)
        `).run(JSON.stringify(newProduct));

        return { id: productId, success: true };
      }
    } catch (error: any) {
      console.error('Inventory Save Error:', error);
      if (error.message.includes('UNIQUE constraint failed: products.barcode')) {
        return { success: false, message: 'This barcode is already assigned to another product.' };
      }
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('inventory:delete', (_event, id: number) => {
    try {
      // Professional check: Attempt hard delete first to keep DB clean
      db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
      
      // Push hard delete to sync queue
      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('product', 'delete', ?, 'pending', 5)
      `).run(JSON.stringify({ id, deleted: true }));

      return { success: true };
    } catch (err: any) {
      // Fallback to soft delete if product is referenced by transactions (foreign key constraint)
      if (err.message.includes('FOREIGN KEY constraint failed')) {
        db.prepare(`UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
        
        const deletedProduct = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
        db.prepare(`
          INSERT INTO sync_queue (entity, operation, payload, status, priority)
          VALUES ('product', 'delete', ?, 'pending', 5)
        `).run(JSON.stringify(deletedProduct));
        
        return { success: true, message: 'Product soft-deleted because it has sales history.' };
      }
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('inventory:adjustStock', (_event, id: number, delta: number, _reason: string) => {
    if (delta > 0) {
      // Positive adjustment → add to most recent batch
      restoreStockToLatestBatch(db, id, delta);
    } else if (delta < 0) {
      // Negative adjustment → deplete FEFO
      depleteStockFEFO(db, id, Math.abs(delta));
    }
    
    // Push to sync queue (priority 5 for products)
    const adjustedProduct = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    db.prepare(`
      INSERT INTO sync_queue (entity, operation, payload, status, priority)
      VALUES ('product', 'update', ?, 'pending', 5)
    `).run(JSON.stringify(adjustedProduct));

    return { success: true };
  });

  // Get all batches for a product
  ipcMain.handle('inventory:getBatches', (_event, productId: number) => {
    return db.prepare(`
      SELECT id, batch_number, expiry_date, cost_price, stock_qty, created_at
      FROM product_batches
      WHERE product_id = ?
      ORDER BY
        CASE WHEN expiry_date IS NULL OR trim(expiry_date) = '' THEN 1 ELSE 0 END,
        expiry_date ASC,
        created_at ASC
    `).all(productId);
  });

  ipcMain.handle('inventory:getCategories', (_event) => {
    const fromProducts = db.prepare(`SELECT DISTINCT category FROM products WHERE is_active = 1 ORDER BY category`).pluck().all() as string[];
    const customCatsStr = db.prepare(`SELECT value FROM settings WHERE key = 'custom_categories'`).pluck().get() as string;
    const customCats = customCatsStr ? customCatsStr.split(',').map(c => c.trim()).filter(Boolean) : [];
    
    // Merge and deduplicate
    const allCats = Array.from(new Set([...fromProducts, ...customCats])).sort();
    return allCats;
  });

  ipcMain.handle('inventory:getSummary', (_event) => {
    return db.prepare(`
      SELECT 
        COUNT(*) as total_items,
        SUM(stock_qty) as total_stock,
        SUM(stock_qty * unit_price) as total_value_selling,
        SUM(stock_qty * cost_price) as total_value_cost
      FROM products 
      WHERE is_active = 1
    `).get();
  });

  ipcMain.handle('inventory:getCategorySummary', (_event) => {
    return db.prepare(`
      SELECT 
        category,
        COUNT(*) as item_count,
        SUM(stock_qty) as total_stock,
        SUM(stock_qty * unit_price) as total_value
      FROM products 
      WHERE is_active = 1
      GROUP BY category
      ORDER BY total_value DESC
    `).all();
  });

  ipcMain.handle('inventory:downloadTemplate', async () => {
    const worksheet = XLSX.utils.json_to_sheet([INVENTORY_TEMPLATE_SAMPLE]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Inventory Template',
      defaultPath: 'sikapos_inventory_template.xlsx',
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (!filePath) {
      return { success: false, message: 'Save cancelled' };
    }

    const saved = writeFileSafe(filePath, (target) => XLSX.writeFile(workbook, target));
    if (!saved.success) {
      return { success: false, message: saved.message };
    }
    return { success: true, filePath: saved.filePath, message: saved.message };
  });

  ipcMain.handle('inventory:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Inventory',
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return { success: false, message: 'Import cancelled' };

    try {
      const workbook = XLSX.readFile(filePaths[0]);
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];

      const insertStmt = db.prepare(`
        INSERT INTO products (
          name, barcode, category, unit_price, cost_price, stock_qty, low_stock_threshold, tax_category,
          is_pharmacy, is_inventory, unit, pack_label, pack_size, pack_price, size, stock_unit,
          expiry_date, expiry_alert_months, batch_number, nafdac_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(barcode) DO UPDATE SET
          name = excluded.name,
          category = excluded.category,
          unit_price = excluded.unit_price,
          cost_price = excluded.cost_price,
          stock_qty = excluded.stock_qty,
          low_stock_threshold = excluded.low_stock_threshold,
          tax_category = excluded.tax_category,
          is_pharmacy = excluded.is_pharmacy,
          unit = excluded.unit,
          pack_label = excluded.pack_label,
          pack_size = excluded.pack_size,
          pack_price = excluded.pack_price,
          is_inventory = excluded.is_inventory,
          size = excluded.size,
          stock_unit = excluded.stock_unit,
          expiry_date = excluded.expiry_date,
          expiry_alert_months = excluded.expiry_alert_months,
          batch_number = excluded.batch_number,
          nafdac_number = excluded.nafdac_number,
          is_active = 1,
          updated_at = datetime('now')
      `);

      const selectStmt = db.prepare(`
        SELECT * FROM products WHERE barcode = ?
      `);
      const selectByNameStmt = db.prepare(`
        SELECT * FROM products WHERE name = ? ORDER BY id DESC LIMIT 1
      `);
      const queueStmt = db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('product', 'create', ?, 'pending', 5)
      `);

      const transaction = db.transaction((items) => {
        for (const item of items) {
          const row = parseImportItem(item as Record<string, unknown>);
          const barcode = row.barcode;
          const name = row.name;

          insertStmt.run(
            name,
            barcode,
            row.category,
            row.unit_price,
            row.cost_price,
            row.stock_qty,
            row.low_stock_threshold,
            row.tax_category,
            row.is_pharmacy,
            row.is_inventory,
            row.unit,
            row.pack_label,
            row.pack_size,
            row.pack_price,
            row.size,
            row.stock_unit,
            row.expiry_date,
            row.expiry_alert_months,
            row.batch_number,
            row.nafdac_number
          );

          const product = barcode
            ? selectStmt.get(barcode)
            : selectByNameStmt.get(name);

          if (product) {
            setProductStockQuantity(
              db,
              (product as Product).id!,
              row.stock_qty,
              row.cost_price
            );
            const synced = db.prepare(`SELECT * FROM products WHERE id = ?`).get((product as Product).id);
            queueStmt.run(JSON.stringify(synced));
          }
        }
      });

      transaction(data);
      return { success: true, count: data.length };
    } catch (error: any) {
      console.error('Import Error:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('inventory:exportInventory', async () => {
    const products = db.prepare(`
      SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC
    `).all() as Product[];

    if (!products.length) {
      return { success: false, message: 'No products found in inventory to export.' };
    }

    const rows = products.map((p) => productToExportRow(p as unknown as Record<string, unknown>));
    const csv = rowsToCsv(rows);

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Inventory',
      defaultPath: `SikaPOS_Inventory_${new Date().toISOString().split('T')[0]}.csv`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Excel Files', extensions: ['xlsx'] },
      ],
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Export cancelled' };
    }

    let saved: { success: boolean; filePath: string; message?: string };
    if (filePath.toLowerCase().endsWith('.xlsx')) {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
      saved = writeFileSafe(filePath, (target) => XLSX.writeFile(workbook, target));
    } else {
      saved = writeFileSafe(filePath, (target) => {
        fs.writeFileSync(target, '\uFEFF' + csv, 'utf8');
      });
    }

    if (!saved.success) {
      return { success: false, message: saved.message };
    }
    return {
      success: true,
      count: products.length,
      filePath: saved.filePath,
      message: saved.message,
    };
  });

  // Clear all inventory (with cloud sync)
  ipcMain.handle('inventory:clearAll', async (_event) => {
    const db = getDb();
    try {
      // Check total products
      const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as {count: number};
      
      // Get all active product IDs before deleting
      const products = db.prepare('SELECT id FROM products WHERE is_active = 1').all() as {id: number}[];
      
      if (products.length === 0) {
        return { success: true, count: 0 };
      }
      
      // Professional check: Hard delete products with no transaction history
      try {
        db.prepare('DELETE FROM products WHERE id NOT IN (SELECT DISTINCT product_id FROM transaction_items WHERE product_id IS NOT NULL)').run();
      } catch (e) {
        console.warn('[Inventory Clear] Partial hard delete failed');
      }
      // Soft delete any remaining active products
      db.prepare('UPDATE products SET is_active = 0 WHERE is_active = 1').run();
      
      // Push delete operations to sync queue for each product (priority 5)
      const insert = db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('product', 'delete', ?, 'pending', 5)
      `);
      
      const insertAll = db.transaction(() => {
        for (const p of products) {
          insert.run(JSON.stringify({ id: p.id, deleted: true }));
        }
      });
      insertAll();

      // Also trigger cloud clear
      try {
        const axios = require('axios');
        const secureStore = new (require('../store/secure-store').SecureStore)();
        const businessId = secureStore.get('license_key') || 'default_shop';
        const API_BASE_URL = process.env.API_BASE_URL || 'https://sikapos-api-production.up.railway.app';
        
        await axios.post(`${API_BASE_URL}/v1/inventory/clear`, {
          business_id: businessId
        });
      } catch (cloudErr: any) {
        console.warn('[Inventory Clear] Cloud clear failed:', cloudErr.message);
        // Continue - local clear succeeded
      }

      return { success: true, count: products.length };
    } catch (error: any) {
      console.error('Clear All Error:', error);
      return { success: false, message: error.message };
    }
  });
}
