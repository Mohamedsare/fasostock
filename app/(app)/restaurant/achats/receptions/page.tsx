import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

/** Recevoir un arrivage : c'est exactement ce que fait l'Approvisionnement express. */
export default function RestaurantReceptionsPage() {
  redirect(ROUTES.quickSupply);
}
