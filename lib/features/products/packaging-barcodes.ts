import type { ProductItem } from "./types";

/**
 * Un code-barres de conditionnement scanné en caisse doit désigner UN seul article.
 * S'il est déjà pris — par un autre produit, par le conditionnement d'un autre produit,
 * par la pièce du produit courant, ou par une autre ligne de la même saisie — la caisse
 * ajouterait le mauvais article au panier. On le dit donc avant d'enregistrer.
 *
 * Retourne un message prêt à afficher, ou `null` si tous les codes sont libres.
 */
export function findPackagingBarcodeCollision(args: {
  /** Catalogue complet ; le produit courant est ignoré via `selfProductId`. */
  products: ProductItem[];
  selfProductId: string | null;
  /** Code-barres « pièce » du produit courant (colonne `products.barcode`). */
  selfMainBarcode: string;
  /** État final voulu des conditionnements du produit courant. */
  drafts: { label: string; barcode: string }[];
}): string | null {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const selfMain = norm(args.selfMainBarcode);
  const taken = new Map<string, string>(); // code-barres → nom du produit propriétaire
  for (const p of args.products) {
    if (p.id === args.selfProductId) continue;
    const b = norm(p.barcode);
    if (b) taken.set(b, p.name);
    for (const pk of p.product_packagings ?? []) {
      const pb = norm(pk.barcode);
      if (pb && !taken.has(pb)) taken.set(pb, p.name);
    }
  }
  const seen = new Set<string>();
  for (const d of args.drafts) {
    const b = norm(d.barcode);
    if (!b) continue;
    if (b === selfMain) {
      return `Le conditionnement « ${d.label} » a le même code-barres que la pièce de ce produit.`;
    }
    if (seen.has(b)) {
      return `Code-barres en double (« ${d.label} ») : chaque conditionnement doit avoir le sien.`;
    }
    seen.add(b);
    const owner = taken.get(b);
    if (owner) {
      return `Le code-barres du conditionnement « ${d.label} » est déjà utilisé par « ${owner} ».`;
    }
  }
  return null;
}
