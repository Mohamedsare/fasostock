/** Règles d’alerte stock — alignées Flutter / page Inventaire. */

export function isBoutiqueProductScope(scope: string | null | undefined): boolean {
  const s = scope ?? "both";
  return s === "both" || s === "boutique_only";
}

/** Comme Flutter `_effectiveMin` et `fetchInventoryScreenData`. */
export function effectiveStockAlertThreshold(
  productStockMin: number,
  override: number | null | undefined,
  defaultThreshold: number,
): number {
  const base = override != null ? override : productStockMin;
  return base > 0 ? base : defaultThreshold;
}

/** Alertes « stock bas » : seuil &gt; 0 et quantité disponible &lt;= seuil (rupture incluse). */
export function isLowStockAlert(
  availableQuantity: number,
  alertThreshold: number,
): boolean {
  return alertThreshold > 0 && availableQuantity <= alertThreshold;
}

export function parseDefaultStockAlertThreshold(raw: unknown): number {
  if (typeof raw === "number" && raw >= 0) return Math.trunc(raw);
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 5;
}
