import {
  createEmailLog,
  hasEmailBeenSent,
  markEmailLogFailed,
  markEmailLogSent,
} from "@/lib/email/email-logs";
import { getResendClient, getResendFromEmail } from "@/lib/email/resend";
import type { EmailTemplateKey } from "@/lib/email/templates";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  templateKey?: EmailTemplateKey | string;
  metadata?: Record<string, unknown>;
  /** Si présente et déjà envoyée, l’envoi est ignoré. */
  dedupeKey?: string;
};

export type SendEmailResult = {
  ok: true;
  resendId: string | null;
  logId: string | null;
  skipped?: boolean;
};

function normalizeRecipients(to: string | string[]): string[] {
  const list = (Array.isArray(to) ? to : [to])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) {
    throw new Error("Destinataire email manquant.");
  }
  return list;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Envoie un email via Resend et journalise dans `email_logs` (pending → sent | failed).
 * À appeler uniquement côté serveur (Route Handler, Server Action, cron).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(params.to);
  for (const email of recipients) {
    if (!isValidEmail(email)) {
      throw new Error(`Adresse email invalide : ${email}`);
    }
  }

  const subject = params.subject.trim();
  if (!subject) {
    throw new Error("Sujet email manquant.");
  }

  const dedupeKey = params.dedupeKey?.trim();
  if (dedupeKey && (await hasEmailBeenSent(dedupeKey))) {
    return { ok: true, resendId: null, logId: null, skipped: true };
  }

  const recipientLabel = recipients.join(", ");
  const logId = await createEmailLog({
    recipient: recipientLabel,
    subject,
    templateKey: params.templateKey ?? null,
    metadata: params.metadata,
    dedupeKey: dedupeKey || null,
  });

  if (dedupeKey && !logId) {
    return { ok: true, resendId: null, logId: null, skipped: true };
  }

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: getResendFromEmail(),
      to: recipients,
      subject,
      html: params.html,
    });

    if (error) {
      const message = error.message || "Erreur Resend inconnue.";
      if (logId) await markEmailLogFailed(logId, message);
      throw new Error(message);
    }

    const resendId = data?.id ?? null;
    if (logId) await markEmailLogSent(logId, resendId);

    return { ok: true, resendId, logId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (logId) await markEmailLogFailed(logId, message);
    throw e instanceof Error ? e : new Error(message);
  }
}
