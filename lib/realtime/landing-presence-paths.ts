import { ROUTES } from "@/lib/config/routes";

/** Racines de l’app métier (hors pages publiques / marketing). */
const APP_ZONE_ROOTS: string[] = [
  ROUTES.dashboard,
  ROUTES.products,
  ROUTES.barcodes,
  ROUTES.sales,
  ROUTES.stores,
  ROUTES.inventory,
  ROUTES.stockCashier,
  ROUTES.purchases,
  ROUTES.warehouse,
  ROUTES.transfers,
  ROUTES.customers,
  ROUTES.credit,
  ROUTES.suppliers,
  ROUTES.reports,
  ROUTES.ai,
  ROUTES.settings,
  ROUTES.printers,
  ROUTES.users,
  ROUTES.audit,
  ROUTES.help,
  ROUTES.subscription,
  ROUTES.integrations,
  "/restaurant",
];

/**
 * True si on doit diffuser la présence « visiteur » (landing, login, légal, etc.).
 * Exclut /admin*, /api* et toute l’app connectée (dashboard, POS, …).
 */
export function shouldReportLandingPresence(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? pathname).replace(/\/$/, "") || "/";
  if (path.startsWith("/admin") || path.startsWith("/api")) return false;

  const normalized = path === "" ? "/" : path;

  for (const root of APP_ZONE_ROOTS) {
    const r = root.replace(/\/$/, "") || "/";
    if (normalized === r || normalized.startsWith(`${r}/`)) return false;
  }

  return true;
}
