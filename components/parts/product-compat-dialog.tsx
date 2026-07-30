"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MdClose, MdSearch } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { listProductPartModels, setProductPartModels } from "@/lib/features/parts/api";
import type { PartModel } from "@/lib/features/parts/types";
import type { ProductItem } from "@/lib/features/products/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/** Étiquette lisible d'un modèle : « Yamaha · Crypton 115 ». */
export function partModelLabel(m: { name: string; maker: string | null }): string {
  return m.maker ? `${m.maker} · ${m.name}` : m.name;
}

/**
 * « Sur quels modèles cette pièce va-t-elle ? »
 * On choisit d'abord la pièce, puis on coche les modèles compatibles.
 */
export function ProductCompatDialog({
  open,
  onClose,
  products,
  models,
  initialProductId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductItem[];
  models: PartModel[];
  /** Pré-sélectionne une pièce (ouverture depuis un résultat de recherche). */
  initialProductId?: string | null;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setProductId(initialProductId ?? null);
    setProductSearch("");
    setModelSearch("");
    setSelected(new Set());
  }, [open, initialProductId]);

  // Compatibilités déjà enregistrées pour la pièce choisie.
  const currentQ = useQuery({
    queryKey: ["parts", "product-models", productId] as const,
    queryFn: () => listProductPartModels(productId ?? ""),
    enabled: open && !!productId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!currentQ.data) return;
    setSelected(new Set(currentQ.data.map((r) => r.modelId)));
  }, [currentQ.data]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

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

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.maker ?? "").toLowerCase().includes(q),
    );
  }, [models, modelSearch]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const mut = useMutation({
    mutationFn: () => setProductPartModels(productId ?? "", [...selected]),
    onSuccess: () => {
      toast.success("Compatibilités enregistrées.");
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
            <h3 className="text-base font-bold text-fs-text">Compatibilités de la pièce</h3>
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
          {/* 1. La pièce */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">1. La pièce</p>
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
                    placeholder="Rechercher une pièce (nom, référence, code-barres)…"
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

          {/* 2. Les modèles */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-600">
                2. Modèles compatibles ({selected.size})
              </p>
              {selected.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-[11px] font-bold text-neutral-500 hover:underline"
                >
                  Tout décocher
                </button>
              ) : null}
            </div>

            {models.length === 0 ? (
              <p className="rounded-sm border border-dashed border-black/10 px-3 py-6 text-center text-xs text-neutral-500 dark:border-white/10">
                Aucun modèle enregistré. Créez-en un dans l&apos;onglet «&nbsp;Modèles&nbsp;».
              </p>
            ) : (
              <>
                <div className="relative mb-2">
                  <MdSearch
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                    aria-hidden
                  />
                  <input
                    className={fsInputClass("pl-9 rounded-sm")}
                    placeholder="Filtrer les modèles…"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-sm border border-black/8 dark:border-white/10">
                  {currentQ.isLoading ? (
                    <p className="px-3 py-6 text-center text-xs text-neutral-500">Chargement…</p>
                  ) : filteredModels.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-neutral-500">Aucun modèle.</p>
                  ) : (
                    <ul>
                      {filteredModels.map((m) => {
                        const on = selected.has(m.id);
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => toggle(m.id)}
                              disabled={!productId}
                              className={cn(
                                "flex w-full items-center gap-3 border-b border-black/5 px-3 py-2 text-left last:border-b-0 disabled:opacity-40 dark:border-white/5",
                                on && "bg-fs-accent/5",
                              )}
                            >
                              <input
                                type="checkbox"
                                readOnly
                                checked={on}
                                className="h-4 w-4 accent-fs-accent"
                                tabIndex={-1}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm text-fs-text">
                                {partModelLabel(m)}
                              </span>
                              {m.years ? (
                                <span className="shrink-0 text-[11px] text-neutral-500">{m.years}</span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
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
            {mut.isPending ? "Enregistrement…" : "Enregistrer les compatibilités"}
          </button>
        </div>
      </div>
    </div>
  );
}
