import { redirect } from "next/navigation";

/**
 * Filet de sécurité pour les anciens liens.
 *
 * Toutes les entrées du menu restaurant ont désormais leur page. Ce qui atterrit
 * ici vient donc d'un favori pris pendant la phase de conception, ou d'un lien
 * partagé entre deux téléphones du comptoir. Plutôt qu'un écran « en construction »
 * qui laisse le serveur bloqué en plein service, on le ramène sur le plan de salle.
 */
export default function RestaurantUnknownRoutePage() {
  redirect("/restaurant/salle/plan");
}
