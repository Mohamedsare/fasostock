/** PU caisse : détail jusqu'au seuil exclusif, puis prix gros si seuil et prix gros > 0. */
export function posEffectiveUnitPrice(
  salePrice: number,
  wholesalePrice: number,
  wholesaleQty: number,
  cartQuantity: number,
): number {
  const wq = Math.max(0, Math.floor(Number(wholesaleQty) || 0));
  const wp = Number(wholesalePrice) || 0;
  const sp = Number(salePrice) || 0;
  if (wq > 0 && wp > 0 && cartQuantity >= wq) return wp;
  return sp;
}
