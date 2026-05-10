import { ipcMain, Notification } from 'electron';
import { SecureStore } from '../store/secure-store';

let secureStoreRef: SecureStore | null = null;

export function registerNotificationHandlers(secureStore?: SecureStore) {
  if (secureStore) secureStoreRef = secureStore;

  ipcMain.handle('notifications:show', (event, { title, body, data }) => {
    const notification = new Notification({
      title,
      body,
    });

    if (data) {
      notification.on('click', () => {
        event.sender.send('notification:click', data);
      });
    }

    notification.show();
    return { success: true };
  });


}
