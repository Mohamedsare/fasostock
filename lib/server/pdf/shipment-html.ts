import { escapeHtml } from "./escape-html";
import { TABLE_PAGINATION_CSS } from "./table-pagination-css";

/**
 * Bordereau d'expédition A4 — le papier qui accompagne le colis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL EST LU PAR TROIS PERSONNES QUI NE CHERCHENT PAS LA MÊME CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *   LE TRANSPORTEUR cherche OÙ ça va et À QUI le remettre. C'est donc le bloc
 *     « Destinataire » qui est en haut, en gros, avant tout le reste — y compris avant
 *     le nom de l'expéditeur. Un bordereau qui met son propre logo en avant et l'adresse
 *     de livraison en petit fait perdre des colis.
 *
 *   LE DESTINATAIRE cherche ce qu'il doit recevoir, et combien de colis. D'où le nombre
 *     de colis en chiffre isolé : c'est ce qu'il compte à la descente du car.
 *
 *   LE COMMERÇANT cherche, des semaines plus tard, ce qu'il a avancé et ce qu'on lui
 *     doit encore. D'où le bloc « frais de transport » chiffré à part, jamais mélangé
 *     au montant de la marchandise.
 *
 * Le montant de la marchandise n'apparaît QUE s'il est connu, et jamais le détail des
 * articles : le bordereau passe entre les mains du transporteur, qui n'a pas à connaître
 * le prix de ce qu'il porte — ni pour sa sécurité, ni pour celle du colis.
 */

function tx(s: string | null | undefined): string {
  return escapeHtml(s ?? "");
}

const ACCENT = "#1D4ED8";
const ACCENT_SOFT = "#EFF6FF";

export type ShipmentPdfData = {
  companyName: string;
  companyLogoSrc: string | null;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;

  shipmentNumber: string;
  createdLabel: string;
  statusLabel: string;
  cancelled: boolean;

  recipientName: string;
  recipientPhone: string | null;
  destination: string;

  carrier: string | null;
  carrierPhone: string | null;
  trackingRef: string | null;
  packageCount: number;
  packageNote: string | null;
  expectedLabel: string | null;

  saleNumber: string | null;
  currencyLabel: string;
  goodsAmount: number;

  shippingCost: number;
  shippingPaidByCompany: boolean;
  shippingReimbursed: number;

  note: string | null;
};

function money(n: number, currency: string): string {
  const rounded = Math.round(n);
  const withSep = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${rounded < 0 ? "-" : ""}${withSep} ${currency}`;
}

export function renderShipmentHtml(data: ShipmentPdfData): string {
  const remaining = Math.max(0, data.shippingCost - data.shippingReimbursed);
  const feesOpen = data.shippingPaidByCompany && remaining > 0.5;

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
    .logo { height: 38px; max-width: 120px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 4px; }
    .cancelled {
      margin-top: 12px; padding: 8px 12px; border-radius: 8px;
      background: #FEE2E2; color: #991B1B; font-weight: 800; text-align: center;
      letter-spacing: 0.08em; text-transform: uppercase;
    }

    /* Le bloc que le transporteur doit lire de loin. */
    .to {
      margin-top: 16px; border: 2px solid ${ACCENT}; border-radius: 12px;
      padding: 12px 14px; background: ${ACCENT_SOFT};
      display: flex; align-items: center; justify-content: space-between; gap: 14px;
    }
    .to .label {
      font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em;
      color: ${ACCENT}; font-weight: 800;
    }
    .to .who { margin-top: 2px; font-size: 22px; font-weight: 900; line-height: 1.15; }
    .to .where { margin-top: 2px; font-size: 15px; font-weight: 700; color: #1f2937; }
    .to .phone { margin-top: 2px; font-size: 13px; color: #374151; }
    .packages { text-align: center; flex-shrink: 0; }
    .packages .n { font-size: 40px; font-weight: 900; line-height: 1; color: ${ACCENT}; }
    .packages .cap { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }

    .grid { display: flex; gap: 12px; margin-top: 14px; }
    .box { flex: 1; border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px; }
    .box .label {
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
      color: #6b7280; font-weight: 800;
    }
    .kv { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
    .kv .k { color: #6b7280; }
    .kv .v { font-weight: 700; text-align: right; }

    .fees {
      margin-top: 14px; border-radius: 10px; padding: 11px 13px;
      border: 2px solid ${ACCENT}; background: ${ACCENT_SOFT};
    }
    .fees.settled { border-color: #15803D; background: #F0FDF4; }
    .fees .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; color: ${ACCENT}; }
    .fees.settled .label { color: #15803D; }
    .fees .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
    .fees .row.big { font-size: 17px; font-weight: 900; padding-top: 6px; border-top: 1px solid rgba(0,0,0,0.1); margin-top: 4px; }
    .fees .hint { margin-top: 5px; font-size: 10.5px; color: #4b5563; }

    .note { margin-top: 14px; padding: 8px 11px; border-left: 3px solid ${ACCENT}; background: #fafafa; color: #374151; }
    .signs { margin-top: 26px; display: flex; gap: 40px; }
    .sign { flex: 1; }
    .sign .cap { font-size: 10px; color: #6b7280; }
    .sign .rule { margin-top: 30px; border-top: 1px solid #9ca3af; }
    .foot { margin-top: 18px; text-align: center; color: #9ca3af; font-size: 9.5px; }
  </style>
</head>
<body>
  <div class="topbar"></div>

  <div class="head">
    <div>
      <h1>Bordereau d'expédition</h1>
      <div class="sub">
        N° ${tx(data.shipmentNumber)} · ${tx(data.createdLabel)} · ${tx(data.statusLabel)}
        ${data.saleNumber ? ` · facture ${tx(data.saleNumber)}` : ""}
      </div>
    </div>
    <div class="company">
      ${data.companyLogoSrc ? `<img class="logo" src="${tx(data.companyLogoSrc)}" alt="" />` : ""}
      <div class="name">${tx(data.companyName)}</div>
      <div>${tx(data.storeName)}</div>
      ${data.storeAddress ? `<div>${tx(data.storeAddress)}</div>` : ""}
      ${data.storePhone ? `<div>Tél. ${tx(data.storePhone)}</div>` : ""}
    </div>
  </div>

  ${data.cancelled ? `<div class="cancelled">Expédition annulée</div>` : ""}

  <div class="to no-break">
    <div>
      <div class="label">Destinataire</div>
      <div class="who">${tx(data.recipientName)}</div>
      <div class="where">${tx(data.destination)}</div>
      ${data.recipientPhone ? `<div class="phone">Tél. ${tx(data.recipientPhone)}</div>` : ""}
    </div>
    <div class="packages">
      <div class="n">${data.packageCount}</div>
      <div class="cap">colis</div>
    </div>
  </div>

  <div class="grid">
    <div class="box no-break">
      <div class="label">Transport</div>
      <div class="kv"><span class="k">Transporteur</span><span class="v">${tx(data.carrier ?? "—")}</span></div>
      <div class="kv"><span class="k">Contact</span><span class="v">${tx(data.carrierPhone ?? "—")}</span></div>
      <div class="kv"><span class="k">N° de bordereau</span><span class="v">${tx(data.trackingRef ?? "—")}</span></div>
      <div class="kv"><span class="k">Arrivée annoncée</span><span class="v">${tx(data.expectedLabel ?? "—")}</span></div>
    </div>
    <div class="box no-break">
      <div class="label">Colis</div>
      <div class="kv"><span class="k">Nombre</span><span class="v">${data.packageCount}</span></div>
      <div class="kv"><span class="k">Contenu</span><span class="v">${tx(data.packageNote ?? "—")}</span></div>
      ${
        data.goodsAmount > 0
          ? `<div class="kv"><span class="k">Valeur marchandise</span><span class="v">${money(
              data.goodsAmount,
              data.currencyLabel,
            )}</span></div>`
          : ""
      }
    </div>
  </div>

  ${
    data.shippingCost > 0
      ? `<div class="fees no-break${feesOpen ? "" : " settled"}">
    <div class="label">Frais de transport</div>
    <div class="row"><span>Payé au transporteur</span><span>${money(
      data.shippingCost,
      data.currencyLabel,
    )}</span></div>
    <div class="row"><span>Avancés par</span><span>${
      data.shippingPaidByCompany ? tx(data.companyName) : tx(data.recipientName)
    }</span></div>
    ${
      data.shippingReimbursed > 0
        ? `<div class="row"><span>Déjà remboursé</span><span>${money(
            data.shippingReimbursed,
            data.currencyLabel,
          )}</span></div>`
        : ""
    }
    ${
      data.shippingPaidByCompany
        ? `<div class="row big"><span>${
            feesOpen ? "Reste à rembourser" : "Frais soldés"
          }</span><span>${money(remaining, data.currencyLabel)}</span></div>
    ${
      feesOpen
        ? `<div class="hint">Ces frais ont été avancés pour vous et sont à ajouter à votre prochain règlement. Ils ne font pas partie du montant de la marchandise.</div>`
        : ""
    }`
        : `<div class="hint">Le transport a été réglé par le destinataire : rien à rembourser.</div>`
    }
  </div>`
      : ""
  }

  ${data.note ? `<div class="note no-break">${tx(data.note)}</div>` : ""}

  <div class="signs no-break">
    <div class="sign">
      <div class="cap">Remis au transporteur le</div>
      <div class="rule"></div>
    </div>
    <div class="sign">
      <div class="cap">Reçu par ${tx(data.recipientName)} le</div>
      <div class="rule"></div>
    </div>
  </div>

  <div class="foot">
    Bordereau d'expédition — à présenter au retrait du colis.
  </div>
</body>
</html>`;
}
