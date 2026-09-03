/**
 * Ligne du panier de caisse — état d'écran, pas encore une `sale_items`.
 *
 * Vit ici plutôt que dans l'écran depuis que le panier est persisté : la forme des
 * lignes est ce qui est écrit sur disque, elle a besoin d'un point de définition unique
 * que le brouillon et l'écran partagent (voir `pos-draft.ts`).
 */
export type CartRow = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  imageUrl?: string | null;
  /** Ligne depuis `sale_items.total` — remises ligne pour RPC update (Flutter). */
  lineTotal?: number;
  /** Si true, ne pas recalculer détail/gros quand la qté change (ex. PU saisi ou édition vente). */
  linePriceUserSet?: boolean;
  /**
   * Palier de conditionnement actuellement appliqué à la ligne (« Paquet », « Carton »…),
   * `null`/absent = prix à la pièce. Recalculé à CHAQUE changement de quantité : le
   * tarif de gros suit la quantité, dans les deux sens.
   */
  tierLabel?: string | null;
  /**
   * Conditionnement CHOISI explicitement par le vendeur (dialogue « Conditionnement »
   * ou scan du code-barres du carton). Son tarif fait foi tant que la quantité le
   * couvre, MÊME s'il revient plus cher à la pièce que le prix catalogue : c'est une
   * décision du vendeur sur le prix affiché dans le dialogue, pas une déduction
   * automatique. Sans ce marqueur, un carton tarifé au-dessus du prix pièce était
   * silencieusement facturé au prix pièce (carton de 200 à 4 100 000 encaissé 400 000).
   */
  chosenPackaging?: { label: string; factor: number; price: number | null } | null;
};
