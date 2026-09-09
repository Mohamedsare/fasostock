import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

export default function RestaurantExpenseCategoriesPage() {
  redirect(ROUTES.expenses);
}
