import type { EngineCondition, EnginePaymentMethod, EngineWheels } from "./types";

/**
 * Vente d'engin en cours de saisie.
 *
 * L'écran demande une trentaine de champs — identité complète de l'acheteur, numéros de
 * châssis et de moteur, garantie, accessoires remis. C'est plusieurs minutes de frappe,
 * souvent avec la carte d'identité du client en main : le formulaire ne doit pas partir
 * parce que le vendeur est allé vérifier un prix ou une disponibilité dans un autre
 * écran.
 */
export type EngineSaleDraft = {
  /** Étape affichée : revenir directement sur le formulaire, pas sur la liste des modèles. */
  step: "products" | "details";

  productId: string;
  quantity: number;
  unitPrice: number;
  engineUnitId: string;

  clientName: string;
  civility: string;
  profession: string;
  idType: string;
  idNumber: string;
  address: string;
  phone: string;
  email: string;

  wheels: EngineWheels | "";
  brand: string;
  model: string;
  designation: string;
  chassis: string;
  motor: string;
  color: string;
  condition: EngineCondition | "";

  paymentMethod: EnginePaymentMethod;
  amountPaid: number;

  warranty: boolean;
  warrantyDuration: string;
  warrantyKm: string;
  warrantyCovered: string;
  warrantyConditions: string;

  accHelmet: boolean;
  accToolkit: boolean;
  accManual: boolean;
  accKeys: boolean;
  accVest: boolean;
  accOther: string;

  observations: string;
  internalReference: string;
};

/** Incrémenter à tout changement de forme : les brouillons d'avant sont alors ignorés. */
export const ENGINE_SALE_DRAFT_VERSION = 1;

/** Une vente en cours par entreprise × boutique — le stock d'engins est propre à chacune. */
export function engineSaleDraftKey(companyId: string, storeId: string): string {
  return `engine-sale:${companyId}:${storeId}`;
}

/**
 * Le formulaire n'est atteignable qu'après avoir choisi un modèle : sans `productId` et
 * sans nom de client, il n'y a rien d'autre que des valeurs par défaut.
 */
export function isEngineSaleDraftEmpty(draft: EngineSaleDraft): boolean {
  return draft.productId === "" && draft.clientName.trim() === "";
}
