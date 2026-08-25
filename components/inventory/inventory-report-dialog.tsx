"use client";

import { FsCard } from "@/components/ui/fs-screen-primitives";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { MdCheckCircle, MdDownload, MdPrint } from "react-icons/md";

/**
 * Fin d'inventaire : le résultat, puis le papier.
 *
 * Elle s'ouvre juste après la validation, au moment précis où l'on veut la trace —
 * le rapport est ce qu'on classe, ce qu'on fait signer, et ce qu'on ressort le jour
 * où quelqu'un conteste une correction de stock. Proposé ici plutôt que caché dans
 * l'historique : une pièce qu'il faut aller chercher n'est jamais éditée.
 */
export function InventoryReportDialog({
  open,
  title = "Inventaire terminé",
  subtitle,
  counted,
  total,
  varianceCount,
  varianceValue,
  busy,
  onPrint,
  onDownload,
  onClose,
}: {
  open: boolean;
  title?: string;
  subtitle: string;
  counted: number;
  total: number;
  varianceCount: number;
  varianceValue: number;
  busy: "print" | "download" | null;
  onPrint: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const tone = varianceValue < 0 ? "text-red-600" : varianceValue > 0 ? "text-emerald-700" : "text-neutral-500";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <FsCard className="w-full max-w-md shadow-xl" padding="p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600">
            <MdCheckCircle className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fs-text">{title}</h2>
            <p className="mt-0.5 text-sm text-neutral-600">{subtitle}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Comptés" value={`${counted}/${total}`} />
          <Stat label="Écarts" value={String(varianceCount)} />
          <Stat
            label="Impact"
            value={`${varianceValue > 0 ? "+" : ""}${formatCurrency(varianceValue)}`}
            className={tone}
          />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-neutral-500">
          Le rapport A4 reprend le résumé, les écarts classés par valeur et le détail du
          comptage, avec les cases de signature.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onPrint}
            disabled={busy != null}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fs-accent px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            <MdPrint className="h-5 w-5" aria-hidden />
            {busy === "print" ? "Préparation…" : "Imprimer"}
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={busy != null}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-fs-accent/40 bg-fs-card px-4 text-sm font-bold text-fs-accent disabled:opacity-60"
          >
            <MdDownload className="h-5 w-5" aria-hidden />
            {busy === "download" ? "Préparation…" : "Télécharger"}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={busy != null}
          className="mt-2 min-h-11 w-full rounded-xl border border-black/[0.08] bg-fs-card text-sm font-semibold text-neutral-700 disabled:opacity-60"
        >
          Terminer
        </button>
      </FsCard>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-black/[0.06] bg-fs-surface-container/60 px-3 py-2">
      <p className="text-[11px] font-medium leading-tight text-neutral-500">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-bold text-fs-text", className)}>{value}</p>
    </div>
  );
}
