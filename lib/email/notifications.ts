import { sendEmail, type SendEmailResult } from "@/lib/email/send-email";
import {
  renderSubscriptionExpiredEmail,
  renderSubscriptionPaidEmail,
  renderTrialEndingEmail,
  renderTrialStartedEmail,
  renderWelcomeEmail,
  type SubscriptionExpiredTemplateParams,
  type SubscriptionPaidTemplateParams,
  type TrialEndingTemplateParams,
  type TrialStartedTemplateParams,
  type WelcomeTemplateParams,
} from "@/lib/email/templates";

export async function sendWelcomeEmail(
  params: WelcomeTemplateParams & { to: string },
): Promise<SendEmailResult> {
  const { to, ...templateParams } = params;
  return sendEmail({
    to,
    subject: "Bienvenue sur FasoStock",
    html: renderWelcomeEmail(templateParams),
    templateKey: "welcome",
    metadata: { ...templateParams },
  });
}

export async function sendTrialStartedEmail(
  params: TrialStartedTemplateParams & { to: string },
): Promise<SendEmailResult> {
  const { to, ...templateParams } = params;
  return sendEmail({
    to,
    subject: "Votre essai FasoStock a démarré",
    html: renderTrialStartedEmail(templateParams),
    templateKey: "trial_started",
    metadata: { ...templateParams },
  });
}

export async function sendTrialEndingEmail(
  params: TrialEndingTemplateParams & { to: string },
): Promise<SendEmailResult> {
  const { to, ...templateParams } = params;
  return sendEmail({
    to,
    subject: "Votre essai FasoStock se termine bientôt",
    html: renderTrialEndingEmail(templateParams),
    templateKey: "trial_ending",
    metadata: { ...templateParams },
  });
}

export async function sendSubscriptionPaidEmail(
  params: SubscriptionPaidTemplateParams & { to: string },
): Promise<SendEmailResult> {
  const { to, ...templateParams } = params;
  return sendEmail({
    to,
    subject: "Paiement reçu — FasoStock",
    html: renderSubscriptionPaidEmail(templateParams),
    templateKey: "subscription_paid",
    metadata: { ...templateParams },
  });
}

export async function sendSubscriptionExpiredEmail(
  params: SubscriptionExpiredTemplateParams & { to: string },
): Promise<SendEmailResult> {
  const { to, ...templateParams } = params;
  return sendEmail({
    to,
    subject: "Votre abonnement FasoStock a expiré",
    html: renderSubscriptionExpiredEmail(templateParams),
    templateKey: "subscription_expired",
    metadata: { ...templateParams },
  });
}
