/** Destinataires ops / super-admin pour alertes plateforme (séparés par des virgules). */
export function getPlatformAdminEmails(): string[] {
  const raw =
    process.env.PLATFORM_ADMIN_EMAIL?.trim() ||
    process.env.PLATFORM_OPS_EMAIL?.trim() ||
    "";
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

export function isPlatformEmailConfigured(): boolean {
  return getPlatformAdminEmails().length > 0;
}

/** Fuseau plateforme (Burkina Faso = UTC+0). */
export const PLATFORM_TIMEZONE = "Africa/Ouagadougou";
