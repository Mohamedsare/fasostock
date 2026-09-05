import { sanitizeForPdf } from "@/lib/features/invoices/invoice-a4-helpers";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  buildReceiptQrPayload,
  metaFactureDateHeureLine,
  paymentUppercase,
  receiptGroupedNumber,
  telLine,
} from "@/lib/features/receipt/receipt-ticket-format";
import { normalizeReceiptTemplate } from "@/lib/features/receipt/receipt-ticket-template";
import { layoutOn, layoutText, parseInvoiceLayout } from "@/lib/features/invoices/invoice-layout";
import { renderReceiptThermalModernHtml } from "./receipt-thermal-modern-html";
import { currencySymbolOf } from "@/lib/config/currencies";
import { formatCurrencyFlutter } from "@/lib/utils/currency";
import QRCode from "qrcode";
import { ARCHIVO_BLACK_FONT_FACE_CSS } from "./archivo-black-font";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(sanitizeForPdf(s));
}

/**
 * Ticket thermique HTML → PDF, dans la mise en forme choisie par la boutique
 * (`stores.receipt_template`, transportée par le ticket : le serveur ne connaît
 * aucune boutique). Absente ou inconnue ⇒ modèle classique.
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
 * Ticket thermique — modèle « Classique » : la mise en forme historique, en Courier,
 * avec ses filets pointillés et ses colonnes chiffrées.
 *
 * Zone de contenu : **~72 mm** (papier 80 mm) ou **~48 mm** (papier 58 mm) ; marges
 * PDF gérées dans `html-to-pdf.ts`. Le viewport de rendu suit la largeur du papier :
 * les tailles en `px` ont donc la même taille **physique** sur 58 et 80 mm. En 58 mm
 * on réduit seulement ce qui risquerait de toucher les bords.
 *
 * Trois écarts assumés avec le ticket Flutter (`receipt_ticket_layout.dart`), qui
 * corrigent des défauts visibles en caisse — **Flutter reste à aligner** :
 * 1. montants avec séparateurs de milliers (« 12 500 FCFA », pas « 12500 FCFA ») ;
 * 2. nom d'article complet, qui passe à la ligne au lieu d'être coupé à 22 caractères
 *    (16 en 58 mm) — le client doit reconnaître ce qu'il a acheté ;
 * 3. filets tracés en CSS plutôt qu'en chaînes de tirets de longueur fixe : ces
 *    dernières débordaient du papier 58 mm et sortaient rognées en plein milieu.
 */
export async function renderReceiptThermalClassicHtml(
  data: ReceiptTicketData,
  paperWidthMm: 58 | 80 = 80,
): Promise<string> {
  const L = parseInvoiceLayout(data.layout);
  const narrow = paperWidthMm === 58;
  // Largeurs fixes calibrées pour 72 mm ; réduites pour tenir dans 48 mm (58 mm).
  const logoMaxWidthPx = narrow ? 160 : 248;
  const storeFontPx = narrow ? 19 : 25;
  const storeLetterSp = narrow ? 0.4 : 0.65;
  const bodyFontPx = narrow ? 7.5 : 8;
  const metaFontPx = narrow ? 8 : 8.5;
  const totalFontPx = narrow ? 11 : 12;

  const money = (n: number): string =>
    formatCurrencyFlutter(Math.round(n), data.currencyCode);
  const num = (n: number): string => receiptGroupedNumber(n, data.currencyCode);
  const currency = currencySymbolOf(data.currencyCode ?? undefined);
  // 48 mm : « PU » seul rend 40 px à la colonne des noms. La devise reste lisible
  // juste en dessous, sur chaque ligne de total.
  const puHeader = layoutText(L, "t.colPrice", narrow ? "PU" : `PU (${currency})`);

  const tel = telLine(data.storePhone);
  const payU = paymentUppercase(data.paymentMethod);
  const isCash = payU === "ESPECES";
  // Contenu du QR inchangé (montant sans séparateurs, libellés d'origine) : il sert de
  // preuve scannable sur des tickets déjà remis, il ne doit pas bouger avec la mise en forme.
  const qrDataUrl = !layoutOn(L, "t.qr")
    ? ""
    : await QRCode.toDataURL(buildReceiptQrPayload(data), {
    width: 216,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const row = (label: string, value: string, cls = ""): string =>
    `<div class="row mono${cls ? ` ${cls}` : ""}"><span class="lbl">${tx(label)}</span><span class="val">${tx(value)}</span></div>`;

  const parts: string[] = [];
  const logoUrl = layoutOn(L, "t.logo") ? data.storeLogoUrl?.trim() : "";
  if (logoUrl) {
    parts.push(
      `<div class="logo-wrap"><img src="${escapeHtml(logoUrl)}" alt="" /></div>`,
    );
  }
  parts.push(`<div class="store">${tx(data.storeName).toUpperCase()}</div>`);
  if (data.storeAddress?.trim() && layoutOn(L, "t.address")) {
    parts.push(
      `<div class="small center mono">${tx(data.storeAddress.trim())}</div>`,
    );
  }
  if (tel && layoutOn(L, "t.phone")) {
    parts.push(`<div class="small center mono">${tx(tel)}</div>`);
  }
  if (layoutOn(L, "t.meta")) {
    parts.push(
      `<div class="meta mono center">${tx(metaFactureDateHeureLine(data.saleNumber, data.date))}</div>`,
    );
  }

  parts.push(`<div class="sep"></div>`);
  // Colonnes chiffrées retirables : un ticket sans prix reste un bon de remise.
  const showQty = layoutOn(L, "t.colQty");
  const showPu = layoutOn(L, "t.colPrice");
  const showTot = layoutOn(L, "t.colTotal");
  parts.push(`<table class="grid mono"><thead><tr>
    <th class="left">${escapeHtml(layoutText(L, "t.colDesc", "Produit"))}</th>
    ${showQty ? `<th class="cqty">${escapeHtml(layoutText(L, "t.colQty", "Qté"))}</th>` : ""}
    ${showPu ? `<th class="cnum">${escapeHtml(puHeader)}</th>` : ""}
    ${showTot ? `<th class="cnum">${escapeHtml(layoutText(L, "t.colTotal", "Total"))}</th>` : ""}
  </tr></thead><tbody>`);
  for (const item of data.items) {
    // Nom complet : il passe à la ligne dans sa colonne, les chiffres restent alignés.
    parts.push(`<tr>
      <td class="left">${tx(item.name.trim())}</td>
      ${showQty ? `<td class="cqty">${item.quantity}</td>` : ""}
      ${showPu ? `<td class="cnum">${escapeHtml(num(item.unitPrice))}</td>` : ""}
      ${showTot ? `<td class="cnum">${escapeHtml(num(item.total))}</td>` : ""}
    </tr>`);
  }
  parts.push(`</tbody></table>`);
  parts.push(`<div class="sep"></div>`);

  if (layoutOn(L, "t.subtotal")) {
    parts.push(row(layoutText(L, "t.subtotal", "Sous-total"), money(data.subtotal)));
  }
  if (data.discount > 0 && layoutOn(L, "t.discount")) {
    parts.push(row(layoutText(L, "t.discount", "Remise"), `- ${money(data.discount)}`));
  }
  parts.push(`<div class="sep solid"></div>`);
  parts.push(row(layoutText(L, "t.total", "TOTAL"), money(data.total), "total"));
  parts.push(`<div class="sep solid"></div>`);

  if (layoutOn(L, "t.payment")) {
    parts.push(row(layoutText(L, "t.payment", "Paiement"), payU, "strong"));
    // Vente réglée en deux moyens (espèces + mobile money) : le détail fait la preuve.
    for (const split of data.paymentSplit ?? []) {
      parts.push(row(split.label, money(split.amount)));
    }
  }
  if (isCash && layoutOn(L, "t.received")) {
    parts.push(row(layoutText(L, "t.received", "Reçu"), money(data.amountReceived ?? data.total)));
  }
  if (isCash && layoutOn(L, "t.change")) {
    parts.push(row(layoutText(L, "t.change", "Rendu"), money(data.change ?? 0)));
  }
  // Client associé à la vente (facultatif au comptant, obligatoire à crédit).
  if (data.customerName?.trim() && layoutOn(L, "t.customer")) {
    parts.push(row(layoutText(L, "t.customer", "Client"), data.customerName.trim()));
  }

  // Vente à crédit : le ticket sert de preuve de dette (acompte, reste, échéance).
  const creditRemaining = Math.max(0, data.creditRemaining ?? 0);
  if (creditRemaining > 0 && layoutOn(L, "t.credit")) {
    parts.push(`<div class="sep"></div>`);
    parts.push(row("Acompte", money(data.creditPaid ?? 0)));
    parts.push(row("RESTE À PAYER", money(creditRemaining), "due"));
    if (data.creditDueLabel?.trim()) {
      parts.push(row("Échéance", data.creditDueLabel.trim()));
    }
  }

  if (qrDataUrl) {
    parts.push(
      `<div class="qrwrap"><img src="${qrDataUrl}" width="52" height="52" alt="" /></div>`,
    );
  }
  if (layoutOn(L, "t.thanks")) {
    parts.push(
      `<div class="thanks mono">${tx(layoutText(L, "t.thanks", "Merci pour votre achat !"))}</div>`,
    );
  }
  if (layoutOn(L, "t.powered")) {
    parts.push(`<div class="sep"></div>`);
    parts.push(`<div class="powered small center mono">Powered by FasoStock POS</div>`);
  }

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
    font-size: ${bodyFontPx}px;
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
  .meta { font-size: ${metaFontPx}px; margin-top: 6px; }
  /* Filet à la largeur exacte du papier : la chaîne de tirets d'avant sortait rognée. */
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .sep.solid { border-top: 1px solid #000; }
  table.grid { width: 100%; border-collapse: collapse; font-size: ${bodyFontPx}px; }
  table.grid thead th {
    font-weight: 700;
    text-align: left;
    padding-bottom: 3px;
    white-space: nowrap;
  }
  table.grid thead th.cqty { text-align: center; padding: 0 6px 3px; }
  table.grid thead th.cnum { text-align: right; padding-left: 8px; }
  table.grid tbody td { padding-bottom: 3px; vertical-align: top; }
  table.grid tbody td.left { word-break: break-word; padding-right: 6px; }
  table.grid tbody td.cqty { text-align: center; white-space: nowrap; padding: 0 6px 3px; }
  table.grid tbody td.cnum { text-align: right; white-space: nowrap; padding-left: 8px; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    font-size: ${bodyFontPx}px;
    line-height: 1.4;
  }
  .row .val { white-space: nowrap; flex: 0 0 auto; }
  .row.strong .val { font-weight: 700; }
  .row.total {
    font-size: ${totalFontPx}px;
    font-weight: 700;
    letter-spacing: 0.3px;
    margin: 3px 0;
  }
  .row.due { font-weight: 700; }
  /* pre-line : le propriétaire peut écrire ses mentions sur plusieurs lignes.
     Sans retour à la ligne dans le texte, le rendu est celui d'avant. */
  .thanks { font-size: 8.5px; font-weight: 700; text-align: center; margin-top: 7px; white-space: pre-line; }
  .powered { color: #333; }
  .qrwrap { text-align: center; margin-top: 9px; }
  .qrwrap img { display: inline-block; }
</style></head><body>
${parts.join("")}
</body></html>`;
}
