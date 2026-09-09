import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * Un ingrédient est un produit du catalogue, compté dans le stock ordinaire. Lui
 * donner sa propre page aurait créé un second inventaire — et deux quantités
 * différentes pour le même sac de riz.
 */
export default function RestaurantIngredientsPage() {
  redirect(ROUTES.inventory);
}
