import { getAppBaseUrl } from "@/lib/email/app-url";
import { formatDateFr } from "@/lib/email/format";
import type { PlatformDailyDigestData } from "@/lib/email/platform-digest-data";
import {
  platformCtaButton,
  platformEmailLayout,
  platformInfoCard,
  platformRankList,
  platformSectionTitle,
  platformStatGrid,
} from "@/lib/email/templates/platform-layout";
import { formatCurrencyFlutter } from "@/lib/utils/currency";

export type PlatformDailyDigestTemplateParams = {
  data: PlatformDailyDigestData;
  adminUrl?: string;
};

export function renderPlatformDailyDigestEmail(
  params: PlatformDailyDigestTemplateParams,
): string {
  const data = params.data;
  const adminUrl = params.adminUrl?.trim() || `${getAppBaseUrl()}/admin`;

  const stats = platformStatGrid([
    {
      label: "Ventes du jour",
      value: String(data.salesCountToday),
      hint: formatCurrencyFlutter(data.salesTotalToday),
      accent: "#ea580c",
    },
    {
      label: "Entreprises actives",
      value: String(data.activeCompaniesToday),
      hint: `${data.totalCompanies} au total sur la plateforme`,
      accent: "#0f766e",
    },
    {
      label: "Nouvelles inscriptions",
      value: String(data.newCompaniesToday),
      hint: "Entreprises créées aujourd'hui",
      accent: "#7c3aed",
    },
    {
      label: "Produits catalogue",
      value: String(data.productsTotal),
      hint:
        data.newProductsToday > 0
          ? `+${data.newProductsToday} ajouté(s) aujourd'hui`
          : "Aucun nouveau produit aujourd'hui",
      accent: "#0369a1",
    },
  ]);

  const top = platformRankList(
    data.topCompanies.map((row, index) => ({
      rank: index + 1,
      title: row.name,
      meta: `${row.salesCount} vente${row.salesCount > 1 ? "s" : ""}`,
      value: formatCurrencyFlutter(row.salesTotal),
    })),
  );

  const newCompaniesBlock =
    data.newCompanies.length > 0
      ? data.newCompanies
          .map((c) =>
            platformInfoCard({
              title: c.name,
              accent: "#ecfdf5",
              lines: [
                { label: "Activité", value: c.businessType ?? "Non renseignée" },
                { label: "Inscription", value: c.createdAtLabel },
              ],
            }),
          )
          .join("")
      : `<p style="margin:0 0 18px;padding:14px 16px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;font-size:13px;color:#64748b;">Aucune nouvelle entreprise inscrite aujourd'hui.</p>`;

  const bodyHtml = `
    ${stats}
    ${platformSectionTitle("Top boutiques du jour", "Classement par chiffre d'affaires encaissé.")}
    ${top}
    ${platformSectionTitle("Nouvelles entreprises", "Inscriptions enregistrées sur la journée.")}
    ${newCompaniesBlock}
    ${platformCtaButton(adminUrl, "Ouvrir la console admin")}
    <p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#64748b;text-align:center;">
      Bilan généré le ${formatDateFr(new Date().toISOString())} · fuseau ${"Africa/Ouagadougou"}
    </p>
  `;

  return platformEmailLayout({
    title: `Bilan plateforme — ${data.dateLabel}`,
    preheader: `${data.salesCountToday} ventes · ${data.newCompaniesToday} nouvelles entreprises · ${formatCurrencyFlutter(data.salesTotalToday)}`,
    hero: {
      eyebrow: "Bilan du soir · 22h",
      title: "Activité des entreprises",
      subtitle: data.dateLabel,
      tone: "slate",
    },
    bodyHtml,
  });
}
