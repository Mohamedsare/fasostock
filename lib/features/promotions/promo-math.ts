import type { Promotion, PromotionStatus } from "./types";

export const PROMO_STATUS_LABELS: Record<PromotionStatus, string> = {
  active: "En cours",
  scheduled: "Programmée",
  expired: "Expirée",
  inactive: "Désactivée",
};

/** Statut affiché : désactivée > (dates) programmée / expirée / en cours. */
export function promotionStatus(p: Promotion, now: Date = new Date()): PromotionStatus {
  if (!p.isActive) return "inactive";
  const t = now.getTime();
  if (p.startsAt) {
    const s = Date.parse(p.startsAt);
    if (Number.isFinite(s) && t < s) return "scheduled";
  }
  if (p.endsAt) {
    const e = Date.parse(p.endsAt);
    if (Number.isFinite(e) && t > e) return "expired";
  }
  return "active";
}

/** Applique une remise en % à un prix, arrondi à l'entier (FCFA). Jamais négatif. */
export function applyPromoPercent(price: number, percent: number): number {
  const p = Number(price) || 0;
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.max(0, Math.round(p * (1 - pct / 100)));
}
