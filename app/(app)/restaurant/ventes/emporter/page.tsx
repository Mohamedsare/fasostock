import { SalesScreen } from "@/components/sales/sales-screen";
import { Suspense } from "react";

export default function RestaurantTakeawayOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      }
    >
      <SalesScreen preset="takeaway" />
    </Suspense>
  );
}
