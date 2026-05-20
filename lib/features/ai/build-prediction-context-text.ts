import { formatCurrency } from "@/lib/utils/currency";
import type { PredictionContext } from "@/lib/features/ai/prediction-types";

/** Texte contexte envoyé à DeepSeek — aligné `_buildContextText` (Flutter). */
export function buildPredictionContextText(ctx: PredictionContext): string {
  const fmt = (v: number) => formatCurrency(Number.isFinite(v) ? v : 0);
  const scope =
    ctx.storeName != null
      ? `Boutique: ${ctx.storeName}`
      : `Entreprise: ${ctx.companyName} (toutes boutiques)`;

  let trend = "";
  if (ctx.salesByDay.length >= 2) {
    const mid = Math.floor(ctx.salesByDay.length / 2);
    const sumFirst = ctx.salesByDay.slice(0, mid).reduce((s, d) => s + d.total, 0);
    const sumSecond = ctx.salesByDay.slice(mid).reduce((s, d) => s + d.total, 0);
    const trendPct = sumFirst > 0 ? ((sumSecond - sumFirst) / sumFirst) * 100 : 0;
    trend = `Tendance CA en cours de mois: ${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}% (2e moitié vs 1re moitié).`;
  }

  let comparison = "";
  if (ctx.previousMonthSummary != null) {
    const p = ctx.previousMonthSummary;
    const deltaCa = ctx.salesSummary.totalAmount - p.totalAmount;
    const deltaPct = p.totalAmount > 0 ? (deltaCa / p.totalAmount) * 100 : 0;
    comparison = `
Mois précédent (comparaison):
  CA: ${fmt(p.totalAmount)} (${p.count} ventes)
  Évolution ce mois: ${deltaCa >= 0 ? "+" : ""}${fmt(deltaCa)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)
  Marge mois précédent: ${fmt(p.margin)}`;
  }

  const dailyLine =
    ctx.salesByDay.length > 0
      ? `\nCA par jour (${ctx.salesByDay.length} jours avec ventes):\n${ctx.salesByDay
          .map((d) => `  ${d.date}: ${fmt(d.total)} (${d.count} ventes)`)
          .join("\n")}`
      : "\nAucune vente détaillée par jour ce mois.";

  return `
Période: ${ctx.period}
Contexte: ${scope}
${trend ? `\n${trend}` : ""}

--- CE MOIS ---
Chiffre d'affaires: ${fmt(ctx.salesSummary.totalAmount)} (${ctx.salesSummary.count} ventes, ${ctx.salesSummary.itemsSold} articles vendus)
Marge: ${fmt(ctx.salesSummary.margin)} (taux: ${ctx.marginRatePercent.toFixed(1)}%)
Achats: ${fmt(ctx.purchasesSummary.totalAmount)} (${ctx.purchasesSummary.count} commandes)
Valeur stock: ${fmt(ctx.stockValue)}
Alertes stock (produits sous seuil minimum): ${ctx.lowStockCount}
${comparison}
${dailyLine}

--- TOP 15 PRODUITS VENDUS (ce mois) ---
${ctx.topProducts
  .map(
    (e, i) =>
      `${i + 1}. ${e.productName}: ${e.quantitySold} vendus, CA ${fmt(e.revenue)}, marge ${fmt(e.margin)}`,
  )
  .join("\n")}
`.trim();
}
