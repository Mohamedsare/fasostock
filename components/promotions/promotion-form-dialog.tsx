"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdClose, MdSearch } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { savePromotion } from "@/lib/features/promotions/api";
import { applyPromoPercent } from "@/lib/features/promotions/promo-math";
import type { Promotion } from "@/lib/features/promotions/types";
import type { ProductItem } from "@/lib/features/products/types";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Début = 00:00 local ; fin = 23:59:59 local (jour inclus). */
function dateInputToIso(date: string, edge: "start" | "end"): string | null {
  if (!date) return null;
  const suffix = edge === "start" ? "T00:00:00" : "T23:59:59.999";
  const d = new Date(`${date}${suffix}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function PromotionFormDialog({
  open,
  onClose,
  companyId,
  stores,
  products,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  stores: { id: string; name: string }[];
  products: ProductItem[];
  editing: Promotion | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("10");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPercent(editing ? String(editing.discountPercent) : "10");
    setStartDate(isoToDateInput(editing?.startsAt ?? null));
    setEndDate(isoToDateInput(editing?.endsAt ?? null));
    setIsActive(editing?.isActive ?? true);
    setNote(editing?.note ?? "");
    setProductSearch("");
    setSelectedProducts(new Set(editing?.productIds ?? []));
    setSelectedStores(
      new Set(editing?.storeIds ?? (stores.length === 1 ? [stores[0]!.id] : [])),
    );
  }, [open, editing, stores]);

  const percentNum = Math.max(0, Math.min(100, Number(percent.replace(",", ".")) || 0));

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q),
    );
  }, [products, productSearch]);

  const toggleProduct = (id: string) =>
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleStore = (id: string) =>
    setSelectedStores((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllFiltered = () =>
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      for (const p of filteredProducts) next.add(p.id);
      return next;
    });

  const clearProducts = () => setSelectedProducts(new Set());

  const mut = useMutation({
    mutationFn: () =>
      savePromotion(companyId, {
        id: editing?.id ?? null,
        name: name.trim(),
        discountPercent: percentNum,
        startsAt: dateInputToIso(startDate, "start"),
        endsAt: dateInputToIso(endDate, "end"),
        isActive,
        note: note.trim() || null,
        productIds: [...selectedProducts],
        storeIds: [...selectedStores],
      }),
    onSuccess: () => {
      toast.success(editing ? "Promotion mise à jour." : "Promotion créée.");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  if (!open) return null;

  const canSubmit =
    name.trim().length > 0 &&
    percentNum > 0 &&
    percentNum <= 100 &&
    selectedProducts.size > 0 &&
    selectedStores.size > 0 &&
    !mut.isPending &&
    (!startDate || !endDate || startDate <= endDate);

  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/40">
      <button type="button" className="min-w-0 flex-1 md:min-w-[120px]" aria-label="Fermer" onClick={onClose} />
      <div className="flex h-dvh w-full max-w-xl flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <h3 className="text-base font-bold text-fs-text">
            {editing ? "Modifier la promotion" : "Nouvelle promotion"}
          </h3>
          <button type="button" onClick={onClose} className="rounded-sm p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Fermer">
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">Nom de la promotion</label>
              <input
                className={fsInputClass("rounded-sm")}
                placeholder="Ex. Soldes fin d'année"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600">Remise (%)</label>
                <input
                  className={fsInputClass("rounded-sm")}
                  inputMode="decimal"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600">Début (optionnel)</label>
                <input
                  type="date"
                  className={fsInputClass("rounded-sm")}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600">Fin (optionnel)</label>
                <input
                  type="date"
                  className={fsInputClass("rounded-sm")}
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-fs-accent"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="font-medium text-fs-text">Promotion active</span>
              <span className="text-xs text-neutral-500">(décochez pour préparer sans l&apos;appliquer)</span>
            </label>

            {/* Boutiques */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-600">
                Boutiques concernées ({selectedStores.size}/{stores.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stores.map((s) => {
                  const on = selectedStores.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleStore(s.id)}
                      className={cn(
                        "rounded-sm border px-3 py-1.5 text-xs font-semibold transition-colors",
                        on
                          ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                          : "border-black/10 text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5",
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Produits */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-neutral-600">
                  Produits en promo ({selectedProducts.size})
                </p>
                <div className="flex gap-2 text-[11px] font-bold">
                  <button type="button" onClick={selectAllFiltered} className="text-fs-accent hover:underline">
                    Tout cocher
                  </button>
                  <button type="button" onClick={clearProducts} className="text-neutral-500 hover:underline">
                    Vider
                  </button>
                </div>
              </div>
              <div className="relative mb-2">
                <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
                <input
                  className={fsInputClass("pl-9 rounded-sm")}
                  placeholder="Rechercher un produit (nom, code-barres)…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-sm border border-black/8 dark:border-white/10">
                {filteredProducts.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-neutral-500">Aucun produit.</p>
                ) : (
                  <ul>
                    {filteredProducts.map((p) => {
                      const on = selectedProducts.has(p.id);
                      const promoPrice = applyPromoPercent(p.sale_price, percentNum);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => toggleProduct(p.id)}
                            className={cn(
                              "flex w-full items-center gap-3 border-b border-black/5 px-3 py-2 text-left last:border-b-0 dark:border-white/5",
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
                            <span className="min-w-0 flex-1 truncate text-sm text-fs-text">{p.name}</span>
                            <span className="shrink-0 text-right text-xs">
                              <span className="text-neutral-400 line-through">{formatCurrency(p.sale_price)}</span>{" "}
                              <span className="font-bold text-fs-accent">{formatCurrency(promoPrice)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">Note interne (optionnel)</label>
              <textarea
                className={fsInputClass("min-h-[60px] resize-y rounded-sm")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex. Opération magasin, condition…"
              />
            </div>
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
              canSubmit ? "bg-fs-accent" : "cursor-not-allowed bg-neutral-300 text-neutral-500 dark:bg-neutral-700",
            )}
          >
            {mut.isPending ? "Enregistrement…" : editing ? "Enregistrer" : "Créer la promotion"}
          </button>
        </div>
      </div>
    </div>
  );
}
