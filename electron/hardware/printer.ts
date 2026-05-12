import { buildReceiptBytes, buildReportBytes, buildKitchenReceiptBytes, buildOpenDrawerBytes } from './esc-pos';

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
    throw new Error(`Failed to print: ${err.message}`);
  }
}

export async function printReceipt(receipt: any, printerDeviceId?: string): Promise<void> {
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

export function listPrinters() {
  if (!usb) return [{ id: 'mock-printer', name: 'Mock Printer (Native module missing)' }];
  const devices = usb.getDeviceList();
  return devices.map((d: any) => ({
    id: `${d.deviceDescriptor.idVendor}:${d.deviceDescriptor.idProduct}`,
    name: `USB Printer (${d.deviceDescriptor.idVendor.toString(16)}:${d.deviceDescriptor.idProduct.toString(16)})`
  }));
}

export async function openDrawer(printerDeviceId?: string): Promise<void> {
  const data = buildOpenDrawerBytes();
  return _printBytes(data, printerDeviceId);
}
