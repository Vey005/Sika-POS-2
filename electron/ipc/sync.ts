import { ipcMain } from 'electron';
import { getDb } from '../db/database';
import { SyncManager } from '../sync/sync-manager';

export function registerSyncHandlers(syncManager: SyncManager) {
  ipcMain.handle('sync:force', async () => {
    await syncManager.forceSync();
    return { success: true };
  });

  ipcMain.handle('sync:restore', async () => {
    return await syncManager.restoreFromCloud();
  });

  ipcMain.handle('sync:queueItem', (_event, item: {
    entity: string;
    operation: string;
    payload: unknown;
    priority?: number;
  }) => {
    const db = getDb();
    db.prepare(`
      INSERT INTO sync_queue (entity, operation, payload, status, priority)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(
      item.entity,
      item.operation,
      JSON.stringify(item.payload),
      item.priority ?? 5,
    );
    return { success: true };
  });

  // Renderer could also poll if it wanted, but we use server-sent events (IPC send)
  // mostly for status changes.
}
