/**
 * Téléphone client — OBLIGATOIRE à la création comme à la modification.
 * C'est le seul moyen de rappeler un client (relance de crédit, commande prête,
 * livraison) : une fiche sans numéro ne sert à rien sur le terrain.
 */

/** Nombre minimum de chiffres (numéro national Burkina : 8 chiffres). */
export const CUSTOMER_PHONE_MIN_DIGITS = 8;

/** Chiffres du numéro, indicatif et séparateurs (« +226 70 00 00 00 ») ignorés. */
export function customerPhoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Message d'erreur à afficher, ou `null` si le numéro est acceptable. */
export function customerPhoneError(raw: string | null | undefined): string | null {
  const digits = customerPhoneDigits(raw);
  if (digits.length === 0) return "Téléphone requis";
  if (digits.length < CUSTOMER_PHONE_MIN_DIGITS) {
    return `Téléphone incomplet (${CUSTOMER_PHONE_MIN_DIGITS} chiffres minimum)`;
  }
  return null;
}
