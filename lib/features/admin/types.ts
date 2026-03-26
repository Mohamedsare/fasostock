/** Aligné `app/lib/data/models/admin_models.dart` + audit. */

export type AdminCompany = {
  id: string;
  name: string;
  slug: string | null;
  isActive: boolean;
  storeQuota: number;
  aiPredictionsEnabled: boolean;
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
