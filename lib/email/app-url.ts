/** URL canonique production (sans www). */
export const DEFAULT_APP_URL = "https://fasostock.com";

/** URL canonique de l’app (liens emails, redirections auth). */
export function getAppBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return DEFAULT_APP_URL;
}

export function getBillingUrl(): string {
  return `${getAppBaseUrl()}/settings`;
}
