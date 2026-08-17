import { formatCurrency } from "@/lib/utils/currency";

/**
 * Prix des conditionnements (paquet / carton / sachet…).
 *
 * RÈGLE UNIQUE : le champ « Prix » d'un conditionnement est le prix du **LOT ENTIER**
 * — ce que le client paie pour le carton complet — et jamais le prix d'une pièce
 * prise dans ce carton. C'est ainsi que la base le stocke (`product_packagings.price`,
 * migration 00129) et que la caisse l'encaisse.
 *
 * La confusion coûte cher : saisir le prix « de gros à la pièce » (1 250) à la place
 * du prix du lot (25 × 1 250 = 31 250) fait vendre 25 pièces pour 1 250 FCFA, soit
 * moins cher qu'une seule pièce. Ces helpers rendent l'équivalent à la pièce visible
 * partout et refusent les saisies impossibles.
 */

/** Prix du lot entier : prix dédié s'il est saisi, sinon nb de pièces × prix pièce. */
export function packagingTotalPrice(
  price: number | null | undefined,
  factor: number,
  unitSalePrice: number,
): number {
  const f = Math.max(1, Math.floor(Number(factor) || 1));
  if (price != null && Number.isFinite(Number(price))) return Number(price);
  return (Number(unitSalePrice) || 0) * f;
}

/**
 * Prix du lot ramené à la pièce — arrondi **au supérieur**, exactement comme la
 * caisse le facture (`addChosenPackaging`), pour que l'aperçu ne mente jamais.
 */
export function packagingPiecePrice(total: number, factor: number): number {
  const f = Math.max(1, Math.floor(Number(factor) || 1));
  return Math.ceil((Number(total) || 0) / f);
}

/**
 * Contrôle de bon sens d'un prix de conditionnement saisi.
 * Retourne un message prêt à afficher, ou `null` si le prix tient debout.
 *
 * Deux cas seulement, tous deux impossibles dans la vraie vie :
 *  1. le lot entier coûte moins cher (ou autant) qu'une seule pièce ;
 *  2. le lot revient, à la pièce, en dessous du prix d'achat → vente à perte.
 *
 * Dans les deux cas la cause est presque toujours la même — un prix à la pièce saisi
 * dans un champ qui attend le prix du lot — donc le message donne le montant à saisir.
 */
export function packagingPriceProblem(args: {
  label: string;
  factor: number;
  /** Prix saisi. `null` = pas de prix dédié → rien à contrôler. */
  price: number | null;
  unitSalePrice: number;
  purchasePrice?: number | null;
}): string | null {
  const { label, price, unitSalePrice } = args;
  if (price == null || !Number.isFinite(price)) return null;
  const factor = Math.max(1, Math.floor(Number(args.factor) || 1));
  if (factor < 2) return null; // un « lot » d'une pièce n'a pas d'équivalent à comparer
  const name = label.trim() || "conditionnement";
  const suggestion = (piece: number) =>
    `Ce champ attend le prix du LOT ENTIER : pour ${formatCurrency(piece)} la pièce, saisissez ${formatCurrency(piece * factor)}.`;

  if (unitSalePrice > 0 && price <= unitSalePrice) {
    return (
      `« ${name} » : ${factor} pièces à ${formatCurrency(price)}, c'est moins cher qu'une seule pièce ` +
      `(${formatCurrency(unitSalePrice)}). ${suggestion(price)}`
    );
  }

  const purchase = Number(args.purchasePrice ?? 0);
  const piece = packagingPiecePrice(price, factor);
  if (purchase > 0 && piece < purchase) {
    return (
      `« ${name} » : ${formatCurrency(price)} pour ${factor} pièces revient à ${formatCurrency(piece)} la pièce, ` +
      `en dessous du prix d'achat (${formatCurrency(purchase)}) — vous vendriez à perte. ${suggestion(piece)}`
    );
  }

  return null;
}
