import { BrowserWindow, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getReceiptPaymentDisplay } from './receipt-payment';

function escapeHtml(unsafe: any): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Quantity label for report transaction rows (pack lines show box count + pack size). */
function formatReportTransactionItemQty(item: {
  quantity: number;
  sale_unit?: string | null;
  unit_multiplier?: number | null;
}): string {
  const q = Number(item.quantity) || 0;
  const mult = Math.max(1, Number(item.unit_multiplier ?? 1));
  if (String(item.sale_unit || '').toLowerCase() === 'pack' && mult > 1) {
    return `${q} [Box ×${mult}]`;
  }
  return String(q);
}

function formatStockUnitsSold(qty: unknown): string {
  const q = Number(qty);
  if (!Number.isFinite(q)) return '0';
  return !Number.isInteger(q) ? q.toFixed(2) : String(Math.round(q));
}

function isSafeImageSrc(src: any): boolean {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  return /^data:image\/(png|jpe?g|gif);base64,[A-Za-z0-9+/]+=*$/.test(trimmed) || /^https?:\/\/[\w\-./?&=#%+~]+$/.test(trimmed);
}

// Code 128B barcode SVG generator for PDF receipts
const CODE128B_PDF: number[][] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1,2],
];

function generateBarcodeSVG(text: string): string {
  const START_B = 104, STOP = 106;
  const codes: number[] = [START_B];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code >= 0 && code < 95) codes.push(code);
  }
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
  codes.push(checksum % 103);
  codes.push(STOP);

  const bars: boolean[] = [];
  for (const code of codes) {
    const pattern = CODE128B_PDF[code];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i++) {
      const width = pattern[i];
      const isBar = i % 2 === 0;
      for (let w = 0; w < width; w++) bars.push(isBar);
    }
  }

  const quietZone = 10, svgWidth = 220;
  const barWidth = (svgWidth - quietZone * 2) / bars.length;
  let rects = '';
  for (let i = 0; i < bars.length; i++) {
    if (bars[i]) {
      const x = quietZone + i * barWidth;
      rects += `<rect x="${x.toFixed(2)}" y="0" width="${(barWidth + 0.3).toFixed(2)}" height="44" fill="#000"/>`;
    }
  }
  return rects;
}

export async function saveAsPDF(data: any, type: 'receipt' | 'report') {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const html = type === 'receipt' ? generateReceiptHtml(data) : generateReportHtml(data);
  
  await win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);

  const sanitizeFilename = (s: unknown) =>
    String(s ?? '')
      .replace(/[^\w\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'report';

  const reportData = Array.isArray(data) ? data[0] : data;
  const fileDate =
    reportData?.reportFileDate ||
    String(reportData?.date || '')
      .match(/\d{4}-\d{2}-\d{2}/)?.[0] ||
    sanitizeFilename(new Date().toISOString().slice(0, 10));
  const staffName = reportData?.cashierName ? sanitizeFilename(reportData.cashierName) : '';
  const defaultBase =
    type === 'receipt'
      ? `receipt-${sanitizeFilename(reportData?.receiptNumber || 'sale')}`
      : staffName
        ? `${staffName}-${fileDate}`
        : `report-${fileDate}`;

  const pdfPath = await dialog.showSaveDialog({
    title: `Save ${type === 'receipt' ? 'Receipt' : 'Report'} as PDF`,
    defaultPath: `${defaultBase}.pdf`,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });

  if (pdfPath.canceled || !pdfPath.filePath) {
    win.destroy();
    return { success: false, message: 'Cancelled' };
  }

  try {
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' },
      pageSize: 'A4',
    });

    fs.writeFileSync(pdfPath.filePath, pdfData);
    win.destroy();
    
    // Ask user if they want to open the file
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Open File', 'OK'],
      title: 'PDF Saved',
      message: `PDF saved successfully to ${path.basename(pdfPath.filePath)}`,
    });

    if (response === 0) {
      shell.openPath(pdfPath.filePath);
    }

    return { success: true, path: pdfPath.filePath };
  } catch (err: any) {
    win.destroy();
    console.error('PDF Generation Error:', err);
    throw new Error(`Failed to generate PDF: ${err.message}`);
  }
}

function generateReceiptHtml(receipt: any) {
  const cfg = receipt.config || {};
  const cur = receipt.currency || 'GHS';
  const paymentDisplay = getReceiptPaymentDisplay({
    paymentMethod: receipt.paymentMethod,
    status: receipt.status,
    total: receipt.total,
    amountTendered: receipt.amountTendered,
    change: receipt.change,
    paidAmount: receipt.paidAmount ?? receipt.paid_amount,
    customerCreditBalanceAfter: receipt.customerCreditBalanceAfter,
    currency: cur,
  });
  const paymentHtml = paymentDisplay.lines
    .map(
      (line) =>
        `<strong>${escapeHtml(line.label)}:</strong> ${escapeHtml(line.value)}${line.emphasize ? ' <span style="color:#b45309;font-weight:700">!</span>' : ''}<br>`
    )
    .join('');
  const statusBannerHtml = paymentDisplay.statusBanner
    ? `<div style="text-align:center;font-weight:bold;font-size:16px;color:#b91c1c;margin-bottom:8px;">*** ${escapeHtml(paymentDisplay.statusBanner)} ***</div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline';">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .business-name { font-size: 28px; font-weight: bold; margin-bottom: 5px; color: #000; }
        .info { font-size: 14px; color: #666; }
        .divider { border-bottom: 2px solid #eee; margin: 20px 0; }
        .receipt-info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { text-align: left; border-bottom: 2px solid #eee; padding: 10px 0; font-size: 14px; text-transform: uppercase; color: #888; }
        td { padding: 12px 0; font-size: 15px; }
        tr.item-row td { border-bottom: 1px dotted #ccc; }
        tr.item-row:last-child td { border-bottom: none; }
        .total-section { margin-top: 20px; }
        .total-row { display: flex; justify-content: flex-end; margin-bottom: 8px; font-size: 15px; }
        .total-label { width: 150px; text-align: right; margin-right: 20px; color: #666; }
        .total-value { width: 120px; text-align: right; font-weight: 500; }
        .grand-total { font-size: 20px; font-weight: bold; color: #000; margin-top: 10px; border-top: 2px solid #eee; padding-top: 10px; }
        .footer { text-align: center; margin-top: 50px; font-size: 13px; color: #999; }
        .payment-status { margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 8px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        ${(cfg.showLogo !== false && isSafeImageSrc(receipt.businessLogo)) ? `<img src="${escapeHtml(receipt.businessLogo)}" alt="Logo" style="max-width: 80px; max-height: 80px; object-fit: contain; margin-bottom: 10px;" />` : ''}
        <div class="business-name">${escapeHtml(receipt.businessName)}</div>
        <div class="info">
          ${cfg.showAddress !== false && receipt.businessAddress ? `<div>${escapeHtml(receipt.businessAddress)}</div>` : ''}
          ${cfg.showPhone !== false && receipt.businessPhone ? `<div>Tel: ${escapeHtml(receipt.businessPhone)}</div>` : ''}
          ${cfg.showTIN !== false && receipt.tin ? `<div>TIN: ${escapeHtml(receipt.tin)}</div>` : ''}
          Official Sales Receipt
        </div>
      </div>

      <div class="receipt-info">
        <div>
          <strong>Receipt No:</strong> ${escapeHtml(receipt.receiptNumber)}<br>
          <strong>Date:</strong> ${escapeHtml(receipt.date)}<br>
          ${(cfg.showCustomer !== false && receipt.customerName) ? `<strong>Customer:</strong> ${escapeHtml(receipt.customerName)}` : ''}
        </div>
        <div style="text-align: right">
          ${cfg.showCashier !== false ? `<strong>Cashier:</strong> ${escapeHtml(receipt.cashier)}<br>` : ''}
          <strong>Payment Method:</strong> ${escapeHtml(String(receipt.paymentMethod || '—').toUpperCase())}<br>
          ${receipt.status ? `<strong>Status:</strong> ${escapeHtml(String(receipt.status).toUpperCase())}<br>` : ''}
          ${(cfg.showOrderType !== false && receipt.orderType && receipt.orderType !== 'retail') ? `<strong>Order:</strong> ${escapeHtml(receipt.orderType.toUpperCase())}<br>` : ''}
          ${(cfg.showOrderNote !== false && receipt.orderNote) ? `<strong>Note:</strong> ${escapeHtml(receipt.orderNote)}` : ''}
        </div>
      </div>

      <div class="divider"></div>

      <table>
        <thead>
          <tr>
            <th>Item Description</th>
            <th style="text-align: center">Qty</th>
            <th style="text-align: right">Unit Price</th>
            <th style="text-align: right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${receipt.items.map((item: any, index: number) => `
            <tr class="item-row"${index === receipt.items.length - 1 ? ' style="border-bottom:none"' : ''}>
              <td>
                ${escapeHtml(item.name)}
                ${item.size ? `<br><small style="color: #d4af37; font-weight: 600;">(${escapeHtml(item.size)})</small>` : ''}
              </td>
              <td style="text-align: center">${escapeHtml(item.quantity)}</td>
              <td style="text-align: right">${escapeHtml(cur)} ${escapeHtml(item.unitPrice.toFixed(2))}</td>
              <td style="text-align: right">${escapeHtml(cur)} ${escapeHtml(item.subtotal.toFixed(2))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total-section">
        <div class="total-row">
          <div class="total-label">Subtotal</div>
          <div class="total-value">${escapeHtml(cur)} ${escapeHtml(receipt.subtotal.toFixed(2))}</div>
        </div>
        ${receipt.discount > 0 ? `
          <div class="total-row">
            <div class="total-label">Discount</div>
            <div class="total-value">- ${escapeHtml(cur)} ${escapeHtml(receipt.discount.toFixed(2))}</div>
          </div>
        ` : ''}
        ${(cfg.showTaxBreakdown !== false && receipt.taxBreakdown && receipt.taxBreakdown.length > 0) ? 
          receipt.taxBreakdown.map((t: any) => `
            <div class="total-row">
              <div class="total-label">${escapeHtml(t.name)} (${escapeHtml(t.rate)}%)</div>
              <div class="total-value">${escapeHtml(cur)} ${escapeHtml(t.amount.toFixed(2))}</div>
            </div>
          `).join('') : `
            <div class="total-row">
              <div class="total-label">Tax</div>
              <div class="total-value">${escapeHtml(cur)} ${escapeHtml(receipt.tax.toFixed(2))}</div>
            </div>
          `
        }
        <div class="total-row grand-total">
          <div class="total-label">GRAND TOTAL</div>
          <div class="total-value">${escapeHtml(cur)} ${escapeHtml(receipt.total.toFixed(2))}</div>
        </div>
      </div>

      <div class="payment-status">
        ${statusBannerHtml}
        ${paymentHtml}
      </div>

      <div class="footer">
        <p>${escapeHtml(receipt.footerMessage)}</p>
        <p>Thank you for your business!</p>
        ${cfg.showPoweredBy !== false ? `<p style="font-size: 10px; margin-top: 20px;">Powered by SikaPOS (DanniTech Solution)</p>` : ''}
        ${cfg.showBarcode !== false ? `
          <div style="margin-top: 30px; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 20px 12px; background: #f8f8f8; border-radius: 8px; border: 1px solid #eee;">
            <svg width="220" height="44" viewBox="0 0 220 44" xmlns="http://www.w3.org/2000/svg">
              ${generateBarcodeSVG(receipt.receiptNumber)}
            </svg>
            <div style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; letter-spacing: 3px; color: #444; text-transform: uppercase;">${escapeHtml(receipt.receiptNumber)}</div>
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

function generateReportHtml(reports: any[]) {
  const reportsList = Array.isArray(reports) ? reports : [reports];
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline';">
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; }
        .report-page { page-break-after: always; }
        .report-page:last-child { page-break-after: auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .business-name { font-size: 24px; font-weight: bold; }
        .report-title { font-size: 18px; color: #666; margin-top: 5px; text-transform: uppercase; letter-spacing: 2px; }
        .date { font-size: 14px; color: #888; margin-top: 5px; }
        .section-title { font-size: 16px; font-weight: bold; margin: 30px 0 15px 0; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: #f9f9f9; padding: 15px; border-radius: 8px; }
        .card-label { font-size: 12px; color: #888; text-transform: uppercase; }
        .card-value { font-size: 18px; font-weight: bold; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; background: #f4f4f4; padding: 10px; font-size: 12px; }
        td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #aaa; }
      </style>
    </head>
    <body>
      ${reportsList.map(report => `
        <div class="report-page">
          <div class="header">
            ${isSafeImageSrc(report.businessLogo) ? `<img src="${escapeHtml(report.businessLogo)}" alt="Logo" style="max-width: 80px; max-height: 80px; object-fit: contain; margin-bottom: 10px;" />` : ''}
            <div class="business-name">${escapeHtml(report.businessName)}</div>
            <div class="report-title">End Of Day Report</div>
            <div class="date">${escapeHtml(report.date)}</div>
            ${report.cashierName ? `
              <div class="info" style="margin-top: 5px; font-weight: 600;">
                Staff: ${escapeHtml(report.cashierName)}
                ${report.shiftDuration ? ` &middot; Duration: ${escapeHtml(report.shiftDuration)}` : ''}
              </div>
              ${report.shiftTimeRange ? `<div class="info" style="margin-top: 4px; font-size: 12px; color: #666;">${escapeHtml(report.shiftTimeRange)}</div>` : ''}
            ` : ''}
          </div>

          <div class="section-title">Performance Summary</div>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="card-label">Total Revenue</div>
              <div class="card-value">${escapeHtml(report.currency || 'GHS')} ${escapeHtml(report.summary.total_revenue.toFixed(2))}</div>
            </div>
            <div class="summary-card">
              <div class="card-label">Transactions</div>
              <div class="card-value">${escapeHtml(report.summary.transaction_count)}</div>
            </div>
            ${report.summary.debt_recovered > 0 ? `
              <div class="summary-card" style="background: #e8f5e9;">
                <div class="card-label">Debt Recovered</div>
                <div class="card-value">${escapeHtml(report.currency || 'GHS')} ${escapeHtml(report.summary.debt_recovered.toFixed(2))}</div>
              </div>
            ` : ''}
            <div class="summary-card">
              <div class="card-label">Cash Total</div>
              <div class="card-value">${escapeHtml(report.currency || 'GHS')} ${escapeHtml(report.summary.cash_total.toFixed(2))}</div>
            </div>
            <div class="summary-card">
              <div class="card-label">MoMo Total</div>
              <div class="card-value">${escapeHtml(report.currency || 'GHS')} ${escapeHtml(report.summary.momo_total.toFixed(2))}</div>
            </div>
            <div class="summary-card">
              <div class="card-label">Credit Total</div>
              <div class="card-value">${escapeHtml(report.currency || 'GHS')} ${escapeHtml(report.summary.credit_total.toFixed(2))}</div>
            </div>
          </div>


          <div class="section-title">Transactions</div>
          ${report.transactions.map((tx: any) => `
            <table style="margin-bottom: 10px;">
              <thead>
                <tr style="background: #f4f4f4;">
                  <th>${escapeHtml(tx.receipt_number)}</th>
                  <th>${escapeHtml(new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }))}</th>
                  <th>${escapeHtml(tx.payment_method.toUpperCase())}</th>
                  <th style="text-align: right">${escapeHtml(report.currency || 'GHS')} ${escapeHtml(tx.grand_total.toFixed(2))}</th>
                </tr>
              </thead>
              ${tx.items && tx.items.length > 0 ? `
                <tbody>
                  ${tx.items.map((item: any) => `
                    <tr>
                      <td colspan="2" style="padding-left: 20px; color: #555;">
                        ${escapeHtml(item.product_name)}
                        ${item.product_size ? `<small style="color: #d4af37;">(${escapeHtml(item.product_size)})</small>` : ''}
                        × ${escapeHtml(formatReportTransactionItemQty(item))}
                      </td>
                      <td></td>
                      <td style="text-align: right; color: #555;">${escapeHtml(report.currency || 'GHS')} ${escapeHtml(item.line_total.toFixed(2))}</td>
                    </tr>
                  `).join('')}
                </tbody>
              ` : ''}
            </table>
          `).join('')}

          ${report.itemSummary && report.itemSummary.length > 0 ? `
            <div class="section-title">Items Sold Summary</div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="text-align: right">Stock units sold</th>
                </tr>
              </thead>
              <tbody>
                ${report.itemSummary.map((item: any) => `
                  <tr>
                    <td>
                      ${escapeHtml(item.product_name)}
                      ${item.product_size ? `<small style="color: #d4af37; margin-left: 6px;">(${escapeHtml(item.product_size)})</small>` : ''}
                    </td>
                    <td style="text-align: right; font-weight: bold;">× ${escapeHtml(formatStockUnitsSold(item.total_qty))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          <div class="footer">
            Generated on ${escapeHtml(new Date().toLocaleString())} &middot; Powered by SikaPOS (DanniTech Solution)
          </div>
        </div>
      `).join('')}
    </body>
    </html>
  `;
}
