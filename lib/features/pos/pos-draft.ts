import type { MobileMoneyProvider } from "@/lib/features/payments/payment-display";
import type { CartRow } from "./cart-types";

/**
 * Vente en cours de saisie, conservée quand le caissier quitte l'écran.
 *
 * Ne contient que ce qui appartient au **client en face du comptoir** : le panier et les
 * modalités de règlement. Ni la recherche ni la catégorie affichée n'en font partie —
 * retrouver la caisse filtrée sur « Boissons » sans se souvenir pourquoi fait croire à
 * un catalogue amputé, alors que ces deux champs se retapent en une seconde.
 */
export type PosDraft = {
  cart: CartRow[];
  paymentMethod: "cash" | "mobile_money" | "card" | "other";
  quickPayment: "cash" | "mobile_money" | "card" | "credit" | "mixed";
  mobileProvider: MobileMoneyProvider | null;
  splitCashAmount: string;
  discount: string;
  amountReceived: string;
  amountReceivedTouched: boolean;
  customerId: string;
  creditDueDate: string;
  prescriptionNumber: string;
  handoffNote: string;
};

/**
 * Incrémenter à tout changement de forme de `PosDraft` ou de `CartRow` : un brouillon
 * écrit par une version précédente est alors ignoré au lieu d'être restauré de travers.
 */
export const POS_DRAFT_VERSION = 1;

/**
 * Une caisse par entreprise × boutique × mode.
 *
 * Les trois sont nécessaires : la facture A4 et la caisse rapide sont deux écrans
 * distincts avec des règles de prix différentes, et deux boutiques n'ont ni le même
 * stock ni le même client au comptoir. Une clé commune ferait réapparaître le panier
 * d'une boutique dans une autre.
 */
export function posDraftKey(companyId: string, storeId: string, mode: string): string {
  return `pos:${companyId}:${storeId}:${mode}`;
}

/** Sans ligne au panier il n'y a pas de vente en cours : le reste n'est que des valeurs par défaut. */
export function isPosDraftEmpty(draft: PosDraft): boolean {
  return draft.cart.length === 0;
}
