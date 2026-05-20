import { getBillingUrl } from "@/lib/email/app-url";
import { ctaButton, emailLayout, escapeHtml } from "@/lib/email/templates/layout";

export type SubscriptionExpiredTemplateParams = {
  companyName?: string;
  expiredAt?: string;
  billingUrl?: string;
};

export function renderSubscriptionExpiredEmail(params: SubscriptionExpiredTemplateParams): string {
  const company = params.companyName?.trim() || "votre entreprise";
  const expiredAt = params.expiredAt?.trim();
  const billingUrl = params.billingUrl?.trim() || getBillingUrl();

  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">
      L'abonnement FasoStock de <strong>${escapeHtml(company)}</strong> n'est plus actif.
      ${expiredAt ? ` Date d'expiration : <strong>${escapeHtml(expiredAt)}</strong>.` : ""}
    </p>
    <p style="margin:0 0 16px;">
      Certaines fonctionnalités peuvent être limitées. Renouvelez votre abonnement pour retrouver l'accès complet
      (ventes, stock, rapports, synchronisation mobile).
    </p>
    ${ctaButton(billingUrl, "Renouveler mon abonnement")}
  `;

  return emailLayout({
    title: "Abonnement FasoStock expiré",
    preheader: "Votre abonnement FasoStock a expiré",
    bodyHtml,
  });
}
