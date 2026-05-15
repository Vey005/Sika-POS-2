<<<<<<< HEAD
import { getReceiptPaymentDisplay } from '../utils/receipt-payment';

=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
export function buildReceiptBytes(receiptData: any): Buffer {
  const buffers: Buffer[] = [];
  const cfg = receiptData.config || {};
  const cur = receiptData.currency || 'GHS';
<<<<<<< HEAD
  const paperSize = cfg.paperSize || '80mm';
  const lineLen = paperSize === '80mm' ? 48 : paperSize === '58mm' ? 32 : 24;

  // Most thermal printers don't support the Cedi symbol (₵) in their default code pages.
  // We'll use GHS for the printer to ensure it prints correctly, while keeping the symbol in the UI.
  const printerCur = cur.includes('₵') ? 'GHS' : cur;
=======
  const lineLen = cfg.paperSize === '58mm' ? 32 : 48;
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  // ESC @: Initialize printer
  buffers.push(Buffer.from([0x1B, 0x40]));

<<<<<<< HEAD
  // Set alignment to Left (0x00) - we will use software centering for better compatibility
  buffers.push(Buffer.from([0x1B, 0x61, 0x00]));
  
  if (receiptData.logoBuffer) {
    buffers.push(receiptData.logoBuffer);
    buffers.push(Buffer.from('\n'));
  }

  // Print business name (Double height/width)
  // GS ! 0x11 (Double Width & Height)
  // When using double width, each character takes 2 slots
  const bizName = receiptData.businessName || '';
  const bizNameWidth = paperSize === '40mm' ? 24 : lineLen; // Use full width for 40mm
  const paddingSlots = Math.max(0, Math.floor((bizNameWidth - (bizName.length * 2)) / 2));
  const bizPadding = ' '.repeat(Math.floor(paddingSlots / 2)); // Divide by 2 because spaces will also be doubled if we send them after GS !

  buffers.push(Buffer.from([0x1D, 0x21, 0x11]));
  buffers.push(Buffer.from(bizPadding + bizName + '\n'));
=======
  // Select alignment: Center (ESC a 1)
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));

  // Print business name (Double height/width)
  // GS ! 0x11
  buffers.push(Buffer.from([0x1D, 0x21, 0x11]));
  buffers.push(Buffer.from(receiptData.businessName + '\n'));
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  // Reset text size
  buffers.push(Buffer.from([0x1D, 0x21, 0x00]));
  
  if (cfg.showAddress !== false && receiptData.businessAddress) {
<<<<<<< HEAD
    buffers.push(Buffer.from(centerText(receiptData.businessAddress, lineLen) + '\n'));
  }
  if (cfg.showPhone !== false && receiptData.businessPhone) {
    buffers.push(Buffer.from(centerText(`Tel: ${receiptData.businessPhone}`, lineLen) + '\n'));
  }
  if (cfg.showTIN !== false && receiptData.tin) {
    buffers.push(Buffer.from(centerText(`TIN: ${receiptData.tin}`, lineLen) + '\n'));
  }
  buffers.push(Buffer.from('\n'));

  // Alignment: Always Left for metadata details as requested
  buffers.push(Buffer.from([0x1B, 0x61, 0x00]));


  buffers.push(Buffer.from(`Receipt No: ${receiptData.receiptNumber}\n`));
  buffers.push(Buffer.from(`Date: ${receiptData.date}\n`));
  if (receiptData.time) {
    buffers.push(Buffer.from(`Time: ${receiptData.time}\n`));
  }
=======
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
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  
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

<<<<<<< HEAD
  // Items Table Header (Unified column design)
  let nameWidth, qtyWidth, priceWidth, totalWidth;
  if (lineLen === 48) {
    nameWidth = 20; qtyWidth = 6; priceWidth = 10; totalWidth = 12;
    buffers.push(Buffer.from([0x1B, 0x61, 0x00])); // Left align table
    buffers.push(Buffer.from('ITEM                QTY      PRICE       TOTAL\n'));
  } else if (lineLen === 32) {
    nameWidth = 12; qtyWidth = 4; priceWidth = 7; totalWidth = 9;
    buffers.push(Buffer.from([0x1B, 0x61, 0x00]));
    buffers.push(Buffer.from('ITEM        QTY  PRICE   TOTAL\n'));
  } else {
    // 40mm (24 chars) - Use center or tight left
    nameWidth = 10; qtyWidth = 2; priceWidth = 6; totalWidth = 6;
    buffers.push(Buffer.from([0x1B, 0x61, 0x00]));
    buffers.push(Buffer.from('ITEM      QT PRICE TOTAL\n'));
  }
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Items (Unified column layout)
  for (const item of receiptData.items) {
    const saleUnitText = item.saleUnitLabel ? ` [${item.saleUnitLabel}]` : '';
    const itemName = item.size ? `${item.name} (${item.size})${saleUnitText}` : `${item.name}${saleUnitText}`;
    const nameLines = wrapText(itemName, nameWidth);
    
    const qty = item.quantity.toString().padStart(qtyWidth - 1).padEnd(qtyWidth);
    const price = item.unitPrice.toFixed(2).padStart(priceWidth);
    const total = item.subtotal.toFixed(2).padStart(totalWidth);
    
    // Print first line of name with numbers
    buffers.push(Buffer.from(`${nameLines[0].padEnd(nameWidth)}${qty}${price}${total}\n`));
    
    // Print remaining lines of name
    for (let i = 1; i < nameLines.length; i++) {
      buffers.push(Buffer.from(`${nameLines[i]}\n`));
    }
=======
  // Items
  for (const item of receiptData.items) {
    const itemName = item.size ? `${item.name} (${item.size})` : item.name;
    buffers.push(Buffer.from(`${itemName}\n`));
    const qtyPrice = `  ${item.quantity} x ${item.unitPrice.toFixed(2)}`;
    const subtotal = item.subtotal.toFixed(2);
    const spaces = Math.max(1, lineLen - qtyPrice.length - subtotal.length);
    buffers.push(Buffer.from(`${qtyPrice}${' '.repeat(spaces)}${subtotal}\n`));
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  }

  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // Totals
  const printTotalRow = (label: string, amount: string, bold = false) => {
    if (bold) buffers.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
    const spaces = Math.max(1, lineLen - label.length - amount.length);
    buffers.push(Buffer.from(`${label}${' '.repeat(spaces)}${amount}\n`));
    if (bold) buffers.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  };

<<<<<<< HEAD
  printTotalRow('Subtotal:', `${printerCur} ${receiptData.subtotal.toFixed(2)}`);
  
  if (cfg.showTaxBreakdown !== false && receiptData.taxBreakdown && receiptData.taxBreakdown.length > 0) {
    receiptData.taxBreakdown.forEach((t: any) => {
      printTotalRow(`${t.name} (${t.rate}%):`, `${printerCur} ${t.amount.toFixed(2)}`);
    });
  } else if (receiptData.tax > 0) {
    printTotalRow('Tax:', `${printerCur} ${receiptData.tax.toFixed(2)}`);
  }
  
  if (receiptData.discount > 0) {
    printTotalRow('Discount:', `-${printerCur} ${receiptData.discount.toFixed(2)}`);
  }
  
  buffers.push(Buffer.from([0x1D, 0x21, 0x01])); // Double height
  printTotalRow(`TOTAL ${printerCur}:`, `${printerCur} ${receiptData.total.toFixed(2)}`, true);
=======
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
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  buffers.push(Buffer.from([0x1D, 0x21, 0x00])); // Reset size

  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

<<<<<<< HEAD
  // Payment (credit / reversed / void / cash-momo-card)
  const paymentDisplay = getReceiptPaymentDisplay({
    paymentMethod: receiptData.paymentMethod,
    status: receiptData.status,
    total: receiptData.total,
    amountTendered: receiptData.amountTendered,
    change: receiptData.change,
    paidAmount: receiptData.paidAmount ?? receiptData.paid_amount,
    customerCreditBalanceAfter: receiptData.customerCreditBalanceAfter,
    currency: printerCur,
  });

  if (paymentDisplay.statusBanner) {
    buffers.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
    printTotalRow('***', paymentDisplay.statusBanner, true);
    buffers.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  }

  for (const line of paymentDisplay.lines) {
    printTotalRow(`${line.label}:`, line.value, Boolean(line.emphasize));
=======
  // Payment
  printTotalRow('Paid via:', receiptData.paymentMethod.toUpperCase());
  if (receiptData.paymentMethod === 'cash') {
    printTotalRow('Amount Tendered:', receiptData.amountTendered.toFixed(2));
    printTotalRow('Change Due:', receiptData.change.toFixed(2));
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  }

  buffers.push(Buffer.from('\n'));

<<<<<<< HEAD
  // Footer (Manual Centering - Pushed Extreme Left)
  const fontBLineLen = Math.floor(lineLen * 1.375);
  const adjustedFontBWidth = fontBLineLen - 4; // Moved right from -12 to -4
  
  buffers.push(Buffer.from([0x1B, 0x61, 0x00])); // Left align
  buffers.push(Buffer.from([0x1B, 0x24, 0x00, 0x00])); // Set absolute position 0
  buffers.push(Buffer.from([0x1B, 0x4D, 0x01])); // Select Font B (Small)
  
  buffers.push(Buffer.from(centerText(receiptData.footerMessage || 'Thanks For Shopping with us', adjustedFontBWidth) + '\n'));
  
  if (cfg.showPoweredBy !== false) {
    // Add 2 spaces (approx 18 dots in Font B) to shift right manually
    const poweredByText = centerText('Powered by SikaPOS (DanniTech Solution)', adjustedFontBWidth);
    buffers.push(Buffer.from('  ' + poweredByText + '\n'));
  }
  buffers.push(Buffer.from([0x1B, 0x4D, 0x00])); // Reset Font

    // Barcode (Shifted 1cm Right)
    if (cfg.showBarcode !== false && receiptData.receiptNumber) {
      buffers.push(Buffer.from([0x1B, 0x61, 0x00])); // Left align
      
      // Set approx 1cm left margin (80 dots at 203 DPI)
      const margin = paperSize === '40mm' ? 60 : 80;
      buffers.push(Buffer.from([0x1D, 0x4C, margin, 0])); 
      
      buffers.push(Buffer.from('\n'));
    // GS h 60: Set barcode height to 60 dots (reduced from 80)
    buffers.push(Buffer.from([0x1D, 0x68, 60]));
    // GS w 1: Use narrower width for small paper sizes
    buffers.push(Buffer.from([0x1D, 0x77, (paperSize === '40mm' || paperSize === '58mm') ? 0x01 : 0x02]));
=======
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
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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
<<<<<<< HEAD
    
    // Reset left margin to 0 for subsequent prints
    buffers.push(Buffer.from([0x1D, 0x4C, 0, 0]));
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  }
  
  buffers.push(Buffer.from('\n\n\n\n'));

  // Paper cut command: GS V 0
  buffers.push(Buffer.from([0x1D, 0x56, 0x00]));

  // Cash Drawer kick: ESC p 0 60 120
  buffers.push(Buffer.from([0x1B, 0x70, 0x00, 0x3C, 0x78]));

  return Buffer.concat(buffers);
}

<<<<<<< HEAD
// Helper to wrap text into multiple lines
function wrapText(text: string, width: number): string[] {
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + (currentLine ? ' ' : '') + word).length <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine !== '') lines.push(currentLine);
      currentLine = word;
      // Handle words longer than width
      while (currentLine.length > width) {
        lines.push(currentLine.substring(0, width));
        currentLine = currentLine.substring(width);
      }
    }
  }
  if (currentLine !== '') lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

function centerText(text: string, width: number): string {
  const trimmed = text.trim();
  if (trimmed.length >= width) return trimmed;
  const left = Math.floor((width - trimmed.length) / 2);
  return ' '.repeat(left) + trimmed;
}

export function buildReportBytes(reportData: any): Buffer {
  const buffers: Buffer[] = [];
  const cfg = reportData.config || {};
  const cur = reportData.currency || cfg.currency || 'GHS';
  const printerCur = cur.includes('₵') ? 'GHS' : cur;
  const paperSize = cfg.paperSize || '80mm';
  const lineLen = paperSize === '80mm' ? 48 : paperSize === '58mm' ? 32 : 24;
=======
export function buildReportBytes(reportData: any): Buffer {
  const buffers: Buffer[] = [];
  const cfg = reportData.config || {};
  const lineLen = cfg.paperSize === '58mm' ? 32 : 48;
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  // ESC @: Initialize printer
  buffers.push(Buffer.from([0x1B, 0x40]));

  // Center (ESC a 1)
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));

  // Print business name (Double height/width)
  buffers.push(Buffer.from([0x1D, 0x21, 0x11]));
<<<<<<< HEAD
  buffers.push(Buffer.from((reportData.businessName || 'SikaPOS') + '\n'));
  
  // Report Title
  buffers.push(Buffer.from([0x1D, 0x21, 0x01])); // Double height
  if (reportData.isShiftReport) {
    buffers.push(Buffer.from('SHIFT SUMMARY REPORT\n'));
  } else {
    buffers.push(Buffer.from('END OF DAY REPORT\n'));
  }
  
  // Metadata (Date, Cashier)
  buffers.push(Buffer.from([0x1D, 0x21, 0x00])); // Reset size
  buffers.push(Buffer.from(`Date: ${reportData.date}\n`));
  if (reportData.cashierName) {
    buffers.push(Buffer.from(`Staff: ${reportData.cashierName}\n`));
  }
  if (reportData.shiftDuration) {
    buffers.push(Buffer.from(`Duration: ${reportData.shiftDuration}\n`));
  }
=======
  buffers.push(Buffer.from(reportData.businessName + '\n'));
  
  // Report Title
  buffers.push(Buffer.from([0x1D, 0x21, 0x01])); // Double height
  buffers.push(Buffer.from('END OF DAY REPORT\n'));
  
  // Date
  buffers.push(Buffer.from([0x1D, 0x21, 0x00])); // Reset size
  buffers.push(Buffer.from(`${reportData.date}\n`));
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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
  
<<<<<<< HEAD
  printRow('Total Revenue:', `${printerCur} ${reportData.summary.total_revenue.toFixed(2)}`, true);
  printRow('Total Transactions:', `${reportData.summary.transaction_count}`);
  if (reportData.summary.debt_recovered > 0) {
    printRow('Debt Recovered:', `${printerCur} ${reportData.summary.debt_recovered.toFixed(2)}`);
  }
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));
  printRow('Cash:', `${printerCur} ${reportData.summary.cash_total.toFixed(2)}`);
  printRow('MoMo:', `${printerCur} ${reportData.summary.momo_total.toFixed(2)}`);
  printRow('Credit:', `${printerCur} ${reportData.summary.credit_total.toFixed(2)}`);
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  // NOTE: Transaction history is intentionally omitted from thermal EOD prints.
  // Full transaction-level details remain available in PDF exports.
=======
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
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  // Item Summary at the bottom
  if (reportData.itemSummary && reportData.itemSummary.length > 0) {
    buffers.push(Buffer.from([0x1B, 0x45, 0x01]));
<<<<<<< HEAD
    buffers.push(Buffer.from('ITEMS SOLD (STOCK UNITS)\n'));
=======
    buffers.push(Buffer.from('ITEMS SOLD SUMMARY\n'));
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    buffers.push(Buffer.from([0x1B, 0x45, 0x00]));

    for (const item of reportData.itemSummary) {
      const name = (item.product_name || 'Unknown').substring(0, 38);
<<<<<<< HEAD
      const q = Number(item.total_qty);
      const qtyLabel =
        Number.isFinite(q) && !Number.isInteger(q) ? q.toFixed(2) : String(Number.isFinite(q) ? Math.round(q) : 0);
      const qty = `x ${qtyLabel}`;
=======
      const qty = `x ${item.total_qty}`;
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

<<<<<<< HEAD
/** Thermal list of inventory-tracked products at or below their low-stock threshold. */
export function buildLowStockListBytes(data: {
  businessName?: string;
  printedAt?: string;
  items?: Array<{ name?: string; barcode?: string; stock_qty?: number; low_stock_threshold?: number }>;
  config?: { paperSize?: string };
}): Buffer {
  const buffers: Buffer[] = [];
  const cfg = data.config || {};
  const paperSize = cfg.paperSize || '58mm';
  const lineLen = paperSize === '80mm' ? 48 : paperSize === '58mm' ? 32 : 24;

  buffers.push(Buffer.from([0x1B, 0x40]));
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));
  buffers.push(Buffer.from([0x1D, 0x21, 0x11]));
  buffers.push(Buffer.from(`${data.businessName || 'Business'}\n`));
  buffers.push(Buffer.from([0x1D, 0x21, 0x01]));
  buffers.push(Buffer.from('LOW STOCK LIST\n'));
  buffers.push(Buffer.from([0x1D, 0x21, 0x00]));
  buffers.push(Buffer.from(`${data.printedAt || new Date().toLocaleString('en-GH')}\n`));
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  buffers.push(Buffer.from([0x1B, 0x61, 0x00]));
  const items = Array.isArray(data.items) ? data.items : [];
  buffers.push(Buffer.from(`Lines: ${items.length}\n`));
  buffers.push(Buffer.from([0x1B, 0x45, 0x01]));
  buffers.push(Buffer.from(lineLen >= 40 ? 'ITEM / SKU barcodes below\n' : 'ITEM + stk/thr\n'));
  buffers.push(Buffer.from([0x1B, 0x45, 0x00]));
  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));

  for (const row of items) {
    const stock = Number(row.stock_qty);
    const thr = Number(row.low_stock_threshold);
    const stockStr = Number.isFinite(stock) ? String(stock) : '?';
    const thrStr = Number.isFinite(thr) ? String(thr) : '?';
    const suffix = ` ${stockStr}/${thrStr}`;
    const maxNameLen = Math.max(6, lineLen - suffix.length);
    let name = String(row.name || 'Unknown').replace(/\s+/g, ' ').trim();
    if (name.length > maxNameLen) name = name.slice(0, maxNameLen - 1) + '.';
    const pad = Math.max(1, lineLen - name.length - suffix.length);
    buffers.push(Buffer.from(`${name}${' '.repeat(pad)}${suffix}\n`));

    const bc = row.barcode ? String(row.barcode).trim() : '';
    if (bc) {
      const avail = lineLen - 1;
      const bcDisp = bc.length <= avail ? bc : bc.slice(0, Math.max(0, avail - 3)) + '...';
      buffers.push(Buffer.from(` ${bcDisp}\n`));
    }
  }

  buffers.push(Buffer.from('-'.repeat(lineLen) + '\n'));
  buffers.push(Buffer.from([0x1B, 0x61, 0x01]));
  buffers.push(Buffer.from('\nPowered by SikaPOS\n\n\n'));
  buffers.push(Buffer.from([0x1D, 0x56, 0x00]));
  return Buffer.concat(buffers);
}

export function buildKitchenReceiptBytes(data: any): Buffer {
  const buffers: Buffer[] = [];
  const cfg = data.config || {};
  const paperSize = cfg.paperSize || '80mm';
  const lineLen = paperSize === '80mm' ? 48 : paperSize === '58mm' ? 32 : 24;
=======
export function buildKitchenReceiptBytes(data: any): Buffer {
  const buffers: Buffer[] = [];
  const cfg = data.config || {};
  const lineLen = cfg.paperSize === '58mm' ? 32 : 48;
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

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
