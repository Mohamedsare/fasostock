import { EngineRegistrationScreen } from "@/components/engine-registration/engine-registration-screen";
import { Suspense } from "react";

export default function EngineRegistrationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      }
    >
      <EngineRegistrationScreen />
    </Suspense>
  );
}
