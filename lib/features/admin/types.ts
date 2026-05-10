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
  /** Autorise l’augmentation du quota de boutiques (plateforme). */
  storeQuotaIncreaseEnabled: boolean;
  createdAt: string | null;
};

export type AdminStore = {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  isActive: boolean;
  isPrimary: boolean;
  createdAt: string | null;
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
