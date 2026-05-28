/**
 * End-of-day report HTML for browser print / Save as PDF (portal).
 * Used for sales date-range reports and per-shift attendance reports.
 */

import { paymentMethodLabel } from './paymentDisplay';

export interface EodReportPrintInput {
  businessName: string;
  businessLogo?: string;
  dateLabel: string;
  staffLine?: string;
  summary: {
    total_revenue: number;
    transaction_count: number;
    cash_total: number;
    momo_total: number;
    card_total?: number;
    credit_total: number;
    debt_recovered?: number;
  };
  transactions: Array<{
    receipt_number?: string;
    created_at: string;
    grand_total: number | string;
    payment_method?: string;
    split_cash?: number;
    split_momo?: number;
    change_given?: number;
    items?: Array<{
      product_name?: string;
      quantity?: number;
      line_total?: number;
    }>;
  }>;
  itemSummary: Array<{ product_name?: string; name?: string; total_qty?: number; quantity?: number }>;
  formatCurrency: (n: number | string) => string;
  /** Browser may use this as the suggested name when saving as PDF */
  documentTitle?: string;
}

function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateEodReportHtml(input: EodReportPrintInput): string {
  const {
    businessName,
    businessLogo,
    dateLabel,
    staffLine,
    summary,
    transactions,
    itemSummary,
    formatCurrency,
  } = input;
  const logo = businessLogo || '';

  const txRows = transactions
    .map((tx) => {
      const total = Number(tx.grand_total) || 0;
      const itemsHtml =
        tx.items && tx.items.length > 0
          ? tx.items
              .map(
                (item) => `
                <tr>
                  <td colspan="4" class="item-row">
                    ${escapeHtml(item.product_name)} × ${escapeHtml(item.quantity)}
                    <span style="float: right; color: #888; font-weight: 400;">GHS ${escapeHtml(formatCurrency(Number(item.line_total) || 0))}</span>
                  </td>
                </tr>`
              )
              .join('')
          : '';
      return `
        <tr class="row-zebra">
          <td class="tx-receipt">${escapeHtml(tx.receipt_number)}</td>
          <td>${escapeHtml(new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: true }))}</td>
          <td>${escapeHtml(paymentMethodLabel(String(tx.payment_method || ''), tx))}</td>
          <td style="text-align: right; font-weight: 700;">GHS ${escapeHtml(formatCurrency(total))}</td>
        </tr>
        ${itemsHtml}`;
    })
    .join('');

  const itemsSoldRows = itemSummary
    .map((p) => {
      const name = p.product_name || p.name || 'Unknown';
      const qty = p.total_qty ?? p.quantity ?? 0;
      return `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td style="text-align: right; font-weight: 700;">× ${escapeHtml(qty)}</td>
        </tr>`;
    })
    .join('');

  const pageTitle = input.documentTitle || 'SikaPOS - End of Day Report';

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @media print {
      @page { margin: 1cm; }
      body { margin: 0; padding: 0; }
    }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      color: #1a1a1a;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px;
      line-height: 1.5;
      background: #fff;
    }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { width: 80px; height: 80px; object-fit: contain; margin-bottom: 12px; }
    .business-name { font-size: 24px; font-weight: 700; margin: 0; color: #000; }
    .report-title { font-size: 16px; font-weight: 500; margin: 8px 0; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .date { font-size: 14px; color: #888; font-weight: 500; }
    .staff { font-size: 13px; color: #555; margin-top: 6px; font-weight: 600; }
    .section-header {
      font-size: 18px;
      font-weight: 700;
      margin: 32px 0 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #f0f0f0;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .summary-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #eee;
    }
    .summary-label { font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 8px; }
    .summary-value { font-size: 20px; font-weight: 700; color: #000; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { text-align: left; padding: 12px; background: #f8f9fa; font-size: 12px; font-weight: 700; color: #666; text-transform: uppercase; }
    td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; }
    .row-zebra:nth-child(even) { background: #fafafa; }
    .item-row { font-size: 11px; color: #666; padding: 4px 12px 4px 40px !important; border: none !important; }
    .footer {
      text-align: center;
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      font-size: 12px;
      color: #999;
    }
    .tx-receipt { font-weight: 600; font-family: monospace; }
  </style>
</head>
<body>
  <div class="header">
    ${logo ? `<img src="${escapeHtml(logo)}" class="logo" alt="" />` : '<div style="height: 80px"></div>'}
    <h1 class="business-name">${escapeHtml(businessName)}</h1>
    <h2 class="report-title">End of Day Report</h2>
    <div class="date">${escapeHtml(dateLabel)}</div>
    ${staffLine ? `<div class="staff">${escapeHtml(staffLine)}</div>` : ''}
  </div>

  <div class="section-header">Performance Summary</div>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-label">Total Revenue</div>
      <div class="summary-value">GHS ${escapeHtml(formatCurrency(summary.total_revenue))}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Transactions</div>
      <div class="summary-value">${escapeHtml(summary.transaction_count)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Cash Total</div>
      <div class="summary-value">GHS ${escapeHtml(formatCurrency(summary.cash_total))}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">MoMo Total</div>
      <div class="summary-value">GHS ${escapeHtml(formatCurrency(summary.momo_total))}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Credit Total</div>
      <div class="summary-value">GHS ${escapeHtml(formatCurrency(summary.credit_total))}</div>
    </div>
    ${
      (summary.debt_recovered || 0) > 0
        ? `<div class="summary-card">
      <div class="summary-label">Debt Recovered</div>
      <div class="summary-value">GHS ${escapeHtml(formatCurrency(summary.debt_recovered || 0))}</div>
    </div>`
        : ''
    }
  </div>

  <div class="section-header">Transactions</div>
  ${
    transactions.length === 0
      ? '<p style="color:#888;">No transactions in this period.</p>'
      : `<table>
    <thead>
      <tr>
        <th>Receipt #</th>
        <th>Time</th>
        <th>Method</th>
        <th style="text-align: right">Total</th>
      </tr>
    </thead>
    <tbody>${txRows}</tbody>
  </table>`
  }

  <div class="section-header">Items Sold Summary</div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align: right">Total Qty Sold</th>
      </tr>
    </thead>
    <tbody>
      ${
        itemsSoldRows ||
        '<tr><td colspan="2" style="text-align:center;color:#888;">No items sold in this period</td></tr>'
      }
    </tbody>
  </table>

  <div class="footer">
    <p>Generated on ${escapeHtml(new Date().toLocaleString('en-GH'))} · Powered by SikaPOS (DanniTech Solution)</p>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 500);
    };
  </script>
</body>
</html>`;
}

export function openEodReportPrint(input: EodReportPrintInput): boolean {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Allow pop-ups to print or save this report as PDF.');
    return false;
  }
  win.document.write(generateEodReportHtml(input));
  win.document.close();
  return true;
}
