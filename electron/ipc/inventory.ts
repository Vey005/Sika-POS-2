import { ipcMain, dialog } from 'electron';
import * as XLSX from 'xlsx';
import { getDb } from '../db/database';

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
<<<<<<< HEAD
  pack_size?: number;
  pack_price?: number | null;
  pack_label?: string;
  stock_unit?: 'single' | 'pack';
  size?: string;
  image_path?: string;
  expiry_alert_months?: number | null;
=======
  size?: string;
  image_path?: string;
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  created_at?: string;
  updated_at?: string;
}

<<<<<<< HEAD
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
=======
export function registerInventoryHandlers() {
  const db = getDb();

  ipcMain.handle('inventory:getAll', (_event, filters?: { search?: string, category?: string, limit?: number, lowStock?: boolean }) => {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    let sql = `SELECT * FROM products WHERE is_active = 1`;
    const params: any[] = [];

    if (filters?.lowStock) {
      sql += ` AND stock_qty <= low_stock_threshold AND is_inventory = 1`;
    }

<<<<<<< HEAD
    if (filters?.expiring) {
      const defaultMonths = getDefaultExpiryAlertMonths(db);
      sql += EXPIRING_WHERE;
      params.push(defaultMonths);
    }

=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

  ipcMain.handle('inventory:getLowStockCount', (_event) => {
    return (db.prepare(`
      SELECT COUNT(*) as count FROM products 
      WHERE is_active = 1 AND stock_qty <= low_stock_threshold AND stock_qty > 0
    `).get() as { count: number }).count;
  });

<<<<<<< HEAD
  ipcMain.handle('inventory:getExpiringCount', (_event) => {
    const defaultMonths = getDefaultExpiryAlertMonths(db);
    return (db.prepare(`
      SELECT COUNT(*) as count FROM products
      WHERE is_active = 1
      ${EXPIRING_WHERE}
    `).get(defaultMonths) as { count: number }).count;
  });

=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  ipcMain.handle('inventory:save', (_event, product: Product) => {
    try {
      if (product.id) {
        // Update
        db.prepare(`
          UPDATE products SET
            name = ?, barcode = ?, category = ?, unit_price = ?, cost_price = ?,
            stock_qty = ?, low_stock_threshold = ?, tax_category = ?,
<<<<<<< HEAD
            is_pharmacy = ?, is_inventory = ?, expiry_date = ?, batch_number = ?, nafdac_number = ?, unit = ?,
            pack_size = ?, pack_price = ?, pack_label = ?, stock_unit = ?, size = ?, image_path = ?,
            expiry_alert_months = ?,
=======
            is_pharmacy = ?, is_inventory = ?, expiry_date = ?, batch_number = ?, nafdac_number = ?, unit = ?, size = ?, image_path = ?,
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          product.name, product.barcode || null, product.category,
          product.unit_price, product.cost_price, product.stock_qty,
          product.low_stock_threshold, product.tax_category,
          product.is_pharmacy || 0, product.is_inventory ?? 1, product.expiry_date || null,
          product.batch_number || null, product.nafdac_number || null,
<<<<<<< HEAD
          product.unit || 'each',
          Math.max(1, Number(product.pack_size || 1)),
          product.pack_price ?? null,
          product.pack_label || 'Box',
          product.stock_unit || 'single',
          product.size || null, product.image_path || null,
          product.expiry_alert_months ?? null,
          product.id
=======
          product.unit || 'each', product.size || null, product.image_path || null, product.id
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        );
        
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
<<<<<<< HEAD
          INSERT INTO products (
            name, barcode, category, unit_price, cost_price, stock_qty, low_stock_threshold, tax_category,
            is_pharmacy, is_inventory, expiry_date, batch_number, nafdac_number, unit,
            pack_size, pack_price, pack_label, stock_unit, size, image_path, expiry_alert_months
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
=======
          INSERT INTO products (name, barcode, category, unit_price, cost_price, stock_qty, low_stock_threshold, tax_category, is_pharmacy, is_inventory, expiry_date, batch_number, nafdac_number, unit, size, image_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        `).run(
          product.name, product.barcode || null, product.category,
          product.unit_price, product.cost_price, product.stock_qty,
          product.low_stock_threshold, product.tax_category,
          product.is_pharmacy || 0, product.is_inventory ?? 1, product.expiry_date || null,
          product.batch_number || null, product.nafdac_number || null,
<<<<<<< HEAD
          product.unit || 'each',
          Math.max(1, Number(product.pack_size || 1)),
          product.pack_price ?? null,
          product.pack_label || 'Box',
          product.stock_unit || 'single',
          product.size || null, product.image_path || null,
          product.expiry_alert_months ?? null
=======
          product.unit || 'each', product.size || null, product.image_path || null
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        );
        const productId = result.lastInsertRowid;
        
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
    db.prepare(`
      UPDATE products SET stock_qty = MAX(0, stock_qty + ?), updated_at = datetime('now') WHERE id = ?
    `).run(delta, id);
    
    // Push to sync queue (priority 5 for products)
    const adjustedProduct = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    db.prepare(`
      INSERT INTO sync_queue (entity, operation, payload, status, priority)
      VALUES ('product', 'update', ?, 'pending', 5)
    `).run(JSON.stringify(adjustedProduct));

    return { success: true };
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
    const template = [
      {
        'Product Name': 'Demo Product',
        'Barcode': '1234567890',
        'Category': 'General',
        'Unit': 'each',
<<<<<<< HEAD
        'Pack Label': 'Box',
        'Pack Size': 10,
        'Size': '500ml',
        'Selling Price': 10.00,
        'Pack Price': 90.00,
=======
        'Size': '500ml',
        'Selling Price': 10.00,
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        'Cost Price': 7.00,
        'Stock Quantity': 100,
        'Low Stock Threshold': 5,
        'Tax Category (standard/zero_rated/exempt)': 'standard',
<<<<<<< HEAD
        'Expiry product (0 or 1)': 0,
        'Expiry alert months': '',
        'Track Stock (0 or 1)': 1,
        'Stock Unit (single/pack)': 'single',
=======
        'Pharmacy (0 or 1)': 0,
        'Track Stock (0 or 1)': 1,
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
      }
    ];
    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Inventory Template',
      defaultPath: 'sikapos_inventory_template.xlsx',
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (filePath) {
      XLSX.writeFile(workbook, filePath);
      return { success: true, filePath };
    }
    return { success: false };
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
<<<<<<< HEAD
        INSERT INTO products (
          name, barcode, category, unit_price, cost_price, stock_qty, low_stock_threshold, tax_category,
          is_pharmacy, is_inventory, unit, pack_label, pack_size, pack_price, size, stock_unit
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
=======
        INSERT INTO products (name, barcode, category, unit_price, cost_price, stock_qty, low_stock_threshold, tax_category, is_pharmacy, is_inventory, unit, size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        ON CONFLICT(barcode) DO UPDATE SET
          name = excluded.name,
          category = excluded.category,
          unit_price = excluded.unit_price,
          cost_price = excluded.cost_price,
          stock_qty = excluded.stock_qty,
<<<<<<< HEAD
          pack_label = excluded.pack_label,
          pack_size = excluded.pack_size,
          pack_price = excluded.pack_price,
          is_inventory = excluded.is_inventory,
          size = excluded.size,
          stock_unit = excluded.stock_unit,
=======
          is_inventory = excluded.is_inventory,
          size = excluded.size,
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
          is_active = 1,
          updated_at = datetime('now')
      `);

      const transaction = db.transaction((items) => {
        for (const item of items) {
          insertStmt.run(
            item['Product Name'] || item['name'] || 'Unknown Item',
            item['Barcode'] || item['barcode'] || null,
            item['Category'] || item['category'] || 'General',
            parseFloat(item['Selling Price'] || item['unit_price']) || 0,
            parseFloat(item['Cost Price'] || item['cost_price']) || 0,
            parseInt(item['Stock Quantity'] || item['stock_qty']) || 0,
            parseInt(item['Low Stock Threshold'] || item['low_stock_threshold']) || 5,
            item['Tax Category (standard/zero_rated/exempt)'] || item['tax_category'] || 'standard',
<<<<<<< HEAD
            parseInt(item['Expiry product (0 or 1)'] || item['Pharmacy (0 or 1)'] || item['is_pharmacy']) || 0,
            parseInt(item['Track Stock (0 or 1)'] ?? item['is_inventory'] ?? 1),
            item['Unit'] || item['unit'] || 'each',
            item['Pack Label'] || item['pack_label'] || 'Box',
            Math.max(1, parseInt(item['Pack Size'] || item['pack_size']) || 1),
            (() => {
              const raw = item['Pack Price'] ?? item['pack_price'];
              if (raw === undefined || raw === null || raw === '') return null;
              const parsed = parseFloat(raw);
              return Number.isFinite(parsed) ? parsed : null;
            })(),
            item['Size'] || item['size'] || null,
            item['Stock Unit (single/pack)'] || item['stock_unit'] || 'single'
=======
            parseInt(item['Pharmacy (0 or 1)'] || item['is_pharmacy']) || 0,
            parseInt(item['Track Stock (0 or 1)'] ?? item['is_inventory'] ?? 1),
            item['Unit'] || item['unit'] || 'each',
            item['Size'] || item['size'] || null
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
          );
        }
      });

      transaction(data);
      return { success: true, count: data.length };
    } catch (error: any) {
      console.error('Import Error:', error);
      return { success: false, message: error.message };
    }
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
