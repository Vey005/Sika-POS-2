import { contextBridge, ipcRenderer } from 'electron';
import * as os from 'os';

// Full typed API surface exposed to renderer
const sikapos = {
  // Machine info
  machineId: (() => {
    // Generate a persistent machine ID based on hardware
    const mac = os.networkInterfaces();
    const addresses = Object.values(mac).flat().filter(iface => iface && !iface.internal && iface?.mac);
    return addresses.length > 0 && addresses[0]?.mac ? addresses[0].mac.replace(/:/g, '') : 'PC-' + Math.random().toString(36).substring(7).toUpperCase();
  })(),
  machineName: os.hostname(),

  // Window controls
  window: {
    minimize: () => ipcRenderer.send('app:minimize'),
    maximize: () => ipcRenderer.send('app:maximize'),
    close: () => ipcRenderer.send('app:close'),
  },

  // Inventory / Products
  inventory: {
    getAll: (filters?: any) => ipcRenderer.invoke('inventory:getAll', filters),
    search: (query: string) => ipcRenderer.invoke('inventory:search', query),
    getByBarcode: (barcode: string) => ipcRenderer.invoke('inventory:getByBarcode', barcode),
    getById: (id: number) => ipcRenderer.invoke('inventory:getById', id),
    save: (product: unknown) => ipcRenderer.invoke('inventory:save', product),
    delete: (id: number) => ipcRenderer.invoke('inventory:delete', id),
    adjustStock: (id: number, delta: number, reason: string) =>
      ipcRenderer.invoke('inventory:adjustStock', id, delta, reason),
    getCategories: () => ipcRenderer.invoke('inventory:getCategories'),
    getSummary: () => ipcRenderer.invoke('inventory:getSummary'),
    getLowStockCount: () => ipcRenderer.invoke('inventory:getLowStockCount'),
    getCategorySummary: () => ipcRenderer.invoke('inventory:getCategorySummary'),
    importFromExcel: () => ipcRenderer.invoke('inventory:import'),
    downloadTemplate: () => ipcRenderer.invoke('inventory:downloadTemplate'),
    clearAll: () => ipcRenderer.invoke('inventory:clearAll'),
  },

  // Sales / Transactions
  sales: {
    create: (data: unknown) => ipcRenderer.invoke('sales:create', data),
    getAll: (filters?: unknown) => ipcRenderer.invoke('sales:getAll', filters),
    getById: (id: number) => ipcRenderer.invoke('sales:getById', id),
    void: (id: number, reason: string) => ipcRenderer.invoke('sales:void', id, reason),
    reverse: (id: number, reason: string) => ipcRenderer.invoke('sales:reverse', id, reason),
    getSummary: (filters?: unknown) => ipcRenderer.invoke('sales:getSummary', filters),
    getRecentTransactions: (limit: number) => ipcRenderer.invoke('sales:getRecentTransactions', limit),
    getDailyReportData: (date: string) => ipcRenderer.invoke('sales:getDailyReportData', date),
    hold: (data: { payload: any; customerName?: string }) => ipcRenderer.invoke('sales:hold', data),
    getHeld: () => ipcRenderer.invoke('sales:getHeld'),
    deleteHeld: (id: number) => ipcRenderer.invoke('sales:deleteHeld', id),
    getByShift: (params: { cashierName: string; clockIn: string; clockOut?: string }) => ipcRenderer.invoke('sales:getByShift', params),
  },

  // Customers
  customers: {
    getAll: () => ipcRenderer.invoke('customers:getAll'),
    search: (query: string) => ipcRenderer.invoke('customers:search', query),
    getById: (id: number) => ipcRenderer.invoke('customers:getById', id),
    save: (customer: unknown) => ipcRenderer.invoke('customers:save', customer),
    addCreditPayment: (customerId: number, amount: number, note: string) =>
      ipcRenderer.invoke('customers:addCreditPayment', customerId, amount, note),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    setBusiness: (data: unknown) => ipcRenderer.invoke('settings:setBusiness', data),
    getBusiness: () => ipcRenderer.invoke('settings:getBusiness'),
  },

  // Printer
  printer: {
    listPrinters: () => ipcRenderer.invoke('printer:list'),
    printReceipt: (receipt: unknown) => ipcRenderer.invoke('printer:receipt', receipt),
    printKitchenReceipt: (order: unknown) => ipcRenderer.invoke('printer:kitchen', order),
    printReport: (report: unknown) => ipcRenderer.invoke('printer:report', report),
    testPrint: () => ipcRenderer.invoke('printer:test'),
    saveAsPDF: (data: unknown, type: 'receipt' | 'report') => ipcRenderer.invoke('printer:save-pdf', { data, type }),
  },

  // Scanner
  scanner: {
    onScan: (callback: (barcode: string) => void) => {
      const listener = (_: any, barcode: string) => callback(barcode);
      ipcRenderer.on('scanner:barcode', listener);
      return () => ipcRenderer.removeListener('scanner:barcode', listener);
    },
  },

  // Sync
  sync: {
    forceSync: () => ipcRenderer.invoke('sync:force'),
    restore: () => ipcRenderer.invoke('sync:restore'),
    onStatusChange: (callback: (status: 'synced' | 'syncing' | 'error') => void) => {
      const listener = (_: any, status: 'synced' | 'syncing' | 'error') => callback(status);
      ipcRenderer.on('sync:statusChanged', listener);
      return () => ipcRenderer.removeListener('sync:statusChanged', listener);
    },
  },

  // Users (RBAC)
  users: {
    getAll: () => ipcRenderer.invoke('users:getAll'),
    save: (user: unknown) => ipcRenderer.invoke('users:save', user),
    delete: (id: number) => ipcRenderer.invoke('users:delete', id),
    login: (pin: string) => ipcRenderer.invoke('users:login', pin),
  },

  // Secure Store (electron-store)
  secureStore: {
    get: (key: string) => ipcRenderer.invoke('secure:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('secure:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('secure:delete', key),
    getAll: () => ipcRenderer.invoke('secure:getAll'),
  },

  // Notifications
  notifications: {
    show: (title: string, body: string, data?: any) => ipcRenderer.invoke('notifications:show', { title, body, data }),
    sendOfficial: (to: string, message: string) => ipcRenderer.invoke('notifications:sendOfficial', to, message),
    onClick: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('notification:click', listener);
      return () => ipcRenderer.removeListener('notification:click', listener);
    }
  },

  // Attendance
  attendance: {
    clockIn: (userId: number) => ipcRenderer.invoke('attendance:clockIn', userId),
    clockOut: (userId: number) => ipcRenderer.invoke('attendance:clockOut', userId),
    getStatus: (userId: number) => ipcRenderer.invoke('attendance:getStatus', userId),
    getHistory: (userId: number, range?: unknown) => ipcRenderer.invoke('attendance:getHistory', userId, range),
  },
};

contextBridge.exposeInMainWorld('sikapos', sikapos);

// Type declarations for TypeScript in renderer
export type SikaPOSAPI = typeof sikapos;
