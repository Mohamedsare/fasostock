/**
 * Numéro de reçu court (10 caractères), partagé Web / Flutter / PDF.
 * Forme : `RC` + année (2 chiffres, UTC) + 6 hex (début uuid sans tirets ou hachage si id non hex).
 */
function receiptSixFromPaymentId(paymentId: string): string {
  const compact = String(paymentId ?? "")
    .replace(/-/g, "")
    .toUpperCase();
  if (compact.length === 0) return "000000";
  if (/^[0-9A-F]+$/.test(compact) && compact.length >= 6) {
    return compact.slice(0, 6);
  }
  let h = 0;
  for (let i = 0; i < compact.length; i++) {
    h = (0x1fffffff & (31 * h + compact.charCodeAt(i))) >>> 0;
  }
  return (h % 0x1000000).toString(16).padStart(6, "0").toUpperCase();
}

export function creditRepaymentReceiptNumberFromPaymentId(
  paymentId: string,
  issuedAt: Date | string | number,
): string {
  const d =
    issuedAt instanceof Date
      ? issuedAt
      : new Date(typeof issuedAt === "number" ? issuedAt : String(issuedAt));
  const yy = Number.isFinite(d.getTime())
    ? String(d.getUTCFullYear()).slice(-2)
    : String(new Date().getUTCFullYear()).slice(-2);
  const six = receiptSixFromPaymentId(paymentId);
  return `RC${yy}${six}`;
}

/** Hors ligne / sans id serveur — même longueur 10 (aléatoire sur 6 hex finaux). */
export function creditRepaymentReceiptNumberFallback(issuedAt: Date): string {
  const yy = String(issuedAt.getUTCFullYear()).slice(-2);
  const rnd = Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0")
    .toUpperCase();
  return `RC${yy}${rnd}`;
}
