import { redirect } from "next/navigation";

/** Le coût du gaspillage se lit sur sa propre page, avec le détail ligne à ligne. */
export default function RestaurantWasteReportPage() {
  redirect("/restaurant/stock/pertes");
}
