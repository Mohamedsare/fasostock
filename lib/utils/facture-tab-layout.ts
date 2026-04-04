/**
 * Aligné sur `app/lib/core/breakpoints.dart` — POS facture (tableau).
 * Hauteur du bandeau produits (Card + recherche + catégories + strip 2 rangées).
 */
export const FACTURE_TAB_TABLET_PX = 600;
export const FACTURE_TAB_DESKTOP_PX = 900;
export const FACTURE_TAB_WIDE_STEP1_PX = 1400;
export const FACTURE_TAB_WIDE_STEP2_PX = 1900;

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
 * `Breakpoints.factureTabStripHeight` — cible ~1/9 de h, plafond 32 % de h,
 * plancher selon largeur (téléphone / tablette / bureau).
 */
export function factureTabStripHeightPx(
  usableHeight: number,
  viewportWidth: number,
): number {
  const h = usableHeight;
  if (h <= 0) return 220;
  const ninth = h / 9;
  const maxStrip = h * 0.32;
  const w = viewportWidth;
  const isPhoneNarrow = Number.isFinite(w) && w < FACTURE_TAB_TABLET_PX;
  const minStrip = isPhoneNarrow
    ? 200
    : Number.isFinite(w) && w < FACTURE_TAB_DESKTOP_PX
      ? 230
      : 250;
  if (maxStrip <= minStrip) {
    return maxStrip;
  }
  if (ninth <= minStrip) return minStrip;
  if (ninth >= maxStrip) return maxStrip;
  return ninth;
}
