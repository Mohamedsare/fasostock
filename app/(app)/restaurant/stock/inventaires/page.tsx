import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * Un restaurant ne fait pas de campagne d'inventaire : ses ingrédients se
 * comptent directement sur la page Stock cuisine.
 */
export default function RestaurantStockSessionsPage() {
  redirect(ROUTES.inventory);
}
