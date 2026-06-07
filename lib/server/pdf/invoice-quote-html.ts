import { escapeHtml } from "@/lib/server/pdf/escape-html";
import {
  computeTotals,
  docLabels,
  formatDateFr,
  formatMoney,
  hasConversion,
  lineTotal,
  type FdDocument,
} from "@/lib/tools/invoice-quote";

const ACCENT = "#E85D2C";

/** Image data URL sûre pour <img> (sinon rien). */
function safeImg(src: string | null): string {
  return src && /^data:image\//.test(src) ? src : "";
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br/>");
}

/**
 * Rend la Facture / Devis en HTML A4 autonome (styles inline) pour génération PDF
 * serveur via Puppeteer. Miroir visuel du composant <InvoiceQuoteDocument>.
 */
export function renderInvoiceQuoteHtml(doc: FdDocument): string {
  const labels = docLabels(doc.docType);
  const totals = computeTotals(doc);
  const fmt = (n: number) => escapeHtml(formatMoney(n, doc.currency));

  const senderName = doc.senderName.trim() || "Votre entreprise";
  const clientName = doc.clientName.trim() || "Client";
  const hasItems = doc.items.some((it) => it.designation.trim() || it.quantity || it.unitPrice);
  const logo = safeImg(doc.logoDataUrl);
  const signature = safeImg(doc.signatureDataUrl);

  const itemsRows = hasItems
    ? doc.items
        .map((it, i) => {
          const bg = i % 2 === 1 ? "#fafafa" : "#ffffff";
          const desig = it.designation.trim()
            ? escapeHtml(it.designation.trim())
            : '<span style="color:#9ca3af">—</span>';
          return `<tr style="background:${bg}">
            <td class="td">${desig}</td>
            <td class="td num center">${escapeHtml(String(it.quantity ?? 0))}</td>
            <td class="td num">${fmt(it.unitPrice ?? 0)}</td>
            <td class="td num strong">${fmt(lineTotal(it))}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td class="td" colspan="4" style="text-align:center;color:#9ca3af;padding:32px 0">Aucun article.</td></tr>`;

  const discountRow =
    totals.discountAmount > 0
      ? `<div class="trow"><span>Remise</span><span class="num">− ${fmt(totals.discountAmount)}</span></div>`
      : "";

  const taxRow = doc.taxEnabled
    ? `<div class="trow"><span>TVA (${escapeHtml(String(doc.taxRate || 0))} %)</span><span class="num">${fmt(
        totals.taxAmount,
      )}</span></div>`
    : "";

  const conversionRow = hasConversion(doc)
    ? `<div class="conv"><span>Soit (1 ${escapeHtml(doc.currency)} = ${escapeHtml(
        String(doc.exchangeRate),
      )} ${escapeHtml(doc.secondaryCurrency)})</span><span class="num strong">≈ ${escapeHtml(
        formatMoney(totals.total * doc.exchangeRate, doc.secondaryCurrency),
      )}</span></div>`
    : "";

  const notesBlock = doc.notes.trim()
    ? `<div class="card" style="margin-top:28px">
        <div class="eyebrow">Notes &amp; conditions</div>
        <div class="muted" style="margin-top:4px">${nl2br(doc.notes.trim())}</div>
      </div>`
    : "";

  const signatureBlock =
    signature || doc.signatureLabel.trim()
      ? `<div style="margin-top:28px;display:flex;justify-content:flex-end">
          <div style="width:230px;text-align:center">
            ${
              signature
                ? `<img src="${signature}" alt="" style="height:80px;width:auto;max-width:100%;object-fit:contain"/>`
                : `<div style="height:80px"></div>`
            }
            <div style="margin-top:4px;border-top:1px solid rgba(31,41,55,0.3);padding-top:6px;font-size:12px;font-weight:600;color:#374151">
              ${escapeHtml(doc.signatureLabel.trim() || "Signature & cachet")}
            </div>
          </div>
        </div>`
      : "";

  const logoBlock = logo
    ? `<img src="${logo}" alt="" style="height:64px;width:64px;border-radius:12px;object-fit:contain;border:1px solid rgba(0,0,0,0.06)"/>`
    : `<div style="height:64px;width:64px;border-radius:12px;background:rgba(232,93,44,0.1);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:${ACCENT}">${escapeHtml(
        senderName.charAt(0).toUpperCase(),
      )}</div>`;

  const dueRow = doc.dueDate
    ? `<div><span class="k">${escapeHtml(labels.dueLabel)} :</span> ${escapeHtml(formatDateFr(doc.dueDate))}</div>`
    : "";

  const footerNote =
    doc.docType === "devis"
      ? "Ce devis est sans engagement et valable à la date indiquée."
      : "Document généré électroniquement.";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; font-size: 12.5px; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .accent { height: 8px; background: ${ACCENT}; }
  .wrap { padding: 8px 4px 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .sender { display: flex; gap: 16px; align-items: flex-start; }
  .sname { font-size: 18px; font-weight: 800; color: #111827; line-height: 1.2; }
  .muted { color: #4b5563; font-size: 12px; }
  .title { font-size: 30px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; color: ${ACCENT}; margin: 0; text-align: right; }
  .dnum { font-size: 13px; font-weight: 700; color: #111827; margin-top: 4px; text-align: right; }
  .dmeta { margin-top: 6px; font-size: 12px; color: #4b5563; text-align: right; }
  .dmeta .k { font-weight: 600; color: #374151; }
  .grid2 { display: flex; gap: 16px; margin-top: 28px; }
  .card { flex: 1; border: 1px solid rgba(0,0,0,0.07); background: #fafafa; border-radius: 12px; padding: 14px; }
  .card.client { border-color: rgba(232,93,44,0.2); background: #fff7f1; }
  .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #9ca3af; }
  .card.client .eyebrow { color: ${ACCENT}; }
  .pname { font-size: 14px; font-weight: 700; color: #111827; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 28px; border-radius: 12px; overflow: hidden; }
  thead th { background: #111827; color: #fff; text-align: left; padding: 10px 14px; font-size: 12px; font-weight: 600; }
  thead th.center { text-align: center; }
  thead th.right { text-align: right; }
  .td { padding: 10px 14px; vertical-align: top; border-bottom: 1px solid rgba(0,0,0,0.05); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }
  .strong { font-weight: 700; color: #111827; }
  .totals { display: flex; justify-content: flex-end; margin-top: 22px; }
  .totals .box { width: 300px; }
  .trow { display: flex; justify-content: space-between; color: #4b5563; padding: 3px 0; }
  .ttotal { display: flex; justify-content: space-between; align-items: center; background: ${ACCENT}; color: #fff; border-radius: 8px; padding: 10px 12px; margin-top: 6px; }
  .ttotal .lbl { font-size: 14px; font-weight: 700; text-transform: uppercase; }
  .ttotal .val { font-size: 16px; font-weight: 900; }
  .conv { display: flex; justify-content: space-between; font-size: 12px; color: #4b5563; padding: 6px 2px 0; }
  .foot { margin-top: 36px; text-align: center; }
  .foot .thanks { font-size: 13px; font-weight: 600; color: #111827; }
  .foot .sub { margin-top: 4px; font-size: 10.5px; color: #9ca3af; }
</style></head>
<body>
  <div class="accent"></div>
  <div class="wrap">
    <div class="head">
      <div class="sender">
        ${logoBlock}
        <div>
          <div class="sname">${escapeHtml(senderName)}</div>
          ${doc.senderDetails.trim() ? `<div class="muted" style="margin-top:4px">${nl2br(doc.senderDetails.trim())}</div>` : ""}
        </div>
      </div>
      <div>
        <p class="title">${escapeHtml(labels.title)}</p>
        <div class="dnum">${escapeHtml(labels.numberLabel)} <span style="color:${ACCENT}">${escapeHtml(doc.number || "—")}</span></div>
        <div class="dmeta">
          <div><span class="k">${escapeHtml(labels.dateLabel)} :</span> ${escapeHtml(formatDateFr(doc.date))}</div>
          ${dueRow}
        </div>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <div class="eyebrow">Émis par</div>
        <div class="pname">${escapeHtml(senderName)}</div>
        ${doc.senderDetails.trim() ? `<div class="muted" style="margin-top:2px">${nl2br(doc.senderDetails.trim())}</div>` : ""}
      </div>
      <div class="card client">
        <div class="eyebrow">${doc.docType === "facture" ? "Facturé à" : "Destinataire"}</div>
        <div class="pname">${escapeHtml(clientName)}</div>
        ${doc.clientDetails.trim() ? `<div class="muted" style="margin-top:2px">${nl2br(doc.clientDetails.trim())}</div>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Désignation</th>
          <th class="center" style="width:64px">Qté</th>
          <th class="right" style="width:120px">P.U.</th>
          <th class="right" style="width:120px">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div class="totals">
      <div class="box">
        <div class="trow"><span>Sous-total</span><span class="num">${fmt(totals.subtotal)}</span></div>
        ${discountRow}
        ${taxRow}
        <div class="ttotal"><span class="lbl">Total</span><span class="val">${fmt(totals.total)}</span></div>
        ${conversionRow}
      </div>
    </div>

    ${notesBlock}
    ${signatureBlock}

    <div class="foot">
      <div class="thanks">Merci de votre confiance.</div>
      <div class="sub">${escapeHtml(footerNote)} · Créé gratuitement avec FasoStock</div>
    </div>
  </div>
</body></html>`;
}
