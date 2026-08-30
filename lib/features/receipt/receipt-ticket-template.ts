/**
 * Modèle de mise en forme du ticket thermique, choisi par boutique
 * (page Boutiques › « Caisse rapide — format ticket »).
 *
 * - `classic` : la mise en forme d'origine, en Courier avec lignes de tirets — parité
 *   avec le ticket Flutter (`receipt_ticket_layout.dart`). Reste le défaut : aucun
 *   ticket déjà en circulation ne change tant que le commerçant ne choisit pas l'autre.
 * - `moderne` : mise en forme épurée (sans-serif, filets pleins, total en bandeau,
 *   nom d'article sur sa propre ligne). Le nom complet tient même en 58 mm, là où le
 *   modèle classique doit le tronquer à 16 caractères pour garder ses colonnes.
 */
export type ReceiptTicketTemplate = "classic" | "moderne";

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTicketTemplate = "classic";

/** Valeur libre (base, payload réseau) → modèle connu. Inconnue/absente ⇒ `classic`. */
export function normalizeReceiptTemplate(
  raw: string | null | undefined,
): ReceiptTicketTemplate {
  return String(raw ?? "").trim().toLowerCase() === "moderne"
    ? "moderne"
    : "classic";
}

export const RECEIPT_TEMPLATE_CHOICES: ReadonlyArray<{
  value: ReceiptTicketTemplate;
  label: string;
  description: string;
}> = [
  {
    value: "classic",
    label: "Classique",
    description:
      "Police machine à écrire, colonnes et lignes de tirets. Le ticket historique.",
  },
  {
    value: "moderne",
    label: "Moderne",
    description:
      "Filets nets, total en bandeau noir, nom d'article complet sur sa ligne.",
  },
];
