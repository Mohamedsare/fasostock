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
  /**
   * Espace métier — accueil dédié à l'activité de l'entreprise (chiffres du jour
   * dans son vocabulaire, actions fréquentes, mémo de gestion). N'existe que pour
   * les activités décrites dans `lib/features/activity/trade-workspaces.ts`.
   */
  tradeWorkspace: "/metier",
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
  /**
   * Module Réparations (ordres de réparation) — réservé à l'activité « garage-mecanique » :
   * le véhicule entre, on diagnostique, on monte des pièces, on facture.
   */
  repairs: "/reparations",
  /**
   * Caisse à deux : la file des paniers envoyés par les vendeurs, que le caissier
   * confirme et encaisse. Activée par le propriétaire dans Paramètres.
   */
  checkoutQueue: "/encaissement",
  /**
   * Approvisionnement express : la marchandise achetée au marché entre en stock et
   * se vend dans la minute. Activé par le propriétaire dans Paramètres.
   */
  quickSupply: "/approvisionnement",
  /**
   * Devis & Factures : le papier qu'on établit AVANT de vendre (proposition de prix,
   * puis facture). Activé par le propriétaire dans Paramètres.
   */
  saleDocuments: "/factures-devis",
  /** Module Pièces : compatibilités par modèle, équivalences, variantes — activé par la plateforme. */
  parts: "/pieces",
  /** Module Réassort : quoi recommander et en quelle quantité — actif par défaut. */
  restock: "/reassort",
  /**
   * Conditionnements : la page où l'on remplit, d'un seul écran, ce que contient
   * chaque paquet/carton et à quel prix il se vend.
   */
  packagings: "/conditionnements",
  /** Module Emplacements : où se trouve physiquement un produit — activé par le propriétaire. */
  productLocations: "/emplacements",
  /** Module Prix de revient : frais d'approche répartis sur un arrivage — activé par le propriétaire. */
  landedCost: "/prix-revient",
  /** Boutique en ligne : vitrine publique + commandes web — activée par le super admin. */
  onlineStore: "/boutique-en-ligne",
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
  /** Historique des notifications reçues + activation des notifications push (tout utilisateur). */
  notifications: "/notifications",
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
  /** Activation de la boutique en ligne par entreprise / par boutique (super admin). */
  adminOnlineStore: "/admin/boutique-en-ligne",
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

/** Lien catalogue public d'une boutique — celui que le commerçant partage. */
export function onlineStorePath(slug: string): string {
  return `/boutique/${slug}`;
}

/** Suivi public d'une commande passée en ligne (lien remis au client). */
export function onlineOrderTrackPath(slug: string, token: string): string {
  return `/boutique/${slug}/commande/${token}`;
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
