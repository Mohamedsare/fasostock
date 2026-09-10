import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * L'état du stock cuisine, article par article, avec ses mouvements.
 */
export default function RestaurantStockReportPage() {
  redirect(ROUTES.inventory);
}
