/** Types du module « Vente Engins » — vente d'engins (motos) avec facture A4 riche. */

export type EngineWheels = 2 | 3;
export type EngineCondition = "neuf" | "occasion";
export type EnginePaymentMethod = "cash" | "mobile_money" | "card" | "transfer" | "other";

/** Infos client saisies avant enregistrement (affichées sur la facture). */
export type EngineSaleClient = {
  name: string;
  civility: string | null;
  profession: string | null;
  fullIdentity: string | null;
  idType: string | null;
  idNumber: string | null;
  address: string | null;
  addressExtra: string | null;
  phone1: string | null;
  phone2: string | null;
  email: string | null;
};

/** Infos de l'engin vendu. Le produit du catalogue fournit prix + stock. */
export type EngineSaleEngine = {
  wheels: EngineWheels | null;
  brand: string | null;
  model: string | null;
  designation: string | null;
  chassis: string | null;
  motor: string | null;
  color: string | null;
  condition: EngineCondition | null;
};

export type EngineSaleWarranty = {
  enabled: boolean;
  duration: string | null;
  kmLimit: string | null;
  covered: string | null;
  conditions: string | null;
};

export type EngineSaleAccessories = {
  helmet: boolean;
  toolkit: boolean;
  manual: boolean;
  keys: boolean;
  vest: boolean;
  other: string | null;
};

/** Payload de création d'une vente d'engin. */
export type CreateEngineSaleInput = {
  companyId: string;
  storeId: string;
  /** Produit du catalogue (engin) — sert au stock et au prix. */
  productId: string;
  /**
   * Engin PHYSIQUE choisi dans la liste des motos identifiées (`engine_units`).
   * `null` = fonction inactive ou aucun engin choisi : la vente se comporte comme avant,
   * châssis et moteur restant ceux tapés à la main.
   */
  engineUnitId?: string | null;
  quantity: number;
  unitPrice: number;
  payments: Array<{ method: EnginePaymentMethod; amount: number; reference?: string | null }>;
  client: EngineSaleClient;
  engine: EngineSaleEngine;
  warranty: EngineSaleWarranty;
  accessories: EngineSaleAccessories;
  observations: string | null;
  internalReference: string | null;
};

export type CreateEngineSaleResult = {
  saleId: string;
  saleNumber: string;
  verificationToken: string;
  /**
   * L'engin choisi a-t-il bien été sorti du stock ? `false` = la vente est enregistrée
   * (le client a payé) mais la moto est restée « en stock » — l'écran le signale pour
   * que le vendeur corrige la fiche plutôt que de le découvrir à l'inventaire.
   * `undefined` quand aucun engin identifié n'était en jeu.
   */
  engineUnitMarked?: boolean;
};

/** Un règlement rattaché à la vente (table `sale_payments`). */
export type EngineSalePaymentLine = {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
  createdAt: string;
};

/** Statut de règlement dérivé (total vs. somme des paiements). */
export type EnginePaymentStatus = "paid" | "partial" | "unpaid";

/** Détail complet d'une vente d'engin (vue + édition). */
export type EngineSaleDetail = {
  saleId: string;
  saleNumber: string;
  status: string;
  createdAt: string;
  storeId: string;
  total: number;
  client: EngineSaleClient;
  engine: EngineSaleEngine;
  warranty: EngineSaleWarranty;
  accessories: EngineSaleAccessories;
  amountInWords: string | null;
  observations: string | null;
  internalReference: string | null;
  verificationToken: string | null;
  /** Règlements enregistrés pour cette vente. */
  payments: EngineSalePaymentLine[];
};

/** Champs modifiables d'une vente d'engin (descriptifs — pas le montant/stock). */
export type UpdateEngineSaleDetailsInput = {
  client: EngineSaleClient;
  engine: EngineSaleEngine;
  warranty: EngineSaleWarranty;
  accessories: EngineSaleAccessories;
  observations: string | null;
  internalReference: string | null;
};

/** Récap public renvoyé par la page de vérification (QR) — champs non sensibles. */
export type EngineSaleVerification = {
  saleNumber: string;
  saleDate: string;
  total: number;
  storeName: string;
  companyName: string;
  clientName: string | null;
  engineDesignation: string | null;
  engineBrand: string | null;
  engineModel: string | null;
  engineChassis: string | null;
  internalReference: string | null;
  /**
   * Règlement — affiché ici et NULLE PART sur la facture A4 (elle circule et se
   * photocopie ; la situation financière de l'acheteur ne s'expose pas au premier
   * regard). Il faut scanner le QR pour l'obtenir.
   */
  amountPaid: number | null;
  amountDue: number | null;
  paymentStatus: "paid" | "partial" | "unpaid" | null;
  paymentMethods: string[];
};
