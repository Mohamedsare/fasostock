"use client";

import { useMemo, useState } from "react";
import { MdCheck, MdSearch, MdPlace, MdLayersClear } from "react-icons/md";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import type { LocationTreeNode } from "@/lib/features/product-locations/tree";
import { flattenLocationTree } from "@/lib/features/product-locations/tree";
import { levelLabel } from "@/lib/features/product-locations/templates";
import type { LocationLevel } from "@/lib/features/product-locations/types";
import { cn } from "@/lib/utils/cn";

/**
 * Choix d'un emplacement dans l'arbre. On peut ranger à n'importe quel niveau
 * (« le carton est dans le rayon, pas encore sur une étagère précise ») : imposer
 * la feuille obligerait à inventer des sous-emplacements fictifs.
 */
export function LocationPickerDialog({
  open,
  title,
  subtitle,
  roots,
  levels,
  selectedId,
  allowClear,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  roots: LocationTreeNode[];
  levels: LocationLevel[];
  selectedId: string | null;
  /** Affiche « Retirer l'emplacement » (produit déjà rangé). */
  allowClear: boolean;
  busy: boolean;
  onClose: () => void;
  onPick: (locationId: string | null) => void;
}) {
  const [query, setQuery] = useState("");

  const flat = useMemo(() => flattenLocationTree(roots), [roots]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (q === "") return flat;
    return flat.filter(
      (n) =>
        n.pathLabel.toLowerCase().includes(q) ||
        (n.code ?? "").toLowerCase().includes(q),
    );
  }, [flat, q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <FsCard
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-b-none shadow-xl sm:rounded-xl"
        padding="p-4 sm:p-5"
      >
        <div className="flex items-center gap-2.5">
          <MdPlace className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-fs-text">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-neutral-600">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="relative mt-3">
          <MdSearch
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            className={fsInputClass("pl-10")}
            placeholder="Filtrer les emplacements…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              Aucun emplacement ne correspond.
            </p>
          ) : (
            <ul className="space-y-1">
              {visible.map((n) => {
                const on = n.id === selectedId;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPick(n.id)}
                      style={q === "" ? { paddingLeft: `${0.75 + n.depth * 1}rem` } : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                        on
                          ? "border-fs-accent bg-fs-accent/10"
                          : "border-black/[0.06] bg-fs-card hover:bg-black/[0.03]",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-fs-text">
                            {n.name}
                          </span>
                          {n.code ? (
                            <span className="shrink-0 rounded bg-fs-surface-container px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">
                              {n.code}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                          {levelLabel(levels, n.depth)}
                          {q !== "" ? ` · ${n.pathLabel}` : ""}
                        </span>
                      </span>
                      {on ? (
                        <MdCheck className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-black/[0.06] pt-3 sm:flex-row sm:justify-between">
          {allowClear ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(null)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/[0.08] px-4 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-60"
            >
              <MdLayersClear className="h-4 w-4" aria-hidden />
              Retirer l&apos;emplacement
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-black/[0.04] disabled:opacity-60"
          >
            Fermer
          </button>
        </div>
      </FsCard>
    </div>
  );
}
