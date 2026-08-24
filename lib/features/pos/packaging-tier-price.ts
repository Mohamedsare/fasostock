/**
 * Paliers de prix (conditionnements) appliqués AUTOMATIQUEMENT dans le panier.
 *
 * Règle métier, décidée en caisse et non négociable :
 *
 *  1. Un tarif de conditionnement ne peut PAS servir tant que la quantité de la ligne
 *     n'atteint pas son nombre de pièces. 3 bougies ne se vendent jamais au prix du
 *     carton de 400 — sinon le magasin vend à perte sans que personne ne le voie.
 *  2. Dès que la quantité ATTEINT un palier, ce palier s'applique tout seul, à TOUTE
 *     la ligne (pas de découpage carton + reste). Le vendeur monte la quantité, le
 *     prix descend, un toast le dit. Et s'il redescend sous le palier, le prix
 *     remonte : le panier ne garde jamais un prix de gros sur une petite quantité.
 *
 * Le prix stocké (`product_packagings.price`) est celui du LOT ENTIER — voir
 * `lib/features/products/packaging-price.ts`. Ici on le ramène à la pièce (arrondi au
 * supérieur, comme la caisse facture) et le total exact de la ligne est recalculé au
 * prorata : 450 pièces au carton (400 pce pour 320 000) = 450 × 800.
 */

export type PackagingTierInput = {
  label: string;
  /** Nombre de pièces contenues. ≥ 1 (les paliers < 2 sont ignorés). */
  factor: number;
  /** Prix du LOT ENTIER ; `null` = factor × prix pièce (donc aucune remise). */
  price: number | null;
};

export type PackagingTier = {
  label: string;
  factor: number;
  /** Prix du lot entier. */
  total: number;
  /** Prix d'une pièce à ce palier (arrondi au supérieur). */
  piecePrice: number;
};

function normalize(tier: PackagingTierInput, unitSalePrice: number): PackagingTier | null {
  const factor = Math.max(0, Math.floor(Number(tier.factor) || 0));
  const label = String(tier.label ?? "").trim();
  if (factor < 2 || label.length === 0) return null;
  const raw = tier.price;
  const total =
    raw != null && Number.isFinite(Number(raw))
      ? Number(raw)
      : (Number(unitSalePrice) || 0) * factor;
  if (!(total > 0)) return null;
  return { label, factor, total, piecePrice: Math.ceil(total / factor) };
}

/**
 * Meilleur palier ATTEIGNABLE pour cette quantité : le moins cher à la pièce parmi
 * ceux dont le nombre de pièces est atteint. `null` si la quantité n'atteint aucun
 * palier — la ligne reste alors au prix catalogue (pièce, gros, promo, arrivage).
 *
 * Le tri ne suppose pas que les conditionnements sont saisis dans l'ordre : un paquet
 * peut très bien être moins cher à la pièce qu'un carton mal tarifé.
 */
export function bestPackagingTier(
  tiers: readonly PackagingTierInput[],
  unitSalePrice: number,
  quantity: number,
): PackagingTier | null {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return null;
  let best: PackagingTier | null = null;
  for (const raw of tiers) {
    const tier = normalize(raw, unitSalePrice);
    if (!tier || tier.factor > qty) continue;
    if (
      best == null ||
      tier.piecePrice < best.piecePrice ||
      (tier.piecePrice === best.piecePrice && tier.factor > best.factor)
    ) {
      best = tier;
    }
  }
  return best;
}

/**
 * Total exact de la ligne à ce palier : le prix du lot ramené au prorata de la
 * quantité réelle. 15 pièces au tarif paquet (10 pce pour 9 000) = 13 500, et non
 * 2 paquets. Arrondi au supérieur, au FCFA, comme le reste de la caisse.
 */
export function packagingTierLineTotal(
  total: number,
  factor: number,
  quantity: number,
): number {
  const f = Math.max(1, Math.floor(Number(factor) || 1));
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  return Math.ceil(((Number(total) || 0) * qty) / f);
}

/** Quantité minimale à atteindre pour débloquer ce palier (message d'aide). */
export function tierUnlockHint(factor: number, unit: string): string {
  const f = Math.max(1, Math.floor(Number(factor) || 1));
  return `à partir de ${f} ${unit || "pce"}`;
}
