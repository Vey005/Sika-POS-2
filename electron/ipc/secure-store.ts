import { ipcMain } from 'electron';
import { SecureStore } from '../store/secure-store';

export function registerSecureStoreHandlers(secureStore: SecureStore) {
  ipcMain.handle('secure:get', (_event, key: string) => {
    return secureStore.get(key);
  });

  ipcMain.handle('secure:set', (_event, key: string, value: any) => {
    secureStore.set(key, value);
    return { success: true };
  });

  ipcMain.handle('secure:delete', (_event, key: string) => {
    secureStore.delete(key);
    return { success: true };
  });

  ipcMain.handle('secure:getAll', (_event) => {
    return secureStore.getAll();
  });
}
