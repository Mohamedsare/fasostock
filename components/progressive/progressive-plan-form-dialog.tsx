"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdClose, MdInfoOutline } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { FsSearchSelect } from "@/components/ui/fs-search-select";
import { saveProgressivePlan } from "@/lib/features/progressive/api";
import type { ProgressiveTerms } from "@/lib/features/progressive/progressive-terms";
import type { ProgressivePlan } from "@/lib/features/progressive/types";
import type { ProductItem } from "@/lib/features/products/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";

const ID_TYPES = ["CNIB", "Passeport", "Permis de conduire", "Carte consulaire", "Autre"];

/**
 * Création / modification d'un dossier d'achat progressif.
 * L'article visé est **facultatif** : beaucoup de clients commencent à épargner
 * avant d'avoir choisi le modèle qu'ils prendront.
 */
export function ProgressivePlanFormDialog({
  open,
  onClose,
  companyId,
  storeId,
  storeName,
  terms,
  products,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  storeId: string;
  storeName: string;
  terms: ProgressiveTerms;
  products: ProductItem[];
  editing: ProgressivePlan | null;
  /** `planId` du dossier enregistré ; `isNew` pour enchaîner sur le 1er versement. */
  onSaved: (planId: string, isNew: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [targetProductId, setTargetProductId] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.clientName ?? "");
    setPhone(editing?.clientPhone ?? "");
    setIdType(editing?.clientIdType ?? "");
    setIdNumber(editing?.clientIdNumber ?? "");
    setAddress(editing?.clientAddress ?? "");
    setTargetProductId(editing?.targetProductId ?? "");
    setTargetAmount(editing?.targetAmount != null ? String(Math.round(editing.targetAmount)) : "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const productOptions = useMemo(
    () => [
      { id: "", name: "— Pas encore choisi —" },
      ...products
        .filter((p) => p.is_active && Number(p.sale_price ?? 0) > 0)
        .map((p) => ({
          id: p.id,
          name: `${p.name} · ${formatCurrency(Number(p.sale_price ?? 0))}`,
        })),
    ],
    [products],
  );

  const selectedProduct = products.find((p) => p.id === targetProductId) ?? null;
  const amountNum = Math.round(toNumber(targetAmount));
  const effectiveGoal =
    amountNum > 0 ? amountNum : Number(selectedProduct?.sale_price ?? 0) || 0;

  const mut = useMutation({
    mutationFn: async () => {
      const planId = await saveProgressivePlan({
        id: editing?.id ?? null,
        companyId,
        storeId,
        customerId: editing?.customerId ?? null,
        clientName: name.trim(),
        clientPhone: phone.trim() || null,
        clientIdType: idType.trim() || null,
        clientIdNumber: idNumber.trim() || null,
        clientAddress: address.trim() || null,
        targetProductId: targetProductId || null,
        targetAmount: amountNum > 0 ? amountNum : null,
        notes: notes.trim() || null,
      });
      return planId;
    },
    onSuccess: (planId) => {
      toast.success(editing ? "Dossier mis à jour." : "Dossier ouvert.");
      onSaved(planId, !editing);
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && !mut.isPending;

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
            <h3 className="text-base font-bold text-fs-text">
              {editing ? `Modifier ${editing.planNumber}` : "Nouveau dossier d'épargne"}
            </h3>
            <p className="truncate text-xs text-neutral-500">{storeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-600">
              Nom du client <span className="text-red-500">*</span>
            </label>
            <input
              className={fsInputClass()}
              placeholder="Ex. OUEDRAOGO Salif"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">Téléphone</label>
              <input
                className={fsInputClass()}
                inputMode="tel"
                placeholder="70 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">Adresse / quartier</label>
              <input
                className={fsInputClass()}
                placeholder="Ex. Tampouy, Ouagadougou"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">Pièce d&apos;identité</label>
              <select
                className={fsInputClass()}
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
              >
                <option value="">—</option>
                {ID_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">N° de la pièce</label>
              <input
                className={fsInputClass()}
                placeholder="Ex. B1234567"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-black/[0.07] bg-fs-surface-container/60 p-3 dark:border-white/10">
            <p className="mb-2 flex items-start gap-1.5 text-xs text-neutral-600">
              <MdInfoOutline className="mt-px h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
              Objectif facultatif : le client peut épargner sans avoir rien choisi. Dès que son
              épargne couvre un {terms.singular} disponible en stock, la page le signale.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600">
                  {terms.singularCap} visé
                </label>
                <FsSearchSelect
                  value={targetProductId}
                  options={productOptions}
                  onChange={setTargetProductId}
                  placeholder="— Pas encore choisi —"
                  ariaLabel={`${terms.singularCap} visé`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600">
                  Montant objectif (FCFA)
                </label>
                <input
                  className={fsInputClass()}
                  inputMode="numeric"
                  placeholder={
                    selectedProduct
                      ? String(Math.round(Number(selectedProduct.sale_price ?? 0)))
                      : "Ex. 450000"
                  }
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
            </div>
            {effectiveGoal > 0 ? (
              <p className="mt-2 text-xs font-semibold text-fs-accent">
                Objectif retenu : {formatCurrency(effectiveGoal)}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-600">Note interne</label>
            <textarea
              className={fsInputClass("min-h-[70px] resize-y")}
              placeholder="Ex. Client présenté par M. Kaboré"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-black/10 p-4 dark:border-white/10">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => mut.mutate()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-fs-accent text-sm font-bold text-white shadow-sm disabled:opacity-50"
          >
            {mut.isPending ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {editing ? "Enregistrer les modifications" : "Ouvrir le dossier"}
          </button>
        </div>
      </div>
    </div>
  );
}
