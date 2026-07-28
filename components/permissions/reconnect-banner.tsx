"use client";

import { MdCloudOff, MdRefresh } from "react-icons/md";

/**
 * Bandeau discret de reconnexion : **ne démonte jamais l'écran**.
 * Utilisé quand le contexte utilisateur n'a pas pu être rafraîchi alors qu'une version
 * exploitable est encore en cache — une vente en cours, un formulaire à moitié rempli
 * ou un panier ne doivent pas être perdus pour une coupure réseau de quelques secondes.
 */
export function ReconnectBanner({
  onRetry,
  busy,
}: {
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 max-[1023px]:bottom-[calc(4.75rem+max(0.75rem,var(--fs-safe-bottom)))]"
    >
      <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-amber-200 bg-amber-50 py-2 pl-4 pr-2 shadow-lg">
        <MdCloudOff className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <span className="truncate text-sm font-medium text-amber-900">
          Connexion instable — reconnexion…
        </span>
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-amber-700 px-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          <MdRefresh
            className={`h-4 w-4 shrink-0 ${busy ? "animate-spin" : ""}`}
            aria-hidden
          />
          Réessayer
        </button>
      </div>
    </div>
  );
}
