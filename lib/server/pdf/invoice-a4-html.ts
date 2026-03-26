/**
 * Rendu HTML facture A4 — comparaison 1:1 avec
 * `InvoiceA4PdfService.buildDocument` (`invoice_a4_pdf_service.dart`).
 */
import type { InvoiceA4Data } from "@/lib/features/invoices/invoice-a4-types";
import {
  formatCurrencyInvoice,
  formatQuantity,
  hexToRgb,
  isElofTemplate,
  sanitizeForPdfLikeFlutter,
  stripTelPrefix,
} from "@/lib/features/invoices/invoice-a4-helpers";
import { escapeHtml } from "./escape-html";
import { bytesToImageDataUrl } from "./image-data-url";

/** Texte PDF Flutter + échappement HTML (XSS). */
function tx(s: string): string {
  return escapeHtml(sanitizeForPdfLikeFlutter(s));
}

/** Comme `_sanitizeForPdf(s).toUpperCase()` puis échappement — pas `tx(s).toUpperCase()`. */
function txUpper(s: string): string {
  return escapeHtml(sanitizeForPdfLikeFlutter(s).toUpperCase());
}

function rgbTupleToCss(hex: string | null | undefined): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Comme `DateFormat('dd/MM/yyyy')` + `DateFormat('HH:mm')` en heure locale (Flutter `DateTime`). */
function formatInvoiceDateFlutter(d: Date): { dateStr: string; timeStr: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { dateStr, timeStr };
}

/** Comme `activityStr.split(RegExp(r'[\r\n]+')).where((s) => s.isNotEmpty)` Flutter. */
function splitLinesActivity(s: string): string[] {
  return s.split(/\r\n|\n|\r/).filter((x) => x.length > 0);
}

/** Comme `sloganStr.split(RegExp(r'[\r\n]+'))` (ELOF) Flutter. */
function splitLinesSloganElof(s: string): string[] {
  return s.split(/\r\n|\n|\r/).filter((x) => x.length > 0);
}

/** Orange money ELOF — `PdfColor.fromInt(0xFFE65100)`. */
const ELOF_ORANGE_CSS = "rgb(230, 81, 0)";

function storeBlockClassic(
  data: InvoiceA4Data,
  primaryCss: string,
  logoUrl: string | null,
): string {
  const store = data.store;
  const shortTitle = (store.invoice_short_title ?? store.description)?.trim();
  const parts: string[] = [];
  if (shortTitle) {
    parts.push(
      `<div class="st-short" style="color:${primaryCss}">${txUpper(shortTitle)}</div>`,
    );
  }
  parts.push(
    `<div class="st-name" style="color:${primaryCss}">${txUpper(store.commercial_name ?? store.name)}</div>`,
  );
  if (store.slogan?.trim()) {
    for (const line of store.slogan!.trim().split("\n")) {
      if (line === "") continue;
      parts.push(
        `<div class="st-slogan-classic">${txUpper(line)}</div>`,
      );
    }
  }
  const activityStr = (store.activity ?? "").trim();
  if (activityStr) {
    for (const line of splitLinesActivity(activityStr)) {
      parts.push(`<div class="st-activity-classic">${txUpper(line)}</div>`);
    }
  }
  if (store.phone?.trim()) {
    const phone = stripTelPrefix(store.phone);
    if (phone) parts.push(`<div class="st-small st-phone">${tx(phone)}</div>`);
  }
  if (store.mobile_money?.trim()) {
    const mm = stripTelPrefix(store.mobile_money);
    if (mm) {
      parts.push(`<div class="st-small st-mm">Mobile money ${tx(mm)}</div>`);
    }
  }
  if (store.address?.trim()) {
    parts.push(`<div class="st-addr">${tx(store.address.trim())}</div>`);
  }

  const rightBlock = `<div class="st-right">${parts.join("")}</div>`;

  if (logoUrl) {
    return `<div class="st-row">
      <div class="st-left">
        <img src="${logoUrl}" width="80" height="80" alt="" style="object-fit:contain;display:block" />
        <div class="sp-8"></div>
        <div class="st-under-logo" style="color:${primaryCss}">${txUpper(store.name)}</div>
      </div>
      <div class="st-gap"></div>
      ${rightBlock}
    </div>`;
  }
  return `<div class="st-only-right">${rightBlock}</div>`;
}

function storeBlockElof(
  data: InvoiceA4Data,
  primaryCss: string,
  logoUrl: string | null,
): string {
  const store = data.store;
  const acronym = (store.invoice_short_title ?? "ELOF").trim().toUpperCase().replace(/\s/g, "");
  const letters =
    acronym.length >= 4 ? acronym.slice(0, 4).split("") : acronym.split("");
  const center: string[] = [];
  if (letters.length) {
    center.push(
      `<div class="elof-letters" style="color:${primaryCss}">${escapeHtml(letters.join("   "))}</div>`,
    );
  }
  center.push(
    `<div class="st-name" style="color:${primaryCss}">${txUpper(store.commercial_name ?? store.name)}</div>`,
  );
  const sloganStr = (store.slogan ?? "").trim();
  if (sloganStr) {
    for (const line of splitLinesSloganElof(sloganStr).slice(0, 2)) {
      center.push(`<div class="elof-slogan">${txUpper(line)}</div>`);
    }
  }
  const activityStr = (store.activity ?? "").trim();
  if (activityStr) {
    for (const line of splitLinesActivity(activityStr).slice(0, 2)) {
      center.push(`<div class="elof-activity">${txUpper(line)}</div>`);
    }
  }
  if (store.address?.trim()) {
    center.push(`<div class="elof-addr">${tx(store.address.trim())}</div>`);
  }
  if (store.phone?.trim()) {
    const phone = stripTelPrefix(store.phone);
    if (phone) center.push(`<div class="st-small st-center st-phone">${tx(phone)}</div>`);
  }
  if (store.mobile_money?.trim()) {
    const mm = stripTelPrefix(store.mobile_money);
    if (mm) {
      center.push(
        `<div class="st-small st-center elof-om">Orange money ${tx(mm)}</div>`,
      );
    }
  }

  const leftBlock = `<div class="st-left">
    ${logoUrl ? `<img src="${logoUrl}" width="80" height="80" alt="" style="object-fit:contain;display:block" />` : ""}
    ${logoUrl ? `<div class="sp-8"></div>` : ""}
    <div class="st-under-logo" style="color:${primaryCss}">${txUpper(store.name)}</div>
  </div>`;

  return `<div class="st-row">
    ${leftBlock}
    <div class="st-center-wrap"><div class="st-center-inner">${center.join("")}</div></div>
  </div>`;
}

function buildTable(data: InvoiceA4Data, currency: string, headerBg: string): string {
  const rows = data.items.map((line, i) => {
    const n = i + 1;
    const qty = formatQuantity(line.quantity);
    return `<tr>
      <td class="c-num">${n}</td>
      <td class="c-desc">${txUpper(line.description)}</td>
      <td class="c-qty">${escapeHtml(qty)}</td>
      <td class="c-unit">${tx(line.unit)}</td>
      <td class="c-price">${escapeHtml(formatCurrencyInvoice(line.unitPrice, currency))}</td>
      <td class="c-tot">${escapeHtml(formatCurrencyInvoice(line.total, currency))}</td>
    </tr>`;
  });
  /* Largeurs proches maquette : Désignation ~42 % (Flutter _cellHeader : N° centre, dés. gauche, prix/tot droite) */
  return `<table class="inv-table">
    <colgroup>
      <col style="width:5.32%" /><col style="width:42.55%" /><col style="width:11.70%" />
      <col style="width:10.64%" /><col style="width:14.89%" /><col style="width:14.89%" />
    </colgroup>
    <thead><tr class="inv-head" style="background:${headerBg};color:#fff">
      <th class="th-h-num">N°</th>
      <th class="th-h-desc">Désignation</th>
      <th class="th-h-qty">Quantité</th>
      <th class="th-h-unit">Unité</th>
      <th class="th-h-price">Prix unit.</th>
      <th class="th-h-tot">Total</th>
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function totalsBlock(data: InvoiceA4Data, currency: string, primaryCss: string): string {
  const deposit = data.depositAmount ?? 0;
  const remaining = Math.max(0, data.total - deposit);
  const rows: string[] = [];
  if (data.discount > 0) {
    rows.push(
      `<div class="tot-line"><span>Sous-total</span><span>${escapeHtml(formatCurrencyInvoice(data.subtotal, currency))}</span></div>`,
    );
    rows.push(
      `<div class="tot-line"><span>Remise</span><span>${escapeHtml(formatCurrencyInvoice(-data.discount, currency))}</span></div>`,
    );
  }
  if (data.tax > 0) {
    rows.push(
      `<div class="tot-line"><span>TVA</span><span>${escapeHtml(formatCurrencyInvoice(data.tax, currency))}</span></div>`,
    );
  }
  rows.push(`<div class="tot-sp"></div>`);
  rows.push(
    `<div class="tot-block"><span class="tot-lbl" style="background:${primaryCss}">Total Net</span><span class="tot-val">${escapeHtml(formatCurrencyInvoice(data.total, currency))}</span></div>`,
  );
  rows.push(
    `<div class="tot-block"><span class="tot-lbl" style="background:${primaryCss}">Total Acompte</span><span class="tot-val">${escapeHtml(formatCurrencyInvoice(deposit, currency))}</span></div>`,
  );
  rows.push(
    `<div class="tot-block"><span class="tot-lbl" style="background:${primaryCss}">Reste à payer</span><span class="tot-val">${escapeHtml(formatCurrencyInvoice(remaining, currency))}</span></div>`,
  );
  return `<div class="tot-wrap">${rows.join("")}</div>`;
}

function customerBlock(data: InvoiceA4Data): string {
  if (!data.customerName && !data.customerPhone && !data.customerAddress) return "";
  const inner: string[] = [`<div class="cust-title">Client</div>`];
  if (data.customerName) inner.push(`<div class="cust-line">${tx(data.customerName)}</div>`);
  if (data.customerPhone) inner.push(`<div class="cust-line">${tx(data.customerPhone)}</div>`);
  if (data.customerAddress) inner.push(`<div class="cust-line">${tx(data.customerAddress)}</div>`);
  return `<div class="cust-box">${inner.join("")}</div>`;
}

function signatureBlock(store: InvoiceA4Data["store"]): string {
  const has =
    (store.invoice_signer_title?.trim() ?? "").length > 0 ||
    (store.invoice_signer_name?.trim() ?? "").length > 0;
  if (!has) return `<div class="sig-sp"></div>`;
  const p: string[] = [];
  if (store.invoice_signer_title?.trim()) {
    p.push(`<div class="sig-t">${txUpper(store.invoice_signer_title.trim())}</div>`);
  }
  if (store.invoice_signer_name?.trim()) {
    p.push(`<div class="sig-n">${txUpper(store.invoice_signer_name.trim())}</div>`);
  }
  return `<div class="sig">${p.join("")}</div>`;
}

export function renderInvoiceA4Html(data: InvoiceA4Data): string {
  const store = data.store;
  const primaryCss = rgbTupleToCss(store.primary_color);
  const currency = store.currency ?? "XOF";
  const { r, g, b } = hexToRgb(store.primary_color);
  const headerBg = `rgb(${r}, ${g}, ${b})`;
  const { dateStr, timeStr } = formatInvoiceDateFlutter(data.date);
  const logoUrl = data.logoBytes?.length
    ? bytesToImageDataUrl(data.logoBytes)
    : null;
  const elof = isElofTemplate(store.invoice_template);
  const storeHtml = elof
    ? storeBlockElof(data, primaryCss, logoUrl)
    : storeBlockClassic(data, primaryCss, logoUrl);

  const cust = customerBlock(data);
  const amountWords = data.amountInWords?.trim()
    ? `<div class="amount-words">Montant en lettres : ${tx(data.amountInWords)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  html {
    height: 100%;
  }
  body {
    margin: 0;
    min-height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
    font-family: Helvetica, Arial, "DejaVu Sans", sans-serif;
    font-size: 11px;
    color: #000;
    padding: 32px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Feuille = zone utile ; pied de page en bas comme le footer MultiPage Flutter */
  .invoice-sheet {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 0;
  }
  .invoice-main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    min-width: 0;
  }
  .store-wrap {
    width: 100%;
    align-self: stretch;
  }
  .hdr {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 12px;
    margin-bottom: 16px;
    border-bottom: 1px solid ${primaryCss};
  }
  .hdr-l { font-size: 12px; font-weight: 700; color: ${primaryCss}; }
  .hdr-r { font-size: 10px; font-weight: 400; color: #000; }
  .sp-16 { height: 16px; font-size: 0; line-height: 0; }
  .sp-8 { height: 8px; font-size: 0; line-height: 0; }
  .st-row { display: flex; justify-content: space-between; align-items: flex-start; }
  .st-left { width: 80px; flex-shrink: 0; }
  .st-gap { width: 32px; flex-shrink: 0; }
  .st-right { flex: 1; text-align: right; min-width: 0; }
  .st-only-right { text-align: right; }
  /* Short title → SizedBox(6) → nom : 6px seulement (pas de margin-top sur .st-name) */
  .st-short { font-size: 24px; font-weight: 700; letter-spacing: 4px; margin-bottom: 6px; }
  .st-name { font-size: 19px; font-weight: 700; margin: 0; line-height: 1.2; }
  .st-slogan-classic { font-size: 12px; font-weight: 700; color: #000; margin-top: 4px; text-align: right; }
  .st-activity-classic { font-size: 12px; font-weight: 700; color: #000; margin-top: 4px; text-align: right; }
  .st-small { font-size: 11px; color: #000; text-align: right; }
  .st-small.st-center { text-align: center; }
  .st-phone { margin-top: 4px; }
  .st-mm { margin-top: 2px; }
  .st-addr { font-size: 11px; color: #000; margin-top: 4px; text-align: right; }
  .st-under-logo { font-size: 13px; font-weight: 700; margin-top: 0; text-align: left; line-height: 1.2; }
  .st-center-wrap { flex: 1; display: flex; justify-content: center; min-width: 0; }
  .st-center-inner { text-align: center; max-width: 100%; }
  .elof-letters { font-size: 28px; font-weight: 700; letter-spacing: 6px; margin-bottom: 6px; line-height: 1.1; }
  .elof-slogan { font-size: 12px; font-weight: 400; color: #000; margin-top: 4px; }
  .elof-activity { font-size: 12px; font-weight: 400; color: #000; margin-top: 4px; }
  .elof-addr { font-size: 11px; color: #000; margin-top: 6px; }
  .elof-om { color: ${ELOF_ORANGE_CSS} !important; margin-top: 2px; }
  .h-fact { font-size: 16px; font-weight: 700; margin: 0 0 8px; line-height: 1.2; }
  .date-line { font-size: 12px; margin-bottom: 20px; line-height: 1.3; }
  /* Bloc client : carte étroite à gauche (~20–25 % max), pas pleine largeur (maquette A4) */
  .cust-box {
    align-self: flex-start;
    width: fit-content;
    max-width: min(280px, 28%);
    min-width: 120px;
    box-sizing: border-box;
    border: 1px solid #000;
    border-radius: 4px;
    padding: 8px 10px;
    text-align: left;
  }
  .cust-title {
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 4px;
    text-align: left;
  }
  .cust-line {
    font-size: 11px;
    line-height: 1.35;
    text-align: left;
  }
  .inv-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0;
    table-layout: fixed;
    border: 0.4px solid #000;
  }
  .inv-table th, .inv-table td {
    border: 0.4px solid #000;
    color: #000;
  }
  /* Ligne d'en-tête : fond boutique, texte blanc gras, séparateurs noirs (maquette) */
  .inv-head th {
    padding: 6px 8px;
    font-size: 12px;
    font-weight: 700;
    vertical-align: middle;
    line-height: 1.25;
    color: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .th-h-num { text-align: center; }
  .th-h-desc { text-align: left; }
  .th-h-qty { text-align: center; }
  .th-h-unit { text-align: center; }
  .th-h-price { text-align: right; }
  .th-h-tot { text-align: right; }
  .inv-table tbody td {
    padding: 3px 6px;
    font-size: 11px;
    vertical-align: middle;
    line-height: 1.25;
  }
  .c-num { text-align: center; }
  .c-desc { text-align: left; }
  .c-qty { text-align: center; }
  .c-unit { text-align: center; }
  .c-price, .c-tot { text-align: right; }
  .tot-wrap { width: 240px; margin-left: auto; margin-top: 16px; }
  .tot-line { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; line-height: 1.25; }
  .tot-sp { height: 8px; }
  .tot-block { display: flex; margin-bottom: 2px; align-items: stretch; }
  .tot-lbl {
    width: 120px;
    padding: 6px 8px;
    color: #fff;
    font-weight: 700;
    font-size: 11px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    line-height: 1.2;
  }
  .tot-val {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #000;
    border-left: 1px solid #000;
    text-align: right;
    font-size: 11px;
    line-height: 1.25;
  }
  .amount-words { font-size: 11px; margin-top: 12px; line-height: 1.35; }
  .sig-sp { height: 32px; }
  .sig { padding-top: 48px; text-align: right; }
  .sig-t { font-size: 13px; font-weight: 400; color: #000; line-height: 1.3; }
  .sig-n { font-size: 12px; font-weight: 400; color: #000; margin-top: 4px; line-height: 1.3; }
  /* Pied de page : trait court à gauche + texte (comme maquette — pas trait pleine largeur) */
  .footer {
    flex-shrink: 0;
    width: 100%;
    align-self: stretch;
    margin-top: auto;
    text-align: left;
  }
  .footer-rule {
    width: 24%;
    max-width: 200px;
    min-width: 100px;
    border: none;
    border-top: 1px solid #000;
    margin: 0;
    padding: 0;
    height: 0;
  }
  .footer-text {
    padding-top: 8px;
    font-size: 9px;
    color: #000;
    line-height: 1.35;
    text-align: left;
  }
</style></head><body>
<div class="invoice-sheet">
  <div class="invoice-main">
  <header class="hdr">
    <div class="hdr-l">${tx(store.commercial_name ?? store.name)}</div>
    <div class="hdr-r">${tx(`Facture ${data.saleNumber} - ${dateStr} ${timeStr}`)}</div>
  </header>
  <div class="store-wrap">${storeHtml}</div>
  <div class="sp-16"></div>
  ${cust}
  <div class="sp-16"></div>
  <div class="h-fact">Facture n° ${tx(data.saleNumber)}</div>
  <div class="date-line">${tx(`Date : ${dateStr} - ${timeStr}`)}</div>
  ${buildTable(data, currency, headerBg)}
  ${totalsBlock(data, currency, primaryCss)}
  ${amountWords}
  <div style="height:72px"></div>
  ${signatureBlock(store)}
  </div>
  <footer class="footer">
    <hr class="footer-rule" />
    <div class="footer-text">${tx(store.footer_text ?? "Merci pour votre confiance.")}</div>
  </footer>
</div>
</body></html>`;
}
