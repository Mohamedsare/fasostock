/**
 * Module « Location » — gestion locative immobilière (maisons, villas, magasins…).
 * Aligné sur la migration `00156_rental_module.sql`.
 *
 * Module autonome : il ne touche ni au stock, ni aux ventes, ni à la caisse.
 * Activable par boutique par le super admin (Admin › Paramètres).
 */

/** Moyens de paiement (enum `payment_method` Supabase). */
export type RentalPaymentMethod =
  | "cash"
  | "mobile_money"
  | "card"
  | "transfer"
  | "other";

export const RENTAL_METHOD_LABELS: Record<RentalPaymentMethod, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  card: "Carte",
  transfer: "Virement",
  other: "Autre",
};

export const RENTAL_METHODS: RentalPaymentMethod[] = [
  "cash",
  "mobile_money",
  "card",
  "transfer",
  "other",
];

/** Nature d'un bien. */
export type RentalPropertyKind =
  | "house"
  | "villa"
  | "apartment"
  | "building"
  | "studio"
  | "room"
  | "shop"
  | "office"
  | "warehouse"
  | "land"
  | "other";

export const RENTAL_PROPERTY_KIND_LABELS: Record<RentalPropertyKind, string> = {
  house: "Maison",
  villa: "Villa",
  apartment: "Appartement",
  building: "Immeuble",
  studio: "Studio",
  room: "Chambre / célibatérium",
  shop: "Boutique / magasin",
  office: "Bureau",
  warehouse: "Entrepôt",
  land: "Terrain",
  other: "Autre",
};

export const RENTAL_PROPERTY_KINDS = Object.keys(
  RENTAL_PROPERTY_KIND_LABELS,
) as RentalPropertyKind[];

/** Nature d'un encaissement locatif. */
export type RentalPaymentKind =
  | "rent"
  | "deposit"
  | "deposit_refund"
  | "charge"
  | "other";

export const RENTAL_PAYMENT_KIND_LABELS: Record<RentalPaymentKind, string> = {
  rent: "Loyer",
  deposit: "Caution",
  deposit_refund: "Restitution de caution",
  charge: "Charges (eau, électricité…)",
  other: "Autre",
};

/** Titre imprimé en tête du ticket selon la nature. */
export const RENTAL_RECEIPT_TITLES: Record<RentalPaymentKind, string> = {
  rent: "RECU DE LOYER",
  deposit: "RECU DE CAUTION",
  deposit_refund: "RESTITUTION CAUTION",
  charge: "RECU DE CHARGES",
  other: "RECU",
};

export type RentalLeaseStatus = "active" | "ended" | "terminated";

export const RENTAL_LEASE_STATUS_LABELS: Record<RentalLeaseStatus, string> = {
  active: "En cours",
  ended: "Terminé",
  terminated: "Résilié",
};

export type RentalFrequency = "monthly" | "quarterly" | "yearly";

export const RENTAL_FREQUENCY_LABELS: Record<RentalFrequency, string> = {
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  yearly: "Annuel",
};

export type RentalChargeCategory =
  | "repair"
  | "water"
  | "electricity"
  | "tax"
  | "agency"
  | "cleaning"
  | "security"
  | "other";

export const RENTAL_CHARGE_CATEGORY_LABELS: Record<RentalChargeCategory, string> = {
  repair: "Réparation",
  water: "Eau",
  electricity: "Électricité",
  tax: "Taxe / impôt",
  agency: "Agence / gestion",
  cleaning: "Entretien",
  security: "Gardiennage",
  other: "Autre",
};

export const RENTAL_CHARGE_CATEGORIES = Object.keys(
  RENTAL_CHARGE_CATEGORY_LABELS,
) as RentalChargeCategory[];

/** Bien immobilier + occupation et rendement (RPC `rental_properties_list`). */
export type RentalProperty = {
  id: string;
  storeId: string;
  name: string;
  kind: RentalPropertyKind;
  address: string | null;
  city: string | null;
  district: string | null;
  description: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  unitsCount: number;
  occupiedCount: number;
  vacantCount: number;
  /** Loyers des baux actifs (revenu théorique du mois). */
  monthlyExpected: number;
  /** Idem + loyer de référence des lots vides (potentiel si tout était loué). */
  monthlyPotential: number;
  /** Impayés cumulés sur tous les baux du bien. */
  outstanding: number;
  chargesTotal: number;
};

/** Lot louable + occupant courant (RPC `rental_units_list`). */
export type RentalUnit = {
  id: string;
  propertyId: string;
  propertyName: string;
  label: string;
  floor: string | null;
  rooms: number | null;
  bathrooms: number | null;
  surfaceM2: number | null;
  baseRent: number;
  baseDeposit: number;
  description: string | null;
  isActive: boolean;
  activeLeaseId: string | null;
  tenantName: string | null;
  currentRent: number | null;
};

/** Locataire (RPC `rental_tenants_list`). */
export type RentalTenant = {
  id: string;
  fullName: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  idType: string | null;
  idNumber: string | null;
  profession: string | null;
  employer: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  activeLeases: number;
  /** Solde cumulé de ses baux : > 0 il doit, < 0 il a payé d'avance. */
  totalBalance: number;
};

/** Bail + agrégats de règlement (RPC `rental_leases_list`). */
export type RentalLease = {
  id: string;
  leaseNumber: string;
  storeId: string;
  propertyId: string;
  propertyName: string;
  propertyKind: RentalPropertyKind;
  propertyAddress: string | null;
  unitId: string;
  unitLabel: string;
  tenantId: string;
  tenantName: string;
  tenantPhone: string | null;
  startDate: string;
  endDate: string | null;
  endedAt: string | null;
  endReason: string | null;
  rentAmount: number;
  depositAmount: number;
  frequency: RentalFrequency;
  graceDays: number;
  status: RentalLeaseStatus;
  notes: string | null;
  createdAt: string;
  /** Σ des échéances émises (non annulées). */
  totalDue: number;
  /** Σ des encaissements de loyer. */
  totalPaid: number;
  /** `totalDue − totalPaid` : > 0 impayé, < 0 avance. */
  balance: number;
  /** Caution détenue (versée − restituée). */
  depositPaid: number;
  invoiceCount: number;
  unpaidCount: number;
  /** Échéances non soldées dont la date est dépassée. */
  lateCount: number;
  nextDueDate: string | null;
  /** Fin de la dernière période intégralement payée (« à jour jusqu'au »). */
  paidThrough: string | null;
  lastPaymentAt: string | null;
};

/** Échéance d'un bail (RPC `rental_lease_schedule`). */
export type RentalInvoice = {
  id: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  label: string | null;
  status: "open" | "paid" | "cancelled";
};

/** Encaissement d'un bail (RPC `rental_lease_payments`). */
export type RentalPayment = {
  id: string;
  kind: RentalPaymentKind;
  amount: number;
  method: RentalPaymentMethod | null;
  paidAt: string;
  reference: string | null;
  note: string | null;
  receiptNumber: string | null;
  createdAt: string;
  createdByName: string | null;
};

/** Charge du bailleur (RPC `rental_charges_list`). */
export type RentalCharge = {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string | null;
  unitLabel: string | null;
  label: string;
  category: RentalChargeCategory;
  amount: number;
  spentOn: string;
  method: RentalPaymentMethod | null;
  note: string | null;
  createdAt: string;
};

/** Indicateurs du mois observé (RPC `rental_stats`). */
export type RentalStats = {
  monthStart: string;
  propertiesCount: number;
  unitsCount: number;
  occupiedUnits: number;
  vacantUnits: number;
  activeLeases: number;
  tenantsCount: number;
  /** Loyers attendus sur le mois (échéances émises). */
  expectedMonth: number;
  /** Loyers réellement encaissés dans le mois. */
  collectedMonth: number;
  chargesMonth: number;
  outstandingTotal: number;
  lateLeases: number;
  depositsHeld: number;
  collectedYear: number;
};

export type RentalPropertyInput = {
  id?: string | null;
  companyId: string;
  storeId: string;
  name: string;
  kind: RentalPropertyKind;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  description?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export type RentalUnitInput = {
  id?: string | null;
  propertyId: string;
  label: string;
  baseRent: number;
  baseDeposit?: number;
  floor?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  surfaceM2?: number | null;
  description?: string | null;
  isActive?: boolean;
};

export type RentalTenantInput = {
  id?: string | null;
  companyId: string;
  storeId: string;
  fullName: string;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  profession?: string | null;
  employer?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export type RentalLeaseInput = {
  id?: string | null;
  companyId: string;
  storeId: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  rentAmount: number;
  depositAmount?: number;
  endDate?: string | null;
  frequency?: RentalFrequency;
  graceDays?: number;
  notes?: string | null;
};

export type RentalChargeInput = {
  id?: string | null;
  propertyId: string;
  label: string;
  amount: number;
  category: RentalChargeCategory;
  spentOn?: string | null;
  unitId?: string | null;
  method?: RentalPaymentMethod;
  note?: string | null;
};

export type RentalPaymentResult = {
  paymentId: string;
  receiptNumber: string;
  /** Solde du bail après le règlement (> 0 : reste dû). */
  balance: number;
};
