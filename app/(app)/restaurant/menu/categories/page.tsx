import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * Les catégories d'un restaurant sont celles du catalogue : un plat EST un produit.
 * En entretenir une seconde liste aurait donné deux arborescences à maintenir, et
 * une caisse qui ne montre pas les mêmes rayons que la page Produits.
 */
export default function RestaurantMenuCategoriesPage() {
  redirect(ROUTES.products);
}
