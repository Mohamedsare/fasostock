/**
 * Rendu HTML facture A4 — comparaison 1:1 avec
 * `InvoiceA4PdfService.buildDocument` (`invoice_a4_pdf_service.dart`).
 */
import type { InvoiceA4Data, InvoiceLineData } from "@/lib/features/invoices/invoice-a4-types";
import {
  invoiceLayoutOfStore,
  layoutOn,
  layoutText,
  type InvoiceLayoutConfig,
} from "@/lib/features/invoices/invoice-layout";
import {
  formatCurrencyInvoice,
  formatQuantity,
  hexToRgb,
  isElofTemplate,
  isModel3Template,
  sanitizeForPdfLikeFlutter,
  stripTelPrefix,
} from "@/lib/features/invoices/invoice-a4-helpers";
import { escapeHtml } from "./escape-html";
import { bytesToImageDataUrl } from "./image-data-url";
import { TABLE_PAGINATION_CSS } from "./table-pagination-css";

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
  L: InvoiceLayoutConfig,
): string {
  const store = data.store;
  const shortTitle = (store.invoice_short_title ?? store.description)?.trim();
  const parts: string[] = [];
  if (shortTitle && layoutOn(L, "a4.shortTitle")) {
    parts.push(
      `<div class="st-short" style="color:${primaryCss}">${txUpper(shortTitle)}</div>`,
    );
  }
  parts.push(
    `<div class="st-name" style="color:${primaryCss}">${txUpper(store.commercial_name ?? store.name)}</div>`,
  );
  if (store.slogan?.trim() && layoutOn(L, "a4.slogan")) {
    for (const line of store.slogan!.trim().split("\n")) {
      if (line === "") continue;
      parts.push(
        `<div class="st-slogan-classic">${txUpper(line)}</div>`,
      );
    }
  }
  const activityStr = (store.activity ?? "").trim();
  if (activityStr && layoutOn(L, "a4.activity")) {
    for (const line of splitLinesActivity(activityStr)) {
      parts.push(`<div class="st-activity-classic">${txUpper(line)}</div>`);
    }
  }
  if (store.phone?.trim() && layoutOn(L, "a4.phone")) {
    const phone = stripTelPrefix(store.phone);
    if (phone) parts.push(`<div class="st-small st-phone">${tx(phone)}</div>`);
  }
  if (store.mobile_money?.trim() && layoutOn(L, "a4.mobileMoney")) {
    const mm = stripTelPrefix(store.mobile_money);
    if (mm) {
      parts.push(`<div class="st-small st-mm">Mobile money ${tx(mm)}</div>`);
    }
  }
  if (store.address?.trim() && layoutOn(L, "a4.address")) {
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
  L: InvoiceLayoutConfig,
): string {
  const store = data.store;
  const acronym = (store.invoice_short_title ?? "ELOF").trim().toUpperCase().replace(/\s/g, "");
  const letters =
    acronym.length >= 4 ? acronym.slice(0, 4).split("") : acronym.split("");
  const center: string[] = [];
  if (letters.length && layoutOn(L, "a4.shortTitle")) {
    center.push(
      `<div class="elof-letters" style="color:${primaryCss}">${escapeHtml(letters.join("   "))}</div>`,
    );
  }
  center.push(
    `<div class="st-name" style="color:${primaryCss}">${txUpper(store.commercial_name ?? store.name)}</div>`,
  );
  const sloganStr = (store.slogan ?? "").trim();
  if (sloganStr && layoutOn(L, "a4.slogan")) {
    for (const line of splitLinesSloganElof(sloganStr).slice(0, 2)) {
      center.push(`<div class="elof-slogan">${txUpper(line)}</div>`);
    }
  }
  const activityStr = (store.activity ?? "").trim();
  if (activityStr && layoutOn(L, "a4.activity")) {
    for (const line of splitLinesActivity(activityStr).slice(0, 2)) {
      center.push(`<div class="elof-activity">${txUpper(line)}</div>`);
    }
  }
  if (store.address?.trim() && layoutOn(L, "a4.address")) {
    center.push(`<div class="elof-addr">${tx(store.address.trim())}</div>`);
  }
  if (store.phone?.trim() && layoutOn(L, "a4.phone")) {
    const phone = stripTelPrefix(store.phone);
    if (phone) center.push(`<div class="st-small st-center st-phone">${tx(phone)}</div>`);
  }
  if (store.mobile_money?.trim() && layoutOn(L, "a4.mobileMoney")) {
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

/**
 * Colonnes du tableau d'articles. Le propriétaire peut en retirer : les largeurs
 * restantes sont alors redistribuées au prorata, sinon un tableau amputé laisserait
 * une bande blanche à droite et cesserait de ressembler à une facture. La désignation
 * n'est pas retirable (`locked`) — sans elle, le document ne dit plus ce qui est vendu.
 */
function a4Columns(currency: string): Array<{
  key: string;
  width: number;
  th: string;
  td: string;
  header: string;
  cell: (line: InvoiceLineData, index: number) => string;
}> {
  return [
    { key: "a4.colNum", width: 5.32, th: "th-h-num", td: "c-num", header: "N°", cell: (_l, i) => String(i + 1) },
    { key: "a4.colDesc", width: 42.55, th: "th-h-desc", td: "c-desc", header: "Désignation", cell: (l) => txUpper(l.description) },
    { key: "a4.colQty", width: 11.7, th: "th-h-qty", td: "c-qty", header: "Quantité", cell: (l) => escapeHtml(formatQuantity(l.quantity)) },
    { key: "a4.colUnit", width: 10.64, th: "th-h-unit", td: "c-unit", header: "Unité", cell: (l) => tx(l.unit) },
    { key: "a4.colPrice", width: 14.89, th: "th-h-price", td: "c-price", header: "Prix unit.", cell: (l) => escapeHtml(formatCurrencyInvoice(l.unitPrice, currency)) },
    { key: "a4.colTotal", width: 14.89, th: "th-h-tot", td: "c-tot", header: "Total", cell: (l) => escapeHtml(formatCurrencyInvoice(l.total, currency)) },
  ];
}

function buildTable(
  data: InvoiceA4Data,
  currency: string,
  headerBg: string,
  L: InvoiceLayoutConfig,
): string {
  const cols = a4Columns(currency).filter((c) => layoutOn(L, c.key));
  const kept = cols.reduce((n, c) => n + c.width, 0);
  const scale = kept > 0 ? 100 / kept : 1;

  /*
   * Mise en forme du HTML reproduite a l identique (retours a la ligne, indentation,
   * colonnes groupees par trois) : a colonnes completes, le document sort octet pour
   * octet comme avant que cette configuration existe. Une facture deja remise a un
   * client ne doit pas changer d un cheveu.
   */
  const rows = data.items.map((line, i) => {
    const cells = cols.map(
      (c) => `
      <td class="${c.td}">${c.cell(line, i)}</td>`,
    );
    return `<tr>${cells.join("")}
    </tr>`;
  });

  const colLines: string[] = [];
  for (let i = 0; i < cols.length; i += 3) {
    colLines.push(
      cols
        .slice(i, i + 3)
        .map((c) => `<col style="width:${(c.width * scale).toFixed(2)}%" />`)
        .join(""),
    );
  }
  const colgroup = colLines
    .map(
      (l) => `
      ${l}`,
    )
    .join("");
  const heads = cols
    .map(
      (c) => `
      <th class="${c.th}">${escapeHtml(layoutText(L, c.key, c.header))}</th>`,
    )
    .join("");

  /* Largeurs proches maquette : Designation ~42 % (Flutter _cellHeader : N centre, des. gauche, prix/tot droite) */
  return `<table class="inv-table">
    <colgroup>${colgroup}
    </colgroup>
    <thead><tr class="inv-head" style="background:${headerBg};color:#fff">${heads}
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function totalsBlock(
  data: InvoiceA4Data,
  currency: string,
  primaryCss: string,
  L: InvoiceLayoutConfig,
): string {
  const linesList = data.paymentLines;
  let encaisseImmediate = 0;
  if (linesList != null) {
    for (const pl of linesList) {
      if (pl.isImmediateEncaisse) encaisseImmediate += pl.amount;
    }
  }
  const hasLines = linesList != null && linesList.length > 0;

  let encaisseEffectif: number;
  if (hasLines) {
    encaisseEffectif = encaisseImmediate;
  } else if (data.depositAmount != null) {
    encaisseEffectif = Math.max(0, data.depositAmount);
  } else {
    encaisseEffectif = 0;
  }

  const resteDu = Math.max(0, data.total - encaisseEffectif);
  const totalPositive = data.total > 0.001;
  /*
   * Le bloc s'affiche dès qu'on CONNAÎT le règlement, même s'il vaut 0 : une
   * facture entièrement à crédit sans ligne de paiement doit dire « Reste à
   * payer », pas rester muette — sinon le client la lit comme acquittée.
   */
  const showReglement =
    totalPositive && (hasLines || data.depositAmount != null) && layoutOn(L, "a4.payments");

  let statutHtml = "";
  if (showReglement && layoutOn(L, "a4.paymentStatus")) {
    if (resteDu < 0.01) {
      statutHtml = `<div class="pay-stat">${tx("Statut : facture intégralement réglée")}</div>`;
    } else if (encaisseEffectif < 0.01) {
      statutHtml = `<div class="pay-stat">${tx("Statut : paiement à crédit — solde à régler")}</div>`;
    } else {
      statutHtml = `<div class="pay-stat">${tx("Statut : règlement partiel — solde à régler")}</div>`;
    }
    const due = data.creditDueLabel?.trim();
    if (due && resteDu >= 0.01 && layoutOn(L, "a4.creditDue")) {
      statutHtml += `<div class="pay-due">${tx(`Solde à régler avant le ${due}`)}</div>`;
    }
  }

  const rows: string[] = [];
  if (data.discount > 0 && layoutOn(L, "a4.subtotal")) {
    rows.push(
      `<div class="tot-line"><span>${escapeHtml(layoutText(L, "a4.subtotal", "Sous-total"))}</span><span>${escapeHtml(formatCurrencyInvoice(data.subtotal, currency))}</span></div>`,
    );
  }
  if (data.discount > 0 && layoutOn(L, "a4.discount")) {
    rows.push(
      `<div class="tot-line"><span>${escapeHtml(layoutText(L, "a4.discount", "Remise"))}</span><span>${escapeHtml(formatCurrencyInvoice(-data.discount, currency))}</span></div>`,
    );
  }
  if (data.tax > 0 && layoutOn(L, "a4.tax")) {
    rows.push(
      `<div class="tot-line"><span>${escapeHtml(layoutText(L, "a4.tax", "TVA"))}</span><span>${escapeHtml(formatCurrencyInvoice(data.tax, currency))}</span></div>`,
    );
  }
  rows.push(`<div class="tot-sp"></div>`);
  const totalLabel = layoutText(
    L,
    "a4.total",
    data.tax > 0 ? "Montant total TTC" : "Montant total",
  );
  rows.push(
    `<div class="tot-block"><span class="tot-lbl" style="background:${primaryCss}">${escapeHtml(totalLabel)}</span><span class="tot-val">${escapeHtml(formatCurrencyInvoice(data.total, currency))}</span></div>`,
  );

  if (showReglement) {
    rows.push(`<div class="tot-pay-sep"></div>`);
    rows.push(
      `<div class="pay-title" style="color:${primaryCss}">${tx(layoutText(L, "a4.payments", "Règlement"))}</div>`,
    );
    rows.push(`<div class="tot-sp-sm"></div>`);
    if (linesList != null && linesList.length > 0) {
      for (const pl of linesList) {
        rows.push(
          `<div class="tot-line"><span>${tx(pl.label)}</span><span>${escapeHtml(formatCurrencyInvoice(pl.amount, currency))}</span></div>`,
        );
      }
    } else if (data.depositAmount != null && encaisseEffectif >= 0.01) {
      // Rien d'encaissé : la ligne de détail répéterait « Total encaissé 0 ».
      rows.push(
        `<div class="tot-line"><span>Montant encaissé</span><span>${escapeHtml(formatCurrencyInvoice(encaisseEffectif, currency))}</span></div>`,
      );
    }
    rows.push(`<div class="tot-sp-sm"></div>`);
    rows.push(
      `<div class="tot-block"><span class="tot-lbl" style="background:${primaryCss}">Total encaissé</span><span class="tot-val">${escapeHtml(formatCurrencyInvoice(encaisseEffectif, currency))}</span></div>`,
    );
    rows.push(
      `<div class="tot-block"><span class="tot-lbl" style="background:${primaryCss}">Reste à payer</span><span class="tot-val">${escapeHtml(formatCurrencyInvoice(resteDu, currency))}</span></div>`,
    );
    if (statutHtml) rows.push(statutHtml);
  }

  return `<div class="tot-wrap no-break">${rows.join("")}</div>`;
}

function customerBlock(data: InvoiceA4Data, L: InvoiceLayoutConfig): string {
  if (!layoutOn(L, "a4.customer")) return "";
  if (!data.customerName && !data.customerPhone && !data.customerAddress) return "";
  const inner: string[] = [
    `<div class="cust-title">${escapeHtml(layoutText(L, "a4.customer", "Client"))}</div>`,
  ];
  if (data.customerName) inner.push(`<div class="cust-line">${tx(data.customerName)}</div>`);
  if (data.customerPhone) inner.push(`<div class="cust-line">${tx(data.customerPhone)}</div>`);
  if (data.customerAddress) inner.push(`<div class="cust-line">${tx(data.customerAddress)}</div>`);
  return `<div class="cust-box">${inner.join("")}</div>`;
}

function signatureBlock(store: InvoiceA4Data["store"], L: InvoiceLayoutConfig): string {
  if (!layoutOn(L, "a4.signature")) return `<div class="sig-sp"></div>`;
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
  if (isModel3Template(data.store.invoice_template)) {
    return renderInvoiceA4Model3Html(data);
  }
  const store = data.store;
  const primaryCss = rgbTupleToCss(store.primary_color);
  const currency = store.currency ?? "XOF";
  const { r, g, b } = hexToRgb(store.primary_color);
  const headerBg = `rgb(${r}, ${g}, ${b})`;
  const L = invoiceLayoutOfStore(store);
  const { dateStr, timeStr } = formatInvoiceDateFlutter(data.date);
  const logoUrl =
    data.logoBytes?.length && layoutOn(L, "a4.logo")
      ? bytesToImageDataUrl(data.logoBytes)
      : null;
  const elof = isElofTemplate(store.invoice_template);
  const storeHtml = elof
    ? storeBlockElof(data, primaryCss, logoUrl, L)
    : storeBlockClassic(data, primaryCss, logoUrl, L);

  const cust = customerBlock(data, L);
  const amountWords =
    data.amountInWords?.trim() && layoutOn(L, "a4.amountWords")
      ? `<div class="amount-words">Montant en lettres : ${tx(data.amountInWords)}</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
${TABLE_PAGINATION_CSS}
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
  .tot-wrap { width: 280px; margin-left: auto; margin-top: 16px; }
  .tot-line { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; line-height: 1.25; }
  .tot-sp { height: 8px; }
  .tot-sp-sm { height: 6px; font-size: 0; line-height: 0; }
  .tot-pay-sep { height: 10px; }
  .pay-title { font-size: 11px; font-weight: 700; margin: 0; line-height: 1.2; }
  .pay-stat { font-size: 10px; font-style: italic; color: #424242; margin-top: 4px; line-height: 1.3; }
  /* Échéance du solde : en noir et en gras, c'est un engagement, pas une note. */
  .pay-due { font-size: 10px; font-weight: 700; color: #000; margin-top: 2px; line-height: 1.3; }
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
    /* Conditions de vente sur plusieurs lignes, si le propriétaire en met. */
    white-space: pre-line;
  }
</style></head><body>
<div class="invoice-sheet">
  <div class="invoice-main">
  ${
    layoutOn(L, "a4.headerBar")
      ? `<header class="hdr">
    <div class="hdr-l">${tx(store.commercial_name ?? store.name)}</div>
    <div class="hdr-r">${tx(`Facture ${data.saleNumber} - ${dateStr} ${timeStr}`)}</div>
  </header>`
      : ""
  }
  <div class="store-wrap">${storeHtml}</div>
  <div class="sp-16"></div>
  ${cust}
  <div class="sp-16"></div>
  ${
    layoutOn(L, "a4.invoiceNumber")
      ? `<div class="h-fact">${escapeHtml(layoutText(L, "a4.invoiceNumber", "Facture n°"))} ${tx(data.saleNumber)}</div>`
      : ""
  }
  ${
    layoutOn(L, "a4.date")
      ? `<div class="date-line">${tx(`${layoutText(L, "a4.date", "Date")} : ${dateStr} - ${timeStr}`)}</div>`
      : ""
  }
  ${buildTable(data, currency, headerBg, L)}
  ${totalsBlock(data, currency, primaryCss, L)}
  ${amountWords}
  <div style="height:72px"></div>
  ${signatureBlock(store, L)}
  </div>
  ${
    layoutOn(L, "a4.footer")
      ? `<footer class="footer">
    <hr class="footer-rule" />
    <div class="footer-text">${tx(layoutText(L, "a4.footer", store.footer_text ?? "Merci pour votre confiance."))}</div>
  </footer>`
      : ""
  }
</div>
</body></html>`;
}

/* ─────────────────────────── Modèle 3 (classique Burkina) ─────────────────────────── */

const MODEL3_MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Date longue « le 09 Janvier 2026 » (heure locale, comme le reste du PDF). */
function formatLongDateFr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `le ${pad(d.getDate())} ${MODEL3_MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

/** Nombre groupé par milliers avec espace (ex. 4 598 500), sans symbole devise. */
function groupThousands(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return neg ? `-${s}` : s;
}

function model3HeaderLines(store: InvoiceA4Data["store"], L: InvoiceLayoutConfig): string[] {
  const lines: string[] = [];
  const slogan = (store.slogan ?? "").trim();
  if (slogan && layoutOn(L, "a4.slogan")) {
    for (const l of slogan.split(/\r\n|\n|\r/)) {
      if (l.trim()) lines.push(`<div class="m3-sub">${tx(l.trim())}</div>`);
    }
  }
  const activity = (store.activity ?? "").trim();
  if (activity && layoutOn(L, "a4.activity")) {
    for (const l of activity.split(/\r\n|\n|\r/)) {
      if (l.trim()) lines.push(`<div class="m3-sub">${tx(l.trim())}</div>`);
    }
  }
  if (store.phone?.trim() && layoutOn(L, "a4.phone")) {
    const phone = stripTelPrefix(store.phone);
    if (phone) lines.push(`<div class="m3-contact">Tél : ${tx(phone)}</div>`);
  }
  if (store.mobile_money?.trim() && layoutOn(L, "a4.mobileMoney")) {
    const mm = stripTelPrefix(store.mobile_money);
    if (mm) lines.push(`<div class="m3-contact">Mobile money ${tx(mm)}</div>`);
  }
  if (store.address?.trim() && layoutOn(L, "a4.address")) {
    lines.push(`<div class="m3-contact">${tx(store.address.trim())}</div>`);
  }
  if (store.city?.trim() && layoutOn(L, "a4.address")) {
    lines.push(`<div class="m3-contact">${tx(store.city.trim())}</div>`);
  }
  if (store.country?.trim() && layoutOn(L, "a4.address")) {
    lines.push(`<div class="m3-contact">${tx(store.country.trim())}</div>`);
  }
  return lines;
}

/** Bloc « DOIT : … » (client destinataire de la facture). */
function model3DoitBlock(data: InvoiceA4Data, L: InvoiceLayoutConfig): string {
  if (!layoutOn(L, "a4.customer")) return "";
  if (!data.customerName && !data.customerPhone && !data.customerAddress) return "";
  const parts: string[] = [];
  if (data.customerName) {
    parts.push(`<span class="m3-doit-name">${txUpper(data.customerName)}</span>`);
  }
  const extra: string[] = [];
  if (data.customerPhone) extra.push(tx(data.customerPhone));
  if (data.customerAddress) extra.push(tx(data.customerAddress));
  const extraHtml = extra.length ? `<div class="m3-doit-extra">${extra.join(" — ")}</div>` : "";
  return `<div class="m3-doit"><span class="m3-doit-lbl">${escapeHtml(layoutText(L, "a4.customer", "DOIT"))} :</span> ${parts.join("")}${extraHtml}</div>`;
}

function model3Table(data: InvoiceA4Data, currency: string, L: InvoiceLayoutConfig): string {
  /*
   * Sous-total / remise / TVA : sans ces lignes, le TOTAL ne correspond pas à la
   * somme de la colonne « P. Total » et le client conteste la facture.
   */
  const adjustments: string[] = [];
  if (data.discount > 0 && layoutOn(L, "a4.subtotal")) {
    adjustments.push(
      `<tr class="m3-adj-row">
        <td class="m3-adj-lbl" colspan="3">${escapeHtml(layoutText(L, "a4.subtotal", "Sous-total"))}</td>
        <td class="m3-adj-val">${escapeHtml(formatCurrencyInvoice(data.subtotal, currency))}</td>
      </tr>`,
      `<tr class="m3-adj-row">
        <td class="m3-adj-lbl" colspan="3">Remise</td>
        <td class="m3-adj-val">${escapeHtml(formatCurrencyInvoice(-data.discount, currency))}</td>
      </tr>`,
    );
  }
  if (data.tax > 0) {
    adjustments.push(
      `<tr class="m3-adj-row">
        <td class="m3-adj-lbl" colspan="3">TVA</td>
        <td class="m3-adj-val">${escapeHtml(formatCurrencyInvoice(data.tax, currency))}</td>
      </tr>`,
    );
  }
  const totalLabel = data.tax > 0 ? "TOTAL TTC" : "TOTAL";
  const rows = data.items.map((line) => {
    const qty = formatQuantity(line.quantity);
    return `<tr>
      <td class="m3-c-desc">${txUpper(line.description)}</td>
      <td class="m3-c-qty">${escapeHtml(qty)}</td>
      <td class="m3-c-price">${escapeHtml(formatCurrencyInvoice(line.unitPrice, currency))}</td>
      <td class="m3-c-tot">${escapeHtml(formatCurrencyInvoice(line.total, currency))}</td>
    </tr>`;
  });
  return `<table class="m3-table">
    <colgroup>
      <col style="width:52%" /><col style="width:12%" /><col style="width:18%" /><col style="width:18%" />
    </colgroup>
    <thead><tr class="m3-head">
      <th class="m3-h-desc">Désignation</th>
      <th class="m3-h-qty">Qté</th>
      <th class="m3-h-price">P. Unitaire</th>
      <th class="m3-h-tot">P. Total</th>
    </tr></thead>
    <tbody>
      ${rows.join("")}
      ${adjustments.join("")}
      <tr class="m3-total-row">
        <td class="m3-total-lbl" colspan="3">${escapeHtml(totalLabel)}</td>
        <td class="m3-total-val">${escapeHtml(formatCurrencyInvoice(data.total, currency))}</td>
      </tr>
    </tbody>
  </table>`;
}

/** Règlement compact (encaissé / reste), aligné sur la logique de `totalsBlock`. */
function model3Reglement(data: InvoiceA4Data, currency: string, L: InvoiceLayoutConfig): string {
  const linesList = data.paymentLines;
  let encaisseImmediate = 0;
  if (linesList != null) {
    for (const pl of linesList) if (pl.isImmediateEncaisse) encaisseImmediate += pl.amount;
  }
  const hasLines = linesList != null && linesList.length > 0;
  let encaisseEffectif: number;
  if (hasLines) encaisseEffectif = encaisseImmediate;
  else if (data.depositAmount != null) encaisseEffectif = Math.max(0, data.depositAmount);
  else encaisseEffectif = 0;

  const resteDu = Math.max(0, data.total - encaisseEffectif);
  const totalPositive = data.total > 0.001;
  // Même règle que `totalsBlock` : un règlement connu s'affiche, fût-il nul.
  const showReglement =
    totalPositive && (hasLines || data.depositAmount != null) && layoutOn(L, "a4.payments");
  if (!showReglement) return "";

  const rows: string[] = [
    `<div class="m3-reg-title">${escapeHtml(layoutText(L, "a4.payments", "RÈGLEMENT").toUpperCase())}</div>`,
  ];
  if (linesList != null && linesList.length > 0) {
    for (const pl of linesList) {
      rows.push(
        `<div class="m3-reg-line"><span>${tx(pl.label)}</span><span>${escapeHtml(formatCurrencyInvoice(pl.amount, currency))}</span></div>`,
      );
    }
  }
  rows.push(
    `<div class="m3-reg-line m3-reg-strong"><span>Total encaissé</span><span>${escapeHtml(formatCurrencyInvoice(encaisseEffectif, currency))}</span></div>`,
  );
  rows.push(
    `<div class="m3-reg-line m3-reg-strong"><span>Reste à payer</span><span>${escapeHtml(formatCurrencyInvoice(resteDu, currency))}</span></div>`,
  );
  let statut: string;
  if (resteDu < 0.01) statut = "Facture intégralement réglée";
  else if (encaisseEffectif < 0.01) statut = "Paiement à crédit — solde à régler";
  else statut = "Règlement partiel — solde à régler";
  rows.push(`<div class="m3-reg-stat">${tx("Statut : " + statut)}</div>`);
  const due = data.creditDueLabel?.trim();
  if (due && resteDu >= 0.01) {
    rows.push(`<div class="m3-reg-due">${tx(`Solde à régler avant le ${due}`)}</div>`);
  }
  return `<div class="m3-reg no-break">${rows.join("")}</div>`;
}

export function renderInvoiceA4Model3Html(data: InvoiceA4Data): string {
  const store = data.store;
  const L = invoiceLayoutOfStore(store);
  const currency = store.currency ?? "XOF";
  // Modèle 3 : en-tête texte uniquement, sans logo (volontaire).
  const storeTitle = store.commercial_name ?? store.name;

  const headerLines = model3HeaderLines(store, L);
  const cityForDate = store.city?.trim() || store.address?.trim() || "";
  const dateLong = formatLongDateFr(data.date);
  const dateLineText = cityForDate ? `${cityForDate}, ${dateLong}` : dateLong;

  const doit = model3DoitBlock(data, L);

  const words = data.amountInWords?.trim();
  const amountLine = words
    ? `Arrêtée la présente facture à la somme de : ${tx(words)} (${escapeHtml(groupThousands(data.total))}) Francs CFA.`
    : `Arrêtée la présente facture à la somme de : ${escapeHtml(groupThousands(data.total))} Francs CFA.`;

  const signerTitle = store.invoice_signer_title?.trim() || "Le Responsable";
  const signerName = store.invoice_signer_name?.trim() ?? "";

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
${TABLE_PAGINATION_CSS}
  * { box-sizing: border-box; }
  html { height: 100%; }
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
  .m3-sheet { flex: 1 1 auto; display: flex; flex-direction: column; width: 100%; min-height: 0; }
  .m3-main { flex: 1 1 auto; display: flex; flex-direction: column; width: 100%; }
  /* En-tête centré */
  .m3-header { text-align: center; }
  .m3-name { font-size: 30px; font-weight: 800; letter-spacing: 1px; line-height: 1.1; }
  .m3-sub { font-size: 12px; font-weight: 700; margin-top: 2px; }
  .m3-contact { font-size: 11px; margin-top: 1px; }
  .m3-hr { border: none; border-top: 2px solid #000; margin: 10px 0 2px; height: 0; }
  .m3-hr-thin { border: none; border-top: 1px solid #000; margin: 0 0 14px; height: 0; }
  /* Date + titre */
  .m3-date { text-align: right; font-size: 12px; margin-bottom: 14px; }
  .m3-title { text-align: center; font-size: 15px; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; margin-bottom: 14px; }
  .m3-doit { font-size: 13px; margin-bottom: 12px; }
  .m3-doit-lbl { font-weight: 800; text-decoration: underline; }
  .m3-doit-name { font-weight: 700; }
  .m3-doit-extra { font-size: 11px; margin-top: 2px; }
  /* Tableau 4 colonnes, noir & blanc */
  .m3-table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #000; }
  .m3-table th, .m3-table td { border: 1px solid #000; padding: 5px 8px; font-size: 12px; vertical-align: middle; line-height: 1.25; }
  .m3-head th { background: #d9d9d9; font-weight: 700; }
  .m3-h-desc { text-align: left; }
  .m3-h-qty { text-align: center; }
  .m3-h-price, .m3-h-tot { text-align: right; }
  .m3-c-desc { text-align: left; }
  .m3-c-qty { text-align: center; }
  .m3-c-price, .m3-c-tot { text-align: right; }
  .m3-total-row td { background: #d9d9d9; font-weight: 800; font-size: 13px; }
  .m3-total-lbl { text-align: center; letter-spacing: 2px; }
  .m3-total-val { text-align: right; }
  .m3-adj-row td { font-size: 12px; }
  .m3-adj-lbl { text-align: right; font-weight: 700; }
  .m3-adj-val { text-align: right; }
  .m3-amount { font-size: 12px; font-weight: 700; margin-top: 12px; line-height: 1.4; }
  /* Règlement compact à droite */
  .m3-reg { width: 260px; margin-left: auto; margin-top: 12px; }
  .m3-reg-line { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; }
  .m3-reg-strong { font-weight: 700; border-top: 1px solid #000; margin-top: 2px; padding-top: 4px; }
  .m3-reg-title { font-size: 12px; font-weight: 800; text-decoration: underline; text-underline-offset: 2px; margin-bottom: 4px; }
  .m3-reg-stat { font-size: 10px; font-style: italic; color: #424242; margin-top: 4px; }
  .m3-reg-due { font-size: 10px; font-weight: 700; color: #000; margin-top: 2px; }
  /* Signature */
  .m3-sign { text-align: right; margin-top: 40px; }
  .m3-sign-title { font-size: 13px; font-weight: 700; text-decoration: underline; }
  .m3-sign-name { font-size: 12px; margin-top: 4px; }
  .m3-sign-space { height: 64px; }
  /* Pied de page */
  .m3-footer { flex-shrink: 0; width: 100%; margin-top: auto; text-align: center; }
  .m3-footer-hr { border: none; border-top: 1px solid #000; margin: 0 0 6px; height: 0; }
  .m3-footer-text { font-size: 9px; line-height: 1.35; white-space: pre-line; }
</style></head><body>
<div class="m3-sheet">
  <div class="m3-main">
    <div class="m3-header">
      <div class="m3-name">${txUpper(storeTitle)}</div>
      ${headerLines.join("")}
    </div>
    <hr class="m3-hr" />
    <hr class="m3-hr-thin" />
    ${layoutOn(L, "a4.date") ? `<div class="m3-date">${tx(dateLineText)}</div>` : ""}
    ${
      layoutOn(L, "a4.invoiceNumber")
        ? `<div class="m3-title">${escapeHtml(layoutText(L, "a4.invoiceNumber", "FACTURE N°").toUpperCase())} ${tx(data.saleNumber)}</div>`
        : ""
    }
    ${doit}
    ${model3Table(data, currency, L)}
    ${model3Reglement(data, currency, L)}
    ${layoutOn(L, "a4.amountWords") ? `<div class="m3-amount">${amountLine}</div>` : ""}
    <div class="m3-sign no-break">
      ${layoutOn(L, "a4.signature") ? `<div class="m3-sign-title">${txUpper(signerTitle)}</div>` : ""}
      ${signerName && layoutOn(L, "a4.signature") ? `<div class="m3-sign-name">${txUpper(signerName)}</div>` : ""}
      <div class="m3-sign-space"></div>
    </div>
  </div>
  ${
    layoutOn(L, "a4.footer")
      ? `<footer class="m3-footer">
    <hr class="m3-footer-hr" />
    <div class="m3-footer-text">${tx(layoutText(L, "a4.footer", store.footer_text ?? "Merci pour votre confiance."))}</div>
  </footer>`
      : ""
  }
</div>
</body></html>`;
}
