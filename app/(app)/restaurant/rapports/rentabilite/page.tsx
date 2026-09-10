import { redirect } from "next/navigation";

/**
 * La rentabilité d'un restaurant se joue au plat, pas au mois : les fiches
 * techniques donnent le coût de revient et la marge de chaque recette.
 */
export default function RestaurantProfitReportPage() {
  redirect("/restaurant/cuisine/recettes");
}
