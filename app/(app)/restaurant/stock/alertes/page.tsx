import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/** Les ruptures et le réassort conseillé vivent dans la page Réassort. */
export default function RestaurantStockAlertsPage() {
  redirect(ROUTES.restock);
}
