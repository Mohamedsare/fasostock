import { escapeHtml } from "@/lib/server/pdf/escape-html";
import { formatCurrencyFlutter } from "@/lib/utils/currency";
import { amountToFrenchWords } from "@/lib/utils/number-to-french-words";
import type { ProgressiveQuoteData } from "@/lib/features/progressive/quote-types";

/**
 * Facture PROFORMA A4 d'un dossier d'achat progressif.
 *
 * C'est le papier que le client emporte : il liste tout ce qu'il a choisi
 * (quantités, prix unitaires négociés, total) et fait le point sur son épargne
 * — déjà versé / reste à verser. Ce n'est PAS une facture de vente : rien n'est
 * livré ni déstocké tant que le dossier n'est pas remis, et le document le dit
 * en toutes lettres pour éviter tout malentendu.
 */
export type ProgressiveQuoteRenderInput = ProgressiveQuoteData & {
  /** Logo embarqué en data URL (aucun téléchargement réseau au rendu). */
  logoDataUrl: string | null;
  /** Date d'établissement du document (aujourd'hui). */
  dateLabel: string;
  timeLabel: string;
  /** Date d'ouverture du dossier. */
  openedLabel: string;
  /** Vocabulaire métier : « articles » / « engins » / « produits ». */
  itemsWord: string;
};

function money(n: number, currency: string | null): string {
  return formatCurrencyFlutter(n, currency);
}

function safeColor(raw: string | null): string {
  const v = (raw ?? "").trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return "#0F766E";
}

function kv(label: string, value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  return `<div class="kv"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(v)}</span></div>`;
}

export function renderProgressiveQuoteHtml(data: ProgressiveQuoteRenderInput): string {
  const primary = safeColor(data.storePrimaryColor);
  const currency = data.currencyCode;
  const total = Math.round(data.selectionTotal);
  const paid = Math.round(Math.min(data.balance, total));
  const remaining = Math.max(0, total - Math.round(data.balance));

  const rows = data.lines
    .map(
      (l, i) => `
      <tr>
        <td class="c-idx">${i + 1}</td>
        <td class="c-lbl">${escapeHtml(l.label)}</td>
        <td class="c-qty">${l.quantity}</td>
        <td class="c-pu">${escapeHtml(money(l.unitPrice, currency))}</td>
        <td class="c-tot">${escapeHtml(money(l.lineTotal, currency))}</td>
      </tr>`,
    )
    .join("");

  const emptyRow = `
      <tr><td class="c-empty" colspan="5">Aucun ${escapeHtml(data.itemsWord)} sélectionné pour l'instant.</td></tr>`;

  const logoHtml = data.logoDataUrl
    ? `<img class="logo" src="${escapeHtml(data.logoDataUrl)}" alt="" />`
    : "";

  const contact = [data.storeAddress, data.storePhone ? `Tél. ${data.storePhone}` : null]
    .filter(Boolean)
    .map((l) => `<div>${escapeHtml(String(l))}</div>`)
    .join("");

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

  .doc { text-align: right; min-width: 190px; }
  .doc-title { display: inline-block; background: ${primary}; color: #fff; font-size: 16px; font-weight: 800; letter-spacing: 1.5px; padding: 7px 16px; border-radius: 4px; }
  .doc-meta { margin-top: 8px; font-size: 11px; color: #374151; line-height: 1.6; }
  .doc-meta b { color: #111827; }

  .grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 10px; margin-top: 12px; }
  .card { border: 1px solid #e5e7eb; border-radius: 5px; overflow: hidden; }
  .card-h { background: #f3f4f6; border-left: 5px solid ${primary}; padding: 7px 11px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
  .card-b { padding: 9px 11px; }
  .kv { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 11.5px; border-bottom: 1px dashed #f1f1f1; }
  .kv:last-child { border-bottom: 0; }
  .kv .k { color: #4b5563; font-weight: 700; }
  .kv .v { text-align: right; color: #111827; }

  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  thead th { background: ${primary}; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; padding: 8px 9px; text-align: left; }
  tbody td { border-bottom: 1px solid #eef0f2; padding: 8px 9px; font-size: 11.5px; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .c-idx { width: 26px; color: #9ca3af; }
  .c-qty { width: 62px; text-align: center; font-weight: 700; }
  .c-pu, .c-tot { width: 110px; text-align: right; white-space: nowrap; }
  .c-tot { font-weight: 700; }
  .c-empty { text-align: center; color: #9ca3af; font-style: italic; padding: 18px 0; }

  .bottom { display: grid; grid-template-columns: 1fr 300px; gap: 12px; margin-top: 12px; }
  .totals { border: 1px solid #e5e7eb; border-radius: 5px; overflow: hidden; }
  .t-line { display: flex; justify-content: space-between; gap: 10px; padding: 7px 11px; font-size: 12px; border-bottom: 1px solid #f1f1f1; }
  .t-line span:last-child { font-weight: 700; white-space: nowrap; }
  .t-total { background: ${primary}; color: #fff; font-size: 14px; font-weight: 800; padding: 10px 11px; display: flex; justify-content: space-between; gap: 10px; }
  .t-rest { background: #fff7ed; color: #9a3412; font-weight: 800; }
  .words { font-size: 11px; color: #374151; padding: 8px 11px; background: #f9fafb; border-top: 1px solid #f1f1f1; }

  .note { font-size: 10.5px; line-height: 1.5; color: #4b5563; }
  .note b { color: #111827; }
  .sign { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sign-box { border: 1px solid #e5e7eb; border-radius: 5px; padding: 8px 11px; }
  .sign-lbl { font-size: 10.5px; font-weight: 700; color: #4b5563; }
  .sign-space { height: 58px; }

  .foot { margin-top: auto; padding-top: 10px; text-align: center; font-size: 10.5px; color: #6b7280; }
  .foot .bar { background: ${primary}; color: #fff; border-radius: 4px; padding: 7px 12px; font-weight: 700; font-size: 11px; }
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
        <div class="doc-title">FACTURE PROFORMA</div>
        <div class="doc-meta">
          <div>Dossier <b>${escapeHtml(data.planNumber)}</b></div>
          <div>Établie le <b>${escapeHtml(data.dateLabel)}</b> à ${escapeHtml(data.timeLabel)}</div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-h">Client</div>
        <div class="card-b">
          ${kv("Nom", data.clientName)}
          ${kv("Téléphone", data.clientPhone)}
          ${kv(data.clientIdType ?? "Pièce d'identité", data.clientIdNumber)}
          ${kv("Adresse", data.clientAddress)}
        </div>
      </div>
      <div class="card">
        <div class="card-h">Achat progressif</div>
        <div class="card-b">
          ${kv("N° de dossier", data.planNumber)}
          ${kv("Ouvert le", data.openedLabel)}
          ${kv("Versements reçus", money(data.totalDeposited, currency))}
          ${kv("Épargne disponible", money(data.balance, currency))}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Désignation</th>
          <th style="text-align:center">Qté</th>
          <th style="text-align:right">Prix unitaire</th>
          <th style="text-align:right">Montant</th>
        </tr>
      </thead>
      <tbody>${rows || emptyRow}</tbody>
    </table>

    <div class="bottom">
      <div>
        <p class="note">
          <b>Ce document n'est pas une facture de vente.</b> Il récapitule la sélection
          retenue par le client dans le cadre de son achat progressif : les
          ${escapeHtml(data.itemsWord)} ne sont ni livrés ni réservés tant que le montant
          total n'est pas atteint et que la remise n'a pas été enregistrée.
        </p>
        <p class="note" style="margin-top:6px">
          Les prix indiqués sont ceux convenus à la date d'établissement du présent
          document et peuvent évoluer. Chaque versement donne lieu à un reçu numéroté.
        </p>
        <div class="sign">
          <div class="sign-box">
            <div class="sign-lbl">Le client (lu et approuvé)</div>
            <div class="sign-space"></div>
          </div>
          <div class="sign-box">
            <div class="sign-lbl">${escapeHtml(data.signerName || data.storeName || "Le vendeur")}</div>
            <div class="sign-space"></div>
          </div>
        </div>
      </div>

      <div class="totals">
        <div class="t-total"><span>TOTAL SÉLECTION</span><span>${escapeHtml(money(total, currency))}</span></div>
        <div class="t-line"><span>Déjà versé (épargne)</span><span>${escapeHtml(money(paid, currency))}</span></div>
        <div class="t-line t-rest"><span>Reste à verser</span><span>${escapeHtml(money(remaining, currency))}</span></div>
        <div class="words">Arrêtée la présente sélection à la somme de :<br /><b>${escapeHtml(amountToFrenchWords(total, currency))}</b></div>
      </div>
    </div>

    <div class="foot">
      <div class="bar">${escapeHtml(data.storeFooterText || "Merci pour votre confiance.")}</div>
    </div>
  </div>
</body></html>`;
}
