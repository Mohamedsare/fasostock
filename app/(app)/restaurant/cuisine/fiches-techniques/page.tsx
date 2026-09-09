import { redirect } from "next/navigation";

/**
 * « Recettes » et « fiches techniques » désignent la même chose en cuisine : la
 * liste des ingrédients et ce qu'ils coûtent. Une seule page, deux portes — la
 * seconde renvoie sur la première plutôt que d'en entretenir un jumeau.
 */
export default function RestaurantTechnicalSheetsPage() {
  redirect("/restaurant/cuisine/recettes");
}
