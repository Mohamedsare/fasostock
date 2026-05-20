import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Email du propriétaire actif de l’entreprise (auth.users). */
export async function getCompanyOwnerEmail(companyId: string): Promise<string | null> {
  const id = companyId.trim();
  if (!id) return null;

  const svc = createServiceRoleClient();
  const { data: roleRow, error: roleErr } = await svc.from("roles").select("id").eq("slug", "owner").maybeSingle();
  if (roleErr || !roleRow?.id) return null;

  const { data: member, error: mErr } = await svc
    .from("user_company_roles")
    .select("user_id")
    .eq("company_id", id)
    .eq("role_id", roleRow.id as string)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mErr || !member?.user_id) return null;

  const { data: userData, error: uErr } = await svc.auth.admin.getUserById(String(member.user_id));
  if (uErr || !userData.user?.email) return null;
  return userData.user.email.trim().toLowerCase();
}

export type CompanyEmailContext = {
  companyId: string;
  companyName: string;
  ownerEmail: string | null;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    planName: string | null;
    planSlug: string | null;
    priceFcfa: number;
  } | null;
};

export async function loadCompanyEmailContext(companyId: string): Promise<CompanyEmailContext | null> {
  const id = companyId.trim();
  if (!id) return null;

  const svc = createServiceRoleClient();
  const { data: company, error: cErr } = await svc.from("companies").select("id, name").eq("id", id).maybeSingle();
  if (cErr || !company) return null;

  const { data: sub } = await svc
    .from("company_subscriptions")
    .select(
      "status, current_period_end, plan:subscription_plans(name, slug, price_cents)",
    )
    .eq("company_id", id)
    .maybeSingle();

  const planRaw = sub?.plan;
  const plan = Array.isArray(planRaw) ? planRaw[0] : planRaw;
  const planRecord = plan as { name?: string; slug?: string; price_cents?: number } | null | undefined;

  return {
    companyId: id,
    companyName: String(company.name ?? "Votre entreprise"),
    ownerEmail: await getCompanyOwnerEmail(id),
    subscription: sub
      ? {
          status: String(sub.status ?? "trialing"),
          currentPeriodEnd: sub.current_period_end != null ? String(sub.current_period_end) : null,
          planName: planRecord?.name != null ? String(planRecord.name) : null,
          planSlug: planRecord?.slug != null ? String(planRecord.slug) : null,
          priceFcfa: Number(planRecord?.price_cents ?? 0),
        }
      : null,
  };
}
