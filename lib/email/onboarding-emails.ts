import { getAppBaseUrl } from "@/lib/email/app-url";
import { sendPlatformNewCompanyAlert } from "@/lib/email/platform-emails";
import { loadCompanyEmailContext } from "@/lib/email/company-recipients";
import { formatDateFr } from "@/lib/email/format";
import { sendTrialStartedEmail, sendWelcomeEmail } from "@/lib/email/notifications";
import { isResendConfigured } from "@/lib/email/resend";
import type { SendEmailResult } from "@/lib/email/send-email";

export type OnboardingEmailsResult = {
  welcome: SendEmailResult | null;
  trialStarted: SendEmailResult | null;
  platformNewCompany: SendEmailResult | null;
};

/** Bienvenue + essai démarré après inscription (idempotent par entreprise). */
export async function sendOnboardingEmails(params: {
  companyId: string;
  userEmail?: string | null;
  userName?: string | null;
}): Promise<OnboardingEmailsResult> {
  if (!isResendConfigured()) {
    return { welcome: null, trialStarted: null, platformNewCompany: null };
  }

  const ctx = await loadCompanyEmailContext(params.companyId);
  if (!ctx) {
    return { welcome: null, trialStarted: null, platformNewCompany: null };
  }

  const platformNewCompany = await sendPlatformNewCompanyAlert({
    companyId: ctx.companyId,
    ownerEmail: params.userEmail ?? ctx.ownerEmail,
    ownerName: params.userName,
  });

  const to = (params.userEmail?.trim() || ctx.ownerEmail || "").toLowerCase();
  if (!to) {
    return { welcome: null, trialStarted: null, platformNewCompany };
  }

  const appUrl = getAppBaseUrl();
  const companyId = ctx.companyId;

  const welcome = await sendWelcomeEmail({
    to,
    userName: params.userName?.trim() || undefined,
    companyName: ctx.companyName,
    appUrl,
    dedupeKey: `welcome:${companyId}`,
  });

  let trialStarted: SendEmailResult | null = null;
  if (ctx.subscription?.status === "trialing") {
    trialStarted = await sendTrialStartedEmail({
      to,
      companyName: ctx.companyName,
      trialEndsAt: formatDateFr(ctx.subscription.currentPeriodEnd),
      appUrl,
      dedupeKey: `trial_started:${companyId}`,
    });
  }

  return { welcome, trialStarted, platformNewCompany };
}
