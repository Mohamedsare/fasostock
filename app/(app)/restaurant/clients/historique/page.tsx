import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/config/routes";

export default function RestaurantCustomerHistoryPage() {
  redirect(ROUTES.customers);
}
