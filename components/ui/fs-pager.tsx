"use client";

/**
 * Pagination « page précédente / page suivante », telle que l'historique des mouvements
 * de stock l'a établie dans l'application.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX FLÈCHES, ET PAS UN DÉFILEMENT INFINI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défilement infini est confortable sur un fil d'actualité, où l'on ne cherche rien.
 * Ici on cherche : « le bon d'Ali, la semaine dernière ». Deux flèches et un numéro de
 * page donnent une position — on sait où l'on est, on peut revenir. Un défilement qui
 * recharge tout seul fait perdre cette position au premier changement d'onglet, et sur
 * une connexion lente il donne surtout l'impression que la liste est finie alors qu'elle
 * charge encore.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE `hasMore` VEUT DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il vient d'une ligne lue en trop côté serveur, jamais d'un `count` exact : compter
 * toute la table à chaque page coûterait plus que la page elle-même. Conséquence
 * assumée : on ne peut pas afficher « page 3 sur 12 ». On affiche la plage réellement
 * montrée (« Bons 21 – 40 »), ce que l'utilisateur peut vérifier de ses yeux.
 */

import { MdChevronLeft, MdChevronRight } from "react-icons/md";

import { FsCard } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";

export function FsPager({
  page,
  hasMore,
  pageSize,
  rowsOnPage,
  busy,
  onPageChange,
  /** Nom de ce qu'on pagine, au pluriel — « Bons », « Expéditions », « Mouvements ». */
  itemLabel,
  className,
}: {
  page: number;
  hasMore: boolean;
  pageSize: number;
  rowsOnPage: number;
  busy: boolean;
  onPageChange: (p: number) => void;
  itemLabel: string;
  className?: string;
}) {
  // Une seule page qui tient entièrement : la pagination n'apprendrait rien.
  if (page === 0 && !hasMore) return null;

  const start = page * pageSize + 1;
  const end = page * pageSize + rowsOnPage;
  const range = rowsOnPage > 0 ? `${itemLabel} ${start} – ${end}` : "Aucune ligne";

  return (
    <FsCard padding="p-3" className={cn("mt-3 rounded-[10px] sm:rounded-[10px]", className)}>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        <span className="hidden text-xs text-neutral-600 sm:mr-2 sm:inline">{range}</span>
        <button
          type="button"
          disabled={page <= 0 || busy}
          onClick={() => onPageChange(page - 1)}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40",
            page > 0 ? "bg-fs-accent" : "bg-neutral-200 text-neutral-500",
          )}
          aria-label={`${itemLabel} plus récents`}
        >
          <MdChevronLeft className="h-7 w-7" aria-hidden />
        </button>
        <span className="text-sm font-semibold text-fs-text">Page {page + 1}</span>
        <button
          type="button"
          disabled={!hasMore || busy}
          onClick={() => onPageChange(page + 1)}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40",
            hasMore ? "bg-fs-accent" : "bg-neutral-200 text-neutral-500",
          )}
          aria-label={`${itemLabel} plus anciens`}
        >
          <MdChevronRight className="h-7 w-7" aria-hidden />
        </button>
        <span className="w-full text-center text-xs text-neutral-600 sm:hidden">{range}</span>
      </div>
    </FsCard>
  );
}
