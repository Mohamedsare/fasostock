import type { DashboardPeriod } from "@/lib/features/dashboard/date-range";
import type { DashboardData } from "@/lib/features/dashboard/types";
import { ROUTES } from "@/lib/config/routes";
import { formatCurrency } from "@/lib/utils/currency";

export type OwnerRecommendationPriority = "urgent" | "important" | "conseil";

export type OwnerRecommendation = {
  id: string;
  priority: OwnerRecommendationPriority;
  title: string;
  situation: string;
  action: string;
  metric?: string;
};

function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
}

function periodLabel(period: DashboardPeriod): string {
  switch (period) {
    case "today":
      return "aujourd'hui";
    case "week":
      return "cette semaine";
    case "month":
      return "ce mois";
    default:
      return "sur la période choisie";
  }
}

function priorityRank(p: OwnerRecommendationPriority): number {
  if (p === "urgent") return 0;
  if (p === "important") return 1;
  return 2;
}

/** Recommandations concrètes à partir des chiffres réels du tableau de bord. */
export function buildOwnerRecommendations(
  d: DashboardData,
  period: DashboardPeriod,
): OwnerRecommendation[] {
  const recs: OwnerRecommendation[] = [];
  const pl = periodLabel(period);
  const cur = d.salesSummary;
  const prev = d.previousPeriodSummary;
  const caPct = pctChange(cur.totalAmount, prev.totalAmount);
  const ventesPct = pctChange(cur.count, prev.count);
  const marginRate =
    cur.totalAmount > 0 ? (cur.margin / cur.totalAmount) * 100 : 0;
  const prevTicket = prev.count > 0 ? prev.totalAmount / prev.count : 0;
  const ticketPct = pctChange(d.ticketAverage, prevTicket);

  const top = d.topProducts[0];
  const topMargin = d.topByMargin[0];
  const slow = d.leastByRevenue[0];

  const topInAlert =
    top &&
    d.stockWatchSamples.some(
      (s) =>
        s.productName.trim().toLowerCase() === top.productName.trim().toLowerCase(),
    );
  const topAlertSample = top
    ? d.stockWatchSamples.find(
        (s) =>
          s.productName.trim().toLowerCase() === top.productName.trim().toLowerCase(),
      )
    : undefined;

  if (cur.count === 0 && cur.totalAmount <= 0) {
    recs.push({
      id: "no-sales",
      priority: "urgent",
      title: "Aucune vente enregistrée",
      situation: `Sur la période (${pl}), FasoStock ne voit aucune vente saisie.`,
      action:
        "Ouvrez la caisse et enregistrez chaque vente. Sans ventes enregistrées, le tableau de bord ne peut pas vous guider.",
      metric: "0 vente sur la période",
    });
  }

  if (topInAlert && topAlertSample) {
    recs.push({
      id: "star-low-stock",
      priority: "urgent",
      title: "Votre meilleure vente manque de stock",
      situation: `« ${top.productName} » est votre produit le plus vendu ${pl}, mais il ne reste que ${topAlertSample.quantity} en stock (seuil ${topAlertSample.threshold}).`,
      action:
        "Commandez ou transférez ce produit en priorité avant la rupture. C'est lui qui attire le plus de clients.",
      metric: `${top.quantitySold} vendu(s) · ${formatCurrency(top.revenue)} de CA`,
    });
  }

  if (d.lowStockCount >= 3 && !topInAlert) {
    recs.push({
      id: "many-alerts",
      priority: "urgent",
      title: "Plusieurs produits en alerte stock",
      situation: `${d.lowStockCount} produit${d.lowStockCount > 1 ? "s" : ""} ${d.lowStockCount > 1 ? " sont" : " est"} sous le seuil minimum sur votre périmètre.`,
      action:
        "Ouvrez le panneau « Alertes stock » ci-dessus, puis réapprovisionnez d'abord ceux que vous vendez le plus souvent.",
      metric: "Voir la liste des produits concernés",
    });
  }

  if (caPct !== null && caPct <= -15) {
    recs.push({
      id: "ca-down",
      priority: "important",
      title: "Votre chiffre d'affaires baisse",
      situation: `Vous avez fait ${formatCurrency(cur.totalAmount)} ${pl}, contre ${formatCurrency(prev.totalAmount)} sur la période précédente (${caPct.toFixed(0)} %).`,
      action:
        "Mettez en avant en boutique vos 2 ou 3 produits qui se vendent le mieux. Vérifiez aussi que toutes les ventes sont bien enregistrées à la caisse.",
      metric: `${cur.count} vente${cur.count > 1 ? "s" : ""} ${pl}`,
    });
  } else if (caPct !== null && caPct >= 15 && cur.totalAmount > 0) {
    recs.push({
      id: "ca-up",
      priority: "conseil",
      title: "Bonne dynamique de ventes",
      situation: `Votre CA ${pl} est de ${formatCurrency(cur.totalAmount)}, en hausse d'environ ${caPct.toFixed(0)} % par rapport à la période précédente.`,
      action:
        "Profitez de cette dynamique : réapprovisionnez tout de suite les produits qui partent vite pour ne pas perdre de clients.",
      metric: `${cur.count} vente${cur.count > 1 ? "s" : ""}`,
    });
  }

  if (cur.totalAmount > 0 && marginRate < 12) {
    recs.push({
      id: "margin-low",
      priority: "important",
      title: "Marge faible — peu de gain sur les ventes",
      situation: `Sur ${formatCurrency(cur.totalAmount)} de ventes, votre gain estimé est ${formatCurrency(cur.margin)} (environ ${marginRate.toFixed(0)} % du CA).`,
      action:
        "Vérifiez vos prix d'achat et augmentez légèrement la marge sur les articles les plus vendus. Même 2 % de plus peut changer votre rentabilité.",
    });
  } else if (cur.totalAmount > 0 && marginRate >= 22) {
    recs.push({
      id: "margin-good",
      priority: "conseil",
      title: "Bonne rentabilité sur la période",
      situation: `Votre gain estimé est ${formatCurrency(cur.margin)} sur ${formatCurrency(cur.totalAmount)} de ventes (environ ${marginRate.toFixed(0)} %).`,
      action:
        "Continuez sur les produits qui vous rapportent le plus. Gardez-les toujours disponibles en rayon.",
    });
  }

  if (top && cur.count > 0) {
    recs.push({
      id: "top-product",
      priority: "conseil",
      title: "Votre produit star du moment",
      situation: `« ${top.productName} » se vend le mieux ${pl} : ${top.quantitySold} unité${top.quantitySold > 1 ? "s" : ""} pour ${formatCurrency(top.revenue)}.`,
      action:
        "Placez-le bien visible en boutique. Proposez à côté des produits complémentaires pour augmenter le panier moyen.",
      metric:
        topMargin && topMargin.productId !== top.productId
          ? `Meilleure marge : « ${topMargin.productName} » (${formatCurrency(topMargin.margin)})`
          : undefined,
    });
  }

  if (slow && cur.count >= 3 && slow.revenue > 0) {
    const slowShare =
      cur.totalAmount > 0 ? (slow.revenue / cur.totalAmount) * 100 : 0;
    if (slowShare < 8) {
      recs.push({
        id: "slow-mover",
        priority: "conseil",
        title: "Un produit tourne peu",
        situation: `« ${slow.productName} » n'a généré que ${formatCurrency(slow.revenue)} ${pl} (${slowShare.toFixed(0)} % de votre CA).`,
        action:
          "Faites une promotion, baissez le stock commandé, ou retirez-le du rayon pour libérer de la place et de l'argent.",
      });
    }
  }

  if (
    cur.count >= 2 &&
    cur.totalAmount >= 50_000 &&
    d.purchasesSummary.count === 0
  ) {
    recs.push({
      id: "no-purchases",
      priority: "important",
      title: "Ventes sans achat enregistré",
      situation: `Vous avez ${cur.count} vente${cur.count > 1 ? "s" : ""} ${pl}, mais aucun bon d'achat / entrée stock saisi sur la même période.`,
      action:
        "Enregistrez vos achats fournisseurs dans FasoStock. Sinon le stock affiché ne sera pas fiable et les alertes seront fausses.",
    });
  }

  if (
    period !== "today" &&
    d.daySalesSummary.count === 0 &&
    cur.count > 0
  ) {
    recs.push({
      id: "today-quiet",
      priority: "conseil",
      title: "Aucune vente aujourd'hui (pour l'instant)",
      situation: `La période affichée a ${cur.count} vente${cur.count > 1 ? "s" : ""}, mais aucune vente n'est enregistrée pour la date du jour.`,
      action:
        "Si la boutique est ouverte, pensez à enregistrer les ventes au fur et à mesure. Si vous êtes fermé, c'est normal.",
    });
  }

  if (ticketPct !== null && ticketPct <= -20 && cur.count >= 3) {
    recs.push({
      id: "ticket-down",
      priority: "important",
      title: "Panier moyen en baisse",
      situation: `Chaque client dépense en moyenne ${formatCurrency(d.ticketAverage)} ${pl}, contre ${formatCurrency(prevTicket)} avant (${ticketPct.toFixed(0)} %).`,
      action:
        "Proposez un produit en plus à la caisse (« Vous prendrez aussi… ? »). Regroupez des articles qui se vendent souvent ensemble.",
    });
  } else if (ticketPct !== null && ticketPct >= 20 && cur.count >= 3) {
    recs.push({
      id: "ticket-up",
      priority: "conseil",
      title: "Panier moyen en hausse",
      situation: `Vos clients dépensent en moyenne ${formatCurrency(d.ticketAverage)} par vente ${pl} (+${ticketPct.toFixed(0)} % vs période précédente).`,
      action: "Identifiez ce qui fonctionne (produits groupés, promotions) et répétez la même approche.",
    });
  }

  const catTotal = d.salesByCategory.reduce((s, c) => s + c.revenue, 0);
  if (catTotal > 0 && d.salesByCategory.length >= 2) {
    const sorted = [...d.salesByCategory].sort((a, b) => b.revenue - a.revenue);
    const lead = sorted[0]!;
    const leadPct = (lead.revenue / catTotal) * 100;
    if (leadPct >= 75) {
      recs.push({
        id: "category-focus",
        priority: "conseil",
        title: "Vos ventes sont très concentrées",
        situation: `La catégorie « ${lead.categoryName} » représente ${leadPct.toFixed(0)} % de votre CA ${pl} (${formatCurrency(lead.revenue)}).`,
        action:
          "Développez 1 ou 2 autres catégories pour ne pas dépendre d'un seul type de produit si les clients changent d'habitude.",
      });
    }
  }

  if (ventesPct !== null && ventesPct <= -25 && cur.totalAmount > 0 && caPct !== null && caPct > -10) {
    recs.push({
      id: "fewer-sales-same-ca",
      priority: "conseil",
      title: "Moins de ventes, mais paniers plus gros",
      situation: `${cur.count} vente${cur.count > 1 ? "s" : ""} ${pl} (${ventesPct.toFixed(0)} % vs avant) pour ${formatCurrency(cur.totalAmount)} de CA.`,
      action:
        "C'est une bonne tendance si le panier moyen monte. Surveillez tout de même que les gros achats ne soient pas des dettes clients difficiles à recouvrer.",
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "all-good",
      priority: "conseil",
      title: "Situation stable — continuez ainsi",
      situation: `Vos indicateurs ${pl} sont équilibrés : ${formatCurrency(cur.totalAmount)} de CA, ${cur.count} vente${cur.count > 1 ? "s" : ""}, marge ${formatCurrency(cur.margin)}.`,
      action:
        "Passez en revue vos stocks une fois par semaine et enregistrez chaque vente à la caisse pour garder des chiffres fiables.",
    });
  }

  recs.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  return recs.slice(0, 6);
}

export const OWNER_REC_PRIORITY_LABEL: Record<
  OwnerRecommendationPriority,
  string
> = {
  urgent: "À faire maintenant",
  important: "Important",
  conseil: "Conseil",
};

/** Liens optionnels (section cartes plus bas) — pas de navigation au clic panneau. */
export function ownerRecommendationHref(
  id: string,
  ctx: { canInventory: boolean; canPurchases: boolean; reportsHref: string },
): string | undefined {
  switch (id) {
    case "no-sales":
      return ROUTES.sales;
    case "star-low-stock":
    case "many-alerts":
      return ctx.canInventory ? ROUTES.inventory : ctx.reportsHref;
    case "no-purchases":
      return ctx.canPurchases ? ROUTES.purchases : undefined;
    default:
      return ctx.reportsHref;
  }
}
