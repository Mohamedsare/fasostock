import { sendOnboardingEmails } from "@/lib/email/onboarding-emails";
import { isResendConfigured } from "@/lib/email/resend";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ONBOARDING_WINDOW_MS = 20 * 60 * 1000;

type Body = { companyId?: string };

export async function POST(req: Request) {
  if (!isResendConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "resend_not_configured" });
  }

  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const companyId = String(body.companyId ?? "").trim();
  if (!companyId) {
    return NextResponse.json({ error: "companyId requis." }, { status: 400 });
  }

  const belongs = await userBelongsToCompany(supabase, auth.user.id, companyId);
  if (!belongs) {
    return NextResponse.json({ error: "Non autorisé pour cette entreprise." }, { status: 403 });
  }

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("created_at")
    .eq("id", companyId)
    .maybeSingle();
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!company?.created_at) {
    return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
  }

  const createdAt = new Date(String(company.created_at)).getTime();
  if (Number.isNaN(createdAt) || Date.now() - createdAt > ONBOARDING_WINDOW_MS) {
    return NextResponse.json(
      { error: "Fenêtre d’onboarding expirée. Connectez-vous pour continuer." },
      { status: 403 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileName =
    user?.user_metadata && typeof user.user_metadata === "object" && "full_name" in user.user_metadata
      ? String((user.user_metadata as { full_name?: string }).full_name ?? "")
      : "";

  try {
    const result = await sendOnboardingEmails({
      companyId,
      userEmail: user?.email ?? null,
      userName: profileName || null,
    });

    return NextResponse.json({
      ok: true,
      welcome: result.welcome?.skipped ? "skipped" : result.welcome ? "sent" : "none",
      trialStarted: result.trialStarted?.skipped ? "skipped" : result.trialStarted ? "sent" : "none",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Échec envoi emails.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
