import type Database from 'better-sqlite3';

/**
 * Recalculate a product's cached stock_qty, expiry_date, and batch_number
 * from the product_batches table. Call this after any batch mutation.
 */
export function recalcProductFromBatches(db: Database.Database, productId: number): void {
  // Sum all batch quantities
  const stockRow = db.prepare(`
    SELECT COALESCE(SUM(stock_qty), 0) as total
    FROM product_batches WHERE product_id = ?
  `).get(productId) as { total: number };

  // Get earliest active batch (FEFO — for display on the product record)
  // Batches with NULL expiry_date sort last (non-expiry products)
  const earliestBatch = db.prepare(`
    SELECT batch_number, expiry_date, cost_price
    FROM product_batches
    WHERE product_id = ? AND stock_qty > 0
    ORDER BY
      CASE WHEN expiry_date IS NULL OR trim(expiry_date) = '' THEN 1 ELSE 0 END,
      expiry_date ASC
    LIMIT 1
  `).get(productId) as { batch_number: string | null; expiry_date: string | null; cost_price: number } | undefined;

  db.prepare(`
    UPDATE products SET
      stock_qty = ?,
      batch_number = ?,
      expiry_date = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    stockRow.total,
    earliestBatch?.batch_number ?? null,
    earliestBatch?.expiry_date ?? null,
    productId
  );
}

/**
 * Deplete stock using FEFO (First Expiry, First Out).
 * If transactionId is provided, records which batches were depleted for accurate reversal.
 * Returns the number of units actually depleted.
 */
export function depleteStockFEFO(
  db: Database.Database,
  productId: number,
  unitsToDeduct: number,
  transactionId?: number
): number {
  if (unitsToDeduct <= 0) return 0;

  // Manual stock edits update products.stock_qty but may leave batches empty — seed before depleting.
  const batchSumRow = db.prepare(`
    SELECT COALESCE(SUM(stock_qty), 0) as total
    FROM product_batches WHERE product_id = ?
  `).get(productId) as { total: number };
  const batchTotal = Number(batchSumRow.total) || 0;
  if (batchTotal <= 0) {
    const prod = db.prepare(`SELECT stock_qty, cost_price FROM products WHERE id = ?`).get(productId) as
      | { stock_qty: number; cost_price: number }
      | undefined;
    const cached = Number(prod?.stock_qty) || 0;
    if (cached > 0) {
      db.prepare(`
        INSERT INTO product_batches (product_id, batch_number, expiry_date, cost_price, stock_qty)
        VALUES (?, NULL, NULL, ?, ?)
      `).run(productId, prod?.cost_price ?? 0, cached);
    }
  }

  // Get batches ordered by expiry (earliest first, NULLs last)
  const batches = db.prepare(`
    SELECT id, stock_qty
    FROM product_batches
    WHERE product_id = ? AND stock_qty > 0
    ORDER BY
      CASE WHEN expiry_date IS NULL OR trim(expiry_date) = '' THEN 1 ELSE 0 END,
      expiry_date ASC,
      created_at ASC
  `).all(productId) as Array<{ id: number; stock_qty: number }>;

  let remaining = unitsToDeduct;
  const updateBatch = db.prepare(`UPDATE product_batches SET stock_qty = ? WHERE id = ?`);
  const deleteBatch = db.prepare(`DELETE FROM product_batches WHERE id = ? AND stock_qty <= 0`);
  const recordDepletion = transactionId
    ? db.prepare(`
        INSERT INTO transaction_batch_depletions (transaction_id, batch_id, product_id, quantity)
        VALUES (?, ?, ?, ?)
      `)
    : null;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const take = Math.min(batch.stock_qty, remaining);
    const newQty = batch.stock_qty - take;
    updateBatch.run(newQty, batch.id);
    remaining -= take;

    // Record which batch was depleted and by how much
    if (recordDepletion && take > 0) {
      recordDepletion.run(transactionId, batch.id, productId, take);
    }

    // Auto-delete the batch if it is now fully exhausted
    if (newQty <= 0) {
      deleteBatch.run(batch.id);
      console.log(`[Batch] Deleted exhausted batch ${batch.id} for product ${productId}`);
    }
  }

  // If we still have remaining units to deduct (oversold), allow negative on last batch
  if (remaining > 0 && batches.length > 0) {
    const lastBatch = batches[batches.length - 1];
    // Only update if it wasn't already deleted above
    const stillExists = db.prepare(`SELECT stock_qty FROM product_batches WHERE id = ?`).get(lastBatch.id) as { stock_qty: number } | undefined;
    if (stillExists) {
      updateBatch.run(stillExists.stock_qty - remaining, lastBatch.id);
      if (recordDepletion) {
        recordDepletion.run(transactionId, lastBatch.id, productId, remaining);
      }
      // Delete if now at or below zero (oversell edge case)
      if (stillExists.stock_qty - remaining <= 0) {
        deleteBatch.run(lastBatch.id);
        console.log(`[Batch] Deleted oversold batch ${lastBatch.id} for product ${productId}`);
      }
    }
  }

  // Recalculate the product's cached fields
  recalcProductFromBatches(db, productId);

  return unitsToDeduct;
}

/**
 * Restore stock to the most recent batch of a product.
 * Used by adjustStock (positive delta) and as fallback when no depletion records exist.
 */
export function restoreStockToLatestBatch(db: Database.Database, productId: number, units: number): void {
  if (units <= 0) return;

  // Find the most recent batch
  const latestBatch = db.prepare(`
    SELECT id FROM product_batches
    WHERE product_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(productId) as { id: number } | undefined;

  if (latestBatch) {
    db.prepare(`UPDATE product_batches SET stock_qty = stock_qty + ? WHERE id = ?`).run(units, latestBatch.id);
  } else {
    // No batch exists — create one (edge case: product was created before batch system)
    db.prepare(`
      INSERT INTO product_batches (product_id, batch_number, expiry_date, cost_price, stock_qty)
      VALUES (?, NULL, NULL, 0, ?)
    `).run(productId, units);
  }

  recalcProductFromBatches(db, productId);
}

/**
 * Restore stock to the EXACT batches that were depleted during a transaction.
 * Falls back to restoreStockToLatestBatch if no depletion records exist.
 */
export function restoreStockFromDepletions(db: Database.Database, transactionId: number, productId: number, totalUnits: number): void {
  // Look up exactly which batches were depleted
  const depletions = db.prepare(`
    SELECT batch_id, quantity
    FROM transaction_batch_depletions
    WHERE transaction_id = ? AND product_id = ?
  `).all(transactionId, productId) as Array<{ batch_id: number; quantity: number }>;

  if (depletions.length === 0) {
    // No depletion records (sale happened before batch tracking) — fallback
    restoreStockToLatestBatch(db, productId, totalUnits);
    return;
  }

  // Restore to each original batch — re-create the row if the batch was auto-deleted when it hit 0
  const getBatch = db.prepare(`SELECT id FROM product_batches WHERE id = ?`);
  const updateBatch = db.prepare(`UPDATE product_batches SET stock_qty = stock_qty + ? WHERE id = ?`);
  const getProductCost = db.prepare(`SELECT cost_price FROM products WHERE id = ?`);

  for (const dep of depletions) {
    const exists = getBatch.get(dep.batch_id);
    if (exists) {
      updateBatch.run(dep.quantity, dep.batch_id);
    } else {
      // Batch was auto-deleted after hitting 0 — re-create it so reversal restores correctly
      const prod = getProductCost.get(productId) as { cost_price: number } | undefined;
      db.prepare(`
        INSERT INTO product_batches (id, product_id, batch_number, expiry_date, cost_price, stock_qty)
        VALUES (?, ?, NULL, NULL, ?, ?)
      `).run(dep.batch_id, productId, prod?.cost_price ?? 0, dep.quantity);
      console.log(`[Batch] Re-created deleted batch ${dep.batch_id} for product ${productId} during reversal`);
    }
  }

  // Clean up depletion records
  db.prepare(`DELETE FROM transaction_batch_depletions WHERE transaction_id = ? AND product_id = ?`).run(transactionId, productId);

  recalcProductFromBatches(db, productId);
}

/**
 * Set on-hand stock by syncing product_batches to a target quantity.
 * Keeps batch totals and products.stock_qty aligned (inventory edits, import).
 */
export function setProductStockQuantity(
  db: Database.Database,
  productId: number,
  targetQty: number,
  costPrice?: number
): void {
  const safeTarget = Math.max(0, Number(targetQty) || 0);
  const stockRow = db.prepare(`
    SELECT COALESCE(SUM(stock_qty), 0) as total
    FROM product_batches WHERE product_id = ?
  `).get(productId) as { total: number };
  const currentBatchTotal = Number(stockRow.total) || 0;
  const delta = safeTarget - currentBatchTotal;

  if (delta === 0) {
    recalcProductFromBatches(db, productId);
    return;
  }

  if (delta > 0) {
    const hasBatch = db.prepare(`
      SELECT id FROM product_batches WHERE product_id = ? LIMIT 1
    `).get(productId);
    if (!hasBatch) {
      const prod = db.prepare(`SELECT cost_price FROM products WHERE id = ?`).get(productId) as { cost_price: number } | undefined;
      addBatch(db, productId, safeTarget, costPrice ?? prod?.cost_price ?? 0);
      return;
    }
    restoreStockToLatestBatch(db, productId, delta);
    return;
  }

  depleteStockFEFO(db, productId, Math.abs(delta));
}

/**
 * Add stock to a new batch (used by restock).
 * Returns the new batch ID.
 */
export function addBatch(
  db: Database.Database,
  productId: number,
  qty: number,
  costPrice: number,
  batchNumber?: string | null,
  expiryDate?: string | null
): number {
  const result = db.prepare(`
    INSERT INTO product_batches (product_id, batch_number, expiry_date, cost_price, stock_qty)
    VALUES (?, ?, ?, ?, ?)
  `).run(productId, batchNumber || null, expiryDate || null, costPrice, qty);

  // Update the product's cost_price to the latest batch's cost
  db.prepare(`UPDATE products SET cost_price = ?, updated_at = datetime('now') WHERE id = ?`).run(costPrice, productId);

  // If expiry_date was provided, make sure the product is flagged as pharmacy
  if (expiryDate && expiryDate.trim() !== '') {
    db.prepare(`UPDATE products SET is_pharmacy = 1 WHERE id = ? AND is_pharmacy = 0`).run(productId);
  }

  recalcProductFromBatches(db, productId);

  return Number(result.lastInsertRowid);
}

/**
 * Undo stock added by a restock line. Prefer the linked batch; deplete FEFO for any remainder.
 */
export function reverseRestockQuantity(
  db: Database.Database,
  productId: number,
  quantity: number,
  batchId?: number | null
): void {
  const units = Math.max(0, Number(quantity) || 0);
  if (units <= 0) return;

  let remaining = units;

  if (batchId) {
    const batch = db.prepare(`
      SELECT id, stock_qty FROM product_batches WHERE id = ? AND product_id = ?
    `).get(batchId, productId) as { id: number; stock_qty: number } | undefined;

    if (batch) {
      const take = Math.min(Number(batch.stock_qty) || 0, remaining);
      if (take > 0) {
        const newQty = batch.stock_qty - take;
        if (newQty <= 0) {
          db.prepare(`DELETE FROM product_batches WHERE id = ?`).run(batch.id);
        } else {
          db.prepare(`UPDATE product_batches SET stock_qty = ? WHERE id = ?`).run(newQty, batch.id);
        }
        remaining -= take;
      }
    }
  }

  if (remaining > 0) {
    depleteStockFEFO(db, productId, remaining);
  } else {
    recalcProductFromBatches(db, productId);
  }
}

