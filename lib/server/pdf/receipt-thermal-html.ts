import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import { sanitizeForPdf } from "@/lib/features/invoices/invoice-a4-helpers";
import {
  RECEIPT_THERMAL_PDF_DASH_LINE,
  RECEIPT_THERMAL_PDF_MAX_NAME_LEN,
  formatCurrencyReceipt,
  stripTelPrefix,
  truncateName,
} from "@/lib/features/receipt/receipt-ticket-format";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(sanitizeForPdf(s));
}

function fmtDateTime(d: Date): { dateStr: string; timeStr: string } {
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const timeStr = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return { dateStr, timeStr };
}

export function renderReceiptThermalHtml(data: ReceiptTicketData): string {
  const { dateStr, timeStr } = fmtDateTime(data.date);
  const phone = stripTelPrefix(data.storePhone);
  const customerPhone = stripTelPrefix(data.customerPhone);

  const parts: string[] = [];
  parts.push(
    `<div class="store">${tx(data.storeName).toUpperCase()}</div>`,
  );
  if (data.storeAddress?.trim()) {
    parts.push(`<div class="small center">${tx(data.storeAddress.trim())}</div>`);
  }
  if (phone) {
    parts.push(`<div class="small center">${tx(phone)}</div>`);
  }
  parts.push(`<div class="dash">${escapeHtml(RECEIPT_THERMAL_PDF_DASH_LINE)}</div>`);
  parts.push(
    `<div class="small center">${tx(`N° ${data.saleNumber}    ${dateStr}  ${timeStr}`)}</div>`,
  );
  parts.push(`<div class="dash">${escapeHtml(RECEIPT_THERMAL_PDF_DASH_LINE)}</div>`);

  if (data.customerName?.trim()) {
    parts.push(`<div class="line"></div>`);
    parts.push(`<div>Client: ${tx(data.customerName.trim())}</div>`);
    if (customerPhone) {
      parts.push(`<div class="small">${tx(customerPhone)}</div>`);
    }
    parts.push(`<div class="dash">${escapeHtml(RECEIPT_THERMAL_PDF_DASH_LINE)}</div>`);
  }

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]!;
    const name = truncateName(
      sanitizeForPdf(item.name),
      RECEIPT_THERMAL_PDF_MAX_NAME_LEN,
    );
    parts.push(`<div class="line"></div>`);
    parts.push(`<div>${escapeHtml(name)}</div>`);
    parts.push(
      `<div class="row"><span class="small">  ${item.quantity} x ${escapeHtml(formatCurrencyReceipt(item.unitPrice))}</span><span>${escapeHtml(formatCurrencyReceipt(item.total))}</span></div>`,
    );
  }

  parts.push(`<div class="line"></div>`);
  parts.push(`<div class="dash">${escapeHtml(RECEIPT_THERMAL_PDF_DASH_LINE)}</div>`);
  parts.push(`<div class="line"></div>`);
  parts.push(
    `<div class="row"><span>Sous-total</span><span>${escapeHtml(formatCurrencyReceipt(data.subtotal))}</span></div>`,
  );
  if (data.discount > 0) {
    parts.push(
      `<div class="row"><span>Remise</span><span>-${escapeHtml(formatCurrencyReceipt(data.discount))}</span></div>`,
    );
  }
  parts.push(`<div class="line"></div>`);
  parts.push(
    `<div class="row tot"><span>TOTAL TTC</span><span>${escapeHtml(formatCurrencyReceipt(data.total))}</span></div>`,
  );
  parts.push(`<div class="line"></div>`);
  parts.push(
    `<div class="row"><span>Paiement</span><span>${tx(data.paymentMethod)}</span></div>`,
  );
  if ((data.amountReceived ?? 0) > 0) {
    parts.push(
      `<div class="row"><span>Montant reçu</span><span>${escapeHtml(formatCurrencyReceipt(data.amountReceived ?? 0))}</span></div>`,
    );
    if ((data.change ?? -1) >= 0) {
      parts.push(
        `<div class="row smallb"><span>Monnaie</span><span>${escapeHtml(formatCurrencyReceipt(data.change ?? 0))}</span></div>`,
      );
    }
  }
  parts.push(`<div class="thanks">Merci et à bientôt</div>`);
  parts.push(`<div class="fs">--- FasoStock ---</div>`);

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, "Segoe UI", Roboto, sans-serif; font-size: 8px; margin: 0; padding: 8px; width: 72mm; }
  .store { font-size: 10px; font-weight: 700; text-align: center; }
  .small { font-size: 7px; }
  .center { text-align: center; }
  .dash { font-size: 7px; text-align: center; margin: 4px 0; }
  .line { height: 3px; }
  .row { display: flex; justify-content: space-between; }
  .tot { font-size: 9px; font-weight: 700; }
  .smallb { font-size: 8px; font-weight: 700; }
  .thanks { font-size: 9px; font-weight: 700; text-align: center; margin-top: 8px; }
  .fs { font-size: 7px; color: #757575; text-align: center; margin-top: 2px; }
</style></head><body>
${parts.join("")}
</body></html>`;
}
