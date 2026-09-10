import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * Le moyen de paiement de chaque encaissement est une colonne des ventes.
 */
export default function RestaurantPaymentsReportPage() {
  redirect(ROUTES.sales);
}
