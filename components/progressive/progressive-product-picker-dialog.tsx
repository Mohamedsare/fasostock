"use client";

import { useEffect, useMemo, useState } from "react";
import { MdCheck, MdChecklist, MdClose, MdSearch } from "react-icons/md";
import {
  ProductListThumbnail,
  firstProductImageUrl,
} from "@/components/products/product-list-thumbnail";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import type { ProgressiveTerms } from "@/lib/features/progressive/progressive-terms";
import type { ProductItem } from "@/lib/features/products/types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

/**
 * Choix **multiple** des articles d'un dossier d'achat progressif.
 *
 * Le client annonce rarement un seul article : « je veux le salon, la télé et le
 * frigo ». On coche donc tout ce qu'il veut en une fois, puis les quantités et
 * les prix se règlent ligne par ligne dans le formulaire.
 *
 * Les articles déjà retenus arrivent cochés : décocher ici retire la ligne du
 * dossier, pour n'avoir qu'un seul endroit où composer la sélection.
 */
export function ProgressiveProductPickerDialog({
  open,
  onClose,
  products,
  stockByProductId,
  selectedIds,
  terms,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** Catalogue vendable de la boutique (actif, prix > 0). */
  products: ProductItem[];
  stockByProductId?: Map<string, number>;
  /** Articles déjà présents dans la sélection du dossier. */
  selectedIds: string[];
  terms: ProgressiveTerms;
  /** Nouvelle liste complète des articles retenus. */
  onConfirm: (productIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());

  // À chaque ouverture : on repart de la sélection réelle du dossier. On ne
  // resynchronise pas ensuite, sinon les coches en cours seraient écrasées.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setChecked(new Set(selectedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const checkedTotal = useMemo(
    () =>
      products.reduce(
        (acc, p) => (checked.has(p.id) ? acc + Number(p.sale_price ?? 0) : acc),
        0,
      ),
    [products, checked],
  );

  if (!open) return null;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function checkAllFiltered() {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const p of filtered) next.add(p.id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 min-[560px]:items-center min-[560px]:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-2xl bg-fs-card shadow-2xl min-[560px]:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Choisir les ${terms.plural}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-fs-text">
              <MdChecklist className="h-5 w-5 text-fs-accent" aria-hidden />
              Choisir les {terms.plural}
            </h2>
            <p className="truncate text-xs text-neutral-500">
              Cochez tout ce que le client veut — les quantités se règlent ensuite.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5 text-fs-text" />
          </button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="relative">
            <MdSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              className={fsInputClass("pl-9")}
              placeholder="Rechercher un article, une référence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-neutral-600">
              {checked.size} coché{checked.size > 1 ? "s" : ""}
              {checked.size > 0 && checkedTotal > 0
                ? ` · ${formatCurrency(checkedTotal)}`
                : ""}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={checkAllFiltered}
                disabled={filtered.length === 0}
                className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-bold text-neutral-600 disabled:opacity-40 dark:border-white/10 dark:text-neutral-300"
              >
                Tout cocher{search.trim() ? " (résultats)" : ""}
              </button>
              <button
                type="button"
                onClick={() => setChecked(new Set())}
                disabled={checked.size === 0}
                className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-bold text-neutral-600 disabled:opacity-40 dark:border-white/10 dark:text-neutral-300"
              >
                Tout décocher
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-neutral-500">
              Aucun article ne correspond à cette recherche.
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((p) => {
                const isChecked = checked.has(p.id);
                const stock = stockByProductId?.get(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      aria-pressed={isChecked}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors",
                        isChecked
                          ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)]"
                          : "border-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                          isChecked
                            ? "border-fs-accent bg-fs-accent text-white"
                            : "border-neutral-400 text-transparent dark:border-neutral-500",
                        )}
                        aria-hidden
                      >
                        <MdCheck className="h-4 w-4" />
                      </span>
                      <ProductListThumbnail imageUrl={firstProductImageUrl(p)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fs-text">
                          {p.name}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-500">
                          {formatCurrency(Number(p.sale_price ?? 0))}
                          {stock != null ? ` · ${stock} en stock` : ""}
                          {p.sku ? ` · ${p.sku}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-black/[0.07] p-4 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-black/10 px-4 text-sm font-semibold text-fs-text dark:border-white/10"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm([...checked]);
              onClose();
            }}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-fs-accent text-sm font-bold text-white shadow-sm"
          >
            <MdChecklist className="h-5 w-5" aria-hidden />
            {checked.size === 0
              ? "Vider la sélection"
              : `Valider ${checked.size} ${checked.size > 1 ? terms.plural : terms.singular}`}
          </button>
        </div>
      </div>
    </div>
  );
}
