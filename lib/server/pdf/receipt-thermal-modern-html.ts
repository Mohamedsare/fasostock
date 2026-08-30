import { sanitizeForPdf } from "@/lib/features/invoices/invoice-a4-helpers";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  buildReceiptQrPayload,
  formatDateStrFr,
  formatTimeStrFr,
  paymentUppercase,
  receiptGroupedNumber,
  telLine,
} from "@/lib/features/receipt/receipt-ticket-format";
import { formatCurrencyFlutter } from "@/lib/utils/currency";
import QRCode from "qrcode";
import { ARCHIVO_BLACK_FONT_FACE_CSS } from "./archivo-black-font";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(sanitizeForPdf(s));
}

/**
 * Ticket thermique — modèle « Moderne » (`stores.receipt_template = 'moderne'`).
 *
 * Jumeau à l'impression de `ReceiptTicketPreviewModern` (aperçu page Boutiques) :
 * toute retouche ici doit être reportée là-bas.
 *
 * Même géométrie que le modèle classique : zone de contenu ~72 mm (papier 80 mm) ou
 * ~48 mm (papier 58 mm), marges gérées dans `html-to-pdf.ts`. Le viewport suit la
 * largeur du papier, donc les `px` ont la même taille **physique** sur les deux
 * formats ; en 58 mm on ne réduit que les éléments à largeur fixe (logo, nom de la
 * boutique, QR). Aucun nom d'article n'est tronqué : il occupe sa propre ligne.
 */
export async function renderReceiptThermalModernHtml(
  data: ReceiptTicketData,
  paperWidthMm: 58 | 80 = 80,
): Promise<string> {
  const narrow = paperWidthMm === 58;
  const logoMaxWidthPx = narrow ? 150 : 240;
  const storeFontPx = narrow ? 15 : 19;
  const storeLetterSp = narrow ? 0.5 : 0.9;
  const qrPx = narrow ? 52 : 58;
  // Le 58 mm ne rétrécit que ce qui risque de toucher les bords : le corps du texte
  // garde une taille lisible sur les deux papiers.
  const subFontPx = narrow ? 7 : 7.5;
  const kvFontPx = narrow ? 7.5 : 8;
  const itemNamePx = narrow ? 8 : 8.5;
  const totalFontPx = narrow ? 10 : 11;

  const money = (n: number): string =>
    formatCurrencyFlutter(Math.round(n), data.currencyCode);
  const unitPrice = (n: number): string =>
    receiptGroupedNumber(n, data.currencyCode);

  const tel = telLine(data.storePhone);
  const payU = paymentUppercase(data.paymentMethod);
  const isCash = payU === "ESPECES";
  const qrDataUrl = await QRCode.toDataURL(buildReceiptQrPayload(data), {
    width: 216,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const kv = (label: string, value: string, strong = false): string =>
    `<div class="kv${strong ? " strong" : ""}"><span class="k">${tx(label)}</span><span class="v">${tx(value)}</span></div>`;

  const parts: string[] = [];
  const logoUrl = data.storeLogoUrl?.trim();
  if (logoUrl) {
    parts.push(
      `<div class="logo-wrap"><img src="${escapeHtml(logoUrl)}" alt="" /></div>`,
    );
  }
  parts.push(`<div class="store">${tx(data.storeName).toUpperCase()}</div>`);
  const subLine = [data.storeAddress?.trim(), tel].filter(Boolean).join(" · ");
  if (subLine) {
    parts.push(`<div class="sub">${tx(subLine)}</div>`);
  }

  parts.push(`<div class="rule strong"></div>`);
  parts.push(kv("Reçu n°", data.saleNumber, true));
  parts.push(
    kv("Date", `${formatDateStrFr(data.date)} · ${formatTimeStrFr(data.date)}`),
  );
  if (data.customerName?.trim()) {
    parts.push(kv("Client", data.customerName.trim()));
  }
  parts.push(`<div class="rule"></div>`);

  parts.push(`<div class="tag">Articles</div>`);
  for (const item of data.items) {
    parts.push(`<div class="item">
      <div class="item-name">${tx(item.name.trim())}</div>
      <div class="item-line">
        <span class="qty">${item.quantity} × ${escapeHtml(unitPrice(item.unitPrice))}</span>
        <span class="line-total">${escapeHtml(money(item.total))}</span>
      </div>
    </div>`);
  }
  parts.push(`<div class="rule"></div>`);

  parts.push(kv("Sous-total", money(data.subtotal)));
  if (data.discount > 0) {
    parts.push(kv("Remise", `- ${money(data.discount)}`));
  }
  parts.push(
    `<div class="total-band"><span>TOTAL</span><span>${escapeHtml(money(data.total))}</span></div>`,
  );

  parts.push(kv("Paiement", payU, true));
  // Vente réglée en deux moyens (espèces + mobile money) : le détail fait la preuve.
  for (const split of data.paymentSplit ?? []) {
    parts.push(kv(split.label, money(split.amount)));
  }
  if (isCash) {
    parts.push(kv("Reçu", money(data.amountReceived ?? data.total)));
    parts.push(kv("Rendu", money(data.change ?? 0)));
  }

  // Vente à crédit : le ticket sert de preuve de dette (acompte, reste, échéance).
  const creditRemaining = Math.max(0, data.creditRemaining ?? 0);
  if (creditRemaining > 0) {
    const inner: string[] = [kv("Acompte versé", money(data.creditPaid ?? 0))];
    inner.push(
      `<div class="due"><span>RESTE À PAYER</span><span>${escapeHtml(money(creditRemaining))}</span></div>`,
    );
    if (data.creditDueLabel?.trim()) {
      inner.push(kv("Échéance", data.creditDueLabel.trim()));
    }
    parts.push(`<div class="credit-box">${inner.join("")}</div>`);
  }

  parts.push(`<div class="rule"></div>`);
  parts.push(
    `<div class="qrwrap"><img src="${qrDataUrl}" width="${qrPx}" height="${qrPx}" alt="" /></div>`,
  );
  parts.push(`<div class="qr-caption">Scannez pour vérifier ce ticket</div>`);
  parts.push(`<div class="thanks">Merci pour votre achat !</div>`);
  parts.push(`<div class="rule"></div>`);
  parts.push(`<div class="powered">Powered by FasoStock POS</div>`);

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
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .logo-wrap { text-align: center; margin-bottom: 4px; }
  .logo-wrap img {
    max-width: ${logoMaxWidthPx}px;
    max-height: 76px;
    width: auto;
    height: auto;
    object-fit: contain;
    object-position: center;
    display: inline-block;
    vertical-align: middle;
  }
  .store {
    font-family: "Archivo Black", sans-serif;
    font-size: ${storeFontPx}px;
    letter-spacing: ${storeLetterSp}px;
    line-height: 1.1;
    text-align: center;
    font-weight: 400;
  }
  .sub {
    text-align: center;
    font-size: ${subFontPx}px;
    line-height: 1.3;
    color: #333;
    margin-top: 3px;
  }
  .rule { border-top: 1px solid #BBB; margin: 7px 0; }
  .rule.strong { border-top: 1.2px solid #000; }
  .kv {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    font-size: ${kvFontPx}px;
    line-height: 1.45;
  }
  .kv .k { color: #333; overflow: hidden; }
  .kv .v { font-weight: 600; white-space: nowrap; flex: 0 0 auto; }
  .kv.strong .v { font-weight: 700; }
  .tag {
    font-size: 6.5px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: #444;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .item { margin-bottom: 5px; }
  .item-name { font-size: ${itemNamePx}px; font-weight: 600; line-height: 1.25; }
  .item-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    font-size: ${kvFontPx}px;
    line-height: 1.3;
    margin-top: 1px;
  }
  .item-line .qty { color: #333; }
  .item-line .line-total { font-weight: 700; white-space: nowrap; }
  .total-band {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    background: #000;
    color: #fff;
    padding: 4px 6px;
    margin: 6px 0;
    font-size: ${totalFontPx}px;
    font-weight: 800;
    letter-spacing: 0.3px;
  }
  .credit-box { border: 1px solid #000; padding: 4px 6px; margin-top: 5px; }
  .due {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    font-size: 9.5px;
    font-weight: 800;
    margin-top: 2px;
  }
  .qrwrap { text-align: center; }
  .qrwrap img { display: inline-block; }
  .qr-caption { text-align: center; font-size: 6.5px; color: #333; margin-top: 3px; }
  .thanks { text-align: center; font-size: 9px; font-weight: 700; margin-top: 7px; }
  .powered { text-align: center; font-size: 6.5px; color: #555; }
</style></head><body>
${parts.join("")}
</body></html>`;
}
