import { getAppBaseUrl, getBillingUrl } from "@/lib/email/app-url";
import { loadCompanyEmailContext } from "@/lib/email/company-recipients";
import { daysUntil, formatDateFr } from "@/lib/email/format";
import {
  sendSubscriptionExpiredEmail,
  sendSubscriptionPaidEmail,
  sendTrialEndingEmail,
} from "@/lib/email/notifications";
import { isResendConfigured } from "@/lib/email/resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SendEmailResult } from "@/lib/email/send-email";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

/** Emails liés à un changement d’abonnement (super admin). */
export async function notifySubscriptionStatusChange(params: {
  companyId: string;
  previousStatus: SubscriptionStatus | null;
  newStatus: SubscriptionStatus;
}): Promise<{ paid: SendEmailResult | null; expired: SendEmailResult | null }> {
  if (!isResendConfigured()) {
    return { paid: null, expired: null };
  }

  const prev = params.previousStatus;
  const next = params.newStatus;
  const companyId = params.companyId.trim();

  const ctx = await loadCompanyEmailContext(companyId);
  if (!ctx?.ownerEmail) {
    return { paid: null, expired: null };
  }

  const to = ctx.ownerEmail;
  const billingUrl = getBillingUrl();
  const appUrl = getAppBaseUrl();
  const sub = ctx.subscription;

  let paid: SendEmailResult | null = null;
  if (next === "active" && prev !== "active") {
    paid = await sendSubscriptionPaidEmail({
      to,
      companyName: ctx.companyName,
      planLabel: sub?.planName ?? "Abonnement FasoStock",
      amountFcfa: sub?.priceFcfa ?? 0,
      periodEnd: formatDateFr(sub?.currentPeriodEnd),
      appUrl,
      dedupeKey: `subscription_paid:${companyId}:${sub?.currentPeriodEnd ?? "na"}`,
    });
  }

  let expired: SendEmailResult | null = null;
  if (next === "expired" && prev !== "expired") {
    expired = await sendSubscriptionExpiredEmail({
      to,
      companyName: ctx.companyName,
      expiredAt: formatDateFr(sub?.currentPeriodEnd) || formatDateFr(new Date().toISOString()),
      billingUrl,
      dedupeKey: `subscription_expired:${companyId}`,
    });
  }

  return { paid, expired };
}

export type CronEmailRunResult = {
  trialEnding: Array<{ companyId: string; daysLeft: number; skipped?: boolean }>;
  expired: Array<{ companyId: string; skipped?: boolean }>;
};

/** Rappels J-3 / J-1 et abonnements expirés (cron quotidien). */
export async function runSubscriptionEmailCron(): Promise<CronEmailRunResult> {
  const result: CronEmailRunResult = { trialEnding: [], expired: [] };
  if (!isResendConfigured()) return result;

  const svc = createServiceRoleClient();
  const billingUrl = getBillingUrl();

  const { data: trialing, error: tErr } = await svc
    .from("company_subscriptions")
    .select("company_id, current_period_end, status")
    .eq("status", "trialing")
    .not("current_period_end", "is", null);
  if (tErr) {
    console.error("[cron emails] trialing:", tErr.message);
  } else {
    for (const row of trialing ?? []) {
      const companyId = String(row.company_id ?? "");
      const endIso = row.current_period_end != null ? String(row.current_period_end) : null;
      const left = daysUntil(endIso);
      if (left !== 3 && left !== 1) continue;

      const ctx = await loadCompanyEmailContext(companyId);
      if (!ctx?.ownerEmail) continue;

      const sendResult = await sendTrialEndingEmail({
        to: ctx.ownerEmail,
        companyName: ctx.companyName,
        trialEndsAt: formatDateFr(endIso),
        daysLeft: left,
        billingUrl,
        dedupeKey: `trial_ending:${companyId}:d${left}`,
      });

      result.trialEnding.push({
        companyId,
        daysLeft: left,
        skipped: sendResult.skipped === true,
      });
    }
  }

  const { data: expiredRows, error: eErr } = await svc
    .from("company_subscriptions")
    .select("company_id, current_period_end")
    .eq("status", "expired");
  if (eErr) {
    console.error("[cron emails] expired:", eErr.message);
  } else {
    for (const row of expiredRows ?? []) {
      const companyId = String(row.company_id ?? "");
      const ctx = await loadCompanyEmailContext(companyId);
      if (!ctx?.ownerEmail) continue;

      const sendResult = await sendSubscriptionExpiredEmail({
        to: ctx.ownerEmail,
        companyName: ctx.companyName,
        expiredAt: formatDateFr(row.current_period_end != null ? String(row.current_period_end) : null),
        billingUrl,
        dedupeKey: `subscription_expired:${companyId}`,
      });

      result.expired.push({ companyId, skipped: sendResult.skipped === true });
    }
  }

  return result;
}
