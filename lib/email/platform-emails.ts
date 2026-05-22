import { getAppBaseUrl } from "@/lib/email/app-url";
import { getCompanyOwnerEmail } from "@/lib/email/company-recipients";
import {
  fetchPlatformDailyDigestData,
  type PlatformDailyDigestData,
} from "@/lib/email/platform-digest-data";
import { getPlatformAdminEmails, isPlatformEmailConfigured } from "@/lib/email/platform-config";
import { isResendConfigured } from "@/lib/email/resend";
import { sendEmail, type SendEmailResult } from "@/lib/email/send-email";
import { renderPlatformDailyDigestEmail } from "@/lib/email/templates/platform-daily-digest";
import { renderPlatformNewCompanyEmail } from "@/lib/email/templates/platform-new-company";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type PlatformNewCompanyAlertParams = {
  companyId: string;
  ownerEmail?: string | null;
  ownerName?: string | null;
};

async function loadNewCompanyAlertDetails(companyId: string): Promise<{
  companyName: string;
  businessType: string | null;
  createdAtIso: string | null;
  storeName: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
} | null> {
  const id = companyId.trim();
  if (!id) return null;

  const svc = createServiceRoleClient();
  const { data: company, error: cErr } = await svc
    .from("companies")
    .select("id, name, business_type_slug, created_at")
    .eq("id", id)
    .maybeSingle();
  if (cErr || !company) return null;

  const { data: store } = await svc
    .from("stores")
    .select("name")
    .eq("company_id", id)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownerEmail = (await getCompanyOwnerEmail(id)) ?? null;
  let ownerName: string | null = null;
  if (ownerEmail) {
    const { data: member } = await svc
      .from("user_company_roles")
      .select("user_id")
      .eq("company_id", id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (member?.user_id) {
      const { data: userData } = await svc.auth.admin.getUserById(String(member.user_id));
      const meta = userData.user?.user_metadata;
      if (meta && typeof meta === "object" && "full_name" in meta) {
        ownerName = String((meta as { full_name?: string }).full_name ?? "").trim() || null;
      }
    }
  }

  return {
    companyName: String(company.name ?? "Entreprise"),
    businessType:
      company.business_type_slug != null ? String(company.business_type_slug) : null,
    createdAtIso: company.created_at != null ? String(company.created_at) : null,
    storeName: store?.name != null ? String(store.name) : null,
    ownerEmail,
    ownerName,
  };
}

/** Alerte immédiate à l’équipe plateforme quand une entreprise est créée. */
export async function sendPlatformNewCompanyAlert(
  params: PlatformNewCompanyAlertParams,
): Promise<SendEmailResult | null> {
  if (!isResendConfigured() || !isPlatformEmailConfigured()) return null;

  const companyId = params.companyId.trim();
  if (!companyId) return null;

  const details = await loadNewCompanyAlertDetails(companyId);
  if (!details) return null;

  const html = renderPlatformNewCompanyEmail({
    companyName: details.companyName,
    companyId,
    ownerEmail: params.ownerEmail?.trim() || details.ownerEmail,
    ownerName: params.ownerName?.trim() || details.ownerName,
    storeName: details.storeName,
    businessType: details.businessType,
    createdAtIso: details.createdAtIso,
    adminUrl: `${getAppBaseUrl()}/admin/companies`,
  });

  return sendEmail({
    to: getPlatformAdminEmails(),
    subject: `🆕 Nouvelle entreprise — ${details.companyName}`,
    html,
    templateKey: "platform_new_company",
    dedupeKey: `platform_new_company:${companyId}`,
    metadata: { companyId, companyName: details.companyName },
  });
}

/** Bilan d’activité plateforme (cron 22h). */
export async function sendPlatformDailyDigestEmail(
  data: PlatformDailyDigestData,
): Promise<SendEmailResult | null> {
  if (!isResendConfigured() || !isPlatformEmailConfigured()) return null;

  const html = renderPlatformDailyDigestEmail({
    data,
    adminUrl: `${getAppBaseUrl()}/admin`,
  });

  return sendEmail({
    to: getPlatformAdminEmails(),
    subject: `📊 Bilan FasoStock — ${data.dateLabel}`,
    html,
    templateKey: "platform_daily_digest",
    dedupeKey: `platform_daily_digest:${data.isoDate}`,
    metadata: {
      isoDate: data.isoDate,
      salesCountToday: data.salesCountToday,
      newCompaniesToday: data.newCompaniesToday,
    },
  });
}

export type PlatformDigestCronResult = {
  skipped?: boolean;
  reason?: string;
  isoDate?: string;
  sent?: boolean;
};

export async function runPlatformDigestEmailCron(
  reference = new Date(),
): Promise<PlatformDigestCronResult> {
  if (!isResendConfigured() || !isPlatformEmailConfigured()) {
    return { skipped: true, reason: "not_configured" };
  }

  const data = await fetchPlatformDailyDigestData(reference);
  const result = await sendPlatformDailyDigestEmail(data);
  return {
    isoDate: data.isoDate,
    sent: Boolean(result && !result.skipped),
    skipped: result?.skipped === true,
  };
}
