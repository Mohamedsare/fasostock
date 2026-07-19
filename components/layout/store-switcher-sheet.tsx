"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type StoreLite = { id: string; name: string; isPrimary?: boolean };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Feuille de sélection de boutique (mobile). Bottom-sheet plein largeur avec
 * poignée, liste des boutiques (avatar à initiale, badge principale, coche active).
 */
export function StoreSwitcherSheet({
  stores,
  activeStoreId,
  onSelect,
  onClose,
}: {
  stores: StoreLite[];
  activeStoreId: string | null;
  onSelect: (storeId: string) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Changer de boutique"
    >
      {/* Fond */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px] animate-[fs-sheet-fade_140ms_ease-out]"
      />

      {/* Fenêtre centrée */}
      <div className="relative z-10 flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-black/[0.06] bg-fs-card shadow-[0_20px_60px_rgba(0,0,0,0.28)] animate-[fs-pop-in_180ms_cubic-bezier(0.22,1,0.36,1)] dark:border-white/10">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fs-text">Changer de boutique</h2>
            <p className="text-xs text-neutral-500">
              {stores.length} boutique{stores.length > 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/8 text-neutral-600 active:scale-95 dark:border-white/10 dark:text-neutral-300"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto px-3 pb-3">
          {stores.map((s) => {
            const active = s.id === activeStoreId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
                  active
                    ? "bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)]"
                    : "active:bg-black/[0.04] dark:active:bg-white/5",
                )}
                aria-current={active ? "true" : undefined}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
                    active
                      ? "bg-[var(--fs-accent)] text-white"
                      : "bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-[var(--fs-accent)]",
                  )}
                  aria-hidden
                >
                  {initials(s.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[15px] font-semibold",
                      active ? "text-[var(--fs-accent)]" : "text-fs-text",
                    )}
                  >
                    {s.name}
                  </span>
                  {s.isPrimary ? (
                    <span className="text-xs text-neutral-500">Boutique principale</span>
                  ) : null}
                </span>
                {active ? (
                  <Check className="h-5 w-5 shrink-0 text-[var(--fs-accent)]" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
