export function buildReceiptBytes(receiptData: any): Buffer {
  const buffers: Buffer[] = [];
  const cfg = receiptData.config || {};
  const cur = receiptData.currency || 'GHS';
  const lineLen = cfg.paperSize === '58mm' ? 32 : 48;

  // ESC @: Initialize printer
  buffers.push(Buffer.from([0x1B, 0x40]));

  // Select alignment: Center (ESC a 1)
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));

  // Print business name (Double height/width)
  // GS ! 0x11
  buffers.push(Buffer.from([0x1D, 0x21, 0x11]));
  buffers.push(Buffer.from(receiptData.businessName + '\n'));

  // Reset text size
  buffers.push(Buffer.from([0x1D, 0x21, 0x00]));
  
  if (cfg.showAddress !== false && receiptData.businessAddress) {
    buffers.push(Buffer.from(receiptData.businessAddress + '\n'));
  }
  if (cfg.showPhone !== false && receiptData.businessPhone) {
    buffers.push(Buffer.from(receiptData.businessPhone + '\n'));
  }
  if (cfg.showTIN !== false && receiptData.tin) {
    buffers.push(Buffer.from(`TIN: ${receiptData.tin}\n`));
  }
  buffers.push(Buffer.from('\n'));

  // Alignment: Left
  buffers.push(Buffer.from([0x1B, 0x61, 0x00]));
  buffers.push(Buffer.from(`Receipt No: ${receiptData.receiptNumber}\n`));
  buffers.push(Buffer.from(`Date: ${receiptData.date}\n`));
  
  if (cfg.showCashier !== false) {
    buffers.push(Buffer.from(`Cashier: ${receiptData.cashier}\n`));
  }
  if (cfg.showCustomer !== false && receiptData.customerName) {
    buffers.push(Buffer.from(`Customer: ${receiptData.customerName}\n`));
  }
  if (cfg.showOrderType !== false && receiptData.orderType && receiptData.orderType !== 'retail') {
    buffers.push(Buffer.from(`Order: ${receiptData.orderType.toUpperCase()}\n`));
  }
  if (cfg.showOrderNote !== false && receiptData.orderNote) {
    buffers.push(Buffer.from(`Note: ${receiptData.orderNote}\n`));
  }

  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Items
  for (const item of receiptData.items) {
    const itemName = item.size ? `${item.name} (${item.size})` : item.name;
    buffers.push(Buffer.from(`${itemName}\n`));
    const qtyPrice = `  ${item.quantity} x ${item.unitPrice.toFixed(2)}`;
    const subtotal = item.subtotal.toFixed(2);
    const spaces = Math.max(1, lineLen - qtyPrice.length - subtotal.length);
    buffers.push(Buffer.from(`${qtyPrice}${' '.repeat(spaces)}${subtotal}\n`));
  }

  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Totals
  const printTotalRow = (label: string, amount: string, bold = false) => {
    if (bold) buffers.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
    const spaces = Math.max(1, lineLen - label.length - amount.length);
    buffers.push(Buffer.from(`${label}${' '.repeat(spaces)}${amount}\n`));
    if (bold) buffers.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  };

  printTotalRow('Subtotal:', receiptData.subtotal.toFixed(2));
  
  if (cfg.showTaxBreakdown !== false && receiptData.taxBreakdown && receiptData.taxBreakdown.length > 0) {
    receiptData.taxBreakdown.forEach((t: any) => {
      printTotalRow(`${t.name} (${t.rate}%):`, t.amount.toFixed(2));
    });
  } else {
    printTotalRow('Tax:', receiptData.tax.toFixed(2));
  }
  
  if (receiptData.discount > 0) {
    printTotalRow('Discount:', `-${receiptData.discount.toFixed(2)}`);
  }
  
  buffers.push(Buffer.from([0x1D, 0x21, 0x01])); // Double height
  printTotalRow(`TOTAL ${cur}:`, receiptData.total.toFixed(2), true);
  buffers.push(Buffer.from([0x1D, 0x21, 0x00])); // Reset size

  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Payment
  printTotalRow('Paid via:', receiptData.paymentMethod.toUpperCase());
  if (receiptData.paymentMethod === 'cash') {
    printTotalRow('Amount Tendered:', receiptData.amountTendered.toFixed(2));
    printTotalRow('Change Due:', receiptData.change.toFixed(2));
  }

  buffers.push(Buffer.from('\n'));

  // Footer (Center)
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));
  buffers.push(Buffer.from(`${receiptData.footerMessage || 'Thank you for your business!'}\n`));
  
  if (cfg.showPoweredBy !== false) {
    buffers.push(Buffer.from('Powered by SikaPOS\n'));
  }
  
  // Barcode (Center)
  if (cfg.showBarcode !== false && receiptData.receiptNumber) {
    buffers.push(Buffer.from('\n'));
    // GS h 80: Set barcode height to 80 dots
    buffers.push(Buffer.from([0x1D, 0x68, 0x50]));
    // GS w 2: Set barcode width (1-6)
    buffers.push(Buffer.from([0x1D, 0x77, 0x02]));
    // GS f 0: Set font for HRI (Human Readable Information)
    buffers.push(Buffer.from([0x1D, 0x66, 0x00]));
    // GS H 2: Set HRI position (2 = below barcode)
    buffers.push(Buffer.from([0x1D, 0x48, 0x02]));
    // GS k 73 (Code 128): GS k m n d1...dn
    // m=73 for Code 128, n=length+2 (including {A|B|C} prefix)
    const barcodeData = receiptData.receiptNumber;
    const n = barcodeData.length + 2;
    buffers.push(Buffer.from([0x1D, 0x6B, 73, n]));
    // Code 128 Subset B prefix: {B (123, 66)
    buffers.push(Buffer.from([123, 66]));
    buffers.push(Buffer.from(barcodeData));
    buffers.push(Buffer.from('\n'));
  }
  
  buffers.push(Buffer.from('\n\n\n\n'));

  // Paper cut command: GS V 0
  buffers.push(Buffer.from([0x1D, 0x56, 0x00]));

  // Cash Drawer kick: ESC p 0 60 120
  buffers.push(Buffer.from([0x1B, 0x70, 0x00, 0x3C, 0x78]));

  return Buffer.concat(buffers);
}

export function buildReportBytes(reportData: any): Buffer {
  const buffers: Buffer[] = [];
  const cfg = reportData.config || {};
  const lineLen = cfg.paperSize === '58mm' ? 32 : 48;

  // ESC @: Initialize printer
  buffers.push(Buffer.from([0x1B, 0x40]));

  // Center (ESC a 1)
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));

  // Print business name (Double height/width)
  buffers.push(Buffer.from([0x1D, 0x21, 0x11]));
  buffers.push(Buffer.from(reportData.businessName + '\n'));
  
  // Report Title
  buffers.push(Buffer.from([0x1D, 0x21, 0x01])); // Double height
  buffers.push(Buffer.from('END OF DAY REPORT\n'));
  
  // Date
  buffers.push(Buffer.from([0x1D, 0x21, 0x00])); // Reset size
  buffers.push(Buffer.from(`${reportData.date}\n`));
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Alignment: Left
  buffers.push(Buffer.from([0x1B, 0x61, 0x00]));

  const printRow = (label: string, amount: string, bold = false) => {
    if (bold) buffers.push(Buffer.from([0x1B, 0x45, 0x01]));
    const spaces = Math.max(1, lineLen - label.length - amount.length);
    buffers.push(Buffer.from(`${label}${' '.repeat(spaces)}${amount}\n`));
    if (bold) buffers.push(Buffer.from([0x1B, 0x45, 0x00]));
  };

  // Summary Section
  buffers.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
  buffers.push(Buffer.from('PERFORMANCE SUMMARY\n'));
  buffers.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  
  printRow('Total Revenue:', `GHS ${reportData.summary.total_revenue.toFixed(2)}`, true);
  printRow('Total Transactions:', `${reportData.summary.transaction_count}`);
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));
  printRow('Cash:', `GHS ${reportData.summary.cash_total.toFixed(2)}`);
  printRow('MoMo:', `GHS ${reportData.summary.momo_total.toFixed(2)}`);
  printRow('Credit:', `GHS ${reportData.summary.credit_total.toFixed(2)}`);
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Transactions with items
  if (reportData.transactions && reportData.transactions.length > 0) {
    buffers.push(Buffer.from([0x1B, 0x45, 0x01]));
    buffers.push(Buffer.from('TRANSACTIONS\n'));
    buffers.push(Buffer.from([0x1B, 0x45, 0x00]));
    
    for (const tx of reportData.transactions) {
      const time = new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: false });
      const method = tx.payment_method.toUpperCase().padEnd(8);
      const total = tx.grand_total.toFixed(2).padStart(10);
      const receipt = tx.receipt_number.slice(-12).padEnd(14);
      
      // Transaction header line (bold)
      buffers.push(Buffer.from([0x1B, 0x45, 0x01]));
      buffers.push(Buffer.from(`${receipt} ${time}  ${method} ${total}\n`));
      buffers.push(Buffer.from([0x1B, 0x45, 0x00]));

      // Items under this transaction
      if (tx.items && tx.items.length > 0) {
        for (const item of tx.items) {
          const itemName = `  ${(item.product_name || 'Unknown').substring(0, 28)}`;
          const qty = `x${item.quantity}`;
          const lineTotal = item.line_total.toFixed(2);
          const itemPad = 36 - itemName.length - qty.length;
          const totalPad = lineLen - 36 - lineTotal.length;
          buffers.push(Buffer.from(`${itemName}${' '.repeat(Math.max(1, itemPad))}${qty}${' '.repeat(Math.max(1, totalPad))}${lineTotal}\n`));
        }
      }
    }
    buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));
  }

  // Item Summary at the bottom
  if (reportData.itemSummary && reportData.itemSummary.length > 0) {
    buffers.push(Buffer.from([0x1B, 0x45, 0x01]));
    buffers.push(Buffer.from('ITEMS SOLD SUMMARY\n'));
    buffers.push(Buffer.from([0x1B, 0x45, 0x00]));

    for (const item of reportData.itemSummary) {
      const name = (item.product_name || 'Unknown').substring(0, 38);
      const qty = `x ${item.total_qty}`;
      const pad = lineLen - name.length - qty.length;
      buffers.push(Buffer.from(`${name}${' '.repeat(Math.max(1, pad))}${qty}\n`));
    }
    buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));
  }

  // Footer (Center)
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));
  buffers.push(Buffer.from('\n'));
  buffers.push(Buffer.from(`Printed on: ${new Date().toLocaleString('en-GH')}\n`));
  buffers.push(Buffer.from('Powered by SikaPOS\n\n\n\n'));

  // Paper cut
  buffers.push(Buffer.from([0x1D, 0x56, 0x00]));

  return Buffer.concat(buffers);
}

export function buildKitchenReceiptBytes(data: any): Buffer {
  const buffers: Buffer[] = [];
  const cfg = data.config || {};
  const lineLen = cfg.paperSize === '58mm' ? 32 : 48;

  // ESC @: Initialize printer
  buffers.push(Buffer.from([0x1B, 0x40]));

  // Center (ESC a 1)
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));

  // Header: KITCHEN ORDER
  buffers.push(Buffer.from([0x1D, 0x21, 11])); // Double size
  buffers.push(Buffer.from('KITCHEN ORDER\n'));
  
  // Reset size
  buffers.push(Buffer.from([0x1D, 0x21, 0x00]));
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Order Type & Table
  buffers.push(Buffer.from([0x1D, 0x21, 0x11])); // Double size
  buffers.push(Buffer.from(`${data.orderType.toUpperCase()}\n`));
  if (data.orderNote) {
    buffers.push(Buffer.from(`NOTE: ${data.orderNote.toUpperCase()}\n`));
  }
  buffers.push(Buffer.from([0x1D, 0x21, 0x00])); // Reset size
  
  buffers.push(Buffer.from(`Date: ${data.date}\n`));
  buffers.push(Buffer.from(`Cashier: ${data.cashier}\n`));
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Items
  buffers.push(Buffer.from([0x1D, 0x21, 0x01])); // Double height
  for (const item of data.items) {
    buffers.push(Buffer.from(`${item.quantity} x ${item.product_name || item.name}\n`));
  }
  buffers.push(Buffer.from([0x1D, 0x21, 0x00])); // Reset size

  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));
  buffers.push(Buffer.from('\n\n\n\n'));

  // Paper cut
  buffers.push(Buffer.from([0x1D, 0x56, 0x00]));

  return Buffer.concat(buffers);
}

export function buildOpenDrawerBytes(): Buffer {
  // ESC p m t1 t2
  // 0x1B = ESC, 0x70 = p, 0x00 = connector pin 2, 0x3C = pulse duration t1 (60), 0x78 = pulse duration t2 (120)
  return Buffer.from([0x1B, 0x70, 0x00, 0x3C, 0x78]);
}
