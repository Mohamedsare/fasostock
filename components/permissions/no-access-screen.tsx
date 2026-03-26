"use client";

import { Lock } from "lucide-react";

export function NoAccessScreen() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Lock className="h-16 w-16 text-red-600" aria-hidden />
      <p className="max-w-sm text-lg text-fs-text">
        Vous n&apos;avez pas accès à cette page.
      </p>
    </div>
  );
}
