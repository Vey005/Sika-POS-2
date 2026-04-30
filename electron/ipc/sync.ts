import { ipcMain } from 'electron';
import { SyncManager } from '../sync/sync-manager';

export function registerSyncHandlers(syncManager: SyncManager) {
  ipcMain.handle('sync:force', async () => {
    await syncManager.forceSync();
    return { success: true };
  });

  ipcMain.handle('sync:restore', async () => {
    return await syncManager.restoreFromCloud();
  });

  // Renderer could also poll if it wanted, but we use server-sent events (IPC send)
  // mostly for status changes.
}
