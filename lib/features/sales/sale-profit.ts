/**
 * Bénéfice d'une vente = **total facturé − coût d'achat des articles vendus**.
 *
 * Le coût de référence est `products.purchase_price`, exactement comme le Tableau de
 * bord et les Rapports (c'est aussi ce que le module Prix de revient réécrit après un
 * arrivage) : deux pages ne doivent jamais donner deux marges différentes.
 *
 * Une différence assumée avec les Rapports : ici le bénéfice porte sur le **facturé**,
 * pas sur l'encaissé. C'est la convention de la page Ventes (voir `analytics.ts`) —
 * une vente à crédit affiche donc son bénéfice complet dès la vente, alors que les
 * Rapports ne le reconnaissent qu'au fil des remboursements.
 */

import type { SaleItem } from "./types";

/** Agrégat des lignes d'une vente, lu depuis `sale_items` (voir `fetchSalesCost`). */
export type SaleCostAggregate = {
  /** Σ des totaux de ligne — avant la remise globale de la vente. */
  itemsTotal: number;
  /** Σ `purchase_price × quantité` sur les lignes dont le coût est connu. */
  cost: number;
  lineCount: number;
  /** Lignes dont le produit n'a pas de prix d'achat renseigné. */
  linesWithoutCost: number;
};

export type SaleProfit = {
  /** Montant facturé retenu = `sales.total` (remise globale déjà déduite). */
  revenue: number;
  cost: number;
  profit: number;
  /** Taux de marge en % du facturé (0 si vente à 0). */
  marginPercent: number;
  linesWithoutCost: number;
  /**
   * Aucun coût connu sur la vente : le « bénéfice » vaudrait le chiffre d'affaires.
   * On préfère l'annoncer que d'afficher une marge de 100 % qui n'existe pas.
   */
  unknown: boolean;
  /** Au moins une ligne sans prix d'achat : le bénéfice affiché est surestimé. */
  understated: boolean;
};

/** Seule une vente complétée a un bénéfice : annulée / remboursée / brouillon = rien. */
export function saleProfitCountable(sale: Pick<SaleItem, "status">): boolean {
  return sale.status === "completed";
}

export function computeSaleProfit(
  sale: Pick<SaleItem, "status" | "total">,
  agg: SaleCostAggregate | undefined,
): SaleProfit | null {
  if (!saleProfitCountable(sale) || !agg) return null;
  const revenue = Number(sale.total ?? 0);
  const cost = Math.max(0, agg.cost);
  const profit = revenue - cost;
  const unknown = agg.lineCount > 0 && agg.linesWithoutCost >= agg.lineCount;
  return {
    revenue,
    cost,
    profit,
    marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
    linesWithoutCost: agg.linesWithoutCost,
    unknown,
    understated: agg.linesWithoutCost > 0 && !unknown,
  };
}

/** Palier de marge — pilote la couleur de la puce et de la jauge. */
export type ProfitTier = "loss" | "thin" | "healthy" | "strong";

export function profitTier(p: SaleProfit): ProfitTier {
  if (p.profit < 0) return "loss";
  if (p.marginPercent < 10) return "thin";
  if (p.marginPercent < 30) return "healthy";
  return "strong";
}

export const PROFIT_TIER_TEXT_CLASS: Record<ProfitTier, string> = {
  loss: "text-red-600 dark:text-red-400",
  thin: "text-amber-700 dark:text-amber-300",
  healthy: "text-emerald-700 dark:text-emerald-300",
  strong: "text-emerald-700 dark:text-emerald-300",
};

export const PROFIT_TIER_BAR_CLASS: Record<ProfitTier, string> = {
  loss: "bg-red-500",
  thin: "bg-amber-500",
  healthy: "bg-emerald-500",
  strong: "bg-emerald-600",
};
