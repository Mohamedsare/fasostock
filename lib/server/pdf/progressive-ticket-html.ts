import { sanitizeForPdf } from "@/lib/features/invoices/invoice-a4-helpers";
import {
  buildProgressiveQrPayload,
  progressiveTicketTitle,
  type ProgressiveTicketData,
} from "@/lib/features/progressive/ticket-types";
import { progressiveTerms } from "@/lib/features/progressive/progressive-terms";
import { PROGRESSIVE_METHOD_LABELS } from "@/lib/features/progressive/types";
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

/** Jauge d'avancement en caractères ASCII — lisible sur toutes les imprimantes thermiques. */
function progressBar(ratio: number, cells: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(r * cells);
  return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, cells - filled))}] ${Math.round(r * 100)}%`;
}

/**
 * Ticket thermique « Achat Progressif » (versement / remboursement).
 * Même géométrie que le ticket de vente (`receipt-thermal-html.ts`) : zone de
 * contenu ~72 mm (papier 80 mm) ou ~48 mm (papier 58 mm), marges gérées par
 * `html-to-pdf.ts`. Les tailles fixes sont réduites en 58 mm pour tenir la largeur.
 */
export async function renderProgressiveTicketHtml(
  data: ProgressiveTicketData,
  paperWidthMm: 58 | 80 = 80,
): Promise<string> {
  const narrow = paperWidthMm === 58;
  const logoMaxWidthPx = narrow ? 160 : 248;
  const storeFontPx = narrow ? 19 : 25;
  const storeLetterSp = narrow ? 0.4 : 0.65;
  const bigAmountPx = narrow ? 16 : 20;
  const barCells = narrow ? 12 : 18;

  const isRefund = data.kind === "refund";
  const goal =
    data.targetAmount != null && data.targetAmount > 0 ? data.targetAmount : null;
  const remaining = goal != null ? Math.max(0, goal - data.balanceAfter) : null;
  const ratio = goal != null && goal > 0 ? data.balanceAfter / goal : 0;
  const methodLabel = data.method ? PROGRESSIVE_METHOD_LABELS[data.method] : null;
  const terms = progressiveTerms(data.businessTypeSlug);

  const qrDataUrl = await QRCode.toDataURL(buildProgressiveQrPayload(data), {
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
  parts.push(`<div class="title">${escapeHtml(progressiveTicketTitle(data.kind))}</div>`);
  parts.push(`<div class="small center mono">Achat progressif</div>`);
  parts.push(`<div style="height:5px"></div>`);
  parts.push(
    `<div class="meta mono center">${escapeHtml(data.receiptNumber)} · ${escapeHtml(
      formatDateStrFr(data.createdAt),
    )} ${escapeHtml(formatTimeStrFr(data.createdAt))}</div>`,
  );
  parts.push(`<div style="height:5px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);

  parts.push(kv("Dossier", data.planNumber));
  parts.push(kv("Client", data.clientName));
  if (data.clientPhone) parts.push(kv("Tel", data.clientPhone));
  if (data.targetProductName) {
    parts.push(kv(`${terms.singularCap} visé`, data.targetProductName));
  }

  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);
  parts.push(`<div style="height:4px"></div>`);
  parts.push(
    `<div class="amount-label mono">${escapeHtml(
      isRefund ? "MONTANT REMBOURSE" : "MONTANT VERSE",
    )}</div>`,
    `<div class="amount">${escapeHtml(receiptIntAmount(data.amount, data.currencyCode))}</div>`,
  );
  parts.push(`<div style="height:4px"></div>`);
  if (methodLabel) parts.push(kv("Paiement", methodLabel.toUpperCase()));
  if (data.reference) parts.push(kv("Référence", data.reference));
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_LONG)}</div>`);
  parts.push(`<div style="height:4px"></div>`);

  parts.push(kv("Total versé", receiptIntAmount(data.totalDeposited, data.currencyCode)));
  parts.push(kv("Épargne disponible", receiptIntAmount(data.balanceAfter, data.currencyCode)));
  if (goal != null) {
    parts.push(kv("Objectif", receiptIntAmount(goal, data.currencyCode)));
    parts.push(kv("Reste à verser", receiptIntAmount(remaining ?? 0, data.currencyCode)));
    parts.push(`<div style="height:3px"></div>`);
    parts.push(`<div class="bar mono">${escapeHtml(progressBar(ratio, barCells))}</div>`);
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
  parts.push(`<div class="sign mono">Signature client</div>`);
  parts.push(`<div class="sign-line"></div>`);
  parts.push(`<div style="height:8px"></div>`);
  parts.push(
    `<div class="qrwrap"><img src="${qrDataUrl}" width="52" height="52" alt="" /></div>`,
  );
  parts.push(`<div style="height:6px"></div>`);
  parts.push(
    `<div class="thanks mono">${escapeHtml(
      isRefund ? "Remboursement remis au client" : "Conservez bien ce ticket !",
    )}</div>`,
  );
  parts.push(
    `<div class="small center mono">Ce reçu justifie votre épargne — il ne vaut pas facture de vente.</div>`,
  );
  parts.push(`<div style="height:6px"></div>`);
  parts.push(`<div class="sep mono">${escapeHtml(RECEIPT_SEP_MID)}</div>`);
  parts.push(`<div class="powered small center mono">Powered by FasoStock POS</div>`);
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
  .bar { text-align: center; font-size: 8px; }
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
