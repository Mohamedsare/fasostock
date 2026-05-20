import { notifySubscriptionStatusChange, type SubscriptionStatus } from "@/lib/email/subscription-emails";
import { requireAuthUser, requireSuperAdmin } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  companyId?: string;
  planId?: string;
  status?: SubscriptionStatus;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

const STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due", "canceled", "expired"];

export async function POST(req: Request) {
  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  const sa = await requireSuperAdmin(supabase);
  if (!sa.ok) return sa.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const companyId = String(body.companyId ?? "").trim();
  const planId = String(body.planId ?? "").trim();
  const status = body.status;
  if (!companyId || !planId || !status || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Paramètres abonnement invalides." }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  const { data: existing } = await svc
    .from("company_subscriptions")
    .select("status")
    .eq("company_id", companyId)
    .maybeSingle();

  const previousStatus =
    existing?.status != null ? (String(existing.status) as SubscriptionStatus) : null;

  const payload = {
    company_id: companyId,
    plan_id: planId,
    status,
    current_period_start: body.currentPeriodStart ?? null,
    current_period_end: body.currentPeriodEnd ?? null,
    cancel_at_period_end: body.cancelAtPeriodEnd === true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await svc.from("company_subscriptions").upsert(payload, { onConflict: "company_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let emails: { paid: string; expired: string } = { paid: "none", expired: "none" };
  try {
    const notified = await notifySubscriptionStatusChange({
      companyId,
      previousStatus,
      newStatus: status,
    });
    emails = {
      paid: notified.paid?.skipped ? "skipped" : notified.paid ? "sent" : "none",
      expired: notified.expired?.skipped ? "skipped" : notified.expired ? "sent" : "none",
    };
  } catch (e) {
    console.error("[company-subscription] emails:", e);
  }

  return NextResponse.json({ ok: true, emails });
}
