import { format } from "date-fns";

export type DashboardPeriod = "today" | "week" | "month" | "custom";

/** Plage courante : période prédéfinie ou dates personnalisées (inclusives). */
export function resolveDashboardRange(params: {
  period: DashboardPeriod;
  customFrom?: string | null;
  customTo?: string | null;
}): { from: string; to: string } {
  if (
    params.period === "custom" &&
    params.customFrom &&
    params.customTo &&
    params.customFrom <= params.customTo
  ) {
    return { from: params.customFrom, to: params.customTo };
  }
  if (params.period === "custom") {
    return getDefaultDateRange("week");
  }
  return getDefaultDateRange(params.period);
}

/**
 * Période précédente de même durée (pour « vs période précédente »).
 * Pour `today`, compare à la veille.
 */
export function getPreviousComparableRange(current: {
  from: string;
  to: string;
}): { from: string; to: string } {
  const from = new Date(`${current.from}T12:00:00`);
  const to = new Date(`${current.to}T12:00:00`);
  const msDay = 86400000;
  const days =
    Math.max(
      1,
      Math.round((to.getTime() - from.getTime()) / msDay) + 1,
    );
  const prevEnd = new Date(from);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));
  return {
    from: format(prevStart, "yyyy-MM-dd"),
    to: format(prevEnd, "yyyy-MM-dd"),
  };
}

/** Aligné sur `getDefaultDateRange` dans `reports_repository.dart` (Flutter). */
export function getDefaultDateRange(
  period: "today" | "week" | "month",
): { from: string; to: string } {
  const now = new Date();
  if (period === "today") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }
  if (period === "week") {
    const weekday = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (weekday - 1));
    monday.setHours(0, 0, 0, 0);
    const to = new Date(monday);
    to.setDate(monday.getDate() + 7);
    to.setMilliseconds(to.getMilliseconds() - 1);
    return { from: format(monday, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
}
