import { escapeHtml } from "./escape-html";

export type SubscriptionInvoiceData = {
  invoiceNumber: string;
  issuedAtIso: string;
  companyName: string;
  companyLogoSrc: string | null;
  clientName: string;
  clientPhone: string;
  clientCity: string | null;
  planName: string;
  billingInterval: "month" | "year";
  periodStartIso: string | null;
  periodEndIso: string | null;
  amountCents: number;
  currency: string;
  paymentMethodLabel: string;
  transactionId: string | null;
  qrDataUrl: string;
};

function fmtMoney(amount: number, currency: string): string {
  const n = Math.round(Number(amount) || 0);
  const grouped = n.toLocaleString("fr-FR").replace(/ /g, " ");
  return `${grouped} ${escapeHtml(currency)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Facture A4 d'abonnement FasoStock — mention « Payé », QR d'authenticité, infos entreprise. */
export function renderSubscriptionInvoiceHtml(d: SubscriptionInvoiceData): string {
  const tx = escapeHtml;
  const intervalLabel = d.billingInterval === "year" ? "annuel" : "mensuel";
  const period =
    d.periodStartIso && d.periodEndIso
      ? `Du ${fmtDate(d.periodStartIso)} au ${fmtDate(d.periodEndIso)}`
      : "";
  const amount = fmtMoney(d.amountCents, d.currency);

  const clientLogo = d.companyLogoSrc
    ? `<img src="${tx(d.companyLogoSrc)}" alt="" class="client-logo" />`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 18px; border-bottom: 3px solid #f97316; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark { width: 42px; height: 42px; border-radius: 10px; background: #f97316; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; }
  .brand-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #111827; }
  .brand-name span { color: #f97316; }
  .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .doc { text-align: right; }
  .doc-title { font-size: 26px; font-weight: 800; color: #111827; letter-spacing: 1px; }
  .doc-meta { font-size: 12px; color: #4b5563; margin-top: 4px; }
  .doc-meta b { color: #111827; }

  .paid-stamp { display: inline-block; margin-top: 10px; padding: 6px 16px; border: 2px solid #16a34a; color: #16a34a; border-radius: 8px; font-weight: 800; font-size: 16px; letter-spacing: 2px; transform: rotate(-2deg); background: #f0fdf4; }

  .parties { display: flex; gap: 16px; margin-top: 22px; }
  .party { flex: 1; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 12px; padding: 14px 16px; }
  .party h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 8px; }
  .party .nm { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #111827; }
  .client-logo { width: 34px; height: 34px; object-fit: contain; border-radius: 8px; background:#fff; border:1px solid #eef0f2; }
  .party .ln { font-size: 12px; color: #4b5563; margin-top: 4px; }

  table { width: 100%; border-collapse: collapse; margin-top: 22px; }
  thead th { background: #111827; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; }
  thead th.r { text-align: right; }
  tbody td { padding: 14px 12px; border-bottom: 1px solid #eef0f2; font-size: 13px; vertical-align: top; }
  tbody td.r { text-align: right; }
  .item-title { font-weight: 700; color: #111827; }
  .item-sub { font-size: 11px; color: #6b7280; margin-top: 3px; }

  .totals { display: flex; justify-content: flex-end; margin-top: 16px; }
  .totals-box { width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; color: #4b5563; }
  .totals-grand { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding: 12px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; }
  .totals-grand .lbl { font-weight: 700; color: #166534; }
  .totals-grand .val { font-weight: 800; font-size: 18px; color: #166534; }

  .pay { margin-top: 22px; display: flex; gap: 18px; align-items: center; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 12px; padding: 16px; }
  .pay .info { flex: 1; }
  .pay h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 8px; }
  .pay .kv { font-size: 12px; color: #374151; margin-top: 3px; }
  .pay .kv b { color: #111827; }
  .qr { text-align: center; }
  .qr img { width: 116px; height: 116px; }
  .qr .cap { font-size: 9px; color: #6b7280; margin-top: 4px; max-width: 120px; }

  .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #eef0f2; font-size: 10px; color: #9ca3af; text-align: center; line-height: 1.5; }
</style>
</head>
<body>
  <div class="page">
    <div class="top">
      <div>
        <div class="brand">
          <div class="brand-mark">FS</div>
          <div>
            <div class="brand-name">Faso<span>Stock</span></div>
            <div class="brand-sub">Logiciel de gestion de stock & caisse</div>
          </div>
        </div>
      </div>
      <div class="doc">
        <div class="doc-title">FACTURE</div>
        <div class="doc-meta">N° <b>${tx(d.invoiceNumber)}</b></div>
        <div class="doc-meta">Date : <b>${fmtDate(d.issuedAtIso)}</b></div>
        <div class="paid-stamp">PAYÉ</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Émetteur</h3>
        <div class="nm">FasoStock</div>
        <div class="ln">Plateforme SaaS de gestion commerciale</div>
        <div class="ln">Burkina Faso</div>
      </div>
      <div class="party">
        <h3>Facturé à</h3>
        <div class="nm">${clientLogo}${tx(d.companyName)}</div>
        ${d.clientName.trim() ? `<div class="ln">${tx(d.clientName)}</div>` : ""}
        ${d.clientPhone.trim() ? `<div class="ln">Tél : ${tx(d.clientPhone)}</div>` : ""}
        ${d.clientCity && d.clientCity.trim() ? `<div class="ln">${tx(d.clientCity)}</div>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="r">Qté</th>
          <th class="r">Montant</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="item-title">Abonnement ${tx(d.planName)} (${intervalLabel})</div>
            ${period ? `<div class="item-sub">${tx(period)}</div>` : ""}
          </td>
          <td class="r">1</td>
          <td class="r">${amount}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="totals-row"><span>Sous-total</span><span>${amount}</span></div>
        <div class="totals-row"><span>Taxes</span><span>—</span></div>
        <div class="totals-grand">
          <span class="lbl">Total payé</span>
          <span class="val">${amount}</span>
        </div>
      </div>
    </div>

    <div class="pay">
      <div class="info">
        <h3>Détails du paiement</h3>
        <div class="kv">Méthode : <b>${tx(d.paymentMethodLabel)}</b></div>
        ${d.transactionId && d.transactionId.trim() ? `<div class="kv">ID transaction : <b>${tx(d.transactionId)}</b></div>` : ""}
        <div class="kv">Statut : <b style="color:#16a34a;">Payé</b></div>
      </div>
      <div class="qr">
        <img src="${tx(d.qrDataUrl)}" alt="QR" />
        <div class="cap">Scannez pour vérifier l'authenticité</div>
      </div>
    </div>

    <div class="footer">
      Document généré par FasoStock — preuve de paiement de votre abonnement.<br/>
      Ce reçu certifie le règlement de l'abonnement mentionné ci-dessus. Conservez-le.
    </div>
  </div>
</body>
</html>`;
}
