"use client";

import { AlertTriangle, RefreshCw, UploadCloud, WifiOff } from "lucide-react";
import { useState } from "react";

import { retryStuckOutbox } from "@/lib/db/dexie-db";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { useOutboxCounts } from "@/lib/hooks/use-outbox-counts";

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}

/**
 * Bandeau d'état de la file d'attente locale.
 *
 * Trois situations, par ordre d'urgence :
 *
 * 1. **Bloqué** — les réessais sont épuisés : ces ventes ne partiront plus toutes seules.
 *    C'est de l'argent encaissé qui manque en base, donc le seul cas qui réclame une
 *    action. Le bouton relance la file (utile une fois la cause levée, ex. migration 00177).
 * 2. **Hors ligne** — le navigateur se sait déconnecté.
 * 3. **En attente alors qu'on se croit en ligne** — cas devenu courant depuis que la
 *    caisse bascule en file sur *échec réseau* et plus seulement sur `navigator.onLine`
 *    (réseau à 2 barres qui ne laisse rien passer). Sans cette ligne, le vendeur n'aurait
 *    aucun signe que sa vente n'est pas encore partie.
 */
export function OfflineStrip() {
  const online = useOnlineStatus();
  const { pending, stuck, stuckSales } = useOutboxCounts();
  const [retrying, setRetrying] = useState(false);

  if (stuck > 0) {
    const label =
      stuckSales > 0
        ? `${stuckSales} ${plural(stuckSales, "vente n'a", "ventes n'ont")} pas pu être ${plural(stuckSales, "enregistrée", "enregistrées")}`
        : `${stuck} ${plural(stuck, "opération n'a", "opérations n'ont")} pas pu être ${plural(stuck, "envoyée", "envoyées")}`;
    return (
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-600 px-3 py-2 text-center text-xs font-medium text-white sm:text-sm"
        role="alert"
      >
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {label} — rien n&apos;est perdu, mais il faut relancer.
        </span>
        <button
          type="button"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void retryStuckOutbox().finally(() => setRetrying(false));
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1 font-semibold hover:bg-white/30 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} aria-hidden />
          {retrying ? "Envoi…" : "Réessayer"}
        </button>
      </div>
    );
  }

  if (!online) {
    return (
      <div
        className="flex items-center justify-center gap-2 bg-neutral-800 px-3 py-2 text-center text-xs font-medium text-white sm:text-sm"
        role="status"
      >
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        {pending > 0
          ? `Hors ligne — ${pending} ${plural(pending, "opération enregistrée", "opérations enregistrées")} sur cet appareil, ${plural(pending, "elle partira", "elles partiront")} à la reconnexion.`
          : "Hors ligne — vos actions sont mises en file et envoyées à la reconnexion."}
      </div>
    );
  }

  if (pending > 0) {
    return (
      <div
        className="flex items-center justify-center gap-2 bg-neutral-700 px-3 py-1.5 text-center text-xs font-medium text-white"
        role="status"
      >
        <UploadCloud className="h-4 w-4 shrink-0" aria-hidden />
        {`${pending} ${plural(pending, "opération en attente d'envoi", "opérations en attente d'envoi")}…`}
      </div>
    );
  }

  return null;
}
