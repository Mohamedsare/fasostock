import { ctaButton, emailLayout, escapeHtml } from "@/lib/email/templates/layout";

export type TrialEndingTemplateParams = {
  companyName?: string;
  trialEndsAt?: string;
  daysLeft?: number;
  billingUrl?: string;
};

export function renderTrialEndingEmail(params: TrialEndingTemplateParams): string {
  const company = params.companyName?.trim() || "votre entreprise";
  const trialEnd = params.trialEndsAt?.trim() || "bientôt";
  const days =
    params.daysLeft != null && Number.isFinite(params.daysLeft)
      ? Math.max(0, Math.round(params.daysLeft))
      : null;
  const billingUrl = params.billingUrl?.trim() || "https://app.fasostock.com";

  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">
      L'essai FasoStock pour <strong>${escapeHtml(company)}</strong>
      ${days != null ? ` se termine dans <strong>${days} jour${days > 1 ? "s" : ""}</strong>` : " touche à sa fin"}.
    </p>
    <p style="margin:0 0 16px;padding:12px 16px;background:#fef2f2;border-radius:12px;border:1px solid #fecaca;">
      Date limite : <strong>${escapeHtml(trialEnd)}</strong>
    </p>
    <p style="margin:0 0 16px;">
      Pour éviter toute interruption (accès, synchronisation, rapports), activez votre abonnement avant cette date.
    </p>
    ${ctaButton(billingUrl, "Activer mon abonnement")}
  `;

  return emailLayout({
    title: "Votre essai FasoStock se termine",
    preheader: "Plus que quelques jours d'essai FasoStock",
    bodyHtml,
  });
}
