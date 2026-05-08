import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";
import { formatCurrencyFlutter } from "@/lib/utils/currency";
import { formatOperationDateTime } from "@/lib/utils/operation-datetime";
import { escapeHtml } from "./escape-html";
import QRCode from "qrcode";

const CREDIT_AMOUNT_EPS = 0.005;

function tx(s: string): string {
  return escapeHtml(String(s ?? "").trim());
}

function txUpper(s: string): string {
  return escapeHtml(String(s ?? "").trim().toUpperCase());
}

function primaryCss(hex?: string | null): string {
  const h = (hex ?? "").trim();
  const norm = h.startsWith("#") ? h : h.length === 6 ? `#${h}` : "";
  return /^#[0-9A-Fa-f]{6}$/.test(norm) ? norm : "#2196F3";
}

export async function renderCreditRepaymentReceiptHtml(data: CreditRepaymentReceiptData): Promise<string> {
  const issued = formatOperationDateTime(data.issuedAt);
  const receiptNo = (data.receiptNumber ?? "").trim() || "—";
  /** En-tête (très en haut) : nom légal entreprise (`companies.name`, résolu côté PDF). */
  const enterpriseLine = (data.companyName ?? "").trim() || "Entreprise";
  /** À côté du logo : nom de boutique (`stores.name`). */
  const boutiqueHeadline = (data.storeName?.trim() || "Boutique").trim().toUpperCase();
  const primary = primaryCss(data.storePrimaryColor);
  const settledLabel = data.settled ? "CRÉDIT SOLDÉ" : "CRÉDIT EN COURS";
  const statusLine = data.settled
    ? "Statut : soldé"
    : `Statut : solde restant ${formatCurrencyFlutter(data.newBalance)}`;

  const payRef = data.paymentReference?.trim() ?? "";
  const hasPayRef = payRef.length > 0;
  const showTendered =
    data.amountTendered != null && data.amountTendered > CREDIT_AMOUNT_EPS;
  const showChange = data.changeDue != null && data.changeDue > CREDIT_AMOUNT_EPS;

  const noteTrim = data.note?.trim() ?? "";
  const hasNote = noteTrim.length > 0;

  const signerTitle = data.invoiceSignerTitle?.trim() ?? "";
  const signerName = data.invoiceSignerName?.trim() ?? "";
  const hasSig = signerTitle.length > 0 || signerName.length > 0;

  const footerLine = (data.storeFooterText?.trim() ?? "").length > 0 ? data.storeFooterText!.trim() : "Merci pour votre confiance.";

  /** Même payload que l’app Flutter (`receiptNumber|amountPaid|customerName`). */
  const qrPayload = `${data.receiptNumber}|${Math.round(Number(data.amountPaid || 0))}|${String(data.customerName ?? "").trim()}`;
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const logo = data.storeLogoUrl?.trim()
    ? `<div class="logo-box"><img src="${tx(data.storeLogoUrl)}" alt="" class="logo-img" /></div>`
    : "";

  const kv = (label: string, value: string, strongValue = false): string => `
    <div class="kv-row">
      <span class="kv-k">${tx(label)}</span>
      <span class="kv-v ${strongValue ? "strong" : ""}">${tx(value)}</span>
    </div>`;

  const signatureHtml = hasSig
    ? `
    <div class="sig-wrap">
      ${signerTitle ? `<div class="sig-t">${txUpper(signerTitle)}</div>` : ""}
      ${signerName ? `<div class="sig-n">${txUpper(signerName)}</div>` : ""}
    </div>`
    : `<div class="sig-spacer"></div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      min-height: 100%;
    }
    body {
      font-family: system-ui, Segoe UI, Arial, sans-serif;
      color: #000000;
      background: #ffffff;
      font-size: 10px;
      line-height: 1.35;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .page {
      flex: 1;
      display: flex;
      flex-direction: column;
      width: 100%;
      min-height: 100vh;
      padding: 32px;
      max-width: 210mm;
      margin: 0 auto;
    }
    .page-main {
      flex: 1 1 auto;
    }
    .page-header {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid ${primary};
      margin-bottom: 16px;
    }
    .company-name-line {
      margin: 0;
      flex: 1;
      min-width: 0;
      font-size: 16px;
      font-weight: 700;
      color: ${primary};
      line-height: 1.2;
      letter-spacing: 0.02em;
    }
    .receipt-meta-line {
      margin: 0;
      flex-shrink: 0;
      max-width: 48%;
      font-size: 10px;
      font-weight: 400;
      color: #000;
      text-align: right;
      line-height: 1.3;
    }
    .store-row {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 18px;
    }
    .logo-box {
      width: 70px;
      height: 70px;
      flex-shrink: 0;
      border: 0.6pt solid #000;
      background: #fff;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .store-text { flex: 1; min-width: 0; }
    .store-name {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: ${primary};
      letter-spacing: 0.02em;
    }
    .info-line { margin: 4px 0 0 0; font-size: 10px; color: #000; }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .doc-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #000;
    }
    .pill {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      background: ${primary};
      color: #fff;
      font-size: 8px;
      font-weight: 700;
      white-space: nowrap;
    }
    .block {
      border: 0.6pt solid #000;
      background: #fff;
      padding: 10px;
    }
    .row-2 {
      display: flex;
      gap: 12px;
      margin-top: 12px;
      align-items: stretch;
    }
    .col {
      flex: 1;
      min-width: 0;
    }
    .sect-title {
      margin: 0 0 8px 0;
      font-size: 11px;
      font-weight: 700;
      color: ${primary};
    }
    .kv-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-bottom: 6px;
      font-size: 10px;
      color: #000;
    }
    .kv-row:last-child { padding-bottom: 0; }
    .kv-k { font-weight: 400; text-align: left; }
    .kv-v { font-weight: 400; text-align: right; }
    .kv-v.strong { font-weight: 700; }
    hr.sep {
      margin: 6px 0;
      border: none;
      border-top: 1px solid #000;
      height: 0;
    }
    .bal-new {
      font-size: 12px;
      font-weight: 700;
    }
    .status-sub { margin: 6px 0 0 0; font-size: 10px; color: #000; }
    .trace-row {
      display: flex;
      gap: 12px;
      margin-top: 12px;
      align-items: flex-start;
    }
    .qr-box {
      width: 90px;
      height: 90px;
      flex-shrink: 0;
      border: 0.6pt solid #000;
      background: #fff;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-box img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .trace-meta { flex: 1; min-width: 0; }
    .trace-h {
      margin: 0 0 6px 0;
      font-size: 11px;
      font-weight: 700;
      color: ${primary};
    }
    .trace-line { margin: 0 0 2px 0; font-size: 10px; color: #000; }
    .sig-spacer { height: 24px; }
    .sig-wrap {
      margin-top: 40px;
      text-align: right;
    }
    .sig-t { font-size: 12px; color: #000; margin-bottom: 4px; }
    .sig-n { font-size: 11px; color: #000; }
    .foot {
      flex-shrink: 0;
      margin-top: auto;
      padding-top: 8px;
      border-top: 1px solid #000;
      text-align: center;
      font-size: 9px;
      color: #000;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
    <header class="page-header">
      <p class="company-name-line">${tx(enterpriseLine)}</p>
      <p class="receipt-meta-line">Reçu ${tx(receiptNo)} - ${tx(issued)}</p>
    </header>

    <div class="store-row">
      ${logo}
      <div class="store-text">
        <p class="store-name">${tx(boutiqueHeadline)}</p>
        ${data.storeAddress?.trim() ? `<p class="info-line">${tx(data.storeAddress.trim())}</p>` : ""}
        ${data.storePhone?.trim() ? `<p class="info-line">Tél : ${tx(data.storePhone.trim())}</p>` : ""}
        ${data.storeMobileMoney?.trim() ? `<p class="info-line">Mobile money : ${tx(data.storeMobileMoney.trim())}</p>` : ""}
      </div>
    </div>

    <div class="title-row">
      <h1 class="doc-title">Reçu de remboursement crédit</h1>
      <span class="pill">${tx(settledLabel)}</span>
    </div>

    <div class="block">
      ${kv("N° reçu", receiptNo, true)}
      ${kv("Date", issued)}
      ${kv("Crédit concerné", data.creditTitle, true)}
      ${hasNote ? kv("Référence vente", noteTrim) : ""}
    </div>

    <div class="row-2">
      <div class="col block">
        <p class="sect-title">CLIENT</p>
        ${kv("Nom", data.customerName, true)}
        ${data.customerPhone?.trim() ? kv("Tél", data.customerPhone.trim()) : ""}
      </div>
      <div class="col block">
        <p class="sect-title">PAIEMENT</p>
        ${kv("Mode", data.paymentMethodLabel, true)}
        ${hasPayRef ? kv("Référence", payRef) : ""}
        ${showTendered ? kv("Montant reçu", formatCurrencyFlutter(data.amountTendered!)) : ""}
        ${showChange ? kv("Monnaie à rendre", formatCurrencyFlutter(data.changeDue!), true) : ""}
      </div>
    </div>

    <div class="block" style="margin-top:12px;">
      ${kv("Solde avant paiement", formatCurrencyFlutter(data.previousBalance), true)}
      ${kv("Montant remboursé (imputé)", formatCurrencyFlutter(data.amountPaid), true)}
      <hr class="sep" />
      <div class="kv-row bal-new">
        <span class="kv-k">Nouveau solde dû</span>
        <span class="kv-v strong">${tx(formatCurrencyFlutter(data.newBalance))}</span>
      </div>
      <p class="status-sub">${tx(statusLine)}</p>
    </div>

    <div class="trace-row">
      <div class="qr-box">
        <img src="${qrDataUrl}" alt="" />
      </div>
      <div class="trace-meta">
        <p class="trace-h">Traçabilité</p>
        <p class="trace-line">N° reçu : ${tx(data.receiptNumber)}</p>
        <p class="trace-line">Paiement : ${tx(formatCurrencyFlutter(data.amountPaid))}</p>
        <p class="trace-line">Solde après : ${tx(formatCurrencyFlutter(data.newBalance))}</p>
      </div>
    </div>

    ${signatureHtml}

    </div>
    <div class="foot">${tx(footerLine)}</div>
  </div>
</body>
</html>`;
}
