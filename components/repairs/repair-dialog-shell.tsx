"use client";

import { MdClose } from "react-icons/md";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

/**
 * Enveloppe des dialogues du module Réparations : feuille glissante en bas sur
 * mobile (le mécanicien est debout, téléphone en main), boîte centrée sur grand
 * écran. Même géométrie que les autres modules de l'application.
 */
export function RepairDialogShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = "max-w-2xl",
  busy = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  busy?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 min-[560px]:items-center min-[560px]:p-4"
      role="presentation"
      onClick={() => (busy ? null : onClose())}
    >
      <div
        className={cn(
          "flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-fs-card shadow-2xl min-[560px]:rounded-2xl",
          maxWidth,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fs-text">{title}</h2>
            {subtitle ? (
              <p className="truncate text-xs text-neutral-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-2 hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5 text-fs-text" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-black/[0.07] p-4 dark:border-white/10">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Champ libellé — homogénéise tous les dialogues du module. */
export function RepairField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-xs font-semibold text-neutral-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-neutral-400">{hint}</span> : null}
    </label>
  );
}
