import { getAppBaseUrl, getBillingUrl } from "@/lib/email/app-url";
import { isResendConfigured } from "@/lib/email/resend";
import {
  sendSubscriptionExpiredEmail,
  sendSubscriptionPaidEmail,
  sendTrialEndingEmail,
  sendTrialStartedEmail,
  sendWelcomeEmail,
} from "@/lib/email/notifications";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TestEmailBody = {
  to?: string;
  template?: "welcome" | "trial_started" | "trial_ending" | "subscription_paid" | "subscription_expired";
};

const TEMPLATES = [
  "welcome",
  "trial_started",
  "trial_ending",
  "subscription_paid",
  "subscription_expired",
] as const;

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }
  const { data: isSa, error } = await supabase.rpc("is_super_admin");
  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }
  if (!isSa) {
    return { ok: false as const, response: NextResponse.json({ error: "Non autorisé" }, { status: 403 }) };
  }
  return { ok: true as const };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  if (!isResendConfigured()) {
    return NextResponse.json(
      { error: "RESEND_API_KEY non configurée sur le serveur." },
      { status: 503 },
    );
  }

  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  let body: TestEmailBody;
  try {
    body = (await req.json()) as TestEmailBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const to = String(body.to ?? "").trim().toLowerCase();
  if (!to || !isValidEmail(to)) {
    return NextResponse.json({ error: "Champ « to » (email) invalide." }, { status: 400 });
  }

  const template = body.template ?? "welcome";
  if (!TEMPLATES.includes(template)) {
    return NextResponse.json(
      { error: `template invalide. Valeurs : ${TEMPLATES.join(", ")}` },
      { status: 400 },
    );
  }

  const demo = {
    userName: "Admin Test",
    companyName: "Boutique Démo Ouaga",
    trialEndsAt: "31/12/2026",
    daysLeft: 3,
    planLabel: "Abonnement annuel",
    amountFcfa: 125_000,
    periodEnd: "31/12/2027",
    expiredAt: "01/01/2026",
    appUrl: getAppBaseUrl(),
    billingUrl: getBillingUrl(),
  };

  try {
    let result;
    switch (template) {
      case "welcome":
        result = await sendWelcomeEmail({ to, userName: demo.userName, companyName: demo.companyName, appUrl: demo.appUrl });
        break;
      case "trial_started":
        result = await sendTrialStartedEmail({
          to,
          companyName: demo.companyName,
          trialEndsAt: demo.trialEndsAt,
          appUrl: demo.appUrl,
        });
        break;
      case "trial_ending":
        result = await sendTrialEndingEmail({
          to,
          companyName: demo.companyName,
          trialEndsAt: demo.trialEndsAt,
          daysLeft: demo.daysLeft,
          billingUrl: demo.billingUrl,
        });
        break;
      case "subscription_paid":
        result = await sendSubscriptionPaidEmail({
          to,
          companyName: demo.companyName,
          planLabel: demo.planLabel,
          amountFcfa: demo.amountFcfa,
          periodEnd: demo.periodEnd,
          appUrl: demo.appUrl,
        });
        break;
      case "subscription_expired":
        result = await sendSubscriptionExpiredEmail({
          to,
          companyName: demo.companyName,
          expiredAt: demo.expiredAt,
          billingUrl: demo.billingUrl,
        });
        break;
    }

    return NextResponse.json({
      ok: true,
      template,
      to,
      resendId: result.resendId,
      logId: result.logId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Échec envoi email.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
