import { redirect } from "next/navigation";

/**
 * L'entrée du module n'a pas de contenu propre : ce qu'un restaurateur veut voir en
 * ouvrant « Restaurant », c'est sa salle. Une page d'accueil intermédiaire aurait
 * ajouté un geste à chaque service, cent fois par soir.
 */
export default function RestaurantIndexPage() {
  redirect("/restaurant/salle/plan");
}
