/**
 * Aligné sur `app/lib/core/breakpoints.dart` — POS facture (tableau).
 * Hauteur du bandeau produits (Card + recherche + catégories + strip 2 rangées).
 */
export const FACTURE_TAB_TABLET_PX = 600;
export const FACTURE_TAB_DESKTOP_PX = 900;
export const FACTURE_TAB_WIDE_STEP1_PX = 1400;
export const FACTURE_TAB_WIDE_STEP2_PX = 1900;

/**
 * À partir de cette largeur, la facture (tableau) passe en deux colonnes :
 * catalogue plein écran à gauche, tableau du panier à droite. En dessous, le
 * catalogue reste un bandeau horizontal posé au-dessus du panier.
 */
export const FACTURE_TAB_SPLIT_PX = 1100;

/** Bandeau 2 rangées seul : `pos_product_grid.dart` `PosProductTwoRowHorizontalStrip`. */
export function factureTabProductStripInnerHeightPx(viewportWidth: number): number {
  if (viewportWidth >= FACTURE_TAB_WIDE_STEP2_PX) return 332;
  if (viewportWidth >= FACTURE_TAB_WIDE_STEP1_PX) return 304;
  return 282;
}

/** Largeur de « colonne » du strip horizontal (tuile) — `mainExtent` Flutter. */
export function factureTabStripColumnWidthPx(viewportWidth: number): number {
  if (viewportWidth >= FACTURE_TAB_WIDE_STEP2_PX) return 172;
  if (viewportWidth >= FACTURE_TAB_WIDE_STEP1_PX) return 152;
  return 132;
}

/**
 * Hauteur du bandeau produits en disposition empilée (écran étroit).
 *
 * La règle Flutter d'origine visait ~1/9 de la hauteur : sur un écran de bureau
 * cela donnait un cadre de 250 px pour un contenu de plus de 400 px (recherche +
 * catégories + deux rangées de vignettes), donc des produits coupés en deux et un
 * mini-scroll interne. On part maintenant de la hauteur réelle du contenu
 * (`contentHeight`, mesurée dans le DOM) : le bandeau montre les vignettes en
 * entier tant qu'il reste de la place, sans jamais dépasser 55 % de l'écran pour
 * que le panier garde de quoi travailler.
 */
export function factureTabStripHeightPx(
  usableHeight: number,
  viewportWidth: number,
  contentHeight = 0,
): number {
  const h = usableHeight;
  if (h <= 0) return 220;
  const w = viewportWidth;
  const minStrip =
    Number.isFinite(w) && w < FACTURE_TAB_TABLET_PX
      ? 200
      : Number.isFinite(w) && w < FACTURE_TAB_DESKTOP_PX
        ? 230
        : 250;
  const maxStrip = h * 0.55;
  if (maxStrip <= minStrip) return Math.min(minStrip, h);
  return Math.min(Math.max(minStrip, contentHeight), maxStrip);
}
