import { format } from "date-fns";

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
