import { escapeHtml } from "@/lib/server/pdf/escape-html";
import { formatCurrencyFlutter } from "@/lib/utils/currency";
import { amountToFrenchWords } from "@/lib/utils/number-to-french-words";
import type { SaleDocumentPdfData } from "@/lib/features/sale-documents/pdf-types";

/**
 * Devis / facture A4.
 *
 * C'est le papier qui part chez le client — souvent une administration ou une
 * entreprise, qui le lira à côté de trois autres propositions. Il porte donc tout ce
 * qu'un acheteur professionnel cherche avant de signer : l'objet, sa référence de
 * commande, le détail ligne à ligne avec les remises consenties, la TVA le cas
 * échéant, le total en toutes lettres (qui fait foi en cas de rature) et la durée
 * de validité de l'offre.
 *
 * La mention la plus importante est celle qui distingue les deux documents : un
 * DEVIS n'engage à rien tant qu'il n'est pas accepté, une facture PROFORMA n'est pas
 * encore une facture. Les taire ferait croire à un client qu'il doit payer.
 */
export type SaleDocumentRenderInput = SaleDocumentPdfData & {
  /** Logo embarqué en data URL (aucun téléchargement réseau au rendu). */
  logoDataUrl: string | null;
  /** Dates déjà formatées en français — le serveur PDF n'a pas de locale ambiante. */
  issueDateLabel: string;
  validUntilLabel: string | null;
  dueDateLabel: string | null;
};

function money(n: number, currency: string | null): string {
  return formatCurrencyFlutter(n, currency);
}

function safeColor(raw: string | null): string {
  const v = (raw ?? "").trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return "#1D4ED8";
}

function kv(label: string, value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  return `<div class="kv"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(v)}</span></div>`;
}

/** Quantité : entière quand elle l'est (« 3 »), décimale sinon (« 2,5 »). */
function qtyLabel(q: number): string {
  return Number.isInteger(q) ? String(q) : String(q).replace(".", ",");
}

export function renderSaleDocumentHtml(data: SaleDocumentRenderInput): string {
  const primary = safeColor(data.storePrimaryColor);
  const currency = data.currencyCode;
  const isQuote = data.kind === "quote";
  const isIssued = data.status === "issued";

  const docTitle = isQuote ? "DEVIS" : isIssued ? "FACTURE" : "FACTURE PROFORMA";

  const rows = data.lines
    .map(
      (l, i) => `
      <tr>
        <td class="c-idx">${i + 1}</td>
        <td class="c-lbl">
          <div class="lbl">${escapeHtml(l.label)}</div>
          ${l.description ? `<div class="desc">${escapeHtml(l.description)}</div>` : ""}
        </td>
        <td class="c-qty">${escapeHtml(qtyLabel(l.quantity))}</td>
        <td class="c-unit">${escapeHtml(l.unit)}</td>
        <td class="c-pu">${escapeHtml(money(l.unitPrice, currency))}</td>
        <td class="c-rem">${l.discountPercent > 0 ? `${escapeHtml(qtyLabel(l.discountPercent))} %` : "—"}</td>
        <td class="c-tot">${escapeHtml(money(l.total, currency))}</td>
      </tr>`,
    )
    .join("");

  const emptyRow = `<tr><td class="c-empty" colspan="7">Aucune ligne sur ce document.</td></tr>`;

  const logoHtml = data.logoDataUrl
    ? `<img class="logo" src="${escapeHtml(data.logoDataUrl)}" alt="" />`
    : "";

  const contact = [
    data.storeAddress,
    data.storePhone ? `Tél. ${data.storePhone}` : null,
    data.storeTaxNumber ? `IFU / RCCM : ${data.storeTaxNumber}` : null,
  ]
    .filter(Boolean)
    .map((l) => `<div>${escapeHtml(String(l))}</div>`)
    .join("");

  // Ce que le lecteur doit comprendre en un coup d'œil sur la nature du papier.
  const disclaimer = isQuote
    ? `<b>Ce document est un devis.</b> Il n'engage ni livraison, ni facturation : les
       ${data.lines.length > 1 ? "articles et prestations" : "prestations"} n'y sont ni
       réservés ni déstockés. Il devient une commande lorsque vous nous le retournez
       signé${data.validUntilLabel ? `, au plus tard le ${escapeHtml(data.validUntilLabel)}` : ""}.`
    : isIssued
      ? `<b>Facture définitive.</b> Elle correspond à une vente enregistrée : la
         marchandise est sortie de nos stocks et le règlement, s'il reste un solde, est
         attendu à l'échéance indiquée.`
      : `<b>Facture proforma.</b> Elle vous permet d'engager votre dépense ou de préparer
         votre règlement. Elle n'est pas encore une facture définitive : la vente ne sera
         enregistrée qu'à son émission.`;

  const remaining = Math.max(0, data.total - data.paidAmount);

  const totalsRows = [
    `<div class="t-line"><span>Montant hors remise</span><span>${escapeHtml(money(data.subtotal, currency))}</span></div>`,
    data.discount > 0
      ? `<div class="t-line t-disc"><span>Remise accordée</span><span>− ${escapeHtml(money(data.discount, currency))}</span></div>`
      : "",
    data.taxRate > 0
      ? `<div class="t-line"><span>TVA ${escapeHtml(qtyLabel(data.taxRate))} %</span><span>${escapeHtml(money(data.tax, currency))}</span></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  // Le règlement ne s'affiche que sur une facture émise : sur un devis, parler
  // d'« encaissé » n'aurait aucun sens et inquiéterait le client.
  const paymentRows =
    isIssued && !isQuote
      ? `<div class="t-line"><span>Déjà réglé</span><span>${escapeHtml(money(data.paidAmount, currency))}</span></div>
         <div class="t-line ${remaining > 0 ? "t-rest" : "t-ok"}">
           <span>${remaining > 0 ? "Reste à payer" : "Soldé"}</span>
           <span>${escapeHtml(money(remaining, currency))}</span>
         </div>`
      : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 0; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2937; font-size: 12px; }
  .page { width: 210mm; min-height: 297mm; padding: 12mm 12mm 8mm; display: flex; flex-direction: column; }

  .hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 3px solid ${primary}; padding-bottom: 10px; }
  .seller { display: flex; align-items: center; gap: 12px; }
  .logo { max-width: 78px; max-height: 58px; object-fit: contain; }
  .seller-name { font-size: 20px; font-weight: 800; color: ${primary}; }
  .seller-sub { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #374151; margin-top: 2px; }
  .seller-slogan { font-size: 10.5px; color: #6b7280; margin-top: 1px; }
  .seller-contact { font-size: 10.5px; color: #4b5563; line-height: 1.45; margin-top: 4px; }

  .doc { text-align: right; min-width: 200px; }
  .doc-title { display: inline-block; background: ${primary}; color: #fff; font-size: 16px; font-weight: 800; letter-spacing: 1.5px; padding: 7px 16px; border-radius: 4px; }
  .doc-meta { margin-top: 8px; font-size: 11px; color: #374151; line-height: 1.6; }
  .doc-meta b { color: #111827; }

  .subject { margin-top: 12px; border-left: 5px solid ${primary}; background: #f8fafc; padding: 7px 11px; font-size: 12px; }
  .subject .k { font-weight: 800; text-transform: uppercase; font-size: 10.5px; letter-spacing: .4px; color: #4b5563; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .card { border: 1px solid #e5e7eb; border-radius: 5px; overflow: hidden; }
  .card-h { background: #f3f4f6; border-left: 5px solid ${primary}; padding: 7px 11px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
  .card-b { padding: 9px 11px; }
  .kv { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 11.5px; border-bottom: 1px dashed #f1f1f1; }
  .kv:last-child { border-bottom: 0; }
  .kv .k { color: #4b5563; font-weight: 700; }
  .kv .v { text-align: right; color: #111827; }

  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  thead th { background: ${primary}; color: #fff; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; padding: 8px 8px; text-align: left; }
  tbody td { border-bottom: 1px solid #eef0f2; padding: 7px 8px; font-size: 11.5px; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .c-idx { width: 24px; color: #9ca3af; }
  .lbl { font-weight: 600; color: #111827; }
  .desc { font-size: 10px; color: #6b7280; margin-top: 2px; line-height: 1.4; }
  .c-qty { width: 50px; text-align: center; font-weight: 700; }
  .c-unit { width: 46px; text-align: center; color: #6b7280; }
  .c-pu, .c-tot { width: 100px; text-align: right; white-space: nowrap; }
  .c-rem { width: 56px; text-align: center; color: #6b7280; }
  .c-tot { font-weight: 700; }
  .c-empty { text-align: center; color: #9ca3af; font-style: italic; padding: 18px 0; }

  .bottom { display: grid; grid-template-columns: 1fr 300px; gap: 12px; margin-top: 12px; }
  .totals { border: 1px solid #e5e7eb; border-radius: 5px; overflow: hidden; }
  .t-line { display: flex; justify-content: space-between; gap: 10px; padding: 7px 11px; font-size: 12px; border-bottom: 1px solid #f1f1f1; }
  .t-line span:last-child { font-weight: 700; white-space: nowrap; }
  .t-disc { color: #9a3412; }
  .t-total { background: ${primary}; color: #fff; font-size: 14px; font-weight: 800; padding: 10px 11px; display: flex; justify-content: space-between; gap: 10px; }
  .t-rest { background: #fff7ed; color: #9a3412; font-weight: 800; }
  .t-ok { background: #ecfdf5; color: #065f46; font-weight: 800; }
  .words { font-size: 11px; color: #374151; padding: 8px 11px; background: #f9fafb; border-top: 1px solid #f1f1f1; }

  .note { font-size: 10.5px; line-height: 1.5; color: #4b5563; }
  .note b { color: #111827; }
  .terms { margin-top: 6px; font-size: 10px; line-height: 1.5; color: #6b7280; white-space: pre-line; }
  .sign { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sign-box { border: 1px solid #e5e7eb; border-radius: 5px; padding: 8px 11px; }
  .sign-lbl { font-size: 10.5px; font-weight: 700; color: #4b5563; }
  .sign-space { height: 54px; }

  .foot { margin-top: auto; padding-top: 10px; text-align: center; font-size: 10.5px; color: #6b7280; }
  .foot .bar { background: ${primary}; color: #fff; border-radius: 4px; padding: 7px 12px; font-weight: 700; font-size: 11px; }
  .foot .legal { margin-top: 5px; font-size: 9.5px; color: #9ca3af; }
</style></head>
<body>
  <div class="page">
    <div class="hdr">
      <div class="seller">
        ${logoHtml}
        <div>
          <div class="seller-name">${escapeHtml(data.storeName || data.companyName)}</div>
          ${data.storeActivity ? `<div class="seller-sub">${escapeHtml(data.storeActivity)}</div>` : ""}
          ${data.storeSlogan ? `<div class="seller-slogan">${escapeHtml(data.storeSlogan)}</div>` : ""}
          <div class="seller-contact">${contact}</div>
        </div>
      </div>
      <div class="doc">
        <div class="doc-title">${escapeHtml(docTitle)}</div>
        <div class="doc-meta">
          <div>N° <b>${escapeHtml(data.number)}</b></div>
          <div>Du <b>${escapeHtml(data.issueDateLabel)}</b></div>
          ${
            isQuote && data.validUntilLabel
              ? `<div>Valable jusqu'au <b>${escapeHtml(data.validUntilLabel)}</b></div>`
              : ""
          }
          ${
            !isQuote && data.dueDateLabel
              ? `<div>À régler avant le <b>${escapeHtml(data.dueDateLabel)}</b></div>`
              : ""
          }
          ${
            data.sourceDocumentNumber
              ? `<div>Suite au devis <b>${escapeHtml(data.sourceDocumentNumber)}</b></div>`
              : ""
          }
        </div>
      </div>
    </div>

    ${
      data.subject
        ? `<div class="subject"><span class="k">Objet</span> — ${escapeHtml(data.subject)}</div>`
        : ""
    }

    <div class="grid">
      <div class="card">
        <div class="card-h">${isQuote ? "Devis établi pour" : "Facturé à"}</div>
        <div class="card-b">
          ${kv("Nom", data.customerName)}
          ${kv("Téléphone", data.customerPhone)}
          ${kv("E-mail", data.customerEmail)}
          ${kv("Adresse", data.customerAddress)}
          ${kv("IFU / RCCM", data.customerTaxId)}
        </div>
      </div>
      <div class="card">
        <div class="card-h">Références</div>
        <div class="card-b">
          ${kv(isQuote ? "N° de devis" : "N° de facture", data.number)}
          ${kv("Votre référence", data.clientReference)}
          ${kv("Établi par", data.authorName)}
          ${kv("Conditions de règlement", data.storePaymentTerms)}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Désignation</th>
          <th style="text-align:center">Qté</th>
          <th style="text-align:center">Unité</th>
          <th style="text-align:right">Prix unitaire</th>
          <th style="text-align:center">Remise</th>
          <th style="text-align:right">Montant</th>
        </tr>
      </thead>
      <tbody>${rows || emptyRow}</tbody>
    </table>

    <div class="bottom">
      <div>
        <p class="note">${disclaimer}</p>
        ${data.notes ? `<p class="note" style="margin-top:6px">${escapeHtml(data.notes)}</p>` : ""}
        ${data.terms ? `<div class="terms">${escapeHtml(data.terms)}</div>` : ""}
        <div class="sign">
          <div class="sign-box">
            <div class="sign-lbl">${isQuote ? "Le client (bon pour accord)" : "Le client"}</div>
            <div class="sign-space"></div>
          </div>
          <div class="sign-box">
            <div class="sign-lbl">${escapeHtml(
              data.signerTitle || (data.signerName ? "" : "Le responsable"),
            )}${data.signerName ? ` ${escapeHtml(data.signerName)}` : ""}</div>
            <div class="sign-space"></div>
          </div>
        </div>
      </div>

      <div class="totals">
        ${totalsRows}
        <div class="t-total"><span>${isQuote ? "TOTAL DEVIS" : "NET À PAYER"}</span><span>${escapeHtml(money(data.total, currency))}</span></div>
        ${paymentRows}
        <div class="words">Arrêté${isQuote ? "" : "e"} le présent ${isQuote ? "devis" : "document"} à la somme de :<br /><b>${escapeHtml(
          amountToFrenchWords(data.total, currency),
        )}</b></div>
      </div>
    </div>

    <div class="foot">
      <div class="bar">${escapeHtml(data.storeFooterText || "Merci pour votre confiance.")}</div>
      ${data.storeLegalInfo ? `<div class="legal">${escapeHtml(data.storeLegalInfo)}</div>` : ""}
    </div>
  </div>
</body></html>`;
}
