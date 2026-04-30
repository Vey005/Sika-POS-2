import { BrowserWindow } from 'electron';

// Safely require node-hid in case native bindings failed to build
let HID: any = null;
try {
  HID = require('node-hid');
} catch (e) {
  console.warn('Failed to load native node-hid module. Raw USB scanner will be disabled.', e);
}

// Common barcode scanner USB vendor/product IDs
// If no specific IDs are known, we can scan for keyboards but it's safer to use known Vendor IDs
const SCANNER_FILTERS = [
  { vendorId: 0x05fe },   // Symbol Technologies
  { vendorId: 0x08ff },   // AuthenTec / Honeywell
  { vendorId: 0x04b4 },   // Cypress (many Chinese scanners)
  { vendorId: 0x0c2e },   // MetroLogic
  { vendorId: 0x05e0 },   // Symbol
  { vendorId: 0x1d57 },   // Generic
];

// Helper to convert HID Keyboard scan codes to characters
// Note: This is a simplified US English map. Real implementation may need a full keymap table.
const HID_KEY_MAP: Record<number, string> = {
  30: '1', 31: '2', 32: '3', 33: '4', 34: '5',
  35: '6', 36: '7', 37: '8', 38: '9', 39: '0',
  40: '\n' // Enter
};

function scanCodeToChar(buffer: Buffer): string {
  // A standard HID keyboard report is 8 bytes. Byte 2 is the keycode.
  if (buffer.length >= 3) {
    const keycode = buffer[2];
    if (keycode >= 4 && keycode <= 29) {
      // a-z
      return String.fromCharCode(keycode - 4 + 97);
    }
    return HID_KEY_MAP[keycode] || '';
  }
  return '';
}

export function initBarcodeScanner(mainWindow: BrowserWindow): void {
  if (!HID) {
    console.log('MOCK SCANNER: node-hid not loaded, skipping scanner init.');
    return;
  }

  try {
    const devices = HID.devices().filter((d: any) =>
      SCANNER_FILTERS.some(f => f.vendorId === d.vendorId)
    );

    if (devices.length === 0) {
      console.log('No supported USB HID barcode scanners found. Will rely on keyboard wedge fallback in React if available.');
      return;
    }

    const scannerPath = devices[0].path;
    if (!scannerPath) return;
    
    const scanner = new HID.HID(scannerPath);
    let buffer: string[] = [];

    scanner.on('data', (data: Buffer) => {
      const char = scanCodeToChar(data);
      if (char === '\n' && buffer.length > 0) {
        const barcode = buffer.join('');
        buffer = [];
        // Push to renderer via IPC event
        mainWindow.webContents.send('scanner:barcode', barcode);
      } else if (char && char !== '\n') {
        buffer.push(char);
      }
    });

    scanner.on('error', (err: any) => {
      console.error('Barcode Scanner Error:', err);
    });
    
    console.log('Barcode scanner initialized via HID:', devices[0].manufacturer, devices[0].product);
  } catch (err) {
    console.error('Failed to initialize barcode scanner:', err);
  }
}
