import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/** Les mouvements de stock sont un onglet de la page Stock, commune à tous les métiers. */
export default function RestaurantStockMovesPage() {
  redirect(ROUTES.inventory);
}
