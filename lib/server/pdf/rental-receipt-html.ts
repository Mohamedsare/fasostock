import { sanitizeForPdf } from "@/lib/features/invoices/invoice-a4-helpers";
import {
  buildRentalQrPayload,
  rentalReceiptTitle,
  type RentalReceiptData,
} from "@/lib/features/rental/ticket-types";
import { RENTAL_METHOD_LABELS } from "@/lib/features/rental/types";
import {
  RECEIPT_SEP_LONG,
  RECEIPT_SEP_MID,
  formatDateStrFr,
  formatTimeStrFr,
  receiptIntAmount,
  telLine,
} from "@/lib/features/receipt/receipt-ticket-format";
import QRCode from "qrcode";
import { ARCHIVO_BLACK_FONT_FACE_CSS } from "./archivo-black-font";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(sanitizeForPdf(s));
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateStrFr(d);
}

/**
 * Quittance thermique du module Location (loyer, caution, charges).
 * Même géométrie que le ticket de vente (`receipt-thermal-html.ts`) : zone de
 * contenu ~72 mm (papier 80 mm) ou ~48 mm (papier 58 mm), marges gérées par
 * `html-to-pdf.ts`. Les tailles fixes sont réduites en 58 mm pour tenir la largeur.
 */
export async function renderRentalReceiptHtml(
  data: RentalReceiptData,
  paperWidthMm: 58 | 80 = 80,
): Promise<string> {
  const narrow = paperWidthMm === 58;
  const logoMaxWidthPx = narrow ? 160 : 248;
  const storeFontPx = narrow ? 19 : 25;
  const storeLetterSp = narrow ? 0.4 : 0.65;
  const bigAmountPx = narrow ? 16 : 20;

  const isRefund = data.kind === "deposit_refund";
  const methodLabel = data.method ? RENTAL_METHOD_LABELS[data.method] : null;
  const owes = data.balanceAfter > 0.5;
  const advance = data.balanceAfter < -0.5;

  const qrDataUrl = await QRCode.toDataURL(buildRentalQrPayload(data), {
    width: 216,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const parts: string[] = [];

  if (data.storeLogoUrl) {
    parts.push(
      `<div class="logo-wrap"><img src="${escapeHtml(data.storeLogoUrl)}" alt="" /></div>`,
    );
  }
  parts.push(`<div class="store">${tx(data.storeName).toUpperCase()}</div>`);
  if (data.storeAddress) {
    parts.push(`<div class="small center mono">${tx(data.storeAddress)}</div>`);
  }
  const tel = telLine(data.storePhone);
  if (tel) parts.push(`<div class="small center mono">${tx(tel)}</div>`);

  parts.push(`<div style="height:6px"></div>`);
  parts.push(`<div class="title">${escapeHtml(rentalReceiptTitle(data.kind))}</div>`);
  parts.push(`<div class="small center mono">Gestion locative</div>`);
  parts.push(`<div style="height:5px"></div>`);
  parts.push(
    `<div class="meta mono center">${escapeHtml(data.receiptNumber)} · ${escapeHtml(
      formatDateStrFr(data.paidAt),
    )} ${escapeHtml(formatTimeStrFr(data.paidAt))}</div>`,
  );
  parts.push(`<div style="height:5px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);

  parts.push(kv("Bail", data.leaseNumber));
  parts.push(kv("Locataire", data.tenantName));
  if (data.tenantPhone) parts.push(kv("Tel", data.tenantPhone));
  parts.push(kv("Bien", data.propertyName));
  parts.push(kv("Lot", data.unitLabel));
  if (data.propertyAddress) parts.push(kv("Adresse", data.propertyAddress));

  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);
  parts.push(`<div style="height:4px"></div>`);
  parts.push(
    `<div class="amount-label mono">${escapeHtml(
      isRefund ? "CAUTION RESTITUEE" : "MONTANT RECU",
    )}</div>`,
    `<div class="amount">${escapeHtml(receiptIntAmount(data.amount, data.currencyCode))}</div>`,
  );
  parts.push(`<div style="height:4px"></div>`);
  if (data.periodsCovered) parts.push(kv("Période(s)", data.periodsCovered));
  if (methodLabel) parts.push(kv("Paiement", methodLabel.toUpperCase()));
  if (data.reference) parts.push(kv("Référence", data.reference));
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);
  parts.push(`<div style="height:4px"></div>`);

  parts.push(kv("Loyer mensuel", receiptIntAmount(data.rentAmount, data.currencyCode)));
  const paidThrough = shortDate(data.paidThrough);
  if (paidThrough) parts.push(kv("À jour jusqu'au", paidThrough));
  if (owes) {
    parts.push(kv("Reste à payer", receiptIntAmount(data.balanceAfter, data.currencyCode)));
    const next = shortDate(data.nextDueDate);
    if (next) parts.push(kv("Prochaine échéance", next));
  } else if (advance) {
    parts.push(kv("Avance en votre faveur", receiptIntAmount(Math.abs(data.balanceAfter), data.currencyCode)));
  } else {
    parts.push(kv("Situation", "COMPTE A JOUR"));
  }

  if (data.note) {
    parts.push(`<div style="height:4px"></div>`);
    parts.push(`<div class="small mono">Note : ${tx(data.note)}</div>`);
  }
  if (data.cashierName) {
    parts.push(`<div style="height:4px"></div>`);
    parts.push(`<div class="small mono">Reçu par : ${tx(data.cashierName)}</div>`);
  }

  parts.push(`<div style="height:6px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);
  parts.push(`<div style="height:6px"></div>`);
  parts.push(`<div class="sign mono">Signature du bailleur</div>`);
  parts.push(`<div class="sign-line"></div>`);
  parts.push(`<div style="height:8px"></div>`);
  parts.push(
    `<div class="qrwrap"><img src="${qrDataUrl}" width="52" height="52" alt="" /></div>`,
  );
  parts.push(`<div style="height:6px"></div>`);
  parts.push(
    `<div class="thanks mono">${escapeHtml(
      isRefund ? "Caution remise au locataire" : "Conservez bien cette quittance !",
    )}</div>`,
  );
  parts.push(
    `<div class="small center mono">Ce reçu atteste du paiement ci-dessus pour le logement indiqué.</div>`,
  );
  parts.push(`<div style="height:6px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_MID)}</div>`);
  parts.push(`<div class="powered small center mono">Powered by FasoStock</div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_MID)}</div>`);

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<style>
  ${ARCHIVO_BLACK_FONT_FACE_CSS}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: system-ui, "Segoe UI", Roboto, sans-serif;
    font-size: 8px;
    width: 100%;
    max-width: 100%;
    color: #000;
  }
  .mono { font-family: "Courier New", Courier, monospace; }
  .logo-wrap { text-align: center; margin-bottom: 4px; }
  .logo-wrap img {
    max-width: ${logoMaxWidthPx}px;
    max-height: 80px;
    width: auto; height: auto;
    object-fit: contain; object-position: center;
    display: inline-block; vertical-align: middle;
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
  .meta { font-size: 8.5px; }
  .title {
    text-align: center;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.6px;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 2px 0;
  }
  .sep { font-size: 7.5px; text-align: center; white-space: nowrap; overflow: hidden; }
  .row { display: flex; justify-content: space-between; gap: 6px; font-size: 8px; }
  .row .k { flex: 0 0 auto; }
  .row .v { text-align: right; font-weight: 700; word-break: break-word; }
  .amount-label { text-align: center; font-size: 7.5px; letter-spacing: 0.5px; }
  .amount {
    text-align: center;
    font-size: ${bigAmountPx}px;
    font-weight: 800;
    line-height: 1.1;
  }
  .sign { font-size: 7px; }
  .sign-line { border-bottom: 1px dotted #000; height: 16px; }
  .thanks { font-size: 8px; font-weight: 700; text-align: center; }
  .powered { font-size: 7.5px; color: #333; margin-top: 2px; }
  .qrwrap { text-align: center; }
  .qrwrap img { display: inline-block; }
</style></head><body>
${parts.join("")}
</body></html>`;
}

function kv(label: string, value: string): string {
  return `<div class="row mono"><span class="k">${tx(label)}</span><span class="v">${tx(
    value,
  )}</span></div>`;
}
