import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * Le chiffre d'un restaurant se lit sur ses commandes encaissées : période,
 * vendeur, panier moyen et bénéfice y sont déjà.
 */
export default function RestaurantSalesReportPage() {
  redirect(ROUTES.sales);
}
