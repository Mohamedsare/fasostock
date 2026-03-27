import { sanitizeForPdf } from "@/lib/features/invoices/invoice-a4-helpers";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  RECEIPT_SEP_LONG,
  RECEIPT_SEP_MID,
  RECEIPT_SEP_TOTAL,
  RECEIPT_THERMAL_PDF_MAX_NAME_LEN,
  buildReceiptQrPayload,
  metaFactureDateHeureLine,
  paymentUppercase,
  receiptIntAmount,
  telLine,
  truncateName,
} from "@/lib/features/receipt/receipt-ticket-format";
import QRCode from "qrcode";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(sanitizeForPdf(s));
}

/**
 * Ticket thermique HTML → PDF (parité `ReceiptThermalPrintService` Flutter).
 * Rendu dans la zone **~72 mm** de large (papier **80 mm** ; marges PDF gérées dans `html-to-pdf.ts`).
 */
export async function renderReceiptThermalHtml(
  data: ReceiptTicketData,
): Promise<string> {
  const tel = telLine(data.storePhone);
  const payU = paymentUppercase(data.paymentMethod);
  const isCash = payU === "ESPECES";
  const qrPayload = buildReceiptQrPayload(data);
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 216,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const parts: string[] = [];
  parts.push(
    `<div class="store">${tx(data.storeName).toUpperCase()}</div>`,
  );
  if (data.storeAddress?.trim()) {
    parts.push(
      `<div class="small center mono" style="margin-top:2px">${tx(data.storeAddress.trim())}</div>`,
    );
  }
  if (tel) {
    parts.push(
      `<div class="small center mono" style="margin-top:2px">${tx(tel)}</div>`,
    );
  }
  parts.push(`<div style="height:6px"></div>`);
  parts.push(
    `<div class="meta mono center">${tx(metaFactureDateHeureLine(data.saleNumber, data.date))}</div>`,
  );
  parts.push(`<div style="height:6px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);
  parts.push(`<table class="grid mono"><thead><tr>
    <th class="left">Produit</th>
    <th class="cqty">Qté</th>
    <th class="cnum">PU(CFA)</th>
    <th class="cnum">Total</th>
  </tr></thead></table>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);
  parts.push(`<table class="grid mono"><tbody>`);
  for (const item of data.items) {
    const name = truncateName(
      sanitizeForPdf(item.name),
      RECEIPT_THERMAL_PDF_MAX_NAME_LEN,
    );
    parts.push(`<tr>
      <td class="left">${escapeHtml(name)}</td>
      <td class="cqty">${item.quantity}</td>
      <td class="cnum">${Math.round(item.unitPrice)}</td>
      <td class="cnum">${Math.round(item.total)}</td>
    </tr>`);
  }
  parts.push(`</tbody></table>`);
  parts.push(`<div style="height:4px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);
  parts.push(`<div style="height:4px"></div>`);
  parts.push(
    `<div class="row mono"><span>Sous-total</span><span>${escapeHtml(receiptIntAmount(data.subtotal))}</span></div>`,
  );
  if (data.discount > 0) {
    parts.push(
      `<div class="row mono"><span>Remise</span><span>${escapeHtml(receiptIntAmount(data.discount))}</span></div>`,
    );
  }
  parts.push(`<div style="height:4px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_TOTAL)}</div>`);
  parts.push(`<div style="height:4px"></div>`);
  parts.push(
    `<div class="row total"><span>TOTAL</span><span>${escapeHtml(receiptIntAmount(data.total))}</span></div>`,
  );
  parts.push(`<div style="height:6px"></div>`);
  parts.push(
    `<div class="mono">Paiement : ${escapeHtml(payU)}</div>`,
  );
  if (isCash) {
    parts.push(
      `<div class="mono">Reçu     : ${escapeHtml(receiptIntAmount(Math.round(data.amountReceived ?? data.total)))}</div>`,
      `<div class="mono">Rendu    : ${escapeHtml(receiptIntAmount(Math.round(data.change ?? 0)))}</div>`,
    );
  }
  parts.push(`<div style="height:8px"></div>`);
  parts.push(
    `<div class="qrwrap"><img src="${qrDataUrl}" width="108" height="108" alt="" /></div>`,
  );
  parts.push(`<div style="height:8px"></div>`);
  parts.push(
    `<div class="thanks mono">Merci pour votre achat !</div>`,
  );
  parts.push(`<div style="height:6px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_MID)}</div>`);
  parts.push(
    `<div class="powered small center mono">Powered by FasoStock POS</div>`,
  );
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_MID)}</div>`);

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap"/>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
  }
  body {
    font-family: system-ui, "Segoe UI", Roboto, sans-serif;
    font-size: 8px;
    width: 100%;
    max-width: 100%;
    color: #000;
  }
  .mono { font-family: "Courier New", Courier, monospace; }
  .store {
    font-family: "Archivo Black", sans-serif;
    font-size: 25px;
    letter-spacing: 0.65px;
    line-height: 1.05;
    text-align: center;
    font-weight: 400;
  }
  .small { font-size: 7px; }
  .center { text-align: center; }
  .meta { font-size: 8.5px; }
  .sep {
    font-size: 7.5px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
  }
  table.grid { width: 100%; border-collapse: collapse; font-size: 8px; }
  table.grid thead th {
    font-weight: 700;
    text-align: left;
    padding-bottom: 2px;
  }
  table.grid thead th.cqty { text-align: center; width: 18px; }
  table.grid thead th.cnum { text-align: right; width: 32px; }
  table.grid tbody td { padding-bottom: 3px; vertical-align: top; }
  table.grid tbody td.cqty { text-align: center; }
  table.grid tbody td.cnum { text-align: right; }
  .row {
    display: flex;
    justify-content: space-between;
    font-size: 8px;
  }
  .row.total {
    font-size: 11px;
    font-weight: 700;
  }
  .thanks { font-size: 8px; font-weight: 700; text-align: center; }
  .powered { font-size: 7.5px; color: #333; margin-top: 2px; }
  .qrwrap { text-align: center; }
  .qrwrap img { display: inline-block; }
</style></head><body>
${parts.join("")}
</body></html>`;
}
