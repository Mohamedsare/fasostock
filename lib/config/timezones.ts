/**
 * Fuseaux horaires proposés au propriétaire (Paramètres › Fuseau horaire).
 *
 * **Pourquoi un réglage d'entreprise et non le fuseau du navigateur.**
 * Se fier au poste revient à faire dépendre l'heure des tickets, des rapports et des
 * bornes « aujourd'hui » du réglage Windows de chaque caissier. Un seul PC mal réglé
 * (cas constaté : « W. Central Africa », UTC+1, dans un commerce burkinabè en UTC+0)
 * suffisait à décaler l'heure imprimée et à ranger des ventes dans le mauvais jour.
 * Le commerce a UN fuseau, celui de son pays : il se choisit une fois, il vaut pour
 * tous les postes et pour les documents générés côté serveur.
 *
 * La liste couvre le marché visé (UEMOA, CEMAC, Afrique de l'Est et Maghreb).
 * Ce sont des identifiants IANA : les règles d'heure d'été (Maroc/Ramadan) sont
 * gérées par `Intl`, il n'y a aucun décalage à coder ici.
 */
export type TimeZoneDef = {
  /** Identifiant IANA, tel que passé à `Intl.DateTimeFormat`. */
  id: string;
  /** Libellé du sélecteur. */
  label: string;
  /** Décalage indicatif, pour reconnaître le sien d'un coup d'œil. */
  offsetLabel: string;
};

export const DEFAULT_TIME_ZONE = "Africa/Ouagadougou";

export const SUPPORTED_TIME_ZONES: readonly TimeZoneDef[] = [
  {
    id: "Africa/Ouagadougou",
    label: "Burkina Faso, Mali, Sénégal, Côte d'Ivoire, Togo, Guinée",
    offsetLabel: "UTC+0",
  },
  { id: "Africa/Abidjan", label: "Côte d'Ivoire (Abidjan)", offsetLabel: "UTC+0" },
  { id: "Africa/Dakar", label: "Sénégal (Dakar)", offsetLabel: "UTC+0" },
  { id: "Africa/Bamako", label: "Mali (Bamako)", offsetLabel: "UTC+0" },
  { id: "Africa/Accra", label: "Ghana (Accra)", offsetLabel: "UTC+0" },
  { id: "Africa/Conakry", label: "Guinée (Conakry)", offsetLabel: "UTC+0" },
  { id: "Africa/Nouakchott", label: "Mauritanie (Nouakchott)", offsetLabel: "UTC+0" },
  { id: "Africa/Lome", label: "Togo (Lomé)", offsetLabel: "UTC+0" },
  { id: "Africa/Banjul", label: "Gambie (Banjul)", offsetLabel: "UTC+0" },
  { id: "Africa/Bissau", label: "Guinée-Bissau (Bissau)", offsetLabel: "UTC+0" },
  { id: "Africa/Freetown", label: "Sierra Leone (Freetown)", offsetLabel: "UTC+0" },
  { id: "Africa/Monrovia", label: "Liberia (Monrovia)", offsetLabel: "UTC+0" },
  { id: "Africa/Lagos", label: "Nigeria, Niger, Bénin (Lagos)", offsetLabel: "UTC+1" },
  { id: "Africa/Porto-Novo", label: "Bénin (Porto-Novo)", offsetLabel: "UTC+1" },
  { id: "Africa/Niamey", label: "Niger (Niamey)", offsetLabel: "UTC+1" },
  { id: "Africa/Douala", label: "Cameroun (Douala)", offsetLabel: "UTC+1" },
  { id: "Africa/Bangui", label: "Centrafrique (Bangui)", offsetLabel: "UTC+1" },
  { id: "Africa/Ndjamena", label: "Tchad (N'Djaména)", offsetLabel: "UTC+1" },
  { id: "Africa/Libreville", label: "Gabon (Libreville)", offsetLabel: "UTC+1" },
  { id: "Africa/Brazzaville", label: "Congo (Brazzaville)", offsetLabel: "UTC+1" },
  { id: "Africa/Kinshasa", label: "RD Congo — ouest (Kinshasa)", offsetLabel: "UTC+1" },
  { id: "Africa/Luanda", label: "Angola (Luanda)", offsetLabel: "UTC+1" },
  { id: "Africa/Tunis", label: "Tunisie (Tunis)", offsetLabel: "UTC+1" },
  { id: "Africa/Algiers", label: "Algérie (Alger)", offsetLabel: "UTC+1" },
  { id: "Africa/Casablanca", label: "Maroc (Casablanca)", offsetLabel: "UTC+1 / heure d'été" },
  { id: "Africa/Lubumbashi", label: "RD Congo — est (Lubumbashi)", offsetLabel: "UTC+2" },
  { id: "Africa/Kigali", label: "Rwanda (Kigali)", offsetLabel: "UTC+2" },
  { id: "Africa/Bujumbura", label: "Burundi (Bujumbura)", offsetLabel: "UTC+2" },
  { id: "Africa/Cairo", label: "Égypte (Le Caire)", offsetLabel: "UTC+2 / heure d'été" },
  { id: "Africa/Nairobi", label: "Kenya, Tanzanie, Ouganda (Nairobi)", offsetLabel: "UTC+3" },
  { id: "Africa/Djibouti", label: "Djibouti", offsetLabel: "UTC+3" },
  { id: "Indian/Comoro", label: "Comores (Moroni)", offsetLabel: "UTC+3" },
  { id: "Europe/Paris", label: "France (Paris)", offsetLabel: "UTC+1 / heure d'été" },
];

const IDS = new Set(SUPPORTED_TIME_ZONES.map((t) => t.id));

export function isSupportedTimeZone(id: string): boolean {
  return IDS.has(id);
}

export function timeZoneLabelOf(id: string): string {
  return SUPPORTED_TIME_ZONES.find((t) => t.id === id)?.label ?? id;
}
