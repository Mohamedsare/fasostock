"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdArrowBack,
  MdCheckCircle,
  MdContentCopy,
  MdDelete,
  MdDownload,
  MdEdit,
  MdInfoOutline,
  MdLocalShipping,
  MdLock,
  MdSettings,
  MdUndo,
  MdWarningAmber,
} from "react-icons/md";
import { FsQueryErrorPanel, FsSectionLabel } from "@/components/ui/fs-screen-primitives";
import { LcCard } from "./ui";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import {
  applyCostBatch,
  batchTotals,
  computeBatch,
  deleteBatchCharge,
  deleteBatchItem,
  fetchBatchCharges,
  fetchBatchItems,
  importItemsFromPurchase,
  listImportablePurchases,
  revertBatchPrices,
  saveBatchCharge,
  saveBatchItem,
} from "@/lib/features/landed-cost/api";
import {
  allocationLabel,
  chargeKindLabel,
  statusLabel,
} from "@/lib/features/landed-cost/labels";
import {
  formatCost,
  formatDateFr,
  formatPercent,
  formatQuantity,
} from "@/lib/features/landed-cost/format";
import type {
  AllocationMethod,
  ComputedLine,
  CostBatch,
  CostBatchCharge,
  CostBatchItem,
} from "@/lib/features/landed-cost/types";
import { listProductsForPicker } from "@/lib/features/purchases/api";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { ChargeFormDialog } from "./charge-form-dialog";
import { ItemFormDialog } from "./item-form-dialog";
import { PriceHistoryDialog } from "./price-history-dialog";
import { LandedCostGuideButton } from "./landed-cost-guide";
import { ResultTable, lineFlag } from "./result-table";

/** Encadré chiffré du pied de page — le total que le commerçant recopie sur son cahier. */
function TotalRow({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <span
          className={cn(
            "text-xs",
            strong ? "font-semibold text-fs-text" : "text-neutral-600",
          )}
        >
          {label}
        </span>
        {hint ? <span className="block text-[11px] text-neutral-500">{hint}</span> : null}
      </div>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          strong ? "text-base font-bold text-fs-text" : "text-sm font-semibold text-fs-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function BatchWorkspace({
  batch,
  companyId,
  canManage,
  onBack,
  onEditSettings,
  onDuplicate,
  onCancelBatch,
  onDeleteBatch,
  onOpenGuide,
}: {
  batch: CostBatch;
  companyId: string;
  canManage: boolean;
  onBack: () => void;
  onEditSettings: () => void;
  onDuplicate: () => void;
  onCancelBatch: () => void;
  onDeleteBatch: () => void;
  onOpenGuide: () => void;
}) {
  const qc = useQueryClient();
  const editable = canManage && batch.status === "draft";

  const [itemDialog, setItemDialog] = useState<{ open: boolean; editing: CostBatchItem | null }>({
    open: false,
    editing: null,
  });
  const [chargeDialog, setChargeDialog] = useState<{
    open: boolean;
    editing: CostBatchCharge | null;
  }>({ open: false, editing: null });
  const [history, setHistory] = useState<{ id: string; name: string } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<CostBatchItem | null>(null);
  const [chargeToDelete, setChargeToDelete] = useState<CostBatchCharge | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const itemsQ = useQuery({
    queryKey: queryKeys.costBatchItems(batch.id),
    queryFn: () => fetchBatchItems(batch.id),
    staleTime: 15_000,
  });
  const chargesQ = useQuery({
    queryKey: queryKeys.costBatchCharges(batch.id),
    queryFn: () => fetchBatchCharges(batch.id),
    staleTime: 15_000,
  });
  const computeQ = useQuery({
    queryKey: queryKeys.costBatchCompute(batch.id),
    queryFn: () => computeBatch(batch.id),
    staleTime: 5_000,
  });
  const productsQ = useQuery({
    queryKey: queryKeys.productsPicker(companyId),
    queryFn: () => listProductsForPicker(companyId),
    enabled: editable && Boolean(companyId),
    staleTime: 60_000,
  });
  const importableQ = useQuery({
    queryKey: queryKeys.costBatchImportable(companyId, batch.storeId),
    queryFn: () => listImportablePurchases({ companyId, storeId: batch.storeId }),
    enabled: editable && importOpen,
    staleTime: 60_000,
  });

  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const charges = useMemo(() => chargesQ.data ?? [], [chargesQ.data]);
  const lines = useMemo(() => computeQ.data ?? [], [computeQ.data]);
  const totals = useMemo(() => batchTotals(lines), [lines]);

  /** Clés réellement utilisées par les frais : conditionne les champs poids / volume. */
  const usedMethods = useMemo(() => {
    const s = new Set<AllocationMethod>();
    for (const c of charges) {
      if (c.amount > 0) s.add(c.allocationMethod ?? batch.allocationMethod);
    }
    return s;
  }, [charges, batch.allocationMethod]);

  /** Lignes méritant l'attention du patron avant de valider. */
  const alerts = useMemo(
    () =>
      lines
        .map((l) => ({ line: l, flag: lineFlag(l) }))
        .filter((x) => x.flag != null && x.flag.tone !== "info"),
    [lines],
  );

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.costBatchItems(batch.id) }),
      qc.invalidateQueries({ queryKey: queryKeys.costBatchCharges(batch.id) }),
      qc.invalidateQueries({ queryKey: queryKeys.costBatchCompute(batch.id) }),
      qc.invalidateQueries({ queryKey: queryKeys.costBatches(companyId, batch.storeId) }),
      qc.invalidateQueries({ queryKey: queryKeys.costBatches(companyId, null) }),
    ]);
  }

  const itemMut = useMutation({
    mutationFn: saveBatchItem,
    onSuccess: async () => {
      setItemDialog({ open: false, editing: null });
      await refresh();
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const itemDeleteMut = useMutation({
    mutationFn: (id: string) => deleteBatchItem(id),
    onSuccess: async () => {
      setItemToDelete(null);
      await refresh();
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const chargeMut = useMutation({
    mutationFn: saveBatchCharge,
    onSuccess: async () => {
      setChargeDialog({ open: false, editing: null });
      await refresh();
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const chargeDeleteMut = useMutation({
    mutationFn: (id: string) => deleteBatchCharge(id),
    onSuccess: async () => {
      setChargeToDelete(null);
      await refresh();
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const importMut = useMutation({
    mutationFn: (purchaseId: string) => importItemsFromPurchase(batch.id, purchaseId),
    onSuccess: async (n) => {
      setImportOpen(false);
      toast.success(
        `${n} ligne(s) reprise(s). L'arrivage passe en « prix seulement » : le stock de cet achat est déjà entré.`,
      );
      await refresh();
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const applyMut = useMutation({
    mutationFn: () => applyCostBatch(batch.id),
    onSuccess: async (n) => {
      setConfirmApply(false);
      toast.success(
        batch.stockMode === "receive"
          ? `${n} produit(s) mis à jour et entrés en stock.`
          : `${n} produit(s) mis à jour. Le stock n'a pas été touché.`,
      );
      await refresh();
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.productInventory(batch.storeId) });
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const revertMut = useMutation({
    mutationFn: () => revertBatchPrices(batch.id),
    onSuccess: async (n) => {
      setConfirmRevert(false);
      toast.success(
        n > 0
          ? `${n} produit(s) remis à leurs anciens prix. Le stock reçu n'a pas bougé.`
          : "Aucun prix restauré : ils ont tous été modifiés depuis.",
      );
      await refresh();
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  /** Bascule « appliquer le prix de vente » sans rouvrir le dialogue complet. */
  function toggleApplySale(line: ComputedLine, next: boolean) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) return;
    itemMut.mutate({
      id: item.id,
      batchId: batch.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      weightKg: item.weightKg,
      volumeM3: item.volumeM3,
      manualShare: item.manualShare,
      marginMode: item.marginMode,
      marginValue: item.marginValue,
      applySalePrice: next,
    });
  }

  const busy =
    itemMut.isPending ||
    chargeMut.isPending ||
    itemDeleteMut.isPending ||
    chargeDeleteMut.isPending ||
    importMut.isPending;

  const queryError = itemsQ.error ?? chargesQ.error ?? computeQ.error;

  return (
    <div className="pb-24 min-[1024px]:pb-0">
      {/* En-tête de l'arrivage */}
      <LcCard padding="p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour à la liste des arrivages"
            className="fs-touch-target -ml-1 shrink-0 rounded-md p-1.5 text-neutral-600 hover:bg-black/5"
          >
            <MdArrowBack className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-bold text-fs-text sm:text-base">
                {batch.label}
              </h2>
              <StatusChip batch={batch} />
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-600 sm:text-xs">
              {batch.storeName}
              {batch.supplierName ? ` · ${batch.supplierName}` : ""}
              {batch.reference ? ` · ${batch.reference}` : ""}
              {batch.receivedAt ? ` · reçu le ${formatDateFr(batch.receivedAt)}` : ""}
              {batch.currencyCode !== "XOF"
                ? ` · ${batch.currencyCode} (1 = ${formatQuantity(batch.exchangeRate)} F)`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canManage ? (
              <button
                type="button"
                onClick={onDuplicate}
                aria-label="Refaire un arrivage identique"
                title="Refaire un arrivage identique"
                className="fs-touch-target rounded-md p-1.5 text-neutral-500 hover:bg-black/5"
              >
                <MdContentCopy className="h-4 w-4" />
              </button>
            ) : null}
            {editable ? (
              <button
                type="button"
                onClick={onEditSettings}
                aria-label="Réglages de l'arrivage"
                title="Réglages de l'arrivage"
                className="fs-touch-target rounded-md p-1.5 text-neutral-500 hover:bg-black/5"
              >
                <MdSettings className="h-4 w-4" />
              </button>
            ) : null}
            {canManage && batch.status !== "applied" ? (
              <button
                type="button"
                onClick={onDeleteBatch}
                aria-label="Supprimer l'arrivage"
                title="Supprimer l'arrivage"
                className="fs-touch-target rounded-md p-1.5 text-neutral-500 hover:bg-red-500/10 hover:text-red-600"
              >
                <MdDelete className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Le rappel qui évite le double comptage de stock. */}
        <p className="mt-3 flex gap-2 rounded-md bg-fs-surface-container/70 px-2.5 py-2 text-[11px] leading-relaxed text-neutral-600 dark:bg-white/4">
          <MdInfoOutline className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          <span>
            {batch.stockMode === "receive"
              ? "En appliquant, les quantités entreront en stock et les prix seront mis à jour."
              : "Le stock a déjà été saisi ailleurs : appliquer ne changera que les prix."}{" "}
            {batch.costingMethod === "weighted_average"
              ? "Le nouveau prix d'achat sera la moyenne pondérée avec l'ancien stock."
              : "Le nouveau prix d'achat sera celui de cet arrivage seul."}
          </span>
        </p>

        <LandedCostGuideButton onClick={onOpenGuide} className="mt-2.5" />
      </LcCard>

      {queryError ? (
        <FsQueryErrorPanel
          error={queryError}
          onRetry={() => {
            void itemsQ.refetch();
            void chargesQ.refetch();
            void computeQ.refetch();
          }}
          className="mt-3"
        />
      ) : null}

      {/* 1. Les produits commandés */}
      <section className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <FsSectionLabel>1. Marchandise commandée</FsSectionLabel>
          {editable ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setImportOpen((v) => !v)}
                className="fs-touch-target inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-fs-card px-2.5 py-1.5 text-xs font-semibold text-neutral-700"
              >
                <MdDownload className="h-4 w-4" aria-hidden />
                Reprendre un achat
              </button>
              <button
                type="button"
                onClick={() => setItemDialog({ open: true, editing: null })}
                className="fs-touch-target inline-flex items-center gap-1 rounded-md bg-fs-accent px-2.5 py-1.5 text-xs font-semibold text-white"
              >
                <MdAdd className="h-4 w-4" aria-hidden />
                Produit
              </button>
            </div>
          ) : null}
        </div>

        {importOpen && editable ? (
          <LcCard className="mt-2" padding="p-3">
            <p className="text-xs leading-relaxed text-neutral-600">
              Reprenez les lignes d&apos;un achat déjà saisi plutôt que de tout retaper.
              L&apos;arrivage passera alors en « prix seulement » — la marchandise ne sera pas
              comptée deux fois.
            </p>
            {importableQ.isLoading ? (
              <p className="mt-2 text-xs text-neutral-500">Chargement des achats…</p>
            ) : (importableQ.data ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                Aucun achat enregistré pour cette boutique.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {(importableQ.data ?? []).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={importMut.isPending}
                      onClick={() => importMut.mutate(p.id)}
                      className="fs-touch-target w-full truncate rounded-md border border-black/[0.08] px-2.5 py-2 text-left text-xs font-medium text-neutral-800 hover:border-fs-accent/40 disabled:opacity-60"
                    >
                      {p.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </LcCard>
        ) : null}

        {items.length === 0 ? (
          <LcCard className="mt-2" padding="p-4">
            <p className="text-sm font-semibold text-fs-text">Aucun produit pour l&apos;instant</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              Ajoutez ce que vous avez commandé, avec le prix payé au fournisseur. Les frais
              viennent à l&apos;étape suivante.
            </p>
          </LcCard>
        ) : (
          <LcCard className="mt-2" padding="p-0">
            <ul className="divide-y divide-black/[0.05]">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fs-text">{it.productName}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {formatQuantity(it.quantity)} × {formatCost(it.unitPrice)}
                      {batch.currencyCode !== "XOF" ? ` ${batch.currencyCode}` : ""}
                      {it.marginMode ? " · marge propre" : ""}
                      {it.applySalePrice ? "" : " · prix de vente conservé"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-fs-text">
                    {formatCost(it.quantity * it.unitPrice * batch.exchangeRate)}
                  </span>
                  {editable ? (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => setItemDialog({ open: true, editing: it })}
                        aria-label={`Modifier ${it.productName}`}
                        className="fs-touch-target rounded-md p-1.5 text-neutral-500 hover:bg-black/5"
                      >
                        <MdEdit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemToDelete(it)}
                        aria-label={`Retirer ${it.productName}`}
                        className="fs-touch-target rounded-md p-1.5 text-neutral-500 hover:bg-red-500/10 hover:text-red-600"
                      >
                        <MdDelete className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </LcCard>
        )}
      </section>

      {/* 2. Les frais d'approche */}
      <section className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <FsSectionLabel>2. Frais d&apos;approche</FsSectionLabel>
          {editable ? (
            <button
              type="button"
              onClick={() => setChargeDialog({ open: true, editing: null })}
              className="fs-touch-target inline-flex items-center gap-1 rounded-md bg-fs-accent px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              <MdAdd className="h-4 w-4" aria-hidden />
              Frais
            </button>
          ) : null}
        </div>

        {charges.length === 0 ? (
          <LcCard className="mt-2" padding="p-4">
            <div className="flex gap-2">
              <MdLocalShipping className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fs-text">Aucun frais saisi</p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                  Transport, douane, manutention, magasinage… Sans eux, le prix de revient
                  affiché sera celui de la facture du fournisseur — donc faux.
                </p>
              </div>
            </div>
          </LcCard>
        ) : (
          <LcCard className="mt-2" padding="p-0">
            <ul className="divide-y divide-black/[0.05]">
              {charges.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fs-text">{c.label}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {chargeKindLabel(c.kind)} · réparti{" "}
                      {allocationLabel(c.allocationMethod, batch.allocationMethod).toLowerCase()}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-fs-text">
                    {formatCost(c.amount * batch.exchangeRate)}
                  </span>
                  {editable ? (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => setChargeDialog({ open: true, editing: c })}
                        aria-label={`Modifier ${c.label}`}
                        className="fs-touch-target rounded-md p-1.5 text-neutral-500 hover:bg-black/5"
                      >
                        <MdEdit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setChargeToDelete(c)}
                        aria-label={`Supprimer ${c.label}`}
                        className="fs-touch-target rounded-md p-1.5 text-neutral-500 hover:bg-red-500/10 hover:text-red-600"
                      >
                        <MdDelete className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </LcCard>
        )}
      </section>

      {/* 3. Le résultat */}
      {lines.length > 0 ? (
        <section className="mt-5">
          <FsSectionLabel>3. Prix de revient et prix de vente</FsSectionLabel>

          {alerts.length > 0 ? (
            <LcCard
              className="mt-2 border-amber-500/30 bg-amber-500/[0.06]"
              padding="p-3"
            >
              <div className="flex gap-2">
                <MdWarningAmber
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fs-text">
                    {alerts.length} ligne(s) à regarder avant d&apos;appliquer
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {alerts.slice(0, 4).map(({ line, flag }) => (
                      <li key={line.itemId} className="text-[11px] leading-relaxed text-neutral-700">
                        <span className="font-semibold text-fs-text">{line.productName}</span> —{" "}
                        {flag?.detail}
                      </li>
                    ))}
                  </ul>
                  {alerts.length > 4 ? (
                    <p className="mt-1 text-[11px] text-neutral-600">
                      … et {alerts.length - 4} autre(s) dans le tableau.
                    </p>
                  ) : null}
                </div>
              </div>
            </LcCard>
          ) : null}

          <div className="mt-2">
            <ResultTable
              lines={lines}
              batch={batch}
              editable={editable}
              onEdit={(l) => {
                const item = items.find((i) => i.id === l.itemId);
                if (item) setItemDialog({ open: true, editing: item });
              }}
              onToggleApplySale={toggleApplySale}
              onShowHistory={(l) => setHistory({ id: l.productId, name: l.productName })}
            />
          </div>

          {/* Pied de page chiffré */}
          <LcCard className="mt-3" padding="p-3 sm:p-4">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div className="divide-y divide-black/[0.05]">
                <TotalRow label="Marchandise" value={formatCost(totals.goods)} />
                <TotalRow
                  label="Frais d'approche"
                  value={formatCost(totals.charges)}
                  hint={
                    totals.landed > 0
                      ? `${formatPercent(totals.chargesRate)} du coût total`
                      : undefined
                  }
                />
                <TotalRow
                  label="Prix de revient total"
                  value={formatCost(totals.landed)}
                  strong
                />
              </div>
              <div className="divide-y divide-black/[0.05]">
                <TotalRow
                  label="Vente attendue"
                  value={formatCost(totals.expectedRevenue)}
                  hint="Si tout part au prix conseillé"
                />
                <TotalRow
                  label="Bénéfice attendu"
                  value={formatCost(totals.expectedMargin)}
                  hint={
                    totals.expectedRevenue > 0
                      ? `${formatPercent(
                          (totals.expectedMargin / totals.expectedRevenue) * 100,
                        )} du chiffre d'affaires`
                      : undefined
                  }
                  strong
                />
              </div>
            </div>
          </LcCard>
        </section>
      ) : null}

      {/* Barre d'action — collante sur mobile, dans le flux sur grand écran. Le décalage
          bas reprend celui de la barre de navigation du shell : 4,75rem + zone sûre. */}
      {canManage ? (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+max(0.75rem,var(--fs-safe-bottom)))] z-30 border-t border-black/[0.06] bg-fs-surface/95 px-3 py-2.5 backdrop-blur-sm min-[1024px]:static min-[1024px]:mt-4 min-[1024px]:border-0 min-[1024px]:bg-transparent min-[1024px]:px-0 min-[1024px]:backdrop-blur-none">
          {batch.status === "draft" ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 min-[1024px]:hidden">
                <p className="text-[11px] text-neutral-500">Prix de revient</p>
                <p className="truncate text-sm font-bold text-fs-text">
                  {formatCost(totals.landed)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmApply(true)}
                disabled={lines.length === 0 || applyMut.isPending}
                className="fs-touch-target inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-fs-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 min-[1024px]:flex-none"
              >
                <MdCheckCircle className="h-4 w-4" aria-hidden />
                {applyMut.isPending ? "Application…" : "Appliquer les prix"}
              </button>
              {batch.status === "draft" && lines.length > 0 ? (
                <button
                  type="button"
                  onClick={onCancelBatch}
                  className="hidden rounded-md border border-black/[0.08] bg-fs-card px-4 py-3 text-sm font-semibold text-neutral-700 min-[1024px]:inline-flex"
                >
                  Abandonner
                </button>
              ) : null}
            </div>
          ) : batch.status === "applied" ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-neutral-600">
                {batch.pricesRevertedAt
                  ? "Les prix de cet arrivage ont été remis à leur valeur d'avant."
                  : "Prix appliqués. Le retour en arrière ne touche que les prix — le stock reçu reste en place."}
              </p>
              {batch.pricesRevertedAt ? null : (
                <button
                  type="button"
                  onClick={() => setConfirmRevert(true)}
                  disabled={revertMut.isPending}
                  className="fs-touch-target inline-flex items-center gap-2 rounded-md border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-60"
                >
                  <MdUndo className="h-4 w-4" aria-hidden />
                  {revertMut.isPending ? "Restauration…" : "Remettre les anciens prix"}
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-neutral-600">
              Arrivage abandonné — conservé pour l&apos;historique.
            </p>
          )}
        </div>
      ) : null}

      {/* Dialogues — montés à l'ouverture seulement : la `key` garantit un formulaire
          neuf à chaque cible, sans effet de remise à zéro. */}
      {itemDialog.open ? (
        <ItemFormDialog
          key={itemDialog.editing?.id ?? "new-item"}
          editing={itemDialog.editing}
          products={productsQ.data ?? []}
          usedMethods={usedMethods}
          currencyCode={batch.currencyCode}
          batchMarginMode={batch.marginMode}
          batchMarginValue={batch.marginValue}
          stockMode={batch.stockMode}
          busy={itemMut.isPending}
          onClose={() => setItemDialog({ open: false, editing: null })}
          onSubmit={(v) =>
            itemMut.mutate({
              id: itemDialog.editing?.id ?? null,
              batchId: batch.id,
              ...v,
            })
          }
        />
      ) : null}

      {chargeDialog.open ? (
        <ChargeFormDialog
          key={chargeDialog.editing?.id ?? "new-charge"}
          editing={chargeDialog.editing}
          batchAllocation={batch.allocationMethod}
          currencyCode={batch.currencyCode}
          busy={chargeMut.isPending}
          onClose={() => setChargeDialog({ open: false, editing: null })}
          onSubmit={(v) =>
            chargeMut.mutate({
              id: chargeDialog.editing?.id ?? null,
              batchId: batch.id,
              ...v,
            })
          }
        />
      ) : null}

      {history ? (
        <PriceHistoryDialog
          key={history.id}
          productId={history.id}
          productName={history.name}
          onClose={() => setHistory(null)}
        />
      ) : null}

      <FsConfirmDialog
        open={itemToDelete != null}
        title="Retirer ce produit ?"
        message={`« ${itemToDelete?.productName ?? ""} » sortira de cet arrivage. Les frais seront redistribués sur les lignes restantes.`}
        confirmLabel="Retirer"
        tone="danger"
        busy={itemDeleteMut.isPending}
        onCancel={() => setItemToDelete(null)}
        onConfirm={() => itemToDelete && itemDeleteMut.mutate(itemToDelete.id)}
      />

      <FsConfirmDialog
        open={chargeToDelete != null}
        title="Supprimer ce frais ?"
        message={`« ${chargeToDelete?.label ?? ""} » ne sera plus réparti. Le prix de revient de chaque article baissera d'autant.`}
        confirmLabel="Supprimer"
        tone="danger"
        busy={chargeDeleteMut.isPending}
        onCancel={() => setChargeToDelete(null)}
        onConfirm={() => chargeToDelete && chargeDeleteMut.mutate(chargeToDelete.id)}
      />

      <FsConfirmDialog
        open={confirmApply}
        title="Appliquer cet arrivage ?"
        message={
          <>
            <p>
              {batch.stockMode === "receive"
                ? `${formatQuantity(totals.quantity)} article(s) vont entrer en stock dans « ${batch.storeName} ».`
                : "Le stock ne sera pas touché (il a déjà été saisi ailleurs)."}
            </p>
            <p className="mt-2">
              {lines.filter((l) => l.applySalePrice).length} produit(s) verront leur prix de
              vente mis à jour, {lines.length} verront leur prix d&apos;achat passer au coût de
              revient.
            </p>
            {alerts.length > 0 ? (
              <p className="mt-2 font-semibold text-amber-700 dark:text-amber-300">
                {alerts.length} ligne(s) signalée(s) — vérifiez-les avant de continuer.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-neutral-500">
              Les anciens prix sont conservés : vous pourrez revenir en arrière.
            </p>
          </>
        }
        confirmLabel="Appliquer"
        busy={applyMut.isPending}
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => applyMut.mutate()}
      />

      <FsConfirmDialog
        open={confirmRevert}
        title="Remettre les anciens prix ?"
        message={
          "Les prix d'achat et de vente reviendront à leur valeur d'avant cet arrivage. " +
          "Le stock reçu ne bouge pas. Les produits dont le prix a changé depuis seront laissés tels quels."
        }
        confirmLabel="Remettre les anciens prix"
        busy={revertMut.isPending}
        onCancel={() => setConfirmRevert(false)}
        onConfirm={() => revertMut.mutate()}
      />

      {busy ? (
        <span className="sr-only" role="status">
          Enregistrement en cours
        </span>
      ) : null}
    </div>
  );
}

/** Pastille de statut — reprise à l'identique dans la liste et dans le détail. */
export function StatusChip({ batch }: { batch: CostBatch }) {
  const applied = batch.status === "applied";
  const cancelled = batch.status === "cancelled";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold",
        applied
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
          : cancelled
            ? "bg-neutral-500/12 text-neutral-600 dark:text-neutral-300"
            : "bg-amber-500/14 text-amber-700 dark:text-amber-300",
      )}
    >
      {applied ? (
        <MdLock className="h-3 w-3" aria-hidden />
      ) : (
        <MdEdit className="h-3 w-3" aria-hidden />
      )}
      {statusLabel(batch.status)}
      {batch.pricesRevertedAt ? " · annulé" : ""}
    </span>
  );
}
