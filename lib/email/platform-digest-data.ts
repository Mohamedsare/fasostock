import { PLATFORM_TIMEZONE } from "@/lib/email/platform-config";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type PlatformDailyDigestData = {
  dateLabel: string;
  isoDate: string;
  totalCompanies: number;
  newCompaniesToday: number;
  salesCountToday: number;
  salesTotalToday: number;
  activeCompaniesToday: number;
  productsTotal: number;
  newProductsToday: number;
  activeUsers24h: number;
  topCompanies: Array<{ name: string; salesCount: number; salesTotal: number }>;
  newCompanies: Array<{ name: string; businessType: string | null; createdAtLabel: string }>;
};

function getDayBounds(reference = new Date()): {
  startIso: string;
  endIso: string;
  dateLabel: string;
  isoDate: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const startIso = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
  const endIso = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0)).toISOString();
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PLATFORM_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(reference);
  const isoDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { startIso, endIso, dateLabel, isoDate };
}

function formatTimeFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PLATFORM_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Agrège l’activité plateforme pour le bilan du soir (22h Africa/Ouagadougou). */
export async function fetchPlatformDailyDigestData(
  reference = new Date(),
): Promise<PlatformDailyDigestData> {
  const svc = createServiceRoleClient();
  const { startIso, endIso, dateLabel, isoDate } = getDayBounds(reference);

  const [
    companiesTotalRes,
    companiesNewRes,
    productsTotalRes,
    productsNewRes,
    salesRes,
    auditRes,
    newCompaniesRes,
  ] = await Promise.all([
    svc.from("companies").select("id", { count: "exact", head: true }),
    svc
      .from("companies")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    svc.from("products").select("id", { count: "exact", head: true }),
    svc
      .from("products")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    svc
      .from("sales")
      .select("company_id, total, companies(name)")
      .eq("status", "completed")
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    svc
      .from("audit_logs")
      .select("user_id")
      .not("user_id", "is", null)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(8000),
    svc
      .from("companies")
      .select("name, business_type_slug, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const salesRows = (salesRes.data ?? []) as Array<{
    company_id?: string;
    total?: number;
    companies?: { name?: string } | Array<{ name?: string }> | null;
  }>;

  let salesCountToday = 0;
  let salesTotalToday = 0;
  const byCompany = new Map<string, { name: string; salesCount: number; salesTotal: number }>();

  for (const row of salesRows) {
    const companyId = String(row.company_id ?? "").trim();
    const total = Number(row.total ?? 0);
    if (!companyId) continue;
    salesCountToday += 1;
    salesTotalToday += Number.isFinite(total) ? total : 0;
    const companiesRaw = row.companies;
    const company = Array.isArray(companiesRaw) ? companiesRaw[0] : companiesRaw;
    const name = String(company?.name ?? "Entreprise").trim() || "Entreprise";
    const prev = byCompany.get(companyId) ?? { name, salesCount: 0, salesTotal: 0 };
    prev.salesCount += 1;
    prev.salesTotal += Number.isFinite(total) ? total : 0;
    byCompany.set(companyId, prev);
  }

  const topCompanies = [...byCompany.values()]
    .sort((a, b) => b.salesTotal - a.salesTotal || b.salesCount - a.salesCount)
    .slice(0, 5);

  const newCompanies = (newCompaniesRes.data ?? []).map((row) => ({
    name: String((row as { name?: string }).name ?? "Entreprise"),
    businessType:
      (row as { business_type_slug?: string | null }).business_type_slug != null
        ? String((row as { business_type_slug?: string | null }).business_type_slug)
        : null,
    createdAtLabel: formatTimeFr(String((row as { created_at?: string }).created_at ?? "")),
  }));

  const auditRows = auditRes.data ?? [];
  const activeUsers24h = new Set(
    auditRows
      .map((row) => String((row as { user_id?: string }).user_id ?? "").trim())
      .filter(Boolean),
  ).size;

  return {
    dateLabel,
    isoDate,
    totalCompanies: companiesTotalRes.count ?? 0,
    newCompaniesToday: companiesNewRes.count ?? 0,
    salesCountToday,
    salesTotalToday,
    activeCompaniesToday: byCompany.size,
    productsTotal: productsTotalRes.count ?? 0,
    newProductsToday: productsNewRes.count ?? 0,
    activeUsers24h,
    topCompanies,
    newCompanies,
  };
}
