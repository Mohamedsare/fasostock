/**
 * Lecture analytique de l'historique des ventes — « qui a vendu quoi, quand,
 * combien », calculée **sur la liste déjà chargée** par [listSales] : aucune
 * requête supplémentaire, donc aucun coût réseau et aucune permission en plus.
 *
 * Périmètre volontairement limité à ce que porte une ligne de vente :
 * nombre de ventes, **total facturé**, remises, panier moyen. Le **CA encaissé**
 * et la **marge** dépendent des encaissements et du coût d'achat (voir
 * `fetchTeamPerformance` / page Rapports › Équipe) : ils ne sont pas recalculés
 * ici pour ne pas afficher deux chiffres « CA » différents dans l'application.
 */

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { localDateFromIso } from "@/lib/utils/local-day";
import { toIsoDate } from "@/lib/utils/date";
import { saleSellerLabel } from "./sale-display";
import type { SaleItem } from "./types";

/** Une vente n'entre dans les totaux que si elle est **complétée**. */
function isCounted(s: SaleItem): boolean {
  return s.status === "completed";
}

// ───────────────────────── Périodes ─────────────────────────

export type SalesPeriodPreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "month"
  | "lastMonth"
  | "all"
  | "custom";

/** Bornes `"YYYY-MM-DD"` (chaîne vide = pas de borne, donc « tout »). */
export type SalesDateRange = { from: string; to: string };

export const SALES_PERIOD_PRESETS: Array<{
  id: Exclude<SalesPeriodPreset, "custom">;
  label: string;
}> = [
  { id: "today", label: "Aujourd'hui" },
  { id: "yesterday", label: "Hier" },
  { id: "last7", label: "7 derniers jours" },
  { id: "last30", label: "30 derniers jours" },
  { id: "month", label: "Ce mois" },
  { id: "lastMonth", label: "Mois dernier" },
  { id: "all", label: "Tout l'historique" },
];

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Bornes d'un preset, **en date locale** (les bornes horaires exactes sont
 * ensuite calculées par `localDayStartIso`/`localDayEndIso` côté requête).
 */
export function salesPeriodRange(
  preset: SalesPeriodPreset,
  now: Date = new Date(),
): SalesDateRange {
  const today = toIsoDate(now);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = toIsoDate(shiftDays(now, -1));
      return { from: y, to: y };
    }
    case "last7":
      return { from: toIsoDate(shiftDays(now, -6)), to: today };
    case "last30":
      return { from: toIsoDate(shiftDays(now, -29)), to: today };
    case "month":
      return {
        from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: today,
      };
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Jour 0 du mois courant = dernier jour du mois précédent.
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIsoDate(first), to: toIsoDate(last) };
    }
    case "all":
    case "custom":
      return { from: "", to: "" };
  }
}

/** Preset correspondant à des bornes données (pour retrouver la chip active). */
export function matchSalesPeriodPreset(
  range: SalesDateRange,
  now: Date = new Date(),
): SalesPeriodPreset {
  if (!range.from && !range.to) return "all";
  for (const p of SALES_PERIOD_PRESETS) {
    const r = salesPeriodRange(p.id, now);
    if (r.from === range.from && r.to === range.to) return p.id;
  }
  return "custom";
}

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return format(d, "d MMM yyyy", { locale: fr });
}

/** Libellé lisible d'une période, ex. « le 12 juil. 2026 », « du 1 au 12 juil. 2026 ». */
export function salesRangeLabel(range: SalesDateRange): string {
  const { from, to } = range;
  if (!from && !to) return "tout l'historique";
  if (from && to && from === to) return `le ${formatDay(from)}`;
  if (from && to) return `du ${formatDay(from)} au ${formatDay(to)}`;
  if (from) return `depuis le ${formatDay(from)}`;
  return `jusqu'au ${formatDay(to)}`;
}

// ───────────────────────── Synthèse ─────────────────────────

export type SalesSummary = {
  /** Ventes complétées (seules comptées dans les montants). */
  count: number;
  /** Somme des totaux facturés des ventes complétées. */
  billed: number;
  /** Remises accordées sur ces ventes. */
  discount: number;
  /** Panier moyen = `billed / count`. */
  average: number;
  cancelledCount: number;
  draftCount: number;
  refundedCount: number;
  /** Nombre de vendeurs distincts ayant une vente complétée. */
  sellerCount: number;
};

export function summarizeSales(sales: SaleItem[]): SalesSummary {
  let count = 0;
  let billed = 0;
  let discount = 0;
  let cancelledCount = 0;
  let draftCount = 0;
  let refundedCount = 0;
  const sellers = new Set<string>();

  for (const s of sales) {
    if (s.status === "cancelled") cancelledCount += 1;
    else if (s.status === "draft") draftCount += 1;
    else if (s.status === "refunded") refundedCount += 1;
    if (!isCounted(s)) continue;
    count += 1;
    billed += Number(s.total ?? 0);
    discount += Number(s.discount ?? 0);
    if (s.created_by) sellers.add(s.created_by);
  }

  return {
    count,
    billed,
    discount,
    average: count > 0 ? billed / count : 0,
    cancelledCount,
    draftCount,
    refundedCount,
    sellerCount: sellers.size,
  };
}

// ───────────────────── Détail par vendeur ─────────────────────

export type SalesSellerStat = {
  userId: string;
  label: string;
  /** Ventes complétées. */
  count: number;
  billed: number;
  discount: number;
  average: number;
  cancelledCount: number;
  /** Part du total facturé de la période, en %. */
  sharePercent: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  /** Boutiques où ce vendeur a encaissé sur la période. */
  storeNames: string[];
  /** Jours **avec activité**, ordre chronologique. */
  byDay: Array<{ date: string; count: number; billed: number }>;
  /** Ventes par heure locale (0–23), toujours 24 entrées. */
  byHour: Array<{ hour: number; count: number; billed: number }>;
};

type SellerAccumulator = Omit<
  SalesSellerStat,
  "average" | "sharePercent" | "byDay" | "byHour" | "storeNames"
> & {
  days: Map<string, { count: number; billed: number }>;
  hours: number[];
  hourBilled: number[];
  stores: Set<string>;
};

/**
 * Regroupe les ventes par vendeur (`created_by`), triées par total facturé
 * décroissant. Les ventes annulées sont comptées à part, jamais dans les montants.
 */
export function groupSalesBySeller(
  sales: SaleItem[],
  stores: Array<{ id: string; name: string }> = [],
): SalesSellerStat[] {
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const acc = new Map<string, SellerAccumulator>();

  for (const s of sales) {
    const userId = s.created_by;
    if (!userId) continue;
    let a = acc.get(userId);
    if (!a) {
      a = {
        userId,
        label: saleSellerLabel(s),
        count: 0,
        billed: 0,
        discount: 0,
        cancelledCount: 0,
        firstSaleAt: null,
        lastSaleAt: null,
        days: new Map(),
        hours: Array(24).fill(0),
        hourBilled: Array(24).fill(0),
        stores: new Set(),
      };
      acc.set(userId, a);
    }
    // Libellé : garder le premier non vide rencontré (« — » sinon).
    if (a.label === "—") a.label = saleSellerLabel(s);
    if (s.status === "cancelled") {
      a.cancelledCount += 1;
      continue;
    }
    if (!isCounted(s)) continue;

    const total = Number(s.total ?? 0);
    a.count += 1;
    a.billed += total;
    a.discount += Number(s.discount ?? 0);

    const name = s.store?.name?.trim() || storeName.get(s.store_id);
    if (name) a.stores.add(name);

    if (s.created_at) {
      if (!a.firstSaleAt || s.created_at < a.firstSaleAt) a.firstSaleAt = s.created_at;
      if (!a.lastSaleAt || s.created_at > a.lastSaleAt) a.lastSaleAt = s.created_at;
      const day = localDateFromIso(s.created_at);
      const cur = a.days.get(day) ?? { count: 0, billed: 0 };
      a.days.set(day, { count: cur.count + 1, billed: cur.billed + total });
      const d = new Date(s.created_at);
      if (!Number.isNaN(d.getTime())) {
        const h = d.getHours();
        a.hours[h] += 1;
        a.hourBilled[h] += total;
      }
    }
  }

  const totalBilled = [...acc.values()].reduce((sum, a) => sum + a.billed, 0);

  return [...acc.values()]
    .map((a) => ({
      userId: a.userId,
      label: a.label,
      count: a.count,
      billed: a.billed,
      discount: a.discount,
      average: a.count > 0 ? a.billed / a.count : 0,
      cancelledCount: a.cancelledCount,
      sharePercent: totalBilled > 0 ? (a.billed / totalBilled) * 100 : 0,
      firstSaleAt: a.firstSaleAt,
      lastSaleAt: a.lastSaleAt,
      storeNames: [...a.stores].sort((x, y) => x.localeCompare(y, "fr")),
      byDay: [...a.days.entries()]
        .sort((x, y) => x[0].localeCompare(y[0]))
        .map(([date, v]) => ({ date, count: v.count, billed: v.billed })),
      byHour: a.hours.map((count, hour) => ({
        hour,
        count,
        billed: a.hourBilled[hour],
      })),
    }))
    .sort((x, y) => y.billed - x.billed || y.count - x.count);
}

// ───────────────────────── Recherche ─────────────────────────

/** Recherche libre : n° de vente, client (nom/téléphone), vendeur, n° d'ordonnance. */
export function saleMatchesSearch(s: SaleItem, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    s.sale_number,
    s.customer?.name,
    s.customer?.phone,
    s.created_by_label,
    s.prescription_number,
  ];
  return haystack.some((v) => v?.toLowerCase().includes(q));
}
