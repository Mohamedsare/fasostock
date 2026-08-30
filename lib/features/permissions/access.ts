import { P } from "@/lib/constants/permissions";
import { ROUTES } from "@/lib/config/routes";
import type { NavItem } from "@/lib/config/navigation";
import {
  adaptNavItemsForActivity,
  isRouteAllowedForActivity,
} from "@/lib/features/activity/activity-profiles";
import { activityConfig } from "@/lib/features/activity/activity-config";
import { tradeWorkspace } from "@/lib/features/activity/trade-workspaces";
import { getBusinessTypeBySlug } from "@/lib/config/business-types";

/** Icône de l'activité (réutilisée pour l'entrée de menu « Espace métier »). */
function businessTypeIcon(slug: string | null | undefined) {
  return getBusinessTypeBySlug(slug)?.icon;
}

/** Chemins affichés en menu restreint pendant le chargement des droits (Flutter `cashierPaths`). */
export const CASHIER_FALLBACK_HREFS = [
  ROUTES.sales,
  ROUTES.products,
  ROUTES.customers,
  ROUTES.stockCashier,
] as const;

export type AppContextData = {
  companyId: string;
  companyName: string;
  /** `companies.business_type_slug` — onboarding (personnalisation par activité). */
  businessTypeSlug: string | null;
  /** `companies.logo_url` — menu, factures, paramètres (aligné Flutter). */
  companyLogoUrl: string | null;
  storeId: string | null;
  stores: {
    id: string;
    name: string;
    isPrimary?: boolean;
    engineSalesEnabled?: boolean;
    engineRegistrationEnabled?: boolean;
    progressivePurchasesEnabled?: boolean;
    /** Module Location (gestion locative) activé pour cette boutique. */
    rentalModuleEnabled?: boolean;
    /** Suivi de péremption (DLC/DLUO) ouvert pour cette boutique par la plateforme. */
    expiryModuleEnabled?: boolean;
    /** Module Pièces (compatibilités / équivalences / variantes) ouvert pour cette boutique. */
    partsModuleEnabled?: boolean;
    /**
     * Module Réassort actif pour cette boutique. **Soustractif** : `true` par défaut,
     * le super admin peut le couper. `undefined` (contexte partiel) vaut donc actif.
     */
    restockModuleEnabled?: boolean;
    /** Boutique en ligne ouverte pour cette boutique par la plateforme. */
    onlineStoreEnabled?: boolean;
  }[];
  isSuperAdmin: boolean;
  permissionKeys: string[];
  roleSlug: string | null;
  /** Module Magasin (dépôt) — désactivé par la plateforme si false. */
  warehouseFeatureEnabled: boolean;
  /** Module Achats — masqué par la plateforme si false. */
  purchasesFeatureEnabled: boolean;
  /** Module Transferts — masqué par la plateforme si false. */
  transfersFeatureEnabled: boolean;
  /** Augmentation du quota de boutiques autorisée (plateforme). */
  storeQuotaIncreaseEnabled: boolean;
  /** Prédictions IA — désactivé par la plateforme si false. */
  aiPredictionsEnabled: boolean;
  /** Carte KPI « Valeur au prix d'achat » sur le dépôt Magasin (plateforme). */
  warehouseKpiShowPurchaseValue: boolean;
  /** Carte KPI « Valeur au prix de vente » sur le dépôt Magasin (plateforme). */
  warehouseKpiShowSaleValue: boolean;
  /** Module Comptabilité (SYSCOHADA) — désactivé par défaut ; activé par la plateforme. */
  accountingModuleEnabled: boolean;
  /** Module R. Humaine + Paie — désactivé par défaut ; activé par la plateforme. */
  hrModuleEnabled: boolean;
  /** Génération d'affiches publicitaires IA (promotions) — flag GLOBAL super admin, désactivé par défaut. */
  promoAdGenerationEnabled: boolean;
  /**
   * Suivi de péremption ouvert pour TOUTE l'entreprise par la plateforme
   * (`companies.expiry_module_enabled`). S'ajoute au métier, ne retire rien.
   */
  expiryModuleEnabled: boolean;
  /**
   * Module Pièces ouvert pour TOUTE l'entreprise par la plateforme
   * (`companies.parts_module_enabled`). S'ajoute aux drapeaux boutique.
   */
  partsModuleEnabled: boolean;
  /**
   * Module Réassort actif pour l'entreprise (`companies.restock_module_enabled`).
   * **Soustractif** : vrai par défaut, coupé à la main par le super admin.
   */
  restockModuleEnabled: boolean;
  /**
   * Module Emplacements (rangement physique des produits) — désactivé par défaut,
   * ouvert par le PROPRIÉTAIRE dans Paramètres (`companies.product_locations_enabled`).
   */
  productLocationsEnabled: boolean;
  /**
   * « Autres noms » des produits (alias de recherche) — désactivé par défaut,
   * ouvert par le PROPRIÉTAIRE dans Paramètres (`companies.product_aliases_enabled`).
   */
  productAliasesEnabled: boolean;
  /**
   * Module Prix de revient (frais d'approche répartis sur un arrivage) — désactivé par
   * défaut, ouvert par le PROPRIÉTAIRE dans Paramètres (`companies.landed_cost_enabled`).
   */
  landedCostEnabled: boolean;
  /**
   * Mode « Personnaliser mes dépenses » — désactivé par défaut, ouvert par le
   * PROPRIÉTAIRE dans Paramètres (`companies.custom_expenses_enabled`). Actif, il
   * REMPLACE le contenu de la page Dépenses : postes maison + saisie réduite.
   */
  customExpensesEnabled: boolean;
  /**
   * Module « Caisse à deux » (un vendeur prépare le panier, un caissier l'encaisse) —
   * désactivé par défaut, ouvert par le PROPRIÉTAIRE dans Paramètres
   * (`companies.dual_cashier_enabled`).
   */
  dualCashierEnabled: boolean;
  /**
   * Module « Approvisionnement » (arrivage express : la marchandise achetée au marché
   * entre en stock et se vend dans la minute) — désactivé par défaut, ouvert par le
   * PROPRIÉTAIRE dans Paramètres (`companies.quick_supply_enabled`).
   */
  quickSupplyEnabled: boolean;
  /**
   * Module « Devis & Factures » (proposer un prix, puis facturer) — désactivé par
   * défaut, ouvert par le PROPRIÉTAIRE dans Paramètres
   * (`companies.sale_documents_enabled`).
   */
  saleDocumentsEnabled: boolean;
  /**
   * Page « Conditionnements » (remplir carton/paquet pour tout le catalogue d'un seul
   * écran) — désactivée par défaut, ouverte par le PROPRIÉTAIRE dans Paramètres
   * (`companies.packagings_page_enabled`).
   */
  packagingsPageEnabled: boolean;
  /**
   * Page « Photos produits » : l'employé illustre le catalogue sans pouvoir rien y
   * modifier d'autre. Fermée par défaut, ouverte par le PROPRIÉTAIRE dans Paramètres
   * (`companies.employee_photos_enabled`).
   */
  employeePhotosEnabled: boolean;
  /**
   * L'employé peut créer une fiche produit SANS prix — elle reste invendable jusqu'à
   * ce que le propriétaire la chiffre. Fermé par défaut
   * (`companies.employee_draft_products_enabled`).
   */
  employeeDraftProductsEnabled: boolean;
  /**
   * Module « Enlèvements partenaires » (la marchandise qu'un confrère vient prendre) —
   * fermé par défaut (`companies.partner_offtakes_enabled`).
   */
  partnerOfftakesEnabled: boolean;
  /**
   * Module « Rappels de crédit » (relances des clients endettés) — fermé par défaut
   * (`companies.credit_reminders_enabled`).
   */
  creditRemindersEnabled: boolean;
  /**
   * Module « Expéditions » (colis vers un client éloigné + frais avancés) — fermé par
   * défaut (`companies.shipments_enabled`).
   */
  shipmentsEnabled: boolean;
  /**
   * Pages retirées du menu de CET utilisateur par le propriétaire (« help »,
   * « notifications »). Confort d'affichage, pas frontière de sécurité — voir
   * `lib/features/settings/employee-hidden-pages.ts`. Absent ⇒ rien de masqué.
   */
  hiddenPages?: string[];
  /**
   * Boutique en ligne ouverte pour TOUTE l'entreprise par la plateforme
   * (`companies.online_store_enabled`). S'ajoute aux drapeaux boutique.
   */
  onlineStoreEnabled: boolean;
  /**
   * Mode dépannage : le super admin travaille dans l'entreprise d'un client.
   * Non nul ⇒ `companyId` ci-dessus est celle du client, pas la sienne.
   * L'intervention est bornée dans le temps et tracée dans le journal d'audit du client.
   */
  supportSession?: {
    id: string;
    companyId: string;
    companyName: string;
    reason: string;
    expiresAt: string;
  } | null;
};

/**
 * Le super admin a-t-il ouvert le module Pièces pour ce contexte ?
 * Entreprise entière, ou boutique courante (vue « toutes boutiques » : au moins une).
 */
export function partsModuleOverride(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.partsModuleEnabled === true) return true;
  if (data.storeId) {
    return (
      data.stores.find((s) => s.id === data.storeId)?.partsModuleEnabled === true
    );
  }
  return data.stores.some((s) => s.partsModuleEnabled === true);
}

/**
 * Le module Réassort est-il actif ici ? Logique **inverse** des autres modules :
 * actif par défaut, il faut que l'entreprise ET la boutique courante l'aient gardé.
 * En vue « toutes boutiques », il suffit qu'une boutique l'ait encore.
 */
export function restockModuleActive(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.restockModuleEnabled === false) return false;
  if (data.storeId) {
    const store = data.stores.find((s) => s.id === data.storeId);
    // Boutique inconnue du contexte : on ne bloque pas sur une donnée manquante.
    return store == null || store.restockModuleEnabled !== false;
  }
  if (data.stores.length === 0) return true;
  return data.stores.some((s) => s.restockModuleEnabled !== false);
}

/**
 * Le module Vente Engins est-il actif ici ? Boutique COURANTE autorisée, ou — en vue
 * « toutes boutiques » — au moins une qui l'est.
 *
 * Sert de porte unique à tout ce qui touche aux engins : la page /engins, mais aussi
 * les motos identifiées (châssis / moteur / couleur), qui n'ont pas de réglage propre.
 */
export function engineSalesModuleActive(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.storeId) {
    return (
      data.stores.find((s) => s.id === data.storeId)?.engineSalesEnabled === true
    );
  }
  return data.stores.some((s) => s.engineSalesEnabled === true);
}

/**
 * La plateforme a-t-elle ouvert la boutique en ligne ici ?
 * Entreprise entière, ou boutique courante (vue « toutes boutiques » : au moins une).
 */
export function onlineStoreOverride(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.onlineStoreEnabled === true) return true;
  if (data.storeId) {
    return (
      data.stores.find((s) => s.id === data.storeId)?.onlineStoreEnabled === true
    );
  }
  return data.stores.some((s) => s.onlineStoreEnabled === true);
}

/**
 * Le super admin a-t-il ouvert le suivi de péremption pour ce contexte ?
 * Entreprise entière, ou boutique courante (toutes boutiques : au moins une).
 */
export function expiryModuleOverride(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.expiryModuleEnabled === true) return true;
  if (data.storeId) {
    return (
      data.stores.find((s) => s.id === data.storeId)?.expiryModuleEnabled === true
    );
  }
  return data.stores.some((s) => s.expiryModuleEnabled === true);
}

/** Config métier du contexte, drapeaux plateforme (péremption…) déjà appliqués. */
export function activityConfigForContext(
  data: AppContextData | null | undefined,
): ReturnType<typeof activityConfig> {
  return activityConfig(data?.businessTypeSlug, {
    expiryModule: expiryModuleOverride(data),
  });
}

export type AccessHelpers = {
  hasPermission: (key: string) => boolean;
  isOwner: boolean;
  isCashier: boolean;
  canDashboard: boolean;
  canProducts: boolean;
  canSales: boolean;
  /** Module Vente Engins — boutique courante autorisée par la plateforme ET droit ventes. */
  canEngineSales: boolean;
  /** Module Immatriculation Engins — boutique autorisée ET droit ventes. */
  canEngineRegistration: boolean;
  /** Module Achats Progressifs — boutique autorisée ET droit dédié (ou propriétaire). */
  canProgressive: boolean;
  /** Module Location — boutique autorisée ET droit dédié (ou propriétaire). */
  canRental: boolean;
  /** Page Réparations (ordres de réparation) — activité garage uniquement. */
  canRepairs: boolean;
  canStores: boolean;
  canInventory: boolean;
  canPurchases: boolean;
  canCustomers: boolean;
  canSuppliers: boolean;
  canReports: boolean;
  canAi: boolean;
  canUsers: boolean;
  canSettings: boolean;
  canTransfers: boolean;
  canAudit: boolean;
  /** Propriétaire ou permission dépôt central (Magasinier). */
  canWarehouse: boolean;
  /** Propriétaire ou permission page Crédit / créances. */
  canCredit: boolean;
  /** Propriétaire ou permission page Code Barre. */
  canBarcodes: boolean;
  /** Propriétaire ou permission page Promotions. */
  canPromotions: boolean;
  /** Module Pièces ouvert par la plateforme (entreprise ou boutique courante). */
  partsModuleOn: boolean;
  /** Page Pièces : module ouvert ET propriétaire / permission dédiée. */
  canParts: boolean;
  /** Module Réassort actif (non coupé par la plateforme) pour ce périmètre. */
  restockModuleOn: boolean;
  /** Page Réassort : module actif ET propriétaire / permission dédiée. */
  canRestock: boolean;
  /** Page Conditionnements ouverte par le propriétaire pour l'entreprise. */
  packagingsPageOn: boolean;
  /** Page Conditionnements : page ouverte ET droit de voir le catalogue. */
  canPackagings: boolean;
  /** Module Emplacements ouvert par le propriétaire pour l'entreprise. */
  productLocationsOn: boolean;
  /** Page Emplacements : module ouvert ET propriétaire / permission dédiée. */
  canProductLocations: boolean;
  /** « Autres noms » de produits activés par le propriétaire (saisie + recherche). */
  productAliasesOn: boolean;
  /**
   * Motos identifiées (châssis / moteur / couleur) : suit le module Vente Engins,
   * sans réglage propre. Saisie dans la fiche produit + choix de l'engin à la vente.
   */
  engineUnitsOn: boolean;
  /** Caisse à deux ouverte par le propriétaire pour l'entreprise. */
  dualCashierOn: boolean;
  /** Peut ENVOYER un panier à la caisse (droit de vendre). */
  canSendHandoff: boolean;
  /**
   * Page Encaissement : module ouvert ET droit de vendre. Vendre et encaisser sont
   * volontairement le même droit — les deux employés échangent leurs postes dans la
   * journée sans que le propriétaire ait un réglage à revoir.
   */
  canCheckoutQueue: boolean;
  /** Module Approvisionnement ouvert par le propriétaire pour l'entreprise. */
  quickSupplyOn: boolean;
  /**
   * Page Approvisionnement : module ouvert ET propriétaire / droit dédié. Le droit
   * (`quick_supply.create`) n'est donné à aucun rôle : le propriétaire l'accorde
   * nommément, employé par employé, depuis la page Employés.
   */
  canQuickSupply: boolean;
  /** Module Devis & Factures ouvert par le propriétaire pour l'entreprise. */
  saleDocumentsOn: boolean;
  /**
   * Page Devis & Factures : module ouvert ET propriétaire / droit dédié. Le droit
   * (`sale_documents.manage`) n'est donné à aucun rôle : le propriétaire l'accorde
   * nommément, pour que son commercial puisse chiffrer sans tenir la caisse.
   */
  canSaleDocuments: boolean;
  /** Page « Photos produits » ouverte par le propriétaire pour l'entreprise. */
  employeePhotosOn: boolean;
  /**
   * Page Photos produits : module ouvert ET droit d'illustrer (photo, ou modification
   * des produits — qui peut refaire une fiche peut évidemment la photographier).
   */
  canProductPhotos: boolean;
  /** L'employé peut créer une fiche sans prix (réglage propriétaire). */
  employeeDraftProductsOn: boolean;
  /**
   * Peut ajouter un produit SANS prix. Vrai aussi pour qui a déjà `products.create` :
   * le formulaire complet reste sa porte, celle-ci ne lui retire rien.
   */
  canDraftProducts: boolean;
  /** Module Enlèvements partenaires ouvert par le propriétaire. */
  partnerOfftakesOn: boolean;
  /** Page Enlèvements : module ouvert ET propriétaire / droit dédié. */
  canPartnerOfftakes: boolean;
  /** Module Rappels de crédit ouvert par le propriétaire. */
  creditRemindersOn: boolean;
  /**
   * Page Rappels de crédit : module ouvert ET accès à la page Crédit. Pas de droit
   * propre — relancer sur une créance, c'est agir sur ce que `credit.view` montre déjà.
   */
  canCreditReminders: boolean;
  /** Module Expéditions ouvert par le propriétaire. */
  shipmentsOn: boolean;
  /** Page Expéditions : module ouvert ET propriétaire / droit dédié. */
  canShipments: boolean;
  /** Page Aide visible. Visible par défaut ; le propriétaire peut la retirer du menu. */
  canHelp: boolean;
  /** Page Notifications visible. Idem — ne concerne pas la réception des push. */
  canNotifications: boolean;
  /** Module Prix de revient ouvert par le propriétaire pour l'entreprise. */
  landedCostOn: boolean;
  /** Page Prix de revient : module ouvert ET propriétaire / permission dédiée. */
  canLandedCost: boolean;
  /** Boutique en ligne ouverte par la plateforme (entreprise ou boutique courante). */
  onlineStoreOn: boolean;
  /** Page Boutique en ligne : module ouvert ET propriétaire / permission dédiée. */
  canOnlineStore: boolean;
  /**
   * Suivi de péremption (DLC/DLUO) actif pour ce contexte : métier concerné
   * (pharmacie, supermarché…) ou drapeau ouvert par le super admin.
   */
  expiryModuleOn: boolean;
  /** Page Péremptions : module actif ET propriétaire / permission dédiée. */
  canExpiry: boolean;
  /** Propriétaire ou permission de consultation des dépenses. */
  canExpenses: boolean;
  /** Propriétaire ou permission de gestion (CRUD) des dépenses. */
  canManageExpenses: boolean;
  /** Mode « Personnaliser mes dépenses » activé par le propriétaire. */
  customExpensesOn: boolean;
  /** Module Comptabilité activé par la plateforme ET droit de consultation. */
  canAccounting: boolean;
  /** Comptabilité : droit de gestion (saisie / modification des écritures). */
  canManageAccounting: boolean;
  /** Module R. Humaine activé par la plateforme ET droit de consultation. */
  canHr: boolean;
  /** RH : droit de gestion (employés, contrats, congés). */
  canManageHr: boolean;
  /** Paie : droit de gestion (bulletins, barèmes) — implique module RH activé. */
  canPayroll: boolean;
};

/** Construit les helpers à partir du contexte (même logique que `app_shell.dart` Flutter). */
export function buildAccessHelpers(
  data: AppContextData | null | undefined,
): AccessHelpers | null {
  if (!data) return null;
  const set = new Set(data.permissionKeys);
  const hasPermission = (key: string) =>
    data.isSuperAdmin || set.has(key);

  const isOwner = data.roleSlug === "owner";
  const isCashier = data.roleSlug === "cashier";

  const canReports =
    hasPermission(P.reportsViewGlobal) || hasPermission(P.reportsViewStore);
  const canAi =
    hasPermission(P.aiInsightsView) && data.aiPredictionsEnabled === true;
  const canUsers =
    hasPermission(P.usersManage) || isOwner;
  const canSettings = hasPermission(P.settingsManage);
  const canTransfers =
    (hasPermission(P.stockTransfer) ||
      hasPermission(P.transfersCreate) ||
      hasPermission(P.transfersApprove)) &&
    data.transfersFeatureEnabled === true;
  const canDashboard = hasPermission(P.dashboardView);
  const canProducts =
    hasPermission(P.productsView) ||
    hasPermission(P.productsCreate) ||
    hasPermission(P.productsUpdate) ||
    hasPermission(P.productsDelete);
  const canSales =
    hasPermission(P.salesView) ||
    hasPermission(P.salesCreate) ||
    hasPermission(P.salesInvoiceA4);
  // Vente Engins : visible si la boutique COURANTE est autorisée (ou, en vue
  // « toutes boutiques », si au moins une l'est) ET l'utilisateur peut vendre.
  const activeStore = data.stores.find((s) => s.id === data.storeId);
  const engineStoreOn = engineSalesModuleActive(data);
  const canEngineSales =
    engineStoreOn &&
    (hasPermission(P.salesInvoiceA4) ||
      hasPermission(P.salesCreate) ||
      hasPermission(P.salesView));
  // Immatriculation Engins : même logique de gating par boutique que Vente Engins.
  const registrationStoreOn = data.storeId
    ? activeStore?.engineRegistrationEnabled === true
    : data.stores.some((s) => s.engineRegistrationEnabled === true);
  const canEngineRegistration =
    registrationStoreOn &&
    (hasPermission(P.salesInvoiceA4) ||
      hasPermission(P.salesCreate) ||
      hasPermission(P.salesView) ||
      hasPermission(P.salesUpdate));
  // Achats Progressifs : même gating par boutique que les modules engins, mais
  // avec un droit dédié (owner par défaut) car il s'agit d'argent encaissé.
  const progressiveStoreOn = data.storeId
    ? activeStore?.progressivePurchasesEnabled === true
    : data.stores.some((s) => s.progressivePurchasesEnabled === true);
  const canProgressive =
    progressiveStoreOn && (isOwner || hasPermission(P.progressiveManage));
  // Location : module autonome (gestion locative), gating par boutique + droit dédié.
  const rentalStoreOn = data.storeId
    ? activeStore?.rentalModuleEnabled === true
    : data.stores.some((s) => s.rentalModuleEnabled === true);
  const canRental = rentalStoreOn && (isOwner || hasPermission(P.rentalManage));
  /**
   * Réparations : module natif de l'activité garage — aucun drapeau plateforme.
   * Une entreprise d'un autre métier ne le voit jamais, l'application des autres
   * clients reste donc strictement inchangée.
   */
  const repairsActivityOn = data.businessTypeSlug === "garage-mecanique";
  const canRepairs =
    repairsActivityOn && (isOwner || hasPermission(P.repairsManage));
  const canStores =
    hasPermission(P.storesView) || hasPermission(P.storesCreate);
  const canInventory =
    hasPermission(P.stockView) ||
    hasPermission(P.stockAdjust) ||
    hasPermission(P.stockTransfer);
  const canPurchases =
    (hasPermission(P.purchasesView) ||
      hasPermission(P.purchasesCreate) ||
      hasPermission(P.purchasesCancel) ||
      hasPermission(P.purchasesUpdate) ||
      hasPermission(P.purchasesDelete)) &&
    data.purchasesFeatureEnabled !== false;
  const canCustomers =
    hasPermission(P.customersView) || hasPermission(P.customersManage);
  const canSuppliers =
    hasPermission(P.suppliersView) || hasPermission(P.suppliersManage);
  const canAudit = hasPermission(P.auditView) || isOwner;
  const canWarehouse =
    (isOwner || hasPermission(P.warehouseManage)) &&
    data.warehouseFeatureEnabled !== false;
  const canCredit = isOwner || hasPermission(P.creditView);
  const canBarcodes = isOwner || hasPermission(P.barcodesManage);
  const canPromotions = isOwner || hasPermission(P.promotionsManage);
  // Pièces : additif comme la péremption — rien n'apparaît tant que la plateforme
  // n'a pas ouvert le module pour l'entreprise ou pour la boutique en cours.
  const partsModuleOn = partsModuleOverride(data);
  const canParts = partsModuleOn && (isOwner || hasPermission(P.partsManage));
  // Réassort : soustractif — proposé à tous les métiers, coupé à la main si besoin.
  const restockModuleOn = restockModuleActive(data);
  const canRestock = restockModuleOn && (isOwner || hasPermission(P.restockView));
  // Emplacements : additif, mais ouvert par le PROPRIÉTAIRE lui-même (Paramètres),
  // pas par la plateforme. Rien n'apparaît tant qu'il ne l'a pas activé.
  /*
   * Conditionnements : additive, ouverte par le PROPRIÉTAIRE (Paramètres). Pas de
   * droit dédié — la page n'écrit que ce que la fiche produit écrit déjà : qui peut
   * voir le catalogue la voit, qui peut modifier un produit peut y modifier un lot.
   */
  const packagingsPageOn = data.packagingsPageEnabled === true;
  const canPackagings = packagingsPageOn && canProducts;
  const productLocationsOn = data.productLocationsEnabled === true;
  const canProductLocations =
    productLocationsOn && (isOwner || hasPermission(P.productLocationsManage));
  // Autres noms : simple aide à la saisie et à la recherche — aucune permission
  // dédiée, quiconque gère déjà les produits en profite dès que le patron l'active.
  const productAliasesOn = data.productAliasesEnabled === true;
  // Motos identifiées : AUCUN réglage propre — la fonction s'ouvre et se ferme avec
  // le module Vente Engins. Là où on vend des engins, on enregistre leur châssis ;
  // ailleurs, la section n'existe pas. Pas de permission dédiée non plus : celui qui
  // saisit déjà les produits saisit les châssis.
  const engineUnitsOn = engineStoreOn;
  // Prix de revient : additif, ouvert par le PROPRIÉTAIRE (Paramètres). Le module touche
  // aux prix d'achat et de vente : le droit est donc distinct de celui des achats.
  const landedCostOn = data.landedCostEnabled === true;
  const canLandedCost = landedCostOn && (isOwner || hasPermission(P.landedCostManage));
  // Boutique en ligne : additif, ouvert par la PLATEFORME (entreprise ou boutique).
  const onlineStoreOn = onlineStoreOverride(data);
  const canOnlineStore =
    onlineStoreOn && (isOwner || hasPermission(P.onlineStoreManage));
  // Péremptions : réservé aux métiers à suivi de lots (pharmacie, supermarché…) ou
  // aux entreprises / boutiques pour lesquelles le super admin l'a ouvert.
  const expiryModuleOn = activityConfigForContext(data).expiryDashboard;
  const canExpiry = expiryModuleOn && (isOwner || hasPermission(P.expiryView));
  const canManageExpenses = isOwner || hasPermission(P.expensesManage);
  const canExpenses =
    isOwner || hasPermission(P.expensesView) || canManageExpenses;
  // Dépenses personnalisées : aucun droit dédié — c'est la MÊME page, présentée
  // autrement. Qui pouvait déjà saisir une dépense saisit dans les postes maison.
  const customExpensesOn = data.customExpensesEnabled === true;
  /*
   * Caisse à deux : deux gestes, deux droits.
   *
   * Envoyer un panier n'est que vendre (`sales.create`). ENCAISSER est un droit à part
   * (`pos.checkout`), parce que c'est la décision que le propriétaire tient à garder :
   * son neveu qui aide au rayon le jour de marché sert les clients, il n'ouvre pas le
   * tiroir. Sans droit distinct, l'en empêcher voudrait dire l'empêcher de servir.
   *
   * Pas de repli sur `sales.create` : un repli rendrait le retrait du droit sans effet.
   */
  const dualCashierOn = data.dualCashierEnabled === true;
  const canSendHandoff = dualCashierOn && (isOwner || hasPermission(P.salesCreate));
  const canCheckoutQueue = dualCashierOn && (isOwner || hasPermission(P.posCheckout));
  /*
   * Approvisionnement : additif, ouvert par le PROPRIÉTAIRE (Paramètres). Le droit,
   * lui, est étroit et nominatif — le but étant précisément de laisser un caissier
   * réceptionner sans lui ouvrir la fiche produit ni l'ajustement de stock.
   */
  const quickSupplyOn = data.quickSupplyEnabled === true;
  const canQuickSupply =
    quickSupplyOn && (isOwner || hasPermission(P.quickSupplyCreate));
  /*
   * Devis & Factures : additif, ouvert par le PROPRIÉTAIRE (Paramètres). Le droit est
   * distinct de celui de la caisse — établir un devis pour une mairie n'est pas
   * encaisser — mais l'ÉMISSION d'une facture crée une vente réelle, d'où un droit
   * nominatif plutôt qu'un repli sur `sales.create`.
   */
  const saleDocumentsOn = data.saleDocumentsEnabled === true;
  const canSaleDocuments =
    saleDocumentsOn && (isOwner || hasPermission(P.saleDocumentsManage));
  /*
   * Photos produits : additive, ouverte par le PROPRIÉTAIRE (Paramètres).
   *
   * Le droit `products.photo` est donné d'office aux rôles qui travaillent le rayon
   * (migration 00209) : la page n'existe pour personne tant que le module est fermé, et
   * une fois ouvert, obliger le patron à cocher une case par vendeur avant que la page
   * ne serve à quoi que ce soit reviendrait à lui faire faire deux fois le même geste.
   *
   * `products.update` en repli : celui qui peut refonder une fiche peut évidemment
   * l'illustrer. Sans ce repli, ouvrir le module RETIRERAIT la photo à un gérant qui la
   * faisait déjà depuis la fiche produit.
   */
  const employeePhotosOn = data.employeePhotosEnabled === true;
  const canProductPhotos =
    employeePhotosOn &&
    (isOwner ||
      hasPermission(P.productsPhoto) ||
      hasPermission(P.productsUpdate));
  /*
   * Produit ajouté par un employé, sans prix. Pas de page dédiée : c'est le formulaire
   * produit qui se présente autrement — sans les deux champs de prix — à qui n'a que ce
   * droit-là. Le produit créé reste invendable jusqu'à ce que le patron le chiffre.
   */
  const employeeDraftProductsOn = data.employeeDraftProductsEnabled === true;
  const canDraftProducts =
    employeeDraftProductsOn && (isOwner || hasPermission(P.productsDraftCreate));
  /*
   * Enlèvements partenaires et Expéditions : additifs, ouverts par le PROPRIÉTAIRE, et
   * — contrairement aux deux ci-dessus — avec un droit accordé à AUCUN rôle. Sortir de
   * la marchandise pour un confrère ou avancer des frais de transport engage l'argent
   * de la maison : le patron délègue nommément, employé par employé.
   */
  const partnerOfftakesOn = data.partnerOfftakesEnabled === true;
  const canPartnerOfftakes =
    partnerOfftakesOn && (isOwner || hasPermission(P.partnerOfftakesManage));
  const shipmentsOn = data.shipmentsEnabled === true;
  const canShipments = shipmentsOn && (isOwner || hasPermission(P.shipmentsManage));
  /*
   * Rappels de crédit : aucune permission propre. Relancer un client sur sa dette,
   * c'est agir sur exactement ce que la page Crédit montre déjà — un droit de plus
   * obligerait le propriétaire à re-cocher une case pour la même personne, sur la même
   * information, et laisserait entre-temps un écran vide à qui voit déjà tout.
   */
  const creditRemindersOn = data.creditRemindersEnabled === true;
  const canCreditReminders = creditRemindersOn && canCredit;
  /*
   * Aide et Notifications : VISIBLES par défaut, et retirées seulement si le
   * propriétaire l'a demandé pour cet employé. Le sens de la liste est « ce qui est
   * masqué » et non « ce qui est permis », précisément pour que l'absence de donnée
   * (réglage jamais posé, lecture en échec) laisse le menu intact.
   */
  const hidden = new Set(data.hiddenPages ?? []);
  const canHelp = !hidden.has("help");
  const canNotifications = !hidden.has("notifications");

  // Modules plateforme : visibles seulement si le super admin les a activés pour l'entreprise.
  const accountingOn = data.accountingModuleEnabled === true;
  const hrOn = data.hrModuleEnabled === true;
  const canManageAccounting =
    accountingOn && (isOwner || hasPermission(P.accountingManage));
  const canAccounting =
    accountingOn && (isOwner || hasPermission(P.accountingView) || canManageAccounting);
  const canManageHr = hrOn && (isOwner || hasPermission(P.hrManage));
  const canHr = hrOn && (isOwner || hasPermission(P.hrView) || canManageHr);
  const canPayroll = hrOn && (isOwner || hasPermission(P.payrollManage));

  return {
    hasPermission,
    isOwner,
    isCashier,
    canDashboard,
    canProducts,
    canSales,
    canEngineSales,
    canEngineRegistration,
    canProgressive,
    canRental,
    canRepairs,
    canStores,
    canInventory,
    canPurchases,
    canCustomers,
    canSuppliers,
    canReports,
    canAi,
    canUsers,
    canSettings,
    canTransfers,
    canAudit,
    canWarehouse,
    canCredit,
    canBarcodes,
    canPromotions,
    partsModuleOn,
    canParts,
    restockModuleOn,
    canRestock,
    packagingsPageOn,
    canPackagings,
    productLocationsOn,
    canProductLocations,
    productAliasesOn,
    engineUnitsOn,
    dualCashierOn,
    canSendHandoff,
    canCheckoutQueue,
    quickSupplyOn,
    canQuickSupply,
    saleDocumentsOn,
    canSaleDocuments,
    employeePhotosOn,
    canProductPhotos,
    employeeDraftProductsOn,
    canDraftProducts,
    partnerOfftakesOn,
    canPartnerOfftakes,
    creditRemindersOn,
    canCreditReminders,
    shipmentsOn,
    canShipments,
    canHelp,
    canNotifications,
    landedCostOn,
    canLandedCost,
    onlineStoreOn,
    canOnlineStore,
    expiryModuleOn,
    canExpiry,
    canExpenses,
    canManageExpenses,
    customExpensesOn,
    canAccounting,
    canManageAccounting,
    canHr,
    canManageHr,
    canPayroll,
  };
}

/**
 * Filtre les entrées de navigation comme `visibleNavItems` dans `app_shell.dart` (Flutter).
 */
const cashierFallbackSet = new Set<string>(CASHIER_FALLBACK_HREFS);

export function filterNavItemsForPermissions(
  items: NavItem[],
  h: AccessHelpers | null,
  permissionsLoading: boolean,
  businessTypeSlug?: string | null,
): NavItem[] {
  if (permissionsLoading) {
    return adaptNavItemsForActivity(
      items.filter((i) => cashierFallbackSet.has(i.href)),
      businessTypeSlug,
    );
  }

  if (!h) {
    return adaptNavItemsForActivity(
      items.filter((i) => cashierFallbackSet.has(i.href)),
      businessTypeSlug,
    );
  }

  const workspace = tradeWorkspace(businessTypeSlug);

  const filtered = items.filter((item) => {
    if (item.kind === "section") return true;
    const href = item.href;
    if (href === ROUTES.stockCashier) {
      return h.canInventory && !h.isOwner;
    }
    if (href === ROUTES.dashboard) return h.canDashboard;
    // Espace métier : uniquement pour les activités qui en ont un. Les autres
    // (dont tous les métiers historiques) ne voient jamais cette entrée.
    if (href === ROUTES.tradeWorkspace) return workspace !== undefined;
    if (href === ROUTES.products) return h.canProducts;
    if (href === ROUTES.productPhotos) return h.canProductPhotos;
    if (href === ROUTES.parts) return h.canParts;
    if (href === ROUTES.restock) return h.canRestock;
    // Conditionnements : page additive, ouverte par le propriétaire. Ensuite, même
    // porte que le catalogue (modifier un lot demande en plus `products.update`).
    if (href === ROUTES.packagings) return h.canPackagings;
    if (href === ROUTES.productLocations) return h.canProductLocations;
    if (href === ROUTES.landedCost) return h.canLandedCost;
    if (href === ROUTES.onlineStore) return h.canOnlineStore;
    if (href === ROUTES.barcodes) return h.canBarcodes;
    if (href === ROUTES.sales) return h.canSales;
    if (href === ROUTES.checkoutQueue) return h.canCheckoutQueue;
    if (href === ROUTES.promotions) return h.canPromotions;
    if (href === ROUTES.engines) return h.canEngineSales;
    if (href === ROUTES.engineRegistration) return h.canEngineRegistration;
    if (href === ROUTES.progressive) return h.canProgressive;
    if (href === ROUTES.rental) return h.canRental;
    if (href === ROUTES.repairs) return h.canRepairs;
    if (href === ROUTES.stores) return h.canStores;
    if (href === ROUTES.inventory) return h.canInventory && !h.isCashier;
    if (href === ROUTES.inventorySessions) {
      // Droit dédié « Faire l'inventaire » (ou propriétaire). Masqué aux caissiers.
      return (h.isOwner || h.hasPermission(P.inventoryManage)) && !h.isCashier;
    }
    // `canExpiry` porte déjà la condition « suivi de péremption actif » (métier ou
    // drapeau plateforme) en plus du droit utilisateur.
    if (href === ROUTES.expiry) return h.canExpiry;
    if (href === ROUTES.purchases) return h.canPurchases;
    if (href === ROUTES.quickSupply) return h.canQuickSupply;
    if (href === ROUTES.partnerOfftakes) return h.canPartnerOfftakes;
    if (href === ROUTES.shipments) return h.canShipments;
    if (href === ROUTES.saleDocuments) return h.canSaleDocuments;
    if (href === ROUTES.expenses) return h.canExpenses;
    if (href === ROUTES.warehouse) return h.canWarehouse;
    if (href === ROUTES.customers) return h.canCustomers;
    if (href === ROUTES.credit) return h.canCredit;
    if (href === ROUTES.creditReminders) return h.canCreditReminders;
    if (href === ROUTES.suppliers) return h.canSuppliers;
    if (href === ROUTES.reports) return h.canReports;
    /** Même logique que `app_shell.dart` (Flutter) — pas de filtre `isCashier` sur le menu. */
    if (href === ROUTES.ai) return h.canAi;
    if (href === ROUTES.users) return h.canUsers;
    if (href === ROUTES.settings) return h.canSettings;
    if (href === ROUTES.transfers) return h.canTransfers;
    if (href === ROUTES.accounting) return h.canAccounting;
    if (href === ROUTES.hr) return h.canHr;
    if (href === ROUTES.audit) return h.canAudit && !h.isOwner;
    // Aide : visible par tous (tutoriels vidéo + contacts) tant que le propriétaire ne
    // l'a pas retirée à cet employé. Le guide détaillé interne reste owner.
    if (href === ROUTES.help) return h.canHelp;
    // Ses propres notifications : chacun ne voit que les siennes — mais le patron peut
    // alléger le menu d'un caissier en retirant l'entrée.
    if (href === ROUTES.notifications) return h.canNotifications;
    if (href === ROUTES.subscription) return h.isOwner;
    if (href === ROUTES.integrations) return false;
    return true;
  });

  // L'entrée « Espace métier » prend le nom et l'icône de l'activité
  // (« Espace Garage », « Espace Maquis »…) plutôt qu'un libellé générique.
  const named = workspace
    ? filtered.map((item) =>
        item.href === ROUTES.tradeWorkspace
          ? {
              ...item,
              label: workspace.navLabel,
              ...(businessTypeIcon(businessTypeSlug)
                ? { icon: businessTypeIcon(businessTypeSlug)! }
                : {}),
            }
          : item,
      )
    : filtered;

  // Navigation hiérarchique dédiée (restaurant) : garder l'ordre défini tel quel.
  if (named.some((item) => item.kind === "section")) return named;

  return adaptNavItemsForActivity(named, businessTypeSlug);
}

/** Normalise le chemin (sans query, sans slash final) pour la garde de route. */
function normalizeAppRoute(pathname: string): string {
  const p = pathname.split("?")[0] ?? pathname;
  const trimmed = p.replace(/\/+$/, "") || "/";
  if (trimmed === "/" || trimmed === "") return ROUTES.dashboard;
  return trimmed;
}

/**
 * Préfixes de routes sous `ShellRoute` (`app_router.dart` Flutter) — même principe que
 * `GoRouter.redirect` : pas de contrôle de permission sur ces chemins (sauf POS ci‑dessous) ;
 * chaque écran applique ses propres règles (ex. `settings_page` caissier → ventes,
 * `warehouse_page` non‑owner → carte « Accès réservé », etc.).
 */
const APP_SHELL_ROUTE_PREFIXES: readonly string[] = [
  ROUTES.dashboard,
  ROUTES.tradeWorkspace,
  ROUTES.products,
  // Conditionnements : page du catalogue au même titre que Produits. Sans cette
  // ligne, la garde de route la refuse à TOUT LE MONDE — drapeau ouvert ou non —
  // car la liste ci-dessous est une liste blanche, pas une liste d'exceptions.
  ROUTES.packagings,
  // Photos produits, Enlèvements, Rappels crédit, Expéditions : liste BLANCHE. Un
  // module absent d'ici est refusé à tout le monde, drapeau ouvert ou non — le menu
  // affiche l'entrée et la page répond « pas accès ».
  ROUTES.productPhotos,
  ROUTES.partnerOfftakes,
  ROUTES.creditReminders,
  ROUTES.shipments,
  ROUTES.parts,
  ROUTES.restock,
  ROUTES.productLocations,
  ROUTES.landedCost,
  ROUTES.onlineStore,
  ROUTES.barcodes,
  ROUTES.sales,
  ROUTES.checkoutQueue,
  ROUTES.promotions,
  ROUTES.engines,
  ROUTES.engineRegistration,
  ROUTES.progressive,
  ROUTES.rental,
  ROUTES.repairs,
  ROUTES.stores,
  ROUTES.inventory,
  ROUTES.inventorySessions,
  ROUTES.stockCashier,
  ROUTES.expiry,
  ROUTES.purchases,
  ROUTES.quickSupply,
  ROUTES.saleDocuments,
  ROUTES.expenses,
  ROUTES.warehouse,
  ROUTES.transfers,
  ROUTES.customers,
  ROUTES.credit,
  ROUTES.suppliers,
  ROUTES.reports,
  ROUTES.ai,
  ROUTES.accounting,
  ROUTES.hr,
  ROUTES.users,
  ROUTES.audit,
  ROUTES.settings,
  // Ses propres notifications : aucun droit métier à vérifier, la RLS borne déjà
  // chaque utilisateur à ses lignes. C'est aussi la cible des clics sur un push.
  ROUTES.notifications,
  ROUTES.help,
  ROUTES.subscription,
  ROUTES.integrations,
  "/restaurant",
];

function isAppShellRoute(route: string): boolean {
  for (const prefix of APP_SHELL_ROUTE_PREFIXES) {
    if (route === prefix || route.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/**
 * Garde de route alignée sur `GoRouter` Flutter (`redirect` + routes shell) :
 * - utilisateur connecté : toutes les routes shell autorisées (les pages gèrent les droits) ;
 * - seules exceptions : caisse rapide (`sales.create`) et POS facture A4 (`sales.invoice_a4`).
 */
export function canAccessPathname(
  pathname: string,
  h: AccessHelpers | null,
  businessTypeSlug?: string | null,
): boolean {
  if (!h) return false;
  const p = pathname.split("?")[0] ?? pathname;

  if (p.startsWith("/stores/") && p.endsWith("/pos-quick")) {
    return (
      h.hasPermission(P.salesCreate) || h.hasPermission(P.salesUpdate)
    );
  }
  if (p.startsWith("/stores/") && p.endsWith("/pos") && !p.endsWith("/pos-quick")) {
    return (
      h.hasPermission(P.salesInvoiceA4) ||
      h.hasPermission(P.salesCreate) ||
      h.hasPermission(P.salesUpdate)
    );
  }
  if (p.startsWith("/stores/") && p.endsWith("/vente-engin")) {
    return (
      h.hasPermission(P.salesInvoiceA4) ||
      h.hasPermission(P.salesCreate) ||
      h.hasPermission(P.salesUpdate)
    );
  }
  if (p.startsWith("/stores/") && p.endsWith("/facture-tab")) {
    const canA4 =
      h.hasPermission(P.salesInvoiceA4) || h.hasPermission(P.salesCreate);
    return (
      h.hasPermission(P.salesUpdate) ||
      (h.hasPermission(P.salesInvoiceA4Table) && canA4)
    );
  }

  const route = normalizeAppRoute(pathname);
  if (!isRouteAllowedForActivity(route, businessTypeSlug)) return false;
  // Espace métier : réservé aux activités qui en ont un — l'URL directe non plus
  // ne mène nulle part pour les autres.
  if (route === ROUTES.tradeWorkspace && !tradeWorkspace(businessTypeSlug)) {
    return false;
  }
  // Page Péremptions : suivi actif (métier ou drapeau plateforme) — accès URL direct.
  // Le droit utilisateur, lui, reste géré par l'écran (carte « Accès réservé »).
  if (route === ROUTES.expiry && !h.expiryModuleOn) return false;
  // Mêmes gardes pour les modules Pièces (ouvert par la plateforme) et Réassort
  // (actif par défaut, coupé par la plateforme) : l'URL directe ne contourne rien.
  if (route === ROUTES.parts && !h.partsModuleOn) return false;
  if (route === ROUTES.restock && !h.restockModuleOn) return false;
  // Emplacements : tant que le propriétaire n'a pas activé le module, l'URL directe
  // ne mène nulle part non plus.
  /*
   * Conditionnements : on exige ici le droit CATALOGUE, pas le drapeau d'activation.
   * Le drapeau décide de l'entrée de menu ; s'il est fermé, la page s'ouvre quand même
   * et explique elle-même où l'activer. Un cadenas rouge sur une page que le
   * propriétaire vient justement de chercher ne lui apprendrait rien.
   */
  if (route === ROUTES.packagings && !h.canProducts) return false;
  if (route === ROUTES.productLocations && !h.productLocationsOn) return false;
  // Prix de revient : idem — le module touche aux prix, l'URL directe ne le contourne pas.
  if (route === ROUTES.landedCost && !h.landedCostOn) return false;
  // Boutique en ligne : tant que la plateforme ne l'a pas ouverte, l'URL ne mène nulle part.
  if (route === ROUTES.onlineStore && !h.onlineStoreOn) return false;
  // Réparations : module natif du garage. Une autre activité — ou un employé sans
  // le droit dédié — ne l'ouvre pas davantage en tapant l'adresse à la main.
  if (route === ROUTES.repairs && !h.canRepairs) return false;
  // Encaissement : tant que le propriétaire n'a pas ouvert la caisse à deux, la page
  // n'existe pour personne — l'adresse tapée à la main ne la fait pas apparaître.
  if (route === ROUTES.checkoutQueue && !h.canCheckoutQueue) return false;
  // Approvisionnement : le droit est nominatif et la page fait entrer du stock réel.
  // L'adresse tapée à la main ne la fait pas apparaître (la base refuserait de toute
  // façon l'écriture, mais mieux vaut ne pas montrer un écran qui ne servira à rien).
  if (route === ROUTES.quickSupply && !h.canQuickSupply) return false;
  // Devis & Factures : tant que le propriétaire n'a pas ouvert le module — ou sans le
  // droit dédié — l'adresse tapée à la main ne fait pas apparaître la page.
  if (route === ROUTES.saleDocuments && !h.canSaleDocuments) return false;
  /*
   * Les quatre modules de 00209. Même règle pour tous : le drapeau ET le droit. Deux
   * d'entre eux (Enlèvements, Expéditions) font sortir de la marchandise ou engagent de
   * l'argent avancé — la base refuserait de toute façon l'écriture, mais montrer un
   * écran de saisie qui finira par un refus n'apprend rien à personne.
   */
  if (route === ROUTES.productPhotos && !h.canProductPhotos) return false;
  if (route === ROUTES.partnerOfftakes && !h.canPartnerOfftakes) return false;
  if (route === ROUTES.creditReminders && !h.canCreditReminders) return false;
  if (route === ROUTES.shipments && !h.canShipments) return false;
  /*
   * Aide / Notifications retirées du menu de cet employé : un lien resté ouvert dans
   * un onglet ne doit pas rouvrir ce qu'on vient de ranger. La garde SERVEUR, elle, ne
   * connaît pas ce réglage et laisse passer — c'est voulu : ce n'est pas une frontière
   * de sécurité, et une garde serveur qui se tromperait renverrait « Accès réservé »
   * sur des pages inoffensives.
   */
  if (route === ROUTES.help && !h.canHelp) return false;
  if (route === ROUTES.notifications && !h.canNotifications) return false;
  return isAppShellRoute(route);
}
