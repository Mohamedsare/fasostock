"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MdClose } from "react-icons/md";
import { createProductBatch } from "@/lib/features/products/batches-api";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { messageFromUnknownError, toast } from "@/lib/toast";

type LineInput = {
  productId: string;
  productName: string;
  quantity: string;
  lotNumber: string;
  expiryDate: string;
};

type Props = {
  companyId: string;
  storeId: string | null;
  items: Array<{ productId: string; productName: string; quantity: number }>;
  onClose: () => void;
};

/**
 * Capture des lots & dates de péremption à la réception d'un approvisionnement
 * (pharmacie). Crée des `product_batches` — totalement découplé du RPC de
 * confirmation de stock (aucune modification du flux atomique).
 */
export function PurchaseReceiveBatchesDialog({
  companyId,
  storeId,
  items,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<LineInput[]>(() =>
    items.map((it) => ({
      productId: it.productId,
      productName: it.productName || "Produit",
      quantity: String(it.quantity ?? 0),
      lotNumber: "",
      expiryDate: "",
    })),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function setLine(idx: number, patch: Partial<LineInput>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toSave = lines.filter(
        (l) => l.lotNumber.trim() !== "" || l.expiryDate !== "",
      );
      if (toSave.length === 0) {
        throw new Error("Renseignez au moins un lot (n° de lot ou date) à enregistrer.");
      }
      for (const l of toSave) {
        await createProductBatch(companyId, l.productId, {
          lotNumber: l.lotNumber,
          expiryDate: l.expiryDate,
          quantity: Number(l.quantity) || 0,
          storeId: storeId,
          notes: "Réception approvisionnement",
        });
      }
      return toSave.length;
    },
    onSuccess: (count) => {
      void qc.invalidateQueries({ queryKey: ["expiry-summary", companyId] });
      for (const l of lines) {
        void qc.invalidateQueries({ queryKey: ["product-batches", l.productId] });
      }
      toast.success(`${count} lot(s) enregistré(s)`);
      onClose();
    },
    onError: (e) => setErrorMsg(messageFromUnknownError(e)),
  });

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <div
        className="flex max-h-[min(760px,92vh)] w-full max-w-[600px] flex-col rounded-t-2xl border border-black/[0.08] bg-fs-card shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-labelledby="receive-batches-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="receive-batches-title" className="text-lg font-bold text-fs-text">
              Lots reçus & péremption
            </h2>
            <p className="text-xs text-neutral-500">
              Renseignez le n° de lot et la date de péremption des produits reçus.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-500 hover:bg-fs-surface-container"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          <ul className="space-y-3">
            {lines.map((l, idx) => (
              <li
                key={l.productId}
                className="rounded-xl border border-black/[0.06] bg-fs-card p-3"
              >
                <p className="mb-2 text-sm font-semibold text-fs-text">{l.productName}</p>
                <div className="flex flex-col gap-2.5 min-[480px]:flex-row">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                      N° de lot
                    </span>
                    <input
                      value={l.lotNumber}
                      onChange={(e) => setLine(idx, { lotNumber: e.target.value })}
                      className={fsInputClass()}
                      autoComplete="off"
                    />
                  </label>
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                      Péremption
                    </span>
                    <input
                      type="date"
                      value={l.expiryDate}
                      onChange={(e) => setLine(idx, { expiryDate: e.target.value })}
                      className={fsInputClass()}
                    />
                  </label>
                  <label className="min-w-0 min-[480px]:w-24">
                    <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                      Qté
                    </span>
                    <input
                      value={l.quantity}
                      onChange={(e) => setLine(idx, { quantity: e.target.value })}
                      inputMode="numeric"
                      className={fsInputClass()}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          {errorMsg ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {errorMsg}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-black/[0.06] px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-black/[0.1] px-4 text-sm font-semibold text-fs-text hover:bg-fs-surface-container"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => {
              setErrorMsg(null);
              saveMutation.mutate();
            }}
            className="min-h-11 rounded-xl bg-fs-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? "Enregistrement…" : "Enregistrer les lots"}
          </button>
        </div>
      </div>
    </div>
  );
}
