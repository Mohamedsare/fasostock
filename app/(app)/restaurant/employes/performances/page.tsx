import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * Le rendement d'un serveur se lit sur les ventes qu'il a encaissées.
 */
export default function RestaurantStaffPerformancePage() {
  redirect(ROUTES.sales);
}
