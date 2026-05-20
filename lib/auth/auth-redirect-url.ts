import { getAppBaseUrl } from "@/lib/email/app-url";

/** URL de retour Supabase Auth (confirmation email, magic link). */
export function getAuthRedirectUrl(path: string): string {
  const base = getAppBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
