<<<<<<< HEAD
import {
  buildReceiptBytes,
  buildReportBytes,
  buildLowStockListBytes,
  buildKitchenReceiptBytes,
  buildOpenDrawerBytes,
} from './esc-pos';
import { nativeImage } from 'electron';
=======
import { buildReceiptBytes, buildReportBytes, buildKitchenReceiptBytes, buildOpenDrawerBytes } from './esc-pos';
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

// Safely require usb module in case native bindings failed to build
let usb: any = null;
try {
  usb = require('usb');
} catch (e) {
  console.warn('Failed to load native usb module. USB printing will be disabled.', e);
}

async function _printBytes(data: Buffer, printerDeviceId?: string): Promise<void> {
  if (!usb) {
    console.log('MOCK PRINT: Native usb module not loaded. Bytes length:', data.length);
    return Promise.resolve();
  }

  try {
    // Attempt to find device
    let device: any = null;
    if (printerDeviceId) {
<<<<<<< HEAD
      device = usb.getDeviceList().find((d: any) =>
        `${d.deviceDescriptor.idVendor}:${d.deviceDescriptor.idProduct}` === printerDeviceId
      );
    } else {
      // Don't just pick [0] (which is often a system USB hub). Try to find a printer.
      device = usb.getDeviceList().find((d: any) => d.deviceDescriptor.bDeviceClass === 0x07 || KNOWN_PRINTER_VENDORS[d.deviceDescriptor.idVendor]);
    }

    if (!device) throw new Error('No printer configured or detected. Please select a printer in Settings.');

    device.open();
    let interfaceClaimed = false;

    try {
      const iface = device.interface(0);
      try {
        if (iface.isKernelDriverActive()) {
          iface.detachKernelDriver();
        }
      } catch (e) {
        // isKernelDriverActive is not supported on Windows and throws LIBUSB_ERROR_NOT_SUPPORTED
      }

      iface.claim();
      interfaceClaimed = true;

      const outEndpoint = iface.endpoints.find((e: any) => e.direction === 'out');
      if (!outEndpoint) throw new Error('No OUT endpoint found on USB device.');

      await new Promise<void>((resolve, reject) => {
        outEndpoint.transfer(data, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Properly wait for release before closing
      await new Promise<void>((resolve) => {
        iface.release(() => resolve());
      });
      interfaceClaimed = false;
      device.close();

    } catch (err: any) {
      if (interfaceClaimed) {
        try {
          await new Promise<void>((resolve) => {
            device.interface(0).release(() => resolve());
          });
        } catch (e) { }
      }
      try { device.close(); } catch (e) { }
      console.error('Print Error:', err);
      throw new Error(`Failed to print: ${err.message}`);
    }
  } catch (err: any) {
    console.error('Outer Print Error:', err);
=======
      device = usb.getDeviceList().find((d: any) => 
        `${d.deviceDescriptor.idVendor}:${d.deviceDescriptor.idProduct}` === printerDeviceId
      );
    } else {
      device = usb.getDeviceList()[0];
    }

    if (!device) throw new Error('Printer not found. Please check USB connection.');

    device.open();
    const iface = device.interface(0);
    if (iface.isKernelDriverActive()) iface.detachKernelDriver();
    iface.claim();

    const outEndpoint = iface.endpoints.find((e: any) => e.direction === 'out');
    if (!outEndpoint) throw new Error('No OUT endpoint found on USB device.');

    await new Promise<void>((resolve, reject) => {
      outEndpoint.transfer(data, (err: any) => {
        iface.release(() => device.close());
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err: any) {
    console.error('Print Error:', err);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    throw new Error(`Failed to print: ${err.message}`);
  }
}

<<<<<<< HEAD
async function processLogo(logoData: string, paperSize: string): Promise<Buffer | null> {
  if (!logoData || !logoData.startsWith('data:image')) return null;
  
  try {
    const img = nativeImage.createFromDataURL(logoData);
    if (img.isEmpty()) return null;

    // Resize for printer (max width 160-200 for 58mm, 300-384 for 80mm)
    const maxWidth = paperSize === '58mm' ? 184 : 360;
    const size = img.getSize();
    const ratio = maxWidth / size.width;
    const width = Math.floor(size.width * ratio);
    const height = Math.floor(size.height * ratio);
    
    // Ensure width is a multiple of 8
    const finalWidth = Math.floor(width / 8) * 8;
    if (finalWidth <= 0) return null;

    const resized = img.resize({ width: finalWidth, height });
    const bitmap = resized.getBitmap(); // RGBA buffer

    // Convert to ESC/POS GS v 0 format (1-bit monochrome)
    const widthInBytes = finalWidth / 8;
    const escPosData = Buffer.alloc(widthInBytes * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < finalWidth; x++) {
        const idx = (y * finalWidth + x) * 4;
        const b = bitmap[idx];
        const g = bitmap[idx + 1];
        const r = bitmap[idx + 2];
        const a = bitmap[idx + 3];

        // If pixel is transparent, treat as white
        if (a < 128) continue;

        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        if (gray < 128) {
          const byteIdx = y * widthInBytes + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          escPosData[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    const header = Buffer.from([
      0x1D, 0x76, 0x30, 0x00,
      widthInBytes & 0xFF, (widthInBytes >> 8) & 0xFF,
      height & 0xFF, (height >> 8) & 0xFF
    ]);

    return Buffer.concat([header, escPosData]);
  } catch (e) {
    console.error('Logo processing failed:', e);
    return null;
  }
}

export async function printReceipt(receipt: any, printerDeviceId?: string): Promise<void> {
  // Process logo if present
  if (receipt.businessLogo && receipt.config?.showLogo !== false) {
    receipt.logoBuffer = await processLogo(receipt.businessLogo, receipt.config?.paperSize || '58mm');
  }
  
=======
export async function printReceipt(receipt: any, printerDeviceId?: string): Promise<void> {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  const data = buildReceiptBytes(receipt);
  return _printBytes(data, printerDeviceId);
}

export async function printKitchenReceipt(order: any, printerDeviceId?: string): Promise<void> {
  const data = buildKitchenReceiptBytes(order);
  return _printBytes(data, printerDeviceId);
}

export async function printReport(report: any, printerDeviceId?: string): Promise<void> {
  const data = buildReportBytes(report);
  return _printBytes(data, printerDeviceId);
}

<<<<<<< HEAD
export async function printLowStockList(payload: any, printerDeviceId?: string): Promise<void> {
  const data = buildLowStockListBytes(payload);
  return _printBytes(data, printerDeviceId);
}

=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
export async function testPrint(printerDeviceId?: string): Promise<void> {
  const dummyReceipt = {
    businessName: 'SikaPOS Native',
    businessAddress: 'Hardware Test Print',
    businessPhone: '000-000-0000',
    receiptNumber: 'TEST-0001',
    date: new Date().toLocaleString(),
    cashier: 'System Admin',
    items: [{ name: 'Test Item', quantity: 1, unitPrice: 0, subtotal: 0 }],
    subtotal: 0,
    tax: 0,
    discount: 0,
    total: 0,
    paymentMethod: 'cash',
    amountTendered: 0,
    change: 0,
    footerMessage: 'If you see this, USB printing works!'
  };
  return printReceipt(dummyReceipt, printerDeviceId);
}

<<<<<<< HEAD
// Known thermal/receipt printer vendor IDs (decimal)
const KNOWN_PRINTER_VENDORS: Record<number, string> = {
  0x04b8: 'Epson',
  0x0519: 'Star Micronics',
  0x0fe6: 'Bixolon',
  0x1504: 'Citizen',
  0x0dd4: 'Custom SPA',
  0x154f: 'Seiko',
  0x067b: 'Prolific (USB-Serial)',
  0x0416: 'Winbond / Generic Thermal',
  0x2730: 'Rongta',
  0x2040: 'Hasar',
  0x0483: 'Xprinter / STMicroelectronics',
  0x28e9: 'Xprinter (GD32)',
  0x1fc9: 'Xprinter (NXP)',
  0x04e8: 'Samsung',
  0x03f0: 'HP',
  0x04a9: 'Canon',
  0x04da: 'Panasonic',
  0x0924: 'Xerox',
  0x0b0c: 'Todos',
  0x0a5f: 'Zebra',
};

export function listPrinters() {
  if (!usb) return [{ id: 'mock-printer', name: 'Mock Printer (Native module missing)' }];

  const devices: any[] = usb.getDeviceList();
  const result = devices.map((d: any) => {
    const vid: number = d.deviceDescriptor.idVendor;
    const pid: number = d.deviceDescriptor.idProduct;
    const vidHex = vid.toString(16).padStart(4, '0');
    const pidHex = pid.toString(16).padStart(4, '0');
    const vendorName = KNOWN_PRINTER_VENDORS[vid];
    const isPrinter = !!vendorName || d.deviceDescriptor.bDeviceClass === 0x07;
    const label = vendorName
      ? `🖨️ ${vendorName} Printer (${vidHex}:${pidHex})`
      : `USB Device (${vidHex}:${pidHex})`;
    return {
      id: `${vid}:${pid}`,
      name: label,
      isPrinter,
    };
  });

  // Sort: likely printers first
  result.sort((a, b) => (b.isPrinter ? 1 : 0) - (a.isPrinter ? 1 : 0));
  return result;
=======
export function listPrinters() {
  if (!usb) return [{ id: 'mock-printer', name: 'Mock Printer (Native module missing)' }];
  const devices = usb.getDeviceList();
  return devices.map((d: any) => ({
    id: `${d.deviceDescriptor.idVendor}:${d.deviceDescriptor.idProduct}`,
    name: `USB Printer (${d.deviceDescriptor.idVendor.toString(16)}:${d.deviceDescriptor.idProduct.toString(16)})`
  }));
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
}

export async function openDrawer(printerDeviceId?: string): Promise<void> {
  const data = buildOpenDrawerBytes();
  return _printBytes(data, printerDeviceId);
}
