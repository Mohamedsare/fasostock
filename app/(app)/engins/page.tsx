import { EnginesScreen } from "@/components/engine-sales/engines-screen";
import { Suspense } from "react";

export default function EnginesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      }
    >
      <EnginesScreen />
    </Suspense>
  );
}
