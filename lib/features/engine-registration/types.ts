/** Module « Immatriculation Engins » — suivi CMC / WW / récépissé / carte grise. */

/** Étape du cycle de vie du dossier (dérivée). Ordre = progression. */
export type RegistrationStep =
  | "awaiting_payment" // vente non soldée → WW bloqué
  | "ww_to_issue" // soldé, WW à émettre
  | "ww_issued" // WW émis
  | "deposited" // déposé au Ministère des Transports
  | "recepisse" // récépissé reçu
  | "recepisse_delivered" // récépissé remis au client
  | "carte_grise" // carte grise reçue
  | "delivered"; // carte grise remise au client (terminé)

export const REGISTRATION_STEP_ORDER: RegistrationStep[] = [
  "awaiting_payment",
  "ww_to_issue",
  "ww_issued",
  "deposited",
  "recepisse",
  "recepisse_delivered",
  "carte_grise",
  "delivered",
];

export const REGISTRATION_STEP_LABELS: Record<RegistrationStep, string> = {
  awaiting_payment: "En attente de paiement",
  ww_to_issue: "WW à émettre",
  ww_issued: "WW émis",
  deposited: "Déposé au ministère",
  recepisse: "Récépissé reçu",
  recepisse_delivered: "Récépissé remis",
  carte_grise: "Carte grise reçue",
  delivered: "Remise au client",
};

/** Champs du dossier d'immatriculation (documents). */
export type EngineRegistration = {
  cmcAvailable: boolean;
  cmcNumber: string | null;
  cmcDate: string | null;
  wwNumber: string | null;
  wwDate: string | null;
  /** Remise du WW au client — preuve anti-litige. */
  wwDelivered: boolean;
  wwDeliveredDate: string | null;
  wwDeliveredBy: string | null;
  wwReceivedBy: string | null;
  depositDate: string | null;
  depositReference: string | null;
  recepisseNumber: string | null;
  recepisseDate: string | null;
  /** Remise du récépissé au client — preuve anti-litige. */
  recepisseDelivered: boolean;
  recepisseDeliveredDate: string | null;
  recepisseDeliveredBy: string | null;
  recepisseReceivedBy: string | null;
  carteGriseNumber: string | null;
  carteGriseDate: string | null;
  /** Remise de la carte grise au client (date = deliveredToClientDate). */
  carteGriseDelivered: boolean;
  carteGriseDeliveredBy: string | null;
  carteGriseReceivedBy: string | null;
  deliveredToClientDate: string | null;
  notes: string | null;
};

/** Valeurs par défaut d'un dossier vierge (aucune ligne encore en base). */
export const EMPTY_REGISTRATION: EngineRegistration = {
  cmcAvailable: false,
  cmcNumber: null,
  cmcDate: null,
  wwNumber: null,
  wwDate: null,
  wwDelivered: false,
  wwDeliveredDate: null,
  wwDeliveredBy: null,
  wwReceivedBy: null,
  depositDate: null,
  depositReference: null,
  recepisseNumber: null,
  recepisseDate: null,
  recepisseDelivered: false,
  recepisseDeliveredDate: null,
  recepisseDeliveredBy: null,
  recepisseReceivedBy: null,
  carteGriseNumber: null,
  carteGriseDate: null,
  carteGriseDelivered: false,
  carteGriseDeliveredBy: null,
  carteGriseReceivedBy: null,
  deliveredToClientDate: null,
  notes: null,
};

/** Ligne de la liste des dossiers (vente d'engin + paiement + dossier + étape). */
export type EngineRegistrationListItem = {
  saleId: string;
  saleNumber: string;
  createdAt: string;
  storeId: string;
  saleStatus: string;
  clientName: string | null;
  clientPhone: string | null;
  engineDesignation: string | null;
  engineChassis: string | null;
  total: number;
  amountPaid: number;
  remaining: number;
  paid: boolean;
  registration: EngineRegistration;
  step: RegistrationStep;
};

/** Dérive l'étape courante à partir du dossier et de l'état de paiement. */
export function deriveRegistrationStep(
  reg: EngineRegistration,
  paid: boolean,
): RegistrationStep {
  if (reg.deliveredToClientDate || reg.carteGriseDelivered) return "delivered";
  if (reg.carteGriseNumber) return "carte_grise";
  if (reg.recepisseDelivered) return "recepisse_delivered";
  if (reg.recepisseNumber) return "recepisse";
  if (reg.depositDate) return "deposited";
  if (reg.wwNumber) return "ww_issued";
  if (paid) return "ww_to_issue";
  return "awaiting_payment";
}
