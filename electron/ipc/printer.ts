import { ipcMain } from 'electron';
import { listPrinters, printReceipt, printReport, testPrint, printKitchenReceipt, openDrawer } from '../hardware/printer';
import { SecureStore } from '../store/secure-store';
import { saveAsPDF } from '../utils/pdf-generator';

export function registerPrinterHandlers(secureStore: SecureStore) {
  ipcMain.handle('printer:list', async () => {
    return listPrinters();
  });

  ipcMain.handle('printer:receipt', async (_, receipt) => {
    // Get saved printer device ID from secure store
    const printerDeviceId = secureStore.get('printerDeviceId');
    
    await printReceipt(receipt, printerDeviceId);
    return { success: true };
  });

  ipcMain.handle('printer:kitchen', async (_, order) => {
    const printerDeviceId = secureStore.get('printerDeviceId');
    await printKitchenReceipt(order, printerDeviceId);
    return { success: true };
  });

  ipcMain.handle('printer:report', async (_, report) => {
    const printerDeviceId = secureStore.get('printerDeviceId');
    await printReport(report, printerDeviceId);
    return { success: true };
  });

  ipcMain.handle('printer:test', async () => {
    const printerDeviceId = secureStore.get('printerDeviceId');
    
    await testPrint(printerDeviceId);
    return { success: true };
  });

  ipcMain.handle('printer:open-drawer', async () => {
    const printerDeviceId = secureStore.get('printerDeviceId');
    await openDrawer(printerDeviceId);
    return { success: true };
  });

  ipcMain.handle('printer:save-pdf', async (_, { data, type }) => {
    return saveAsPDF(data, type);
  });
}
