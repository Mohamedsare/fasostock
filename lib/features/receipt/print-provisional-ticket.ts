"use client";

import {
  paymentUppercase,
  receiptGroupedNumber,
  telLine,
} from "@/lib/features/receipt/receipt-ticket-format";
import {
  normalizeReceiptTemplate,
  type ReceiptTicketTemplate,
} from "@/lib/features/receipt/receipt-ticket-template";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import { currencySymbolOf } from "@/lib/config/currencies";
import { formatCurrencyFlutter } from "@/lib/utils/currency";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

/**
 * Ticket remis au client pour une vente encaissée **hors ligne**.
 *
 * Pourquoi un ticket à part plutôt que le ticket habituel :
 *
 * - le ticket normal est fabriqué par `/api/pdf/receipt-thermal`, une route serveur —
 *   injoignable, précisément quand on en a besoin ;
 * - il porte un QR de vérification qui encode l'identifiant de la vente. Hors ligne cet
 *   identifiant n'existe pas encore : le QR renverrait le client vers une vente
 *   introuvable. Mieux vaut pas de QR qu'un QR mort ;
 * - il affiche un numéro de vente définitif. En promettre un qui n'est pas encore
 *   attribué exposerait le commerçant à une contestation.
 *
 * Ce ticket assume donc son statut : mêmes montants, même détail, mais annoncé comme
 * provisoire, avec une référence locale qui permet de retrouver la vente après
 * synchronisation. Impression par le navigateur (`window.print`), sans aucun réseau.
 *
 * Il suit en revanche la **mise en forme choisie par la boutique** (`receiptTemplate`,
 * transporté avec le ticket) : le client d'une boutique en « Moderne » ne doit pas
 * recevoir un document d'une autre facture parce que la connexion est tombée. Mêmes
 * tailles que les tickets imprimés par le serveur — la page est calée sur la largeur
 * réelle du papier (`@page`), donc un `px` y vaut la même chose que dans le PDF.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ProvisionalTicketOptions = {
  /** Référence locale (`clientRequestId`) — permet de rapprocher après synchronisation. */
  localReference: string;
  paperWidthMm?: 58 | 80;
};

function buildProvisionalTicketHtml(
  data: ReceiptTicketData,
  opts: ProvisionalTicketOptions,
): string {
  const widthMm = opts.paperWidthMm ?? 80;
  const narrow = widthMm === 58;
  const contentMm = narrow ? 48 : 72;
  const template: ReceiptTicketTemplate = normalizeReceiptTemplate(
    data.receiptTemplate,
  );

  const money = (n: number): string =>
    formatCurrencyFlutter(Math.round(n), data.currencyCode);
  const num = (n: number): string => receiptGroupedNumber(n, data.currencyCode);
  const currency = currencySymbolOf(data.currencyCode ?? undefined);

  const row = (label: string, value: string, cls = ""): string =>
    `<div class="row${cls ? ` ${cls}` : ""}"><span class="lbl">${esc(label)}</span><span class="val">${esc(value)}</span></div>`;

  const tel = telLine(data.storePhone);
  const dateLabel = data.date.toLocaleString("fr-FR", {
    timeZone: getActiveTimeZone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const localRef = opts.localReference.slice(0, 8).toUpperCase();
  // Même en-tête que le ticket habituel du modèle : une ligne jointe en « Moderne »,
  // deux lignes en « Classique ».
  const subLines =
    template === "moderne"
      ? (() => {
          const joined = [data.storeAddress?.trim(), tel].filter(Boolean).join(" · ");
          return joined ? `<div class="sub">${esc(joined)}</div>` : "";
        })()
      : `${data.storeAddress?.trim() ? `<div class="sub">${esc(data.storeAddress.trim())}</div>` : ""}${
          tel ? `<div class="sub">${esc(tel)}</div>` : ""
        }`;

  // Détail des articles : nom complet sur sa propre ligne dans les deux modèles — un
  // ticket provisoire sert justement à reconnaître ce qui a été acheté.
  const items =
    template === "moderne"
      ? data.items
          .map(
            (it) => `<div class="item">
              <div class="item-name">${esc(it.name.trim())}</div>
              <div class="row item-line"><span class="qty">${it.quantity} × ${esc(num(it.unitPrice))}</span><span class="line-total">${esc(money(it.total))}</span></div>
            </div>`,
          )
          .join("")
      : `<table class="grid"><thead><tr>
          <th class="left">Produit</th>
          <th class="cqty">Qté</th>
          <th class="cnum">${esc(narrow ? "PU" : `PU (${currency})`)}</th>
          <th class="cnum">Total</th>
        </tr></thead><tbody>${data.items
          .map(
            (it) => `<tr>
              <td class="left">${esc(it.name.trim())}</td>
              <td class="cqty">${it.quantity}</td>
              <td class="cnum">${esc(num(it.unitPrice))}</td>
              <td class="cnum">${esc(num(it.total))}</td>
            </tr>`,
          )
          .join("")}</tbody></table>`;

  const creditRemaining = Math.max(0, data.creditRemaining ?? 0);
  const creditRows =
    creditRemaining > 0
      ? row("Acompte versé", money(data.creditPaid ?? 0)) +
        row("RESTE À PAYER", money(creditRemaining), "due") +
        (data.creditDueLabel ? row("Échéance", data.creditDueLabel) : "")
      : "";
  const credit =
    creditRemaining === 0
      ? ""
      : template === "moderne"
        ? `<div class="credit-box">${creditRows}</div>`
        : `<div class="sep"></div>${creditRows}`;

  const total =
    template === "moderne"
      ? `<div class="total-band"><span>TOTAL</span><span>${esc(money(data.total))}</span></div>`
      : `<div class="sep solid"></div>${row("TOTAL", money(data.total), "total")}<div class="sep solid"></div>`;

  const css =
    template === "moderne"
      ? `
  body { font-family: system-ui, "Segoe UI", Roboto, sans-serif; }
  .store { font-size: ${narrow ? 15 : 19}px; font-weight: 800; letter-spacing: ${narrow ? 0.5 : 0.9}px; text-transform: uppercase; line-height: 1.1; }
  .sub { font-size: ${narrow ? 7 : 7.5}px; color: #333; margin-top: 3px; }
  .sep { border-top: 1px solid #BBB; margin: 7px 0; }
  .sep.strong { border-top: 1.2px solid #000; }
  .item { margin-bottom: 5px; }
  .item-name { font-size: ${narrow ? 8 : 8.5}px; font-weight: 600; line-height: 1.25; }
  .item-line { margin-top: 1px; }
  .item-line .qty { color: #333; }
  .item-line .line-total { font-weight: 700; }
  .total-band {
    display: flex; justify-content: space-between; align-items: center; gap: 6px;
    background: #000; color: #fff; padding: 4px 6px; margin: 6px 0;
    font-size: ${narrow ? 10 : 11}px; font-weight: 800; letter-spacing: 0.3px;
  }
  .tag { font-size: 6.5px; letter-spacing: 1.4px; text-transform: uppercase; color: #444; font-weight: 700; margin-bottom: 4px; }
  .credit-box { border: 1px solid #000; padding: 4px 6px; margin-top: 5px; }
  .due { font-size: ${narrow ? 9 : 9.5}px; font-weight: 800; margin-top: 2px; }
  .banner { border: 1.4px solid #000; padding: 4px; margin: 7px 0; text-align: center; font-weight: 800; letter-spacing: 0.4px; }
`
      : `
  body { font-family: "Courier New", Courier, monospace; }
  .store { font-size: ${narrow ? 19 : 22}px; font-weight: 700; letter-spacing: ${narrow ? 0.4 : 0.65}px; text-transform: uppercase; line-height: 1.05; font-family: system-ui, "Segoe UI", Roboto, sans-serif; }
  .sub { font-size: 7px; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .sep.solid { border-top: 1px solid #000; }
  .grid { width: 100%; border-collapse: collapse; font-size: ${narrow ? 7.5 : 8}px; }
  .grid thead th { font-weight: 700; text-align: left; padding-bottom: 3px; white-space: nowrap; }
  .grid thead th.cqty { text-align: center; padding: 0 6px 3px; }
  .grid thead th.cnum { text-align: right; padding-left: 8px; }
  .grid tbody td { padding-bottom: 3px; vertical-align: top; }
  .grid tbody td.left { word-break: break-word; padding-right: 6px; }
  .grid tbody td.cqty { text-align: center; white-space: nowrap; padding: 0 6px 3px; }
  .grid tbody td.cnum { text-align: right; white-space: nowrap; padding-left: 8px; }
  .row.total { font-size: ${narrow ? 11 : 12}px; font-weight: 700; letter-spacing: 0.3px; margin: 3px 0; }
  .row.due { font-weight: 700; }
  .banner { border: 1.4px solid #000; padding: 4px; margin: 6px 0; text-align: center; font-weight: 700; }
`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Ticket provisoire</title>
<style>
  @page { size: ${widthMm}mm auto; margin: ${(widthMm - contentMm) / 2}mm; }
  * { box-sizing: border-box; }
  body {
    width: ${contentMm}mm;
    margin: 0;
    font-size: ${narrow ? 7.5 : 8}px;
    color: #000;
    /* Le bandeau du total est un aplat noir : sans ça, l'impression navigateur le mange. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .meta { font-size: ${narrow ? 8 : 8.5}px; line-height: 1.4; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; line-height: 1.4; }
  .row .val { white-space: nowrap; flex: 0 0 auto; }
  .row.strong .val { font-weight: 700; }
  .foot { margin-top: 8px; font-size: 7px; text-align: center; line-height: 1.4; }
  ${css}
</style></head><body>
  <div class="center">
    <div class="store">${esc(data.storeName)}</div>
    ${subLines}
  </div>

  <div class="banner">TICKET PROVISOIRE<br>en attente d'enregistrement</div>

  ${row("Date", dateLabel)}
  ${row("Réf. locale", localRef, "strong")}
  ${data.customerName ? row("Client", data.customerName) : ""}

  <div class="sep${template === "moderne" ? " strong" : ""}"></div>
  ${template === "moderne" ? '<div class="tag">Articles</div>' : ""}
  ${items}
  <div class="sep"></div>

  ${row("Sous-total", money(data.subtotal))}
  ${data.discount > 0 ? row("Remise", `- ${money(data.discount)}`) : ""}
  ${total}
  ${row("Paiement", paymentUppercase(data.paymentMethod), "strong")}
  ${data.amountReceived != null ? row("Reçu", money(data.amountReceived)) : ""}
  ${data.change != null && data.change > 0 ? row("Rendu", money(data.change)) : ""}
  ${credit}

  <div class="foot">
    Ce ticket vaut preuve d'achat.<br>
    Le numéro de vente définitif sera attribué<br>dès le retour de la connexion.
  </div>
</body></html>`;
}

/**
 * Ouvre la boîte d'impression du navigateur avec le ticket provisoire.
 *
 * Renvoie `false` si la fenêtre a été bloquée (bloqueur de pop-up) : l'appelant doit
 * alors le signaler plutôt que laisser croire que le client repart avec un justificatif.
 */
export function printProvisionalTicket(
  data: ReceiptTicketData,
  opts: ProvisionalTicketOptions,
): boolean {
  if (typeof window === "undefined") return false;
  const win = window.open("", "_blank", "width=380,height=640");
  if (!win) return false;

  win.document.open();
  win.document.write(buildProvisionalTicketHtml(data, opts));
  win.document.close();

  // `onafterprint` referme l'onglet ; le `setTimeout` couvre les navigateurs qui ne
  // déclenchent pas l'événement (l'impression reste possible manuellement).
  win.onafterprint = () => win.close();
  win.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* l'utilisateur peut toujours imprimer depuis le menu */
    }
  }, 150);
  return true;
}
