import { DEFAULT_APP_URL } from "@/lib/email/app-url";
import { ctaButton, emailLayout, escapeHtml } from "@/lib/email/templates/layout";

export type TrialStartedTemplateParams = {
  companyName?: string;
  trialEndsAt?: string;
  appUrl?: string;
};

export function renderTrialStartedEmail(params: TrialStartedTemplateParams): string {
  const company = params.companyName?.trim() || "votre entreprise";
  const trialEnd = params.trialEndsAt?.trim();
  const appUrl = params.appUrl?.trim() || DEFAULT_APP_URL;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">
      Votre période d'essai FasoStock est active pour <strong>${escapeHtml(company)}</strong>.
      Profitez de toutes les fonctionnalités pendant cette phase.
    </p>
    ${
      trialEnd
        ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fff7ed;border-radius:12px;border:1px solid #fed7aa;">
            Fin de l'essai prévue : <strong>${escapeHtml(trialEnd)}</strong>
          </p>`
        : ""
    }
    <p style="margin:0;">Besoin d'aide pour configurer votre première boutique ? Notre équipe reste disponible.</p>
    ${ctaButton(appUrl, "Continuer sur FasoStock")}
  `;

  return emailLayout({
    title: "Essai FasoStock démarré",
    preheader: "Votre essai FasoStock a commencé",
    bodyHtml,
  });
}
