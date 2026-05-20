import { DEFAULT_APP_URL } from "@/lib/email/app-url";
import { ctaButton, emailLayout, escapeHtml } from "@/lib/email/templates/layout";

export type SubscriptionPaidTemplateParams = {
  companyName?: string;
  planLabel?: string;
  amountFcfa?: number;
  periodEnd?: string;
  appUrl?: string;
};

function formatFcfa(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.round(amount))) + " CFA";
}

export function renderSubscriptionPaidEmail(params: SubscriptionPaidTemplateParams): string {
  const company = params.companyName?.trim() || "votre entreprise";
  const plan = params.planLabel?.trim() || "Abonnement FasoStock";
  const appUrl = params.appUrl?.trim() || DEFAULT_APP_URL;
  const amount =
    params.amountFcfa != null && Number.isFinite(params.amountFcfa)
      ? formatFcfa(params.amountFcfa)
      : null;
  const periodEnd = params.periodEnd?.trim();

  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">
      Nous avons bien enregistré le paiement de votre abonnement FasoStock pour <strong>${escapeHtml(company)}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;">
      <tr><td style="padding:6px 0;color:#64748b;">Formule</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(plan)}</td></tr>
      ${amount ? `<tr><td style="padding:6px 0;color:#64748b;">Montant</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(amount)}</td></tr>` : ""}
      ${periodEnd ? `<tr><td style="padding:6px 0;color:#64748b;">Valable jusqu'au</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(periodEnd)}</td></tr>` : ""}
    </table>
    <p style="margin:0;">Merci pour votre confiance. Votre accès reste actif sans interruption.</p>
    ${ctaButton(appUrl, "Accéder à FasoStock")}
  `;

  return emailLayout({
    title: "Paiement reçu — FasoStock",
    preheader: "Votre abonnement FasoStock est actif",
    bodyHtml,
  });
}
