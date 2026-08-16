"use client";

import {
  SALE_DOCUMENT_STATUS_LABELS,
  type SaleDocumentStatus,
} from "@/lib/features/sale-documents/types";
import { cn } from "@/lib/utils/cn";

/**
 * Couleurs choisies sur le SENS pour le commerçant, pas sur l'ordre du cycle :
 * vert = c'est gagné, rouge = c'est perdu, ambre = ça dort, neutre = ça se prépare.
 * Un patron qui balaie sa liste doit repérer les devis morts sans lire les mots.
 */
function pillClass(status: SaleDocumentStatus): string {
  switch (status) {
    case "draft":
      return "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300";
    case "sent":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "accepted":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "issued":
      return "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300";
    case "converted":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
    case "expired":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "refused":
    case "cancelled":
    default:
      return "bg-red-500/15 text-red-700 dark:text-red-300";
  }
}

export function SaleDocumentStatusPill({
  status,
  className,
}: {
  status: SaleDocumentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        pillClass(status),
        className,
      )}
    >
      {SALE_DOCUMENT_STATUS_LABELS[status]}
    </span>
  );
}
