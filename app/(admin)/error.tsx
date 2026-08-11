"use client";

import { captureWebAppError } from "@/lib/monitoring/remote-error-logger";
import { ROUTES } from "@/lib/config/routes";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Frontière d'erreur de l'espace super-admin — même rôle que celle des écrans métier
 * (`app/(app)/error.tsx`) : contenir la panne à l'écran fautif au lieu de vider la
 * coquille d'administration.
 */
export default function AdminSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureWebAppError(error, {
      source: "next-admin-section-error",
      stack: error.stack,
      extra: error.digest ? { digest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-fs-text">Cet écran n’a pas pu s’afficher</h1>
      <p className="text-sm text-neutral-600">
        Le reste de l’espace d’administration fonctionne normalement.
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
          href={ROUTES.admin}
          className="rounded-xl border border-black/12 px-5 py-2.5 text-sm font-semibold text-fs-text"
        >
          Accueil admin
        </Link>
      </div>
    </div>
  );
}
