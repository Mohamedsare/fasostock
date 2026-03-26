import type { ProductItem } from "./types";

/** Tri `position` asc puis 1re URL — pour jointures Supabase brutes (`product_images`). */
export function firstProductImageUrlFromNestedRows(imgs: unknown): string | null {
  if (!Array.isArray(imgs) || imgs.length === 0) return null;
  const sorted = [...imgs].sort(
    (a, b) =>
      Number((a as { position?: number }).position ?? 0) -
      Number((b as { position?: number }).position ?? 0),
  );
  const url = (sorted[0] as { url?: string } | undefined)?.url;
  return url != null && url !== "" ? String(url) : null;
}

/** Première image produit (tri `position` asc) — même règle que `listProducts`. */
export function firstProductImageUrl(p: ProductItem): string | null {
  const imgs = p.product_images;
  if (!imgs?.length) return null;
  return imgs[0]?.url ?? null;
}
