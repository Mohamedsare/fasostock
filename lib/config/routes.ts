/**
 * Aligné sur `app/lib/core/config/routes.dart` (Flutter).
 * Chemins Flutter sans page web équivalente pour l’instant : `/create-super-admin`, `/cash`.
 */
export const ROUTES = {
  login: "/login",
  register: "/register",
  /** Choix du type d’activité avant inscription (`?businessType=` sur `/register`). */
  registerSelectActivity: "/register/select-activity",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  products: "/products",
  barcodes: "/barcodes",
  sales: "/sales",
  /** Promotions (remises % par produit / boutique) — tous métiers sauf pharmacie. */
  promotions: "/promotions",
  /** Module Vente Engins (motos) — activé par boutique par le super admin. */
  engines: "/engins",
  /** Module Immatriculation Engins (CMC/WW/récépissé/carte grise) — activé par boutique. */
  engineRegistration: "/immatriculation",
  /** Module Achats Progressifs (épargne par versements vers un engin) — activé par boutique. */
  progressive: "/achats-progressifs",
  /** Module Location (gestion locative immobilière) — activé par boutique. */
  rental: "/location",
  stores: "/stores",
  inventory: "/inventory",
  /** Sessions d'inventaire physique (comptage, écarts, validation). */
  inventorySessions: "/inventaire",
  stockCashier: "/stock-c",
  /** Suivi des dates de péremption (DLC/DLUO) — métiers à suivi de lots (pharmacie, supermarché). */
  expiry: "/peremption",
  purchases: "/purchases",
  /** Gestion des dépenses / charges (loyer, salaires, transport…) — tous métiers. */
  expenses: "/depenses",
  warehouse: "/warehouse",
  transfers: "/transfers",
  customers: "/customers",
  /** Ventes à crédit / créances (placeholder web — compléter selon métier). */
  credit: "/credit",
  suppliers: "/suppliers",
  reports: "/reports",
  ai: "/ai",
  /** Module Comptabilité (SYSCOHADA) — activé par la plateforme. */
  accounting: "/comptabilite",
  /** Module R. Humaine + Paie — activé par la plateforme. */
  hr: "/rh",
  settings: "/settings",
  users: "/users",
  audit: "/audit",
  help: "/help",
  /** Abonnement de l'entreprise (plan, renouvellement, souscription) — owner. */
  subscription: "/abonnement",
  integrations: "/integrations",
  /** Espace super-admin (shell dédié, aligné Flutter `AppRoutes.admin`). */
  admin: "/admin",
  /** Présence en temps réel : qui utilise l'app maintenant, où et pour quoi faire. */
  adminLive: "/admin/live",
  adminCompanies: "/admin/companies",
  adminStores: "/admin/stores",
  adminUsers: "/admin/users",
  adminAudit: "/admin/audit",
  adminAppErrors: "/admin/app-errors",
  adminMessages: "/admin/messages",
  adminAi: "/admin/ai",
  adminReports: "/admin/reports",
  adminGpublique: "/admin/gpublique",
  adminMaps: "/admin/maps",
  adminSettings: "/admin/settings",
} as const;

/** Aligné `AppRoutes.factureTab` (Flutter) — POS facture A4 vue tableau. */
export function storeFactureTabPath(storeId: string): string {
  return `${ROUTES.stores}/${storeId}/facture-tab`;
}

/** Flux de saisie « Vente Engins » (POS engin) pour une boutique. */
export function storeEngineSalePath(storeId: string): string {
  return `${ROUTES.stores}/${storeId}/vente-engin`;
}

/** Page publique de vérification d'une facture engin (QR). */
export function engineSaleVerifyPath(token: string): string {
  return `/verifier/engin/${token}`;
}

/** Barre du bas mobile — 3 raccourcis + « Plus » (comme Flutter `AppShell`). */
export const MOBILE_BOTTOM_PRIMARY = [
  ROUTES.dashboard,
  ROUTES.products,
  ROUTES.sales,
] as const;
