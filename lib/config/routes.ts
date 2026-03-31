/** Aligné sur `app/lib/core/config/routes.dart` (Flutter). */
export const ROUTES = {
  login: "/login",
  register: "/register",
  /** Choix du type d’activité avant inscription (`?businessType=` sur `/register`). */
  registerSelectActivity: "/register/select-activity",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  products: "/products",
  sales: "/sales",
  stores: "/stores",
  inventory: "/inventory",
  stockCashier: "/stock-c",
  purchases: "/purchases",
  warehouse: "/warehouse",
  transfers: "/transfers",
  customers: "/customers",
  suppliers: "/suppliers",
  reports: "/reports",
  ai: "/ai",
  settings: "/settings",
  users: "/users",
  audit: "/audit",
  help: "/help",
  notifications: "/notifications",
  integrations: "/integrations",
  /** Espace super-admin (shell dédié, aligné Flutter `AppRoutes.admin`). */
  admin: "/admin",
  adminCompanies: "/admin/companies",
  adminStores: "/admin/stores",
  adminUsers: "/admin/users",
  adminAudit: "/admin/audit",
  adminAppErrors: "/admin/app-errors",
  adminMessages: "/admin/messages",
  adminAi: "/admin/ai",
  adminReports: "/admin/reports",
  adminSettings: "/admin/settings",
} as const;

/** Barre du bas mobile — 3 raccourcis + « Plus » (comme Flutter `AppShell`). */
export const MOBILE_BOTTOM_PRIMARY = [
  ROUTES.dashboard,
  ROUTES.products,
  ROUTES.sales,
] as const;
