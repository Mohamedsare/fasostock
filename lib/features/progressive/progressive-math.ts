import type { ProductItem } from "@/lib/features/products/types";
import type { ProgressiveEligibleItem, ProgressivePlan } from "./types";

/** Tolérance d'arrondi (montants FCFA entiers, mais on reste défensif). */
const EPS = 0.5;

/**
 * Objectif du dossier : montant saisi à la main, sinon prix de l'article visé.
 * `null` = aucun objectif fixé (le client épargne « librement »).
 */
export function planGoal(plan: ProgressivePlan): number | null {
  if (plan.targetAmount != null && plan.targetAmount > 0) return plan.targetAmount;
  if (plan.targetProductPrice != null && plan.targetProductPrice > 0) {
    return plan.targetProductPrice;
  }
  return null;
}

/** Avancement 0→1 par rapport à l'objectif du dossier (0 si aucun objectif). */
export function planProgress(plan: ProgressivePlan): number {
  const goal = planGoal(plan);
  if (goal == null || goal <= 0) return 0;
  return Math.max(0, Math.min(1, plan.balance / goal));
}

/** Reste à verser pour atteindre l'objectif (`null` si aucun objectif fixé). */
export function planRemaining(plan: ProgressivePlan): number | null {
  const goal = planGoal(plan);
  if (goal == null) return null;
  return Math.max(0, goal - plan.balance);
}

/**
 * Articles que l'épargne permet de prendre **maintenant** dans la boutique :
 * produits actifs du catalogue de la boutique, en stock, dont le prix de vente
 * est couvert par le solde. Triés du plus cher au moins cher (le client voit
 * d'abord le meilleur article accessible).
 */
export function eligibleItems(params: {
  balance: number;
  products: ProductItem[];
  stockByProductId: Map<string, number>;
}): ProgressiveEligibleItem[] {
  const out: ProgressiveEligibleItem[] = [];
  for (const p of params.products) {
    if (!p.is_active) continue;
    const price = Number(p.sale_price ?? 0);
    if (price <= 0) continue;
    const stock = params.stockByProductId.get(p.id) ?? 0;
    if (stock <= 0) continue;
    if (price > params.balance + EPS) continue;
    out.push({
      productId: p.id,
      name: p.name,
      price,
      stock,
      imageUrl: p.product_images?.[0]?.url ?? null,
      missing: 0,
    });
  }
  return out.sort((a, b) => b.price - a.price);
}

/**
 * Articles « bientôt accessibles » : au-dessus du solde mais à moins de
 * `withinRatio` du solde (défaut +30 %). Sert à motiver le client : « il ne
 * manque que X FCFA pour ce modèle ». Triés par manque croissant.
 */
export function nearlyEligibleItems(params: {
  balance: number;
  products: ProductItem[];
  stockByProductId: Map<string, number>;
  withinRatio?: number;
  limit?: number;
}): ProgressiveEligibleItem[] {
  const ratio = params.withinRatio ?? 0.3;
  const ceiling = params.balance * (1 + ratio);
  const out: ProgressiveEligibleItem[] = [];
  for (const p of params.products) {
    if (!p.is_active) continue;
    const price = Number(p.sale_price ?? 0);
    if (price <= 0) continue;
    const stock = params.stockByProductId.get(p.id) ?? 0;
    if (stock <= 0) continue;
    if (price <= params.balance + EPS) continue;
    if (params.balance > 0 && price > ceiling) continue;
    out.push({
      productId: p.id,
      name: p.name,
      price,
      stock,
      imageUrl: p.product_images?.[0]?.url ?? null,
      missing: Math.max(0, Math.round(price - params.balance)),
    });
  }
  return out.sort((a, b) => a.missing - b.missing).slice(0, params.limit ?? 3);
}

/** Prix du moins cher des articles disponibles en boutique (`null` si aucun). */
export function cheapestAvailablePrice(params: {
  products: ProductItem[];
  stockByProductId: Map<string, number>;
}): number | null {
  let min: number | null = null;
  for (const p of params.products) {
    if (!p.is_active) continue;
    const price = Number(p.sale_price ?? 0);
    if (price <= 0) continue;
    if ((params.stockByProductId.get(p.id) ?? 0) <= 0) continue;
    if (min == null || price < min) min = price;
  }
  return min;
}

/**
 * Le dossier est « prêt » : l'épargne couvre au moins un article disponible.
 * (Indépendant de l'objectif : le client peut prendre un modèle moins cher.)
 */
export function isPlanReady(params: {
  plan: ProgressivePlan;
  cheapestPrice: number | null;
}): boolean {
  if (params.plan.status !== "open") return false;
  if (params.cheapestPrice == null) return false;
  return params.plan.balance + EPS >= params.cheapestPrice;
}
