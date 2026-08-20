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
 *
 * Le propriétaire peut renverser la SAISIE (réglage « Prix du conditionnement à la
 * pièce », `packaging_price_per_piece_enabled`) : le champ demande alors le prix d'une
 * pièce du lot, et `packagingPriceFromInput` fait la multiplication. Le stockage, lui,
 * ne change jamais — c'est toujours le prix du lot entier qui part en base.
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
 * Valeur à AFFICHER dans le champ de saisie pour un prix déjà enregistré.
 * En mode « à la pièce », le total stocké est ramené à la pièce (2 décimales au plus,
 * sans zéros inutiles) ; `Math.round(valeur × factor)` retrouve le total d'origine.
 */
export function packagingPriceInputValue(
  storedTotal: number | null | undefined,
  factor: number,
  perPiece: boolean,
): string {
  if (storedTotal == null || !Number.isFinite(Number(storedTotal))) return "";
  const total = Number(storedTotal);
  const f = Math.max(1, Math.floor(Number(factor) || 1));
  if (!perPiece || f < 2) return String(total);
  return String(Math.round((total / f) * 100) / 100);
}

/** Total à ENREGISTRER à partir de la valeur saisie, selon le mode de saisie. */
export function packagingPriceFromInput(
  input: number | null,
  factor: number,
  perPiece: boolean,
): number | null {
  if (input == null || !Number.isFinite(input)) return null;
  const f = Math.max(1, Math.floor(Number(factor) || 1));
  const total = perPiece ? input * f : input;
  return Math.max(0, Math.round(total));
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
  /** Prix du LOT ENTIER (déjà converti si la saisie est à la pièce). `null` = rien à contrôler. */
  price: number | null;
  unitSalePrice: number;
  purchasePrice?: number | null;
  /** Le champ de saisie demande le prix d'une pièce du lot → messages adaptés. */
  perPiece?: boolean;
}): string | null {
  const { label, price, unitSalePrice, perPiece = false } = args;
  if (price == null || !Number.isFinite(price)) return null;
  const factor = Math.max(1, Math.floor(Number(args.factor) || 1));
  if (factor < 2) return null; // un « lot » d'une pièce n'a pas d'équivalent à comparer
  const name = label.trim() || "conditionnement";
  // Le montant conseillé est toujours exprimé dans l'unité du champ affiché.
  const suggestion = (piece: number) =>
    perPiece
      ? `Ce champ attend le prix D'UNE PIÈCE du lot : saisissez au moins ${formatCurrency(piece)}.`
      : `Ce champ attend le prix du LOT ENTIER : pour ${formatCurrency(piece)} la pièce, saisissez ${formatCurrency(piece * factor)}.`;

  /*
   * Lot moins cher qu'une pièce : c'est LA trace d'une saisie inversée. En mode « à la
   * pièce » l'inversion n'existe plus (l'application multiplie elle-même), et un prix
   * de gros volontairement bas ne doit pas être refusé — seule la vente à perte l'est.
   */
  if (!perPiece && unitSalePrice > 0 && price <= unitSalePrice) {
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
