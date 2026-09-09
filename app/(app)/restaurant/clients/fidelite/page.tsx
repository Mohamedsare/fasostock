import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/**
 * Pas de programme de fidélité à ce jour. Plutôt qu'un écran vide qui promet une
 * fonction inexistante, l'entrée mène à la base clients — là où se lit réellement
 * qui revient et combien il a dépensé.
 */
export default function RestaurantLoyaltyPage() {
  redirect(ROUTES.customers);
}
