/**
 * Module Réassort — quoi recommander, en quelle quantité.
 * Voir `supabase/migrations/00165_restock_suggestions.sql`.
 */

/** Degré d'urgence calculé en base (stock vs seuil vs couverture). */
export type RestockUrgency = "rupture" | "critique" | "a_surveiller";

export const RESTOCK_URGENCY_LABELS: Record<RestockUrgency, string> = {
  rupture: "En rupture",
  critique: "Critique",
  a_surveiller: "À surveiller",
};

/** Une ligne de la page : un produit qui se vend et dont le stock descend. */
export type RestockCandidate = {
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  categoryName: string | null;
  /** Stock actuel dans le périmètre (boutique courante ou toutes boutiques). */
  stock: number;
  stockMin: number;
  /** Quantité vendue sur la période analysée. */
  soldQty: number;
  /** Nombre de ventes distinctes (tickets) contenant ce produit. */
  salesCount: number;
  /** Chiffre d'affaires généré sur la période. */
  revenue: number;
  /** Vitesse de vente moyenne, en unités par jour. */
  dailyRate: number;
  /** Jours de stock restants au rythme actuel — `null` si la vitesse est nulle. */
  coverDays: number | null;
  /** Quantité conseillée par le calcul statistique (avant avis de l'IA). */
  suggestedQty: number;
  salePrice: number;
  purchasePrice: number;
  /** Dernier prix d'achat constaté — sert à chiffrer la commande. */
  lastPurchasePrice: number | null;
  lastPurchaseAt: string | null;
  supplierId: string | null;
  supplierName: string | null;
  urgency: RestockUrgency;
};

/** Avis de l'IA sur une ligne : quantité revue et justification en clair. */
export type RestockAdviceItem = {
  productId: string;
  /** Quantité conseillée par l'IA (déjà bornée côté serveur). */
  quantity: number;
  priority: "high" | "medium" | "low";
  /** Une phrase expliquant le chiffre — affichée telle quelle au gérant. */
  reason: string;
};

export type RestockAdvice = {
  items: RestockAdviceItem[];
  /** Résumé général (2-4 phrases) : ce qu'il faut retenir de la commande. */
  summary: string;
  /** Horodatage de génération, pour afficher « avis du … ». */
  generatedAt: string;
};

/** Ligne retenue dans le panier de commande, avec la quantité finale du gérant. */
export type RestockOrderLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};
