import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";
import { escapeHtml } from "./escape-html";
import QRCode from "qrcode";

function tx(s: string): string {
  return escapeHtml(String(s ?? "").trim());
}

function fcfa(v: number): string {
  return `${Math.round(Number(v || 0)).toLocaleString("fr-FR")} FCFA`;
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildReceiptQrPayload(data: CreditRepaymentReceiptData): string {
  return JSON.stringify({
    v: 1,
    doc: "credit_repayment_receipt",
    receipt_no: data.receiptNumber,
    issued_at: data.issuedAt.toISOString(),
    company_id: data.companyId,
    store_id: data.storeId,
    customer_id: data.customerId,
    credit_id: data.creditId,
    payment_id: data.paymentId ?? null,
    amount_paid: Math.round(data.amountPaid),
    currency: data.currency || "XOF",
    remaining_after: Math.round(data.newBalance),
    method: data.paymentMethodCode,
    reference: data.paymentReference ?? null,
  });
}

export async function renderCreditRepaymentReceiptHtml(data: CreditRepaymentReceiptData): Promise<string> {
  const issued = formatDate(data.issuedAt);
  const due = data.dueAt ? formatDate(data.dueAt) : null;
  const badgeText = data.settled ? "CRÉDIT SOLDÉ" : "RÈGLEMENT PARTIEL";
  const badgeTone = data.settled ? "#047857" : "#b45309";
  const qrPayload = buildReceiptQrPayload(data);
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const logo = data.storeLogoUrl?.trim()
    ? `<img src="${tx(data.storeLogoUrl)}" alt="" class="logo" />`
    : `<div class="logo-placeholder">FS</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Inter, Segoe UI, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      font-size: 12px;
    }
    .page {
      width: 100%;
      min-height: 100%;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 2px solid #f97316;
      padding-bottom: 12px;
    }
    .brand {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }
    .logo {
      width: 52px;
      height: 52px;
      object-fit: contain;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
      background: #fff;
      padding: 3px;
    }
    .logo-placeholder {
      width: 52px;
      height: 52px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff7ed;
      color: #c2410c;
      font-weight: 800;
      border: 1px solid #fed7aa;
    }
    .store-name {
      font-size: 18px;
      font-weight: 800;
      line-height: 1.2;
    }
    .store-meta { color: #4b5563; margin-top: 2px; font-size: 11px; }
    .title-wrap { text-align: right; }
    .title {
      font-size: 16px;
      letter-spacing: .06em;
      font-weight: 900;
      color: #c2410c;
    }
    .receipt-no {
      margin-top: 2px;
      color: #374151;
      font-size: 11px;
    }
    .badge {
      display: inline-block;
      margin-top: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      color: ${badgeTone};
      background: color-mix(in srgb, ${badgeTone} 14%, white);
      border: 1px solid color-mix(in srgb, ${badgeTone} 30%, white);
    }
    .grid {
      margin-top: 14px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 10px;
      background: #fafafa;
    }
    .card h3 {
      margin: 0 0 8px 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #6b7280;
    }
    .kv { display: flex; justify-content: space-between; gap: 10px; margin: 4px 0; }
    .kv .k { color: #6b7280; }
    .kv .v { font-weight: 700; text-align: right; }
    .amounts {
      margin-top: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
    }
    .amount-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 12px;
    }
    .amount-row:last-child { border-bottom: none; }
    .amount-row strong { font-size: 14px; }
    .paid { color: #047857; font-weight: 800; }
    .rest { color: #c2410c; font-weight: 900; }
    .note {
      margin-top: 10px;
      border-left: 3px solid #f97316;
      background: #fff7ed;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 11px;
      color: #7c2d12;
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px dashed #d1d5db;
      text-align: center;
      color: #6b7280;
      font-size: 10px;
      line-height: 1.45;
    }
    .qr-wrap {
      margin-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 8px 10px;
      background: #fcfcfc;
    }
    .qr-wrap img {
      width: 86px;
      height: 86px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #fff;
      padding: 3px;
      flex-shrink: 0;
    }
    .qr-meta {
      min-width: 0;
      font-size: 10px;
      color: #4b5563;
      line-height: 1.45;
    }
    .qr-meta b {
      color: #111827;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        ${logo}
        <div>
          <div class="store-name">${tx(data.storeName || "Boutique")}</div>
          ${data.storeAddress ? `<div class="store-meta">${tx(data.storeAddress)}</div>` : ""}
          ${data.storePhone ? `<div class="store-meta">Tél: ${tx(data.storePhone)}</div>` : ""}
        </div>
      </div>
      <div class="title-wrap">
        <div class="title">REÇU DE REMBOURSEMENT</div>
        <div class="receipt-no">N° ${tx(data.receiptNumber)}</div>
        <div class="receipt-no">Date: ${tx(issued)}</div>
        <div class="badge">${tx(badgeText)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Client</h3>
        <div class="kv"><span class="k">Nom</span><span class="v">${tx(data.customerName)}</span></div>
        ${data.customerPhone ? `<div class="kv"><span class="k">Téléphone</span><span class="v">${tx(data.customerPhone)}</span></div>` : ""}
      </div>
      <div class="card">
        <h3>Crédit concerné</h3>
        <div class="kv"><span class="k">Libellé</span><span class="v">${tx(data.creditTitle)}</span></div>
        ${due ? `<div class="kv"><span class="k">Échéance</span><span class="v">${tx(due)}</span></div>` : ""}
      </div>
    </div>

    <div class="amounts">
      <div class="amount-row"><span>Solde avant paiement</span><span>${tx(fcfa(data.previousBalance))}</span></div>
      <div class="amount-row"><span>Montant remboursé</span><span class="paid">${tx(fcfa(data.amountPaid))}</span></div>
      <div class="amount-row"><span>Mode de règlement</span><span>${tx(data.paymentMethodLabel)}</span></div>
      ${data.paymentReference ? `<div class="amount-row"><span>Référence</span><span>${tx(data.paymentReference)}</span></div>` : ""}
      <div class="amount-row"><strong>Nouveau solde dû</strong><strong class="rest">${tx(fcfa(data.newBalance))}</strong></div>
    </div>

    ${data.note?.trim() ? `<div class="note">${tx(data.note)}</div>` : ""}

    <div class="qr-wrap">
      <img src="${qrDataUrl}" alt="QR reçu remboursement" />
      <div class="qr-meta">
        <div><b>QR de traçabilité</b></div>
        <div>N°: ${tx(data.receiptNumber)}</div>
        <div>Paiement: ${tx(fcfa(data.amountPaid))}</div>
        <div>Reste après: ${tx(fcfa(data.newBalance))}</div>
      </div>
    </div>

    <div class="footer">
      Ce document atteste le paiement reçu au titre d'un remboursement de crédit client.<br/>
      Merci pour votre confiance.
    </div>
  </div>
</body>
</html>`;
}
