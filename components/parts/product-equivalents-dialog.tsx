"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MdClose, MdSearch } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { listProductEquivalents, setProductEquivalents } from "@/lib/features/parts/api";
import {
  EQUIVALENCE_KIND_LABELS,
  type EquivalenceKind,
} from "@/lib/features/parts/types";
import type { ProductItem } from "@/lib/features/products/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

const KIND_ORDER: EquivalenceKind[] = ["origine", "generique", "adaptable", "equivalent"];

type Draft = { id: string; kind: EquivalenceKind; note: string };

/**
 * « Par quoi remplacer cette pièce ? »
 * Le lien est écrit dans les deux sens côté base : pas de double saisie à faire.
 */
export function ProductEquivalentsDialog({
  open,
  onClose,
  storeId,
  products,
  initialProductId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string | null;
  products: ProductItem[];
  initialProductId?: string | null;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [altSearch, setAltSearch] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    if (!open) return;
    setProductId(initialProductId ?? null);
    setProductSearch("");
    setAltSearch("");
    setDrafts([]);
  }, [open, initialProductId]);

  const currentQ = useQuery({
    queryKey: ["parts", "equivalents-edit", productId, storeId] as const,
    queryFn: () => listProductEquivalents(productId ?? "", storeId),
    enabled: open && !!productId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!currentQ.data) return;
    setDrafts(
      currentQ.data.map((e) => ({
        id: e.equivalentId,
        kind: e.kind,
        note: e.note ?? "",
      })),
    );
  }, [currentQ.data]);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const selectedProduct = productId ? productById.get(productId) ?? null : null;

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [products, productSearch]);

  const draftIds = useMemo(() => new Set(drafts.map((d) => d.id)), [drafts]);

  const candidates = useMemo(() => {
    const q = altSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.id !== productId &&
          !draftIds.has(p.id) &&
          (p.name.toLowerCase().includes(q) ||
            (p.sku ?? "").toLowerCase().includes(q) ||
            (p.barcode ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [products, altSearch, productId, draftIds]);

  function addDraft(id: string) {
    setDrafts((prev) =>
      prev.some((d) => d.id === id) ? prev : [...prev, { id, kind: "equivalent", note: "" }],
    );
    setAltSearch("");
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  const mut = useMutation({
    mutationFn: () => setProductEquivalents(productId ?? "", drafts),
    onSuccess: () => {
      toast.success("Équivalences enregistrées.");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  if (!open) return null;

  const canSubmit = !!productId && !mut.isPending && !currentQ.isLoading;

  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/40">
      <button
        type="button"
        className="min-w-0 flex-1 md:min-w-[120px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="flex h-dvh w-full max-w-xl flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-fs-text">Équivalences</h3>
            <p className="truncate text-xs text-neutral-500">
              {selectedProduct ? selectedProduct.name : "Choisissez d'abord une pièce"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">1. La pièce d&apos;origine</p>
            {selectedProduct ? (
              <div className="flex items-center gap-2 rounded-sm border border-fs-accent/30 bg-fs-accent/8 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fs-text">
                  {selectedProduct.name}
                </span>
                <button
                  type="button"
                  onClick={() => setProductId(null)}
                  className="shrink-0 text-xs font-bold text-fs-accent hover:underline"
                >
                  Changer
                </button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <MdSearch
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                    aria-hidden
                  />
                  <input
                    className={fsInputClass("pl-9 rounded-sm")}
                    placeholder="Rechercher une pièce…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-sm border border-black/8 dark:border-white/10">
                  {filteredProducts.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-neutral-500">
                      Aucune pièce trouvée.
                    </p>
                  ) : (
                    <ul>
                      {filteredProducts.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setProductId(p.id)}
                            className="flex w-full items-center gap-3 border-b border-black/5 px-3 py-2 text-left last:border-b-0 hover:bg-black/4 dark:border-white/5 dark:hover:bg-white/5"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm text-fs-text">
                              {p.name}
                            </span>
                            {p.sku ? (
                              <span className="shrink-0 text-[11px] text-neutral-500">{p.sku}</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">
              2. Remplaçants ({drafts.length})
            </p>

            {drafts.length === 0 ? (
              <p className="rounded-sm border border-dashed border-black/10 px-3 py-5 text-center text-xs text-neutral-500 dark:border-white/10">
                Aucun remplaçant. Ajoutez-en ci-dessous : ils s&apos;afficheront en caisse
                quand cette pièce sera en rupture.
              </p>
            ) : (
              <ul className="space-y-2">
                {drafts.map((d) => {
                  const p = productById.get(d.id);
                  return (
                    <li
                      key={d.id}
                      className="rounded-sm border border-black/8 p-2.5 dark:border-white/10"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fs-text">
                          {p?.name ?? "Produit supprimé"}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDraft(d.id)}
                          className="shrink-0 text-[11px] font-bold text-red-600 hover:underline"
                        >
                          Retirer
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {KIND_ORDER.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => patchDraft(d.id, { kind: k })}
                            className={cn(
                              "rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                              d.kind === k
                                ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                                : "border-black/10 text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5",
                            )}
                          >
                            {EQUIVALENCE_KIND_LABELS[k]}
                          </button>
                        ))}
                      </div>
                      <input
                        className={fsInputClass("mt-2 rounded-sm")}
                        placeholder="Note (optionnel) — ex. même cote, joint différent"
                        value={d.note}
                        onChange={(e) => patchDraft(d.id, { note: e.target.value })}
                      />
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="relative mt-3">
              <MdSearch
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                className={fsInputClass("pl-9 rounded-sm")}
                placeholder="Ajouter un remplaçant : tapez son nom…"
                value={altSearch}
                onChange={(e) => setAltSearch(e.target.value)}
                disabled={!productId}
              />
            </div>
            {candidates.length > 0 ? (
              <div className="mt-1.5 max-h-52 overflow-y-auto rounded-sm border border-black/8 dark:border-white/10">
                <ul>
                  {candidates.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addDraft(p.id)}
                        className="flex w-full items-center gap-3 border-b border-black/5 px-3 py-2 text-left last:border-b-0 hover:bg-black/4 dark:border-white/5 dark:hover:bg-white/5"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-fs-text">{p.name}</span>
                        {p.sku ? (
                          <span className="shrink-0 text-[11px] text-neutral-500">{p.sku}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2 border-t border-black/10 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-sm border border-black/10 py-2.5 text-sm font-semibold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => mut.mutate()}
            className={cn(
              "flex-[2] rounded-sm py-2.5 text-sm font-bold text-white",
              canSubmit
                ? "bg-fs-accent"
                : "cursor-not-allowed bg-neutral-300 text-neutral-500 dark:bg-neutral-700",
            )}
          >
            {mut.isPending ? "Enregistrement…" : "Enregistrer les équivalences"}
          </button>
        </div>
      </div>
    </div>
  );
}
