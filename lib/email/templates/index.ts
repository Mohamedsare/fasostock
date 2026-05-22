export type { WelcomeTemplateParams } from "@/lib/email/templates/welcome";
export { renderWelcomeEmail } from "@/lib/email/templates/welcome";
export type { TrialStartedTemplateParams } from "@/lib/email/templates/trial-started";
export { renderTrialStartedEmail } from "@/lib/email/templates/trial-started";
export type { TrialEndingTemplateParams } from "@/lib/email/templates/trial-ending";
export { renderTrialEndingEmail } from "@/lib/email/templates/trial-ending";
export type { SubscriptionPaidTemplateParams } from "@/lib/email/templates/subscription-paid";
export { renderSubscriptionPaidEmail } from "@/lib/email/templates/subscription-paid";
export type { SubscriptionExpiredTemplateParams } from "@/lib/email/templates/subscription-expired";
export { renderSubscriptionExpiredEmail } from "@/lib/email/templates/subscription-expired";

export type EmailTemplateKey =
  | "welcome"
  | "trial_started"
  | "trial_ending"
  | "subscription_paid"
  | "subscription_expired"
  | "platform_new_company"
  | "platform_daily_digest";
