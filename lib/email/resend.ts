import { Resend } from "resend";

const DEFAULT_FROM = "FasoStock <noreply@fasostock.com>";

let client: Resend | null = null;

/** Client Resend — serveur uniquement (RESEND_API_KEY). */
export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY n'est pas configurée.");
  }
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}
