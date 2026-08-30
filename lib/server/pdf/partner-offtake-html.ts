import { escapeHtml } from "./escape-html";
import { TABLE_PAGINATION_CSS } from "./table-pagination-css";

/**
 * Bon d'enlèvement A4 — le papier qu'on remet au partenaire qui repart avec la
 * marchandise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE DOCUMENT DOIT FAIRE TENIR EN UNE PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il sert à trois moments, et il faut les tenir tous les trois :
 *
 *   AU DÉPART   — le partenaire vérifie que ce qui est écrit correspond à ce qu'il
 *                 charge. D'où les quantités en gros caractères, avant les prix.
 *   À L'ARRIVÉE — il recompte chez lui. D'où une ligne par article, jamais de regroupement.
 *   AU PAIEMENT — les deux relisent ce qui reste dû. D'où le bloc « reste à payer »
 *                 isolé, chiffré en grand, avec la date convenue.
 *
 * Le RESTE À PAYER est le seul chiffre encadré du document. C'est celui qui sera
 * discuté au téléphone trois semaines plus tard ; s'il faut le chercher, le bon ne
 * sert à rien.
 *
 * Aucun coût d'achat n'y figure — le document part chez un confrère, qui est aussi un
 * concurrent. La marge du commerçant ne quitte pas sa boutique.
 */

function tx(s: string | null | undefined): string {
  return escapeHtml(s ?? "");
}

const ACCENT = "#7C2D12";
const ACCENT_SOFT = "#FFF7ED";

export type PartnerOfftakePdfData = {
  companyName: string;
  companyLogoSrc: string | null;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;

  offtakeNumber: string;
  createdLabel: string;
  partnerName: string;
  partnerPhone: string | null;
  note: string | null;
  dueLabel: string | null;
  cancelled: boolean;

  currencyLabel: string;
  totalAmount: number;
  amountPaid: number;

  lines: Array<{
    label: string;
    unit: string | null;
    quantity: number;
    unitPrice: number;
  }>;

  /** Règlements déjà enregistrés — le partenaire doit pouvoir les retrouver. */
  payments: Array<{ dateLabel: string; methodLabel: string; amount: number }>;
};

/** Montant entier, séparateur d'espace insécable — le serveur n'a pas de locale ambiante. */
function money(n: number, currency: string): string {
  const rounded = Math.round(n);
  const withSep = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${rounded < 0 ? "-" : ""}${withSep} ${currency}`;
}

function qty(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function renderPartnerOfftakeHtml(data: PartnerOfftakePdfData): string {
  const remaining = Math.max(0, data.totalAmount - data.amountPaid);
  const settled = remaining < 0.5;

  const rows = data.lines
    .map(
      (l, i) => `<tr>
      <td class="num">${String(i + 1).padStart(2, "0")}</td>
      <td class="name">${tx(l.label)}</td>
      <td class="qty">${qty(l.quantity)}${l.unit ? ` <span class="unit">${tx(l.unit)}</span>` : ""}</td>
      <td class="amount">${money(l.unitPrice, data.currencyLabel)}</td>
      <td class="amount strong">${money(l.quantity * l.unitPrice, data.currencyLabel)}</td>
    </tr>`,
    )
    .join("");

  const paymentRows =
    data.payments.length === 0
      ? ""
      : `<div class="no-break block">
      <div class="block-title">Règlements enregistrés</div>
      <table class="pay">
        <tbody>
          ${data.payments
            .map(
              (p) => `<tr>
            <td>${tx(p.dateLabel)}</td>
            <td>${tx(p.methodLabel)}</td>
            <td class="amount strong">${money(p.amount, data.currencyLabel)}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <style>
${TABLE_PAGINATION_CSS}
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 22px 28px 28px;
      font-family: "Segoe UI", Roboto, Arial, sans-serif;
      color: #111827;
      font-size: 11px;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .topbar { height: 5px; margin: -22px -28px 16px; background: ${ACCENT}; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .head h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
    .head .sub { margin-top: 3px; color: #6b7280; font-size: 11px; }
    .company { text-align: right; font-size: 11px; line-height: 1.45; }
    .company .name { font-size: 13px; font-weight: 800; color: ${ACCENT}; }
    .logo { height: 40px; max-width: 130px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 4px; }
    .cancelled {
      margin-top: 12px; padding: 8px 12px; border-radius: 8px;
      background: #FEE2E2; color: #991B1B; font-weight: 800; text-align: center;
      letter-spacing: 0.08em; text-transform: uppercase;
    }
    .parties { display: flex; gap: 12px; margin-top: 14px; }
    .party {
      flex: 1; border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px;
      background: ${ACCENT_SOFT};
    }
    .party .label {
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
      color: ${ACCENT}; font-weight: 800;
    }
    .party .value { margin-top: 3px; font-size: 13px; font-weight: 700; }
    .party .line { margin-top: 2px; color: #4b5563; }
    table.items { width: 100%; border-collapse: collapse; margin-top: 14px; }
    table.items thead th {
      text-align: left; background: ${ACCENT}; color: #fff; padding: 8px 9px;
      font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em;
    }
    table.items tbody td { border-bottom: 1px solid #e5e7eb; padding: 8px 9px; vertical-align: middle; }
    table.items tbody tr:last-child td { border-bottom: none; }
    .num { width: 34px; text-align: center; color: #6b7280; font-variant-numeric: tabular-nums; }
    .name { font-weight: 700; font-size: 12px; }
    .qty { width: 92px; font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .qty .unit { font-size: 10px; font-weight: 600; color: #6b7280; }
    .amount { width: 110px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .amount.strong { font-weight: 800; }
    .totals { margin-top: 14px; display: flex; justify-content: flex-end; }
    .totals-box { width: 300px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 2px; font-size: 12px; }
    .totals-row.grand { border-top: 1px solid #d1d5db; font-weight: 800; font-size: 13px; padding-top: 8px; }
    .due-box {
      margin-top: 8px; border: 2px solid ${ACCENT}; border-radius: 10px;
      padding: 10px 12px; background: ${ACCENT_SOFT};
    }
    .due-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: ${ACCENT}; font-weight: 800; }
    .due-box .value { margin-top: 2px; font-size: 21px; font-weight: 900; font-variant-numeric: tabular-nums; }
    .due-box .when { margin-top: 2px; font-size: 11px; color: #4b5563; }
    .due-box.settled { border-color: #15803D; background: #F0FDF4; }
    .due-box.settled .label, .due-box.settled .value { color: #15803D; }
    .block { margin-top: 16px; }
    .block-title {
      font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em;
      color: #6b7280; font-weight: 800; margin-bottom: 5px;
    }
    table.pay { width: 100%; border-collapse: collapse; font-size: 11px; }
    table.pay td { border-bottom: 1px solid #f3f4f6; padding: 5px 2px; }
    .note { margin-top: 14px; padding: 8px 11px; border-left: 3px solid ${ACCENT}; background: #fafafa; color: #374151; }
    .signs { margin-top: 26px; display: flex; gap: 40px; }
    .sign { flex: 1; }
    .sign .cap { font-size: 10px; color: #6b7280; }
    .sign .rule { margin-top: 30px; border-top: 1px solid #9ca3af; }
    .foot { margin-top: 20px; text-align: center; color: #9ca3af; font-size: 9.5px; }
  </style>
</head>
<body>
  <div class="topbar"></div>

  <div class="head">
    <div>
      <h1>Bon d'enlèvement</h1>
      <div class="sub">N° ${tx(data.offtakeNumber)} · ${tx(data.createdLabel)}</div>
    </div>
    <div class="company">
      ${data.companyLogoSrc ? `<img class="logo" src="${tx(data.companyLogoSrc)}" alt="" />` : ""}
      <div class="name">${tx(data.companyName)}</div>
      <div>${tx(data.storeName)}</div>
      ${data.storeAddress ? `<div>${tx(data.storeAddress)}</div>` : ""}
      ${data.storePhone ? `<div>Tél. ${tx(data.storePhone)}</div>` : ""}
    </div>
  </div>

  ${data.cancelled ? `<div class="cancelled">Bon annulé</div>` : ""}

  <div class="parties">
    <div class="party">
      <div class="label">Enlevé par</div>
      <div class="value">${tx(data.partnerName)}</div>
      ${data.partnerPhone ? `<div class="line">Tél. ${tx(data.partnerPhone)}</div>` : ""}
    </div>
    <div class="party">
      <div class="label">Date d'enlèvement</div>
      <div class="value">${tx(data.createdLabel)}</div>
      ${data.dueLabel ? `<div class="line">Solde convenu pour le ${tx(data.dueLabel)}</div>` : ""}
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="num">N°</th>
        <th>Désignation</th>
        <th class="qty">Quantité</th>
        <th class="amount">Prix unit.</th>
        <th class="amount">Montant</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals no-break">
    <div class="totals-box">
      <div class="totals-row grand">
        <span>Total de l'enlèvement</span>
        <span>${money(data.totalAmount, data.currencyLabel)}</span>
      </div>
      <div class="totals-row">
        <span>Déjà versé</span>
        <span>${money(data.amountPaid, data.currencyLabel)}</span>
      </div>
      <div class="due-box${settled ? " settled" : ""}">
        <div class="label">${settled ? "Soldé" : "Reste à payer"}</div>
        <div class="value">${money(remaining, data.currencyLabel)}</div>
        ${
          !settled && data.dueLabel
            ? `<div class="when">à régler avant le ${tx(data.dueLabel)}</div>`
            : ""
        }
      </div>
    </div>
  </div>

  ${paymentRows}

  ${data.note ? `<div class="note no-break">${tx(data.note)}</div>` : ""}

  <div class="signs no-break">
    <div class="sign">
      <div class="cap">Pour la maison</div>
      <div class="rule"></div>
    </div>
    <div class="sign">
      <div class="cap">Reçu la marchandise (${tx(data.partnerName)})</div>
      <div class="rule"></div>
    </div>
  </div>

  <div class="foot">
    Bon d'enlèvement — la marchandise ci-dessus a quitté le magasin à la date indiquée.
  </div>
</body>
</html>`;
}
