"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  MdAdd,
  MdChecklist,
  MdClose,
  MdDelete,
  MdInfoOutline,
  MdRemove,
  MdShoppingCart,
} from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { ProgressiveProductPickerDialog } from "@/components/progressive/progressive-product-picker-dialog";
import {
  listProgressivePlanItems,
  saveProgressivePlan,
  saveProgressivePlanItems,
} from "@/lib/features/progressive/api";
import type { ProgressiveTerms } from "@/lib/features/progressive/progressive-terms";
import type { ProgressivePlan } from "@/lib/features/progressive/types";
import type { ProductItem } from "@/lib/features/products/types";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";

const ID_TYPES = ["CNIB", "Passeport", "Permis de conduire", "Carte consulaire", "Autre"];

/** Ligne de la sélection en cours de saisie. */
type DraftItem = {
  key: string;
  productId: string;
  label: string;
  quantity: number;
  /** Saisi en texte : le vendeur négocie souvent le prix à la main. */
  unitPrice: string;
};

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random());
}

function lineTotal(it: DraftItem): number {
  return Math.round(toNumber(it.unitPrice)) * Math.max(1, it.quantity);
}

/**
 * Création / modification d'un dossier d'achat progressif.
 *
 * La sélection est **libre** : le client compose son panier (plusieurs articles,
 * quantité et prix négocié par ligne) et le total devient l'objectif à atteindre.
 * Elle reste facultative — beaucoup de clients commencent à épargner avant d'avoir
 * choisi quoi que ce soit ; dans ce cas un simple montant objectif suffit.
 */
export function ProgressivePlanFormDialog({
  open,
  onClose,
  companyId,
  storeId,
  storeName,
  terms,
  products,
  stockByProductId,
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
  /** Stock de la boutique — affiché en face de chaque article à cocher. */
  stockByProductId?: Map<string, number>;
  editing: ProgressivePlan | null;
  /** `planId` du dossier enregistré ; `isNew` pour enchaîner sur le 1er versement. */
  onSaved: (planId: string, isNew: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Sélection déjà enregistrée (modification d'un dossier existant).
  const existingItemsQ = useQuery({
    queryKey: queryKeys.progressivePlanItems(editing?.id ?? ""),
    queryFn: () => listProgressivePlanItems(editing!.id),
    enabled: open && !!editing?.id,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!open) return;
    setName(editing?.clientName ?? "");
    setPhone(editing?.clientPhone ?? "");
    setIdType(editing?.clientIdType ?? "");
    setIdNumber(editing?.clientIdNumber ?? "");
    setAddress(editing?.clientAddress ?? "");
    setTargetAmount(editing?.targetAmount != null ? String(Math.round(editing.targetAmount)) : "");
    setNotes(editing?.notes ?? "");
    setPickerOpen(false);
    setItems([]);
  }, [open, editing]);

  // Les lignes existantes arrivent après l'ouverture du panneau (requête).
  useEffect(() => {
    if (!open || !editing?.id) return;
    const rows = existingItemsQ.data;
    if (!rows) return;
    setItems(
      rows.map((r) => ({
        key: r.id,
        productId: r.productId ?? "",
        label: r.label,
        quantity: r.quantity,
        unitPrice: String(Math.round(r.unitPrice)),
      })),
    );
  }, [open, editing?.id, existingItemsQ.data]);

  const sellable = useMemo(
    () => products.filter((p) => p.is_active && Number(p.sale_price ?? 0) > 0),
    [products],
  );

  const selectedProductIds = useMemo(
    () => items.map((it) => it.productId).filter(Boolean),
    [items],
  );

  /**
   * Applique la sélection cochée dans le sélecteur multiple. Les lignes déjà
   * présentes gardent leur quantité et leur prix négocié ; les articles
   * décochés sortent du dossier.
   */
  function applySelection(productIds: string[]) {
    setItems((prev) => {
      const keep = new Set(productIds);
      const kept = prev.filter((it) => !it.productId || keep.has(it.productId));
      const already = new Set(kept.map((it) => it.productId));
      const added: DraftItem[] = [];
      for (const id of productIds) {
        if (already.has(id)) continue;
        const product = sellable.find((p) => p.id === id);
        if (!product) continue;
        added.push({
          key: newKey(),
          productId: id,
          label: product.name,
          quantity: 1,
          unitPrice: String(Math.round(Number(product.sale_price ?? 0))),
        });
      }
      return [...kept, ...added];
    });
  }

  function patchItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  const selectionTotal = items.reduce((acc, it) => acc + lineTotal(it), 0);
  const amountNum = Math.round(toNumber(targetAmount));
  // Une sélection non vide fait l'objectif ; sinon le montant saisi à la main.
  const effectiveGoal = items.length > 0 ? selectionTotal : amountNum;

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
        // La sélection pilote l'article visé et l'objectif : le serveur les
        // recalcule juste après, à partir des lignes envoyées.
        targetProductId: null,
        targetAmount: items.length > 0 ? null : amountNum > 0 ? amountNum : null,
        notes: notes.trim() || null,
      });
      await saveProgressivePlanItems({
        planId,
        items: items.map((it) => ({
          productId: it.productId || null,
          label: it.label,
          quantity: it.quantity,
          unitPrice: Math.round(toNumber(it.unitPrice)),
        })),
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

          {/* Sélection du client */}
          <div className="rounded-xl border border-black/[0.07] bg-fs-surface-container/60 p-3 dark:border-white/10">
            <div className="mb-2 flex items-center gap-1.5">
              <MdShoppingCart className="h-4 w-4 text-fs-accent" aria-hidden />
              <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-600">
                Sélection du client
              </h4>
            </div>
            <p className="mb-2 flex items-start gap-1.5 text-xs text-neutral-600">
              <MdInfoOutline className="mt-px h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
              Cochez tous les {terms.plural} que le client veut — autant qu&apos;il en faut —
              puis ajustez la quantité et le prix convenu de chaque ligne. Le total devient
              son objectif, et sa facture proforma A4.
            </p>

            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)] px-3 text-sm font-bold text-fs-accent"
            >
              <MdChecklist className="h-5 w-5" aria-hidden />
              {items.length > 0
                ? `Modifier la sélection (${items.length})`
                : `Choisir les ${terms.plural}`}
            </button>

            {items.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {items.map((it) => (
                  <li
                    key={it.key}
                    className="rounded-xl border border-black/[0.07] bg-fs-card p-2.5 dark:border-white/10"
                  >
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-sm font-semibold text-fs-text">
                        {it.label}
                      </p>
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}
                        className="shrink-0 rounded-lg p-1.5 text-red-600 hover:bg-red-500/10"
                        aria-label={`Retirer ${it.label}`}
                      >
                        <MdDelete className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <div>
                        <span className="mb-1 block text-[11px] font-semibold text-neutral-500">
                          Quantité
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              patchItem(it.key, { quantity: Math.max(1, it.quantity - 1) })
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 text-neutral-600 dark:border-white/10 dark:text-neutral-300"
                            aria-label="Diminuer la quantité"
                          >
                            <MdRemove className="h-4 w-4" aria-hidden />
                          </button>
                          <input
                            className={fsInputClass("h-9 w-14 text-center")}
                            inputMode="numeric"
                            value={String(it.quantity)}
                            onChange={(e) => {
                              const n = Math.trunc(toNumber(e.target.value.replace(/[^\d]/g, "")));
                              patchItem(it.key, { quantity: Math.max(1, Math.min(9999, n || 1)) });
                            }}
                            aria-label={`Quantité pour ${it.label}`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              patchItem(it.key, { quantity: Math.min(9999, it.quantity + 1) })
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 text-neutral-600 dark:border-white/10 dark:text-neutral-300"
                            aria-label="Augmenter la quantité"
                          >
                            <MdAdd className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <div className="min-w-[120px] flex-1">
                        <label className="mb-1 block text-[11px] font-semibold text-neutral-500">
                          Prix unitaire
                        </label>
                        <input
                          className={fsInputClass("h-9")}
                          inputMode="numeric"
                          value={it.unitPrice}
                          onChange={(e) =>
                            patchItem(it.key, { unitPrice: e.target.value.replace(/[^\d]/g, "") })
                          }
                          aria-label={`Prix unitaire de ${it.label}`}
                        />
                      </div>
                      <div className="text-right">
                        <span className="mb-1 block text-[11px] font-semibold text-neutral-500">
                          Montant
                        </span>
                        <span className="block text-sm font-extrabold tabular-nums text-fs-text">
                          {formatCurrency(lineTotal(it))}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">
                Aucun {terms.singular} choisi — le client peut épargner librement et choisir
                plus tard.
              </p>
            )}

            {items.length === 0 ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-neutral-600">
                  Montant objectif (FCFA)
                </label>
                <input
                  className={fsInputClass()}
                  inputMode="numeric"
                  placeholder="Ex. 450000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
            ) : null}

            {effectiveGoal > 0 ? (
              <div className="mt-3 flex items-baseline justify-between gap-2 rounded-lg bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)] px-3 py-2">
                <span className="text-xs font-semibold text-neutral-600">
                  {items.length > 0
                    ? `Total de la sélection (${items.length} ligne${items.length > 1 ? "s" : ""})`
                    : "Objectif retenu"}
                </span>
                <span className="text-base font-extrabold tabular-nums text-fs-accent">
                  {formatCurrency(effectiveGoal)}
                </span>
              </div>
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

      <ProgressiveProductPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        products={sellable}
        stockByProductId={stockByProductId}
        selectedIds={selectedProductIds}
        terms={terms}
        onConfirm={applySelection}
      />
    </div>
  );
}
