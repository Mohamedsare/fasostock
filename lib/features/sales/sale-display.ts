import type { SaleItem } from "./types";

/** Nom boutique non vide : jointure API puis liste boutiques du contexte (aligné app Flutter). */
export function saleStoreLabel(
  s: SaleItem,
  stores: { id: string; name: string }[],
): string {
  const n = s.store?.name?.trim();
  if (n) return n;
  const fromCtx = stores.find((x) => x.id === s.store_id)?.name?.trim();
  if (fromCtx) return fromCtx;
  return "Boutique";
}

export function saleSellerLabel(s: SaleItem): string {
  const v = s.created_by_label?.trim();
  return v && v.length > 0 ? v : "—";
}
