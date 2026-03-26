"use client";

import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import { createStockTransfer } from "@/lib/features/transfers/api";
import type { CreateTransferLineInput } from "@/lib/features/transfers/types";
import { listProducts } from "@/lib/features/products/api";
import { toast, toastMutationError } from "@/lib/toast";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MdAdd, MdClose, MdDeleteOutline } from "react-icons/md";

type StoreLite = { id: string; name: string };

/**
 * Création transfert **boutique → boutique uniquement** (aligné `CreateTransferDialog` Flutter sur l’écran Transferts).
 */
export function CreateTransferDialog({
  open,
  onClose,
  companyId,
  stores,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  stores: StoreLite[];
  onCreated: () => void;
}) {
  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [lines, setLines] = useState<CreateTransferLineInput[]>([{ productId: "", quantityRequested: 1 }]);

  const productsQ = useQuery({
    queryKey: ["products-transfer-create", companyId] as const,
    queryFn: () => listProducts(companyId),
    enabled: open && Boolean(companyId),
  });

  const products = productsQ.data ?? [];

  useEffect(() => {
    if (!open || stores.length === 0) return;
    setFromStoreId(stores[0].id);
    setToStoreId(stores.length > 1 ? stores[1].id : stores[0].id);
    setLines([{ productId: "", quantityRequested: 1 }]);
  }, [open, stores]);

  function addLine() {
    setLines((prev) => [...prev, { productId: "", quantityRequested: 1 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, j) => j !== i));
  }

  function setLine(i: number, patch: Partial<CreateTransferLineInput>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function submit() {
    if (!fromStoreId.trim()) {
      toast.error("Choisissez la boutique d’origine.");
      return;
    }
    if (!toStoreId.trim()) {
      toast.error("Choisissez la boutique de destination.");
      return;
    }
    if (fromStoreId === toStoreId) {
      toast.error("L’origine et la destination doivent être deux boutiques différentes.");
      return;
    }
    try {
      await createStockTransfer({
        companyId,
        fromWarehouse: false,
        fromStoreId,
        toStoreId,
        items: lines,
      });
      onCreated();
      onClose();
    } catch (e) {
      toastMutationError("transfers-create", e);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45 p-0 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-create-title"
    >
      <div className="flex max-h-[min(92dvh,720px)] w-full flex-col rounded-t-2xl bg-fs-surface shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
          <h2 id="transfer-create-title" className="text-base font-bold text-fs-text">
            Nouveau transfert
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="fs-touch-target rounded-xl p-2 text-neutral-600"
            aria-label="Fermer"
          >
            <MdClose className="h-6 w-6" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-xs text-neutral-600">
            Transfert d’une boutique vers une autre uniquement (pas depuis le dépôt magasin).
          </p>

          <div className="mt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Boutique origine
            </label>
            <select
              className={fsInputClass("mt-1")}
              value={fromStoreId}
              onChange={(e) => setFromStoreId(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Boutique destination
            </label>
            <select
              className={fsInputClass("mt-1")}
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === fromStoreId}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Lignes</p>
          <div className="mt-2 space-y-3">
            {lines.map((line, i) => {
              const lineProduct = line.productId ? products.find((p) => p.id === line.productId) : undefined;
              const lineImageUrl = lineProduct ? firstProductImageUrl(lineProduct) : null;
              return (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-xl border border-black/6 bg-fs-card p-3"
              >
                <div className="flex min-w-0 flex-1 basis-[200px] items-end gap-2">
                  <ProductListThumbnail imageUrl={lineImageUrl} className="h-10 w-10 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <label className="text-[10px] font-semibold text-neutral-500">Produit</label>
                    <select
                      className={fsInputClass("mt-1 w-full")}
                      value={line.productId}
                      onChange={(e) => setLine(i, { productId: e.target.value })}
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="w-24">
                  <label className="text-[10px] font-semibold text-neutral-500">Qté</label>
                  <input
                    type="number"
                    min={1}
                    className={fsInputClass("mt-1")}
                    value={line.quantityRequested}
                    onChange={(e) =>
                      setLine(i, { quantityRequested: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="fs-touch-target mb-0.5 rounded-lg p-2 text-red-600"
                  aria-label="Supprimer la ligne"
                >
                  <MdDeleteOutline className="h-5 w-5" />
                </button>
              </div>
            );
            })}
          </div>
          <button
            type="button"
            onClick={addLine}
            className="fs-touch-target mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-black/8 bg-fs-card py-3 text-sm font-semibold text-fs-text"
          >
            <MdAdd className="h-5 w-5" />
            Ajouter une ligne
          </button>
          {productsQ.isLoading ? (
            <p className="mt-2 text-xs text-neutral-500">Chargement des produits…</p>
          ) : null}
        </div>
        <div className="border-t border-black/6 p-4">
          <button
            type="button"
            onClick={() => void submit()}
            className="fs-touch-target w-full rounded-[10px] bg-fs-accent py-3.5 text-sm font-semibold text-white"
          >
            Créer le brouillon
          </button>
        </div>
      </div>
    </div>
  );
}
