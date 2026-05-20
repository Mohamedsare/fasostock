import { DEFAULT_APP_URL } from "@/lib/email/app-url";
import { ctaButton, emailLayout, escapeHtml } from "@/lib/email/templates/layout";

export type WelcomeTemplateParams = {
  userName?: string;
  companyName?: string;
  appUrl?: string;
};

export function renderWelcomeEmail(params: WelcomeTemplateParams): string {
  const name = params.userName?.trim() || "Bonjour";
  const company = params.companyName?.trim();
  const appUrl = params.appUrl?.trim() || DEFAULT_APP_URL;

  const bodyHtml = `
    <p style="margin:0 0 16px;">${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">
      Bienvenue sur <strong>FasoStock</strong>${company ? ` pour <strong>${escapeHtml(company)}</strong>` : ""}.
      Votre espace est prêt : gérez stock, ventes, caisse et équipe depuis le web et le mobile.
    </p>
    <p style="margin:0 0 8px;">Pour commencer :</p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      <li>Complétez les paramètres de votre boutique</li>
      <li>Importez ou créez vos produits</li>
      <li>Invitez votre équipe avec les bons rôles</li>
    </ul>
    ${ctaButton(appUrl, "Ouvrir FasoStock")}
  `;

  return emailLayout({
    title: "Bienvenue sur FasoStock",
    preheader: "Votre compte FasoStock est prêt",
    bodyHtml,
  });
}
