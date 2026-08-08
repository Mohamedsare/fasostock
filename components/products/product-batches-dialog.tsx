"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MdAdd, MdClose, MdDeleteOutline, MdEdit } from "react-icons/md";
import {
  createProductBatch,
  deleteProductBatch,
  listProductBatches,
  updateProductBatch,
  type ProductBatch,
} from "@/lib/features/products/batches-api";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { messageFromUnknownError, toast } from "@/lib/toast";

type Props = {
  companyId: string;
  productId: string;
  productName: string;
  stores: { id: string; name: string }[];
  onClose: () => void;
};

type EditState = {
  id: string | null;
  lotNumber: string;
  expiryDate: string;
  quantity: string;
  storeId: string;
  notes: string;
};

const EMPTY_EDIT: EditState = {
  id: null,
  lotNumber: "",
  expiryDate: "",
  quantity: "",
  storeId: "",
  notes: "",
};

/** Jours restants avant péremption (négatif = périmé). */
function daysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  const today = new Date();
  const t = new Date(today.toISOString().slice(0, 10)).getTime();
  return Math.round((new Date(expiry).getTime() - t) / 86_400_000);
}

function expiryTone(expiry: string | null): {
  label: string;
  className: string;
} {
  const d = daysLeft(expiry);
  if (d === null) return { label: "Sans date", className: "bg-neutral-100 text-neutral-600" };
  if (d < 0) return { label: `Périmé (${-d} j)`, className: "bg-red-100 text-red-700" };
  if (d <= 90) return { label: `J-${d}`, className: "bg-amber-100 text-amber-700" };
  return { label: `J-${d}`, className: "bg-emerald-100 text-emerald-700" };
}

export function ProductBatchesDialog({
  companyId,
  productId,
  productName,
  stores,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const batchesQ = useQuery({
    queryKey: ["product-batches", productId],
    queryFn: () => listProductBatches(productId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["product-batches", productId] });
    void qc.invalidateQueries({ queryKey: ["expiry-summary", companyId] });
    void qc.invalidateQueries({ queryKey: ["expiry-list", companyId] });
  };

  const saveMutation = useMutation({
    mutationFn: async (state: EditState) => {
      const input = {
        lotNumber: state.lotNumber,
        expiryDate: state.expiryDate,
        quantity: Number(state.quantity) || 0,
        storeId: state.storeId || null,
        notes: state.notes,
      };
      if (state.id) await updateProductBatch(state.id, input);
      else await createProductBatch(companyId, productId, input);
    },
    onSuccess: () => {
      setEdit(EMPTY_EDIT);
      setErrorMsg(null);
      invalidate();
      toast.success("Lot enregistré");
    },
    onError: (e) => setErrorMsg(messageFromUnknownError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProductBatch(id),
    onSuccess: () => {
      invalidate();
      toast.success("Lot supprimé");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const batches = useMemo(() => batchesQ.data ?? [], [batchesQ.data]);
  const totalQty = useMemo(
    () => batches.reduce((s, b) => s + (b.quantity ?? 0), 0),
    [batches],
  );

  function startEdit(b: ProductBatch) {
    setEdit({
      id: b.id,
      lotNumber: b.lot_number ?? "",
      expiryDate: b.expiry_date ?? "",
      quantity: String(b.quantity ?? 0),
      storeId: b.store_id ?? "",
      notes: b.notes ?? "",
    });
    setErrorMsg(null);
  }

  function submit() {
    if (!edit.expiryDate && !edit.lotNumber.trim()) {
      setErrorMsg("Renseignez au moins un n° de lot ou une date de péremption.");
      return;
    }
    saveMutation.mutate(edit);
  }

  const isEditing = edit.id != null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <div
        className="flex max-h-[min(720px,90vh)] w-full max-w-[560px] flex-col rounded-t-lg border border-black/[0.08] bg-fs-card shadow-2xl sm:rounded-lg"
        role="dialog"
        aria-labelledby="batches-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="batches-title" className="truncate text-lg font-bold text-fs-text">
              Lots & péremption
            </h2>
            <p className="truncate text-xs text-neutral-500">
              {productName} · {batches.length} lot(s) · {totalQty} unité(s)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-neutral-500 hover:bg-fs-surface-container"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {/* Formulaire ajout / édition */}
          <div className="rounded-md border border-fs-accent/30 bg-fs-accent/[0.04] p-3">
            <p className="mb-2 text-xs font-semibold text-fs-accent">
              {isEditing ? "Modifier le lot" : "Ajouter un lot"}
            </p>
            <div className="space-y-2.5">
              <div className="flex flex-col gap-2.5 min-[401px]:flex-row">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    N° de lot
                  </span>
                  <input
                    value={edit.lotNumber}
                    onChange={(e) => setEdit((s) => ({ ...s, lotNumber: e.target.value }))}
                    className={fsInputClass()}
                    autoComplete="off"
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    Date de péremption
                  </span>
                  <input
                    type="date"
                    value={edit.expiryDate}
                    onChange={(e) => setEdit((s) => ({ ...s, expiryDate: e.target.value }))}
                    className={fsInputClass()}
                  />
                </label>
              </div>
              <div className="flex flex-col gap-2.5 min-[401px]:flex-row">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    Quantité
                  </span>
                  <input
                    value={edit.quantity}
                    onChange={(e) => setEdit((s) => ({ ...s, quantity: e.target.value }))}
                    inputMode="numeric"
                    className={fsInputClass()}
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    Boutique (optionnel)
                  </span>
                  <select
                    value={edit.storeId}
                    onChange={(e) => setEdit((s) => ({ ...s, storeId: e.target.value }))}
                    className={fsInputClass()}
                  >
                    <option value="">Toutes / global</option>
                    {stores.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {errorMsg ? (
                <p className="text-xs text-red-600" role="alert">
                  {errorMsg}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                {isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEdit(EMPTY_EDIT);
                      setErrorMsg(null);
                    }}
                    className="min-h-10 rounded-md border border-black/[0.1] px-3 text-sm font-semibold text-fs-text"
                  >
                    Annuler
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={submit}
                  className="inline-flex min-h-10 items-center gap-1 rounded-md bg-fs-accent px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <MdAdd className="h-5 w-5" />
                  {isEditing ? "Mettre à jour" : "Ajouter"}
                </button>
              </div>
            </div>
          </div>

          {/* Liste des lots */}
          <ul className="mt-3 space-y-2">
            {batchesQ.isLoading ? (
              <li className="text-sm text-neutral-500">Chargement…</li>
            ) : batches.length === 0 ? (
              <li className="rounded-md bg-fs-surface-container px-3 py-4 text-center text-sm text-neutral-500">
                Aucune date enregistrée. Ajoutez un lot ci-dessus avec sa date de péremption.
              </li>
            ) : (
              batches.map((b) => {
                const tone = expiryTone(b.expiry_date);
                return (
                  <li
                    key={b.id}
                    className="flex items-center gap-2 rounded-md border border-black/[0.06] bg-fs-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-fs-text">
                          {b.lot_number || "Lot —"}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold",
                            tone.className,
                          )}
                        >
                          {tone.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {b.quantity} unité(s)
                        {b.expiry_date ? ` · exp. ${b.expiry_date}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(b)}
                      className="rounded-md p-2 text-fs-accent hover:bg-fs-surface-container"
                      aria-label="Modifier le lot"
                    >
                      <MdEdit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Supprimer ce lot ?")) deleteMutation.mutate(b.id);
                      }}
                      className="rounded-md p-2 text-red-600 hover:bg-fs-surface-container"
                      aria-label="Supprimer le lot"
                    >
                      <MdDeleteOutline className="h-4 w-4" />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="flex shrink-0 justify-end border-t border-black/[0.06] px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-black/[0.1] px-4 text-sm font-semibold text-fs-text hover:bg-fs-surface-container"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
