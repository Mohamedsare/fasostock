import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/** « Qui a vendu combien » est l'onglet Équipe des Rapports. */
export default function RestaurantStaffPerformancePage() {
  redirect(ROUTES.reports);
}
