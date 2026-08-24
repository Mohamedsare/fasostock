"use client";

import { FsCard } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

/**
 * Modale de confirmation générique (remplace `window.confirm`).
 * Fermeture par clic sur le fond, action explicite. Ton « danger » pour les
 * actions destructrices (suppression, annulation).
 */
export function FsConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  tone = "default",
  busy = false,
  overlayClassName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  /** Ex. `z-[96]` quand la confirmation s'ouvre par-dessus un panneau ou un autre modal. */
  overlayClassName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-black/45 p-4",
        overlayClassName ?? "z-[70]",
      )}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <FsCard className="w-full max-w-md shadow-xl" padding="p-4 sm:p-5">
        <h2 className="text-base font-bold text-fs-text">{title}</h2>
        {message ? (
          <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-600">{message}</div>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60",
              tone === "danger" ? "bg-red-600" : "bg-fs-accent",
            )}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </FsCard>
    </div>
  );
}
