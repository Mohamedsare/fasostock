/** Aligné `app/lib/data/models/admin_models.dart` + audit. */

export type AdminCompany = {
  id: string;
  name: string;
  slug: string | null;
  isActive: boolean;
  storeQuota: number;
  aiPredictionsEnabled: boolean;
  /** Module dépôt Magasin — désactivable par la plateforme. */
  warehouseFeatureEnabled: boolean;
  /** Module Achats — masquable par la plateforme. */
  purchasesFeatureEnabled: boolean;
  /** Module Transferts — masquable par la plateforme. */
  transfersFeatureEnabled: boolean;
  /** Autorise l’augmentation du quota de boutiques (plateforme). */
  storeQuotaIncreaseEnabled: boolean;
  /** Affiche la carte KPI « Valeur au prix d'achat » sur le dépôt Magasin. */
  warehouseKpiShowPurchaseValue: boolean;
  /** Affiche la carte KPI « Valeur au prix de vente » sur le dépôt Magasin. */
  warehouseKpiShowSaleValue: boolean;
  /** Nombre maximum de dépôts (magasins) autorisés — modifiable uniquement par le super admin. */
  warehouseQuota: number;
  /** Module Comptabilité (SYSCOHADA) — désactivé par défaut ; activable par la plateforme. */
  accountingModuleEnabled: boolean;
  /** Module R. Humaine + Paie — désactivé par défaut ; activable par la plateforme. */
  hrModuleEnabled: boolean;
  /** Suivi de péremption (DLC/DLUO) ouvert à toute l'entreprise par la plateforme. */
  expiryModuleEnabled: boolean;
  /** Module Pièces (compatibilités, équivalences, variantes) — désactivé par défaut. */
  partsModuleEnabled: boolean;
  /** Module Réassort — **activé** par défaut ; la plateforme peut le couper. */
  restockModuleEnabled: boolean;
  /** Boutique en ligne (catalogue public + commandes) ouverte pour toute l'entreprise. */
  onlineStoreEnabled: boolean;
  createdAt: string | null;
};

export type AdminStore = {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  phone: string | null;
  isActive: boolean;
  isPrimary: boolean;
  /** Module Vente Engins activé pour cette boutique (super admin). */
  engineSalesEnabled: boolean;
  /** Module Immatriculation Engins activé pour cette boutique (super admin). */
  engineRegistrationEnabled: boolean;
  /** Module Achats Progressifs activé pour cette boutique (super admin). */
  progressivePurchasesEnabled: boolean;
  /** Module Location (gestion locative) activé pour cette boutique (super admin). */
  rentalModuleEnabled: boolean;
  /** Suivi de péremption (DLC/DLUO) activé pour cette boutique (super admin). */
  expiryModuleEnabled: boolean;
  /** Module Pièces activé pour cette boutique (super admin). Désactivé par défaut. */
  partsModuleEnabled: boolean;
  /** Module Réassort actif pour cette boutique. **Activé** par défaut. */
  restockModuleEnabled: boolean;
  /** Boutique en ligne activée pour cette boutique (super admin). */
  onlineStoreEnabled: boolean;
  createdAt: string | null;
};

/** Ligne de la page Admin › Boutique en ligne (RPC `admin_online_store_overview`). */
export type AdminOnlineStoreRow = {
  storeId: string;
  storeName: string;
  companyId: string;
  companyName: string;
  companyEnabled: boolean;
  storeEnabled: boolean;
  slug: string | null;
  isPublished: boolean;
  ordersCount: number;
  ordersPending: number;
  ordersTotal: number;
  lastOrderAt: string | null;
};

export type AdminUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  companyNames: string[];
};

export type AdminStats = {
  companiesCount: number;
  storesCount: number;
  usersCount: number;
  salesCount: number;
  salesTotalAmount: number;
  activeSubscriptionsCount: number;
};

export type AdminSalesByCompany = {
  companyId: string;
  companyName: string;
  salesCount: number;
  totalAmount: number;
};

export type AdminSalesOverTimeItem = {
  date: string;
  count: number;
  total: number;
};

export type LockedLogin = {
  emailLower: string;
  failedAttempts: number;
  lockedAt: string | null;
};

/** Origine client : FasoStock web (Next.js) vs app Flutter (voir `client_kind` en base). */
export type AdminAppClientKind = "web" | "flutter";

export type AdminAppErrorLog = {
  id: string;
  createdAt: string;
  userId: string | null;
  companyId: string | null;
  storeId: string | null;
  source: string;
  level: string;
  message: string;
  stackTrace: string | null;
  errorType: string | null;
  platform: string | null;
  /** Dénormalisé côté DB (trigger) ; sinon dérivé du contexte pour l’affichage. */
  clientKind: AdminAppClientKind | null;
  context: Record<string, unknown> | null;
};

export type AuditLogEntry = {
  id: string;
  companyId: string | null;
  storeId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminPublicPartner = {
  id: string;
  name: string;
  logoUrl: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string | null;
};

export type AdminPublicLandingMedia = {
  key: string;
  imageUrl: string;
  updatedAt: string | null;
};

export type AdminPublicLandingSetting = {
  key: string;
  value: string;
  updatedAt: string | null;
};

export type AdminNewsletterSubscriber = {
  id: string;
  email: string;
  source: string;
  createdAt: string | null;
};

export type AdminSubscriptionRow = {
  id: string;
  companyId: string;
  planCode: string | null;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  amountFcfa: number;
  startedAt: string | null;
  endsAt: string | null;
  trialEndsAt: string | null;
  createdAt: string | null;
};

export type AdminSalesRow = {
  id: string;
  companyId: string;
  storeId: string | null;
  total: number;
  status: string;
  createdAt: string;
};

export type AdminStoreLite = {
  id: string;
  companyId: string;
  name: string;
  city: string | null;
  isActive: boolean;
};

export type AdminCompanyLite = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string | null;
};

export type AdminUserRoleLite = {
  id: string;
  userId: string;
  companyId: string;
  createdAt: string | null;
};

export type AdminAuditLite = {
  id: string;
  companyId: string | null;
  entityType: string;
  action: string;
  createdAt: string;
};

export type AdminAppErrorLite = {
  id: string;
  companyId: string | null;
  level: string;
  message: string;
  createdAt: string;
};

/** Agrégats SQL exacts (RPC `admin_cockpit_dashboard_metrics`) — indépendants de la limite de lignes chargées. */
export type AdminCockpitPlatformMetrics = {
  completedSalesCount: number;
  completedSalesTotal: number;
  productsCount: number;
  customersCount: number;
  auditDistinctUsers24h: number;
};

export type AdminCockpitData = {
  companies: AdminCompanyLite[];
  stores: AdminStoreLite[];
  userRoles: AdminUserRoleLite[];
  sales: AdminSalesRow[];
  subscriptions: AdminSubscriptionRow[];
  audits: AdminAuditLite[];
  appErrors: AdminAppErrorLite[];
  /** null si la RPC n’est pas encore déployée ou erreur réseau. */
  platformMetrics: AdminCockpitPlatformMetrics | null;
  /** Nombre de ventes complétées chargées pour graphiques / filtres (≤ cap). */
  salesLoadedCap: number;
};

export type AdminSubscriptionPlanLite = {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  interval: "month" | "year";
  isActive: boolean;
};

export type AdminSubscriptionRequestRow = {
  id: string;
  companyId: string;
  companyName: string | null;
  planName: string | null;
  billingInterval: "month" | "year";
  amountCents: number;
  currency: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string | null;
  paymentMethod: string;
  transactionId: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type AdminCompanySubscriptionRow = {
  companyId: string;
  companyName: string;
  companyCreatedAt: string | null;
  subscriptionId: string | null;
  planId: string | null;
  planSlug: string | null;
  planName: string | null;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};
