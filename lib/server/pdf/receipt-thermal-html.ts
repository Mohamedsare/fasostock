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
import { normalizeReceiptTemplate } from "@/lib/features/receipt/receipt-ticket-template";
import { renderReceiptThermalModernHtml } from "./receipt-thermal-modern-html";
import QRCode from "qrcode";
import { ARCHIVO_BLACK_FONT_FACE_CSS } from "./archivo-black-font";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(sanitizeForPdf(s));
}

/**
 * Ticket thermique HTML → PDF, dans la mise en forme choisie par la boutique
 * (`stores.receipt_template`, transportée par le ticket : le serveur ne connaît
 * aucune boutique). Absente ou inconnue ⇒ modèle classique, donc les tickets déjà
 * en circulation sont imprimés à l'identique.
 */
export async function renderReceiptThermalHtml(
  data: ReceiptTicketData,
  paperWidthMm: 58 | 80 = 80,
): Promise<string> {
  if (normalizeReceiptTemplate(data.receiptTemplate) === "moderne") {
    return renderReceiptThermalModernHtml(data, paperWidthMm);
  }
  return renderReceiptThermalClassicHtml(data, paperWidthMm);
}

/**
 * Ticket thermique HTML → PDF (parité `ReceiptThermalPrintService` Flutter).
 * Zone de contenu : **~72 mm** (papier 80 mm) ou **~48 mm** (papier 58 mm) ;
 * marges PDF gérées dans `html-to-pdf.ts`.
 *
 * Le viewport de rendu suit la largeur du papier : les tailles en `px` ont donc
 * la même taille **physique** sur 58 et 80 mm. En 58 mm on réduit seulement les
 * éléments à largeur fixe (logo, nom de boutique, colonnes chiffres, longueur de
 * nom) pour qu'ils tiennent dans les 48 mm. Le rendu 80 mm reste inchangé.
 */
export async function renderReceiptThermalClassicHtml(
  data: ReceiptTicketData,
  paperWidthMm: 58 | 80 = 80,
): Promise<string> {
  const narrow = paperWidthMm === 58;
  // Largeurs fixes calibrées pour 72 mm ; réduites pour tenir dans 48 mm (58 mm).
  const logoMaxWidthPx = narrow ? 160 : 248;
  const storeFontPx = narrow ? 19 : 25;
  const storeLetterSp = narrow ? 0.4 : 0.65;
  const qtyColPx = narrow ? 14 : 18;
  const numColPx = narrow ? 24 : 32;
  const maxNameLen = narrow ? 16 : RECEIPT_THERMAL_PDF_MAX_NAME_LEN;

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
  const logoUrl = data.storeLogoUrl?.trim();
  if (logoUrl) {
    parts.push(
      `<div class="logo-wrap"><img src="${escapeHtml(logoUrl)}" alt="" /></div>`,
    );
  }
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
    const name = truncateName(sanitizeForPdf(item.name), maxNameLen);
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
    `<div class="row mono"><span>Sous-total</span><span>${escapeHtml(receiptIntAmount(data.subtotal, data.currencyCode))}</span></div>`,
  );
  if (data.discount > 0) {
    parts.push(
      `<div class="row mono"><span>Remise</span><span>${escapeHtml(receiptIntAmount(data.discount, data.currencyCode))}</span></div>`,
    );
  }
  parts.push(`<div style="height:4px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_TOTAL)}</div>`);
  parts.push(`<div style="height:4px"></div>`);
  parts.push(
    `<div class="row total"><span>TOTAL</span><span>${escapeHtml(receiptIntAmount(data.total, data.currencyCode))}</span></div>`,
  );
  parts.push(`<div style="height:6px"></div>`);
  parts.push(
    `<div class="mono">Paiement : ${escapeHtml(payU)}</div>`,
  );
  // Vente réglée en deux moyens (espèces + mobile money) : le détail fait la preuve.
  for (const split of data.paymentSplit ?? []) {
    parts.push(
      `<div class="row"><span>${tx(split.label)}</span><span>${escapeHtml(receiptIntAmount(Math.round(split.amount), data.currencyCode))}</span></div>`,
    );
  }
  if (isCash) {
    parts.push(
      `<div class="mono">Reçu     : ${escapeHtml(receiptIntAmount(Math.round(data.amountReceived ?? data.total), data.currencyCode))}</div>`,
      `<div class="mono">Rendu    : ${escapeHtml(receiptIntAmount(Math.round(data.change ?? 0), data.currencyCode))}</div>`,
    );
  }
  // Client associé à la vente (facultatif au comptant, obligatoire à crédit).
  if (data.customerName?.trim()) {
    parts.push(
      `<div class="mono">Client   : ${tx(data.customerName.trim())}</div>`,
    );
  }
  // Vente à crédit : le ticket sert de preuve de dette (acompte, reste, échéance).
  const creditRemaining = Math.max(0, data.creditRemaining ?? 0);
  if (creditRemaining > 0) {
    parts.push(
      `<div class="mono">Acompte  : ${escapeHtml(receiptIntAmount(Math.round(data.creditPaid ?? 0), data.currencyCode))}</div>`,
      `<div class="row total"><span>RESTE A PAYER</span><span>${escapeHtml(receiptIntAmount(Math.round(creditRemaining), data.currencyCode))}</span></div>`,
    );
    if (data.creditDueLabel?.trim()) {
      parts.push(
        `<div class="mono">Echeance : ${tx(data.creditDueLabel.trim())}</div>`,
      );
    }
  }
  parts.push(`<div style="height:8px"></div>`);
  parts.push(
    `<div class="qrwrap"><img src="${qrDataUrl}" width="52" height="52" alt="" /></div>`,
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
<style>
  ${ARCHIVO_BLACK_FONT_FACE_CSS}
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
  .logo-wrap {
    text-align: center;
    margin-bottom: 4px;
  }
  .logo-wrap img {
    max-width: ${logoMaxWidthPx}px;
    max-height: 80px;
    width: auto;
    height: auto;
    object-fit: contain;
    object-position: center;
    display: inline-block;
    vertical-align: middle;
  }
  .store {
    font-family: "Archivo Black", sans-serif;
    font-size: ${storeFontPx}px;
    letter-spacing: ${storeLetterSp}px;
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
  table.grid thead th.cqty { text-align: center; width: ${qtyColPx}px; }
  table.grid thead th.cnum { text-align: right; width: ${numColPx}px; }
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
