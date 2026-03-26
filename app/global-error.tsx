"use client";

import { captureWebAppError } from "@/lib/monitoring/remote-error-logger";
import { useEffect } from "react";
import "./globals.css";

/**
 * Erreur au niveau racine (layout). Remplace temporairement toute l’UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureWebAppError(error, {
      source: "next-global-error",
      stack: error.stack,
      extra: error.digest ? { digest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <html lang="fr">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center text-neutral-900 antialiased">
        <h1 className="text-lg font-semibold">Erreur critique</h1>
        <p className="max-w-md text-sm text-neutral-600">
          Impossible de charger l’application. Rechargez la page ou réessayez dans un instant.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
