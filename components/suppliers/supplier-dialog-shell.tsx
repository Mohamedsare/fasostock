"use client";

import { MdClose } from "react-icons/md";
import { cn } from "@/lib/utils/cn";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import type { ReactNode } from "react";

/**
 * Enveloppe commune des dialogues de l'espace Fournisseurs : feuille glissante
 * en bas sur mobile (le pouce atteint les actions), boîte centrée sur desktop.
 */
export function SupplierDialogShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  maxWidth = "max-w-lg",
  busy = false,
  zIndex = "z-[80]",
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  busy?: boolean;
  zIndex?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] min-[560px]:items-center min-[560px]:p-4",
        zIndex,
      )}
      role="presentation"
      onClick={() => (busy ? null : onClose())}
    >
      <div
        className={cn(
          "flex max-h-[93vh] w-full flex-col rounded-t-2xl bg-fs-card shadow-2xl min-[560px]:rounded-2xl",
          maxWidth,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-neutral-300/80 min-[560px]:hidden"
          aria-hidden
        />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-fs-text">
              {icon}
              <span className="truncate">{title}</span>
            </h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-neutral-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-2 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5 text-fs-text" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>

        {footer ? (
          <div
            className={cn(
              "shrink-0 border-t border-black/[0.07] bg-fs-card/95 p-4 backdrop-blur-sm dark:border-white/10",
              "pb-[calc(1rem+var(--fs-safe-bottom))] min-[560px]:pb-4",
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SupplierField({
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
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold text-neutral-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-neutral-400">{hint}</span> : null}
    </label>
  );
}

export function SupplierSubmitButton({
  label,
  onClick,
  disabled,
  busy,
  tone = "accent",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "accent" | "danger" | "emerald";
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.99] disabled:opacity-50",
        tone === "danger" ? "bg-red-600" : tone === "emerald" ? "bg-emerald-600" : "bg-fs-accent",
      )}
    >
      {busy ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : null}
      {label}
    </button>
  );
}

/** Bandeau d'erreur des dialogues (message serveur brut, sans jargon ajouté). */
export function SupplierDialogError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200/80 bg-red-50/90 p-3 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-xs font-medium leading-snug text-red-800 dark:text-red-200">{message}</p>
    </div>
  );
}

export const supplierInputClass = fsInputClass("min-h-11 sm:min-h-0");
