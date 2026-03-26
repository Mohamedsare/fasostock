"use client";

import { captureWebAppError } from "@/lib/monitoring/remote-error-logger";
import { ROUTES } from "@/lib/config/routes";
import Link from "next/link";
import { useEffect } from "react";

export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureWebAppError(error, {
      source: "next-app-error",
      stack: error.stack,
      extra: error.digest ? { digest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-fs-text">Une erreur s’est produite</h1>
      <p className="text-sm text-neutral-600">
        L’écran n’a pas pu être affiché correctement. Vous pouvez réessayer ou revenir au tableau de bord.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white"
        >
          Réessayer
        </button>
        <Link
          href={ROUTES.dashboard}
          className="rounded-xl border border-black/12 px-5 py-2.5 text-sm font-semibold text-fs-text"
        >
          Tableau de bord
        </Link>
      </div>
    </div>
  );
}
