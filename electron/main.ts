import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';
import * as path from 'path';
import { initDatabase } from './db/database';
import { registerInventoryHandlers } from './ipc/inventory';
import { registerSalesHandlers } from './ipc/sales';
import { registerCustomerHandlers } from './ipc/customers';
import { registerSettingsHandlers } from './ipc/settings';
import { registerPrinterHandlers } from './ipc/printer';
import { initBarcodeScanner } from './hardware/scanner';
import { SyncManager } from './sync/sync-manager';
import { registerSyncHandlers } from './ipc/sync';
import { registerUserHandlers } from './ipc/users';
import { SecureStore } from './store/secure-store';
import { registerSecureStoreHandlers } from './ipc/secure-store';
import { registerNotificationHandlers } from './ipc/notifications';
import { registerAttendanceHandlers } from './ipc/attendance';
<<<<<<< HEAD
import { registerUpdateHandlers } from './ipc/updates';
import { initAutoUpdater, attachUpdateWindow, scheduleStartupUpdateCheck } from './updater';
import { UPDATE_FEED_URL, USE_GITHUB_RELEASES } from './update-config';

const isDev = !app.isPackaged;

// Disable hardware acceleration to fix GPU process crashes over RDP or some VMs
app.disableHardwareAcceleration();

// App name + Windows notification identity (setAppUserModelId must run before app.ready).
app.setName('SikaPOS');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.sikapos.app');
}

=======

const isDev = !app.isPackaged;

>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let syncManager: SyncManager | null = null;

<<<<<<< HEAD
/** When true, the next main window `close` event may proceed without prompting the renderer. */
let allowMainWindowClose = false;

/** Register once — avoids duplicate ipc listeners if the window is recreated. */
let mainWindowCloseIpcRegistered = false;

function createSplash() {
  splashWindow = new BrowserWindow({
    title: 'SikaPOS',
=======
function createSplash() {
  splashWindow = new BrowserWindow({
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    width: 500,
    height: 350,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 500px; height: 350px;
          background: #0C0C0F;
          border-radius: 24px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          overflow: hidden;
          -webkit-app-region: drag;
          border: 1px solid rgba(212,160,23,0.3);
          box-shadow: 0 30px 60px rgba(0,0,0,0.8);
          position: relative;
        }
        body::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(212,160,23,0.05) 0%, transparent 70%);
          pointer-events: none;
        }
        .logo-ring {
          width: 100px; height: 100px;
          position: relative;
          margin-bottom: 32px;
        }
        .logo-ring svg {
          width: 100px; height: 100px;
          filter: drop-shadow(0 0 10px rgba(212,160,23,0.4));
        }
        svg circle {
          fill: none;
          stroke: #D4A017;
          stroke-width: 3;
          stroke-linecap: round;
          stroke-dasharray: 283;
          stroke-dashoffset: 283;
          animation: draw 1.5s cubic-bezier(0.65, 0, 0.35, 1) forwards;
          transform-origin: center;
          transform: rotate(-90deg);
        }
        @keyframes draw {
          to { stroke-dashoffset: 0; }
        }
        .logo-inner {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          color: #D4A017;
          font-size: 36px;
          font-weight: 700;
          opacity: 0;
          animation: fadeIn 0.8s ease 1s forwards;
          text-shadow: 0 0 20px rgba(212,160,23,0.5);
        }
        .title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          opacity: 0;
          animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards;
        }
        .title {
          color: #FFFFFF;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: 6px;
          text-transform: uppercase;
        }
        .cedi-sign {
          color: #D4A017;
          font-size: 28px;
          font-weight: 700;
        }
        .tagline {
          margin-top: 12px;
          color: rgba(255,255,255,0.4);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 3px;
          text-transform: uppercase;
          opacity: 0;
          animation: fadeIn 1s ease 1.2s forwards;
        }
        .loading-bar {
          position: absolute;
          bottom: 0; left: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, #D4A017, transparent);
          width: 50%;
          animation: loading 2s infinite ease-in-out;
        }
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes fadeIn { to { opacity: 1; } }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    </head>
    <body>
      <div class="logo-ring">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" />
        </svg>
        <div class="logo-inner">₵</div>
      </div>
      <div class="title-wrap">
        <span class="cedi-sign">₵</span>
        <span class="title">SIKAPOS</span>
      </div>
      <div class="tagline">Premium Business Solutions</div>
      <div class="loading-bar"></div>
    </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml)}`);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
<<<<<<< HEAD
    title: 'SikaPOS',
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    backgroundColor: '#0C0C0F',
    show: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, isDev ? '../public/icon.png' : '../../dist/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.destroy();
        splashWindow = null;
      }
      if (mainWindow) {
        mainWindow.show();
        if (isDev) {
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      }
    }, 2500);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // IPC for window controls
  ipcMain.on('app:minimize', () => mainWindow?.minimize());
  ipcMain.on('app:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
<<<<<<< HEAD

  mainWindow.on('close', (e) => {
    if (allowMainWindowClose) {
      allowMainWindowClose = false;
      return;
    }
    e.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:close-intercepted');
    }
  });

  if (!mainWindowCloseIpcRegistered) {
    mainWindowCloseIpcRegistered = true;
    ipcMain.on('app:close-confirmed', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      allowMainWindowClose = true;
      mainWindow.close();
    });
    ipcMain.on('app:close', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('app:close-intercepted');
    });
  }
=======
  ipcMain.on('app:close', () => mainWindow?.close());
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  nativeTheme.themeSource = 'dark';
  
  // Initialize native barcode scanner
  initBarcodeScanner(mainWindow);
<<<<<<< HEAD

  if (mainWindow) {
    attachUpdateWindow(mainWindow);
  }
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
}

app.whenReady().then(async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }

  // Initialize SecureStore FIRST (needed by notifications and printer)
  const secureStore = new SecureStore();
  registerSecureStoreHandlers(secureStore);

  // Seed MNotify API key into SecureStore from environment if provided
  const defaultMNotifyKey = process.env.MNOTIFY_API_KEY;
  if (!secureStore.get('mnotify_api_key') && defaultMNotifyKey) {
    secureStore.set('mnotify_api_key', defaultMNotifyKey);
    console.log('[Init] MNotify API key seeded from environment into SecureStore.');
  }

  // Migrate unhashed PINs to hashed versions
  try {
    const { hashPin, isPinHashed } = require('./utils/crypto');
    const { getDb } = require('./db/database');
    const db = getDb();
    const users = db.prepare('SELECT id, pin FROM users').all() as Array<{ id: number; pin: string }>;
    let migrated = 0;
    for (const user of users) {
      if (!isPinHashed(user.pin)) {
        const hashed = hashPin(user.pin);
        db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(hashed, user.id);
        migrated++;
      }
    }
    if (migrated > 0) {
      console.log(`[Security] Migrated ${migrated} user PINs to hashed format.`);
    }
  } catch (err) {
    console.error('[Security] PIN migration error:', err);
  }

  registerInventoryHandlers();
  registerSalesHandlers();
  registerCustomerHandlers();
  registerSettingsHandlers();
  registerUserHandlers();
  registerNotificationHandlers(secureStore);
  registerAttendanceHandlers();
<<<<<<< HEAD
  registerUpdateHandlers();
  initAutoUpdater();
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  registerPrinterHandlers(secureStore);

  createSplash();
  createMainWindow();

<<<<<<< HEAD
  const updateConnectSrc = USE_GITHUB_RELEASES
    ? 'https://api.github.com https://github.com https://objects.githubusercontent.com'
    : new URL(UPDATE_FEED_URL).origin;

=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  // Add Content-Security-Policy to all responses
  if (mainWindow) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            isDev
<<<<<<< HEAD
              ? `default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://localhost:* https://api.mnotify.com https://apps.mnotify.net https://*.railway.app ${updateConnectSrc}`
              : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.mnotify.com https://apps.mnotify.net https://*.railway.app ${updateConnectSrc}`
=======
              ? "default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://localhost:* https://api.mnotify.com https://apps.mnotify.net https://*.railway.app"
              : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.mnotify.com https://apps.mnotify.net https://*.railway.app"
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
          ]
        }
      });
    });
  }

  // Initialize and start Sync Manager
  syncManager = new SyncManager(mainWindow, secureStore);
  registerSyncHandlers(syncManager);
  syncManager.start();
<<<<<<< HEAD
  scheduleStartupUpdateCheck();
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
