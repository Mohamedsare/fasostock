"use client";

import { captureWebAppError } from "@/lib/monitoring/remote-error-logger";
import { ROUTES } from "@/lib/config/routes";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Frontière d'erreur des écrans métier.
 *
 * Sans elle, une erreur de rendu dans un seul écran remontait jusqu'à `app/error.tsx`,
 * qui remplace **tout** ce qui est sous le layout racine : le commerçant perdait la
 * barre de navigation et se retrouvait devant une page nue, sans moyen évident de
 * revenir à son travail.
 *
 * Placée ici, elle ne remplace que le contenu de l'écran fautif : la coquille de
 * l'application (menu, sélecteur de boutique, notifications) reste en place, et un
 * clic suffit pour aller ailleurs. Le rayon de souffle passe de « l'application » à
 * « la page ».
 */
export default function AppSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureWebAppError(error, {
      source: "next-app-section-error",
      stack: error.stack,
      extra: error.digest ? { digest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-fs-text">Cet écran n’a pas pu s’afficher</h1>
      <p className="text-sm text-neutral-600">
        Le reste de l’application fonctionne normalement. Vous pouvez réessayer, ou passer à un autre
        écran par le menu.
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
