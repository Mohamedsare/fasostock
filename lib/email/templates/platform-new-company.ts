import { getAppBaseUrl } from "@/lib/email/app-url";
import { formatDateFr } from "@/lib/email/format";
import {
  platformCtaButton,
  platformEmailLayout,
  platformInfoCard,
  platformSectionTitle,
} from "@/lib/email/templates/platform-layout";

export type PlatformNewCompanyTemplateParams = {
  companyName: string;
  companyId: string;
  ownerEmail?: string | null;
  ownerName?: string | null;
  storeName?: string | null;
  businessType?: string | null;
  createdAtIso?: string | null;
  adminUrl?: string;
};

export function renderPlatformNewCompanyEmail(
  params: PlatformNewCompanyTemplateParams,
): string {
  const adminUrl = params.adminUrl?.trim() || `${getAppBaseUrl()}/admin/companies`;
  const createdLabel = formatDateFr(params.createdAtIso) || "À l'instant";

  const bodyHtml = `
    ${platformSectionTitle(
      "Nouvelle entreprise inscrite",
      "Une nouvelle structure vient de rejoindre FasoStock.",
    )}
    ${platformInfoCard({
      title: params.companyName,
      lines: [
        { label: "Propriétaire", value: params.ownerName?.trim() || "—" },
        { label: "Email", value: params.ownerEmail?.trim() || "—" },
        { label: "Boutique", value: params.storeName?.trim() || "—" },
        { label: "Activité", value: params.businessType?.trim() || "Non renseignée" },
        { label: "Date", value: createdLabel },
        { label: "ID", value: params.companyId },
      ],
    })}
    ${platformCtaButton(adminUrl, "Voir dans l'administration")}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#475569;text-align:center;">
      Pensez à vérifier l'abonnement d'essai et le bon paramétrage de la boutique.
    </p>
  `;

  return platformEmailLayout({
    title: `Nouvelle entreprise — ${params.companyName}`,
    preheader: `${params.companyName} vient de s'inscrire sur FasoStock`,
    hero: {
      eyebrow: "Alerte plateforme",
      title: "Nouvelle inscription",
      subtitle: params.companyName,
      tone: "emerald",
    },
    bodyHtml,
    footerNote: "Notification automatique à chaque création d'entreprise sur FasoStock.",
  });
}
