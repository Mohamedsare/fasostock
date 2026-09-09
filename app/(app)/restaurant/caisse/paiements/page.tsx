import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/** Le détail des encaissements se lit dans les Rapports, avec le reste du chiffre. */
export default function RestaurantPaymentsPage() {
  redirect(ROUTES.reports);
}
