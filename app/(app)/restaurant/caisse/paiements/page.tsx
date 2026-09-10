import { redirect } from "next/navigation";

/**
 * Les encaissements d'une journée se lisent dans sa session de caisse :
 * fond du matin, ventes en espèces, sorties, et l'écart au comptage.
 */
export default function RestaurantPaymentsPage() {
  redirect("/restaurant/caisse/sessions");
}
