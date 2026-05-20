/** Données d’inscription stockées dans `user_metadata` jusqu’à confirmation email. */
export type PendingRegistration = {
  companyName: string;
  companySlug: string;
  firstStoreName: string;
  firstStorePhone: string;
  businessTypeSlug?: string | null;
};

export function parsePendingRegistration(meta: unknown): PendingRegistration | null {
  if (meta == null || typeof meta !== "object") return null;
  const pending = (meta as { pending_registration?: unknown }).pending_registration;
  if (pending == null || typeof pending !== "object") return null;
  const p = pending as Record<string, unknown>;
  const companyName = String(p.companyName ?? "").trim();
  const firstStoreName = String(p.firstStoreName ?? "").trim();
  if (companyName.length < 2 || firstStoreName.length < 2) return null;
  return {
    companyName,
    companySlug: String(p.companySlug ?? "").trim(),
    firstStoreName,
    firstStorePhone: String(p.firstStorePhone ?? "").trim(),
    businessTypeSlug:
      p.businessTypeSlug != null && String(p.businessTypeSlug).trim() !== ""
        ? String(p.businessTypeSlug).trim()
        : null,
  };
}
