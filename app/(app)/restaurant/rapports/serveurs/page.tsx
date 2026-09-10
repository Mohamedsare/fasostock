import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * Qui a servi combien se lit sur les ventes encaissées, filtrées par vendeur.
 */
export default function RestaurantServersReportPage() {
  redirect(ROUTES.sales);
}
