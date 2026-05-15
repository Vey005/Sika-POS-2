import { ipcMain } from 'electron';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  quitAndInstall,
} from '../updater';

export function registerUpdateHandlers() {
  ipcMain.handle('updates:getState', () => getUpdateState());
  ipcMain.handle('updates:check', () => checkForUpdates());
  ipcMain.handle('updates:download', () => downloadUpdate());
  ipcMain.handle('updates:install', () => {
    quitAndInstall();
    return { success: true };
  });
}
