"use client";

import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/lib/config/navigation";
import Link from "next/link";
import { useEffect } from "react";

type MoreSheetProps = {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
};

export function MoreSheet({ open, onClose, items }: MoreSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[3px] dark:bg-black/55"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 max-h-[85dvh] w-full overflow-hidden rounded-t-[22px] border-t border-black/[0.07] bg-fs-card text-fs-text shadow-[0_-8px_40px_rgba(0,0,0,0.12)] dark:border-white/[0.08] dark:shadow-[0_-12px_48px_rgba(0,0,0,0.45)]",
          "sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-black/[0.06] sm:shadow-2xl dark:sm:border-white/[0.1]",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-sheet-title"
      >
        <div className="flex justify-center bg-gradient-to-b from-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)] to-transparent px-4 pt-3 dark:from-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)]">
          <div
            className="h-1 w-10 rounded-full bg-[color-mix(in_srgb,var(--fs-accent)_55%,var(--fs-on-surface-variant))]"
            aria-hidden
          />
        </div>
        <h2 id="more-sheet-title" className="sr-only">
          Autres sections
        </h2>
        <div className="max-h-[min(70dvh,520px)] overflow-y-auto px-3 pb-[max(12px,var(--fs-safe-bottom))] pt-3 sm:px-4 sm:pb-4 sm:pt-4">
          <ul className="grid grid-cols-3 gap-1 sm:gap-2.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-xl border border-black/[0.07] bg-fs-surface-container px-0.5 py-1.5 text-center text-[10px] font-semibold leading-tight tracking-tight text-fs-text sm:rounded-2xl",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-[transform,background-color,border-color,box-shadow] duration-200",
                      "hover:border-[color-mix(in_srgb,var(--fs-accent)_38%,transparent)] hover:bg-[color-mix(in_srgb,var(--fs-accent)_11%,transparent)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
                      "active:scale-[0.98] dark:border-white/[0.09] dark:bg-fs-surface-low dark:shadow-none",
                      "dark:hover:border-[color-mix(in_srgb,var(--fs-accent)_45%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)]",
                      "sm:min-h-[88px] sm:gap-2 sm:px-2.5 sm:py-4 sm:text-sm",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)]",
                        "sm:h-11 sm:w-11 sm:rounded-xl",
                      )}
                      aria-hidden
                    >
                      <Icon
                        className="h-4 w-4 text-fs-accent sm:h-6 sm:w-6"
                        strokeWidth={2}
                      />
                    </span>
                    <span className="line-clamp-2 text-fs-text">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
