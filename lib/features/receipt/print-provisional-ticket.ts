"use client";

import {
  RECEIPT_THERMAL_PDF_MAX_NAME_LEN,
  receiptIntAmount,
  truncateName,
} from "@/lib/features/receipt/receipt-ticket-format";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
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
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  return receiptIntAmount(n);
}

function line(label: string, value: string, bold = false): string {
  const weight = bold ? "font-weight:700;" : "";
  return `<div class="row" style="${weight}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
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
  const contentMm = widthMm === 58 ? 48 : 72;

  const items = data.items
    .map((it) => {
      const name = esc(truncateName(it.name, RECEIPT_THERMAL_PDF_MAX_NAME_LEN));
      const qty = `${it.quantity} x ${money(it.unitPrice)}`;
      return `<div class="item"><div class="name">${name}</div><div class="row"><span>${esc(qty)}</span><span>${esc(money(it.total))}</span></div></div>`;
    })
    .join("");

  const credit =
    (data.creditRemaining ?? 0) > 0
      ? `<div class="sep"></div>${line("Payé", money(data.creditPaid ?? 0))}${line("Reste dû", money(data.creditRemaining ?? 0), true)}${
          data.creditDueLabel ? line("Échéance", data.creditDueLabel) : ""
        }`
      : "";

  const customer = data.customerName
    ? `<div class="meta">Client : ${esc(data.customerName)}${data.customerPhone ? ` · ${esc(data.customerPhone)}` : ""}</div>`
    : "";

  const dateLabel = data.date.toLocaleString("fr-FR", {
    timeZone: getActiveTimeZone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Ticket provisoire</title>
<style>
  @page { size: ${widthMm}mm auto; margin: ${(widthMm - contentMm) / 2}mm; }
  * { box-sizing: border-box; }
  body { width: ${contentMm}mm; margin: 0; font-family: "Courier New", monospace; font-size: 11px; color: #000; }
  .center { text-align: center; }
  .store { font-size: 14px; font-weight: 700; }
  .meta { font-size: 10px; margin-top: 2px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .item { margin-bottom: 4px; }
  .item .name { font-weight: 600; }
  .total { font-size: 14px; font-weight: 700; }
  .banner { border: 2px solid #000; padding: 4px; margin: 6px 0; text-align: center; font-weight: 700; font-size: 11px; }
  .foot { margin-top: 8px; font-size: 9px; text-align: center; }
</style></head><body>
  <div class="center">
    <div class="store">${esc(data.storeName)}</div>
    ${data.storeAddress ? `<div class="meta">${esc(data.storeAddress)}</div>` : ""}
    ${data.storePhone ? `<div class="meta">Tel : ${esc(data.storePhone)}</div>` : ""}
  </div>

  <div class="banner">TICKET PROVISOIRE<br>en attente d'enregistrement</div>

  <div class="meta">${esc(dateLabel)}</div>
  <div class="meta">Réf. locale : ${esc(opts.localReference.slice(0, 8).toUpperCase())}</div>
  ${customer}

  <div class="sep"></div>
  ${items}
  <div class="sep"></div>

  ${line("Sous-total", money(data.subtotal))}
  ${data.discount > 0 ? line("Remise", `-${money(data.discount)}`) : ""}
  <div class="row total"><span>TOTAL</span><span>${esc(money(data.total))}</span></div>
  ${line("Paiement", data.paymentMethod)}
  ${data.amountReceived != null ? line("Reçu", money(data.amountReceived)) : ""}
  ${data.change != null && data.change > 0 ? line("Rendu", money(data.change)) : ""}
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
