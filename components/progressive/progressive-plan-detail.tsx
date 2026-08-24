"use client";

import { useMemo } from "react";
import { productThumbUrl } from "@/lib/utils/product-thumb-url";
import { useQuery } from "@tanstack/react-query";
import {
  MdAddCard,
  MdCancel,
  MdClose,
  MdDeleteForever,
  MdDescription,
  MdEdit,
  MdInventory2,
  MdOutlineReceiptLong,
  MdPrint,
  MdShoppingCart,
  MdUndo,
} from "react-icons/md";
import { queryKeys } from "@/lib/query/query-keys";
import {
  listProgressiveLedger,
  listProgressivePlanItems,
} from "@/lib/features/progressive/api";
import {
  eligibleItems,
  nearlyEligibleItems,
  planGoal,
} from "@/lib/features/progressive/progressive-math";
import {
  progressiveStatusLabels,
  type ProgressiveTerms,
} from "@/lib/features/progressive/progressive-terms";
import {
  PROGRESSIVE_METHOD_LABELS,
  type ProgressiveEligibleItem,
  type ProgressiveLedgerEntry,
  type ProgressivePlan,
} from "@/lib/features/progressive/types";
import type { ProductItem } from "@/lib/features/products/types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

function dateTimeFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: getActiveTimeZone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Fiche complète d'un dossier : progression, articles accessibles avec l'épargne,
 * relevé des mouvements (réimpression de chaque ticket) et actions.
 */
export function ProgressivePlanDetail({
  plan,
  terms,
  businessTypeSlug,
  products,
  stockByProductId,
  onClose,
  onDeposit,
  onRefund,
  onEdit,
  onConvert,
  onConvertSelection,
  onQuote,
  onReprint,
  onCancelPlan,
  onDeletePlan,
}: {
  plan: ProgressivePlan;
  terms: ProgressiveTerms;
  businessTypeSlug: string | null;
  products: ProductItem[];
  stockByProductId: Map<string, number>;
  onClose: () => void;
  onDeposit: () => void;
  onRefund: () => void;
  onEdit: () => void;
  onConvert: (item: ProgressiveEligibleItem) => void;
  /** Le client repart avec TOUTE sa sélection (vente multi-lignes). */
  onConvertSelection: () => void;
  /** Facture proforma A4 de la sélection (impression / PDF / envoi). */
  onQuote: () => void;
  onReprint: (ledgerId: string) => void;
  onCancelPlan: () => void;
  /** Suppression définitive — fourni au propriétaire uniquement. */
  onDeletePlan?: () => void;
}) {
  const ledgerQ = useQuery({
    queryKey: queryKeys.progressiveLedger(plan.id),
    queryFn: () => listProgressiveLedger(plan.id),
    staleTime: 10_000,
  });

  const itemsQ = useQuery({
    queryKey: queryKeys.progressivePlanItems(plan.id),
    queryFn: () => listProgressivePlanItems(plan.id),
    staleTime: 10_000,
  });
  const selection = itemsQ.data ?? [];
  const selectionTotal = selection.reduce((acc, it) => acc + it.lineTotal, 0);
  const selectionCovered = selection.length > 0 && plan.balance + 0.5 >= selectionTotal;

  const eligible = useMemo(
    () => eligibleItems({ balance: plan.balance, products, stockByProductId }),
    [plan.balance, products, stockByProductId],
  );
  const nearly = useMemo(
    () => nearlyEligibleItems({ balance: plan.balance, products, stockByProductId }),
    [plan.balance, products, stockByProductId],
  );

  const goal = planGoal(plan);
  const ratio = goal != null && goal > 0 ? Math.min(1, plan.balance / goal) : 0;
  const isOpen = plan.status === "open";
  const statusLabels = progressiveStatusLabels(businessTypeSlug);

  return (
    <div className="fixed inset-0 z-[76] flex justify-end bg-black/40">
      <button
        type="button"
        className="min-w-0 flex-1 md:min-w-[120px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="flex h-dvh w-full max-w-2xl flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
        {/* En-tête */}
        <div className="shrink-0 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-bold text-fs-text">{plan.clientName}</h3>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    plan.status === "open"
                      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      : plan.status === "converted"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300",
                  )}
                >
                  {statusLabels[plan.status]}
                </span>
              </div>
              <p className="truncate text-xs text-neutral-500">
                {plan.planNumber}
                {plan.clientPhone ? ` · ${plan.clientPhone}` : ""}
                {plan.clientIdNumber
                  ? ` · ${plan.clientIdType ?? "Pièce"} ${plan.clientIdNumber}`
                  : ""}
              </p>
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

          <div className="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_9%,transparent)] p-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                  Épargne disponible
                </p>
                <p className="text-2xl font-extrabold tabular-nums text-fs-text">
                  {formatCurrency(plan.balance)}
                </p>
              </div>
              <div className="text-right text-xs text-neutral-600">
                <p>
                  {plan.depositCount} versement{plan.depositCount > 1 ? "s" : ""} ·{" "}
                  {formatCurrency(plan.totalDeposited)}
                </p>
                {plan.totalRefunded > 0 ? (
                  <p className="text-amber-700">
                    Remboursé : {formatCurrency(plan.totalRefunded)}
                  </p>
                ) : null}
                {plan.convertedSaleNumber ? (
                  <p className="text-emerald-700">Vente {plan.convertedSaleNumber}</p>
                ) : null}
              </div>
            </div>
            {goal != null ? (
              <>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-fs-accent"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-neutral-600">
                  Objectif {formatCurrency(goal)}
                  {plan.targetProductName ? ` — ${plan.targetProductName}` : ""} ·{" "}
                  {Math.round(ratio * 100)} %
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-neutral-600">
                Aucun {terms.singular} choisi pour l&apos;instant — le client épargne librement.
              </p>
            )}
          </div>

          {isOpen ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDeposit}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-fs-accent px-3 text-xs font-bold text-white sm:flex-none sm:px-4"
              >
                <MdAddCard className="h-4 w-4" aria-hidden />
                Nouveau versement
              </button>
              <button
                type="button"
                onClick={onRefund}
                disabled={plan.balance <= 0}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-black/10 px-3 text-xs font-bold text-amber-700 disabled:opacity-40 dark:border-white/10"
              >
                <MdUndo className="h-4 w-4" aria-hidden />
                Rembourser
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-black/10 px-3 text-xs font-bold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
              >
                <MdEdit className="h-4 w-4" aria-hidden />
                Modifier
              </button>
              <button
                type="button"
                onClick={onCancelPlan}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-black/10 px-3 text-xs font-bold text-red-600 dark:border-white/10"
                title={
                  plan.balance > 0
                    ? "Clôture le dossier et rembourse l'épargne au client"
                    : "Clôture le dossier"
                }
              >
                <MdCancel className="h-4 w-4" aria-hidden />
                Annuler
              </button>
              {onDeletePlan ? (
                <button
                  type="button"
                  onClick={onDeletePlan}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-red-500/40 px-3 text-xs font-bold text-red-600"
                  title="Supprimer définitivement (solde remboursé exigé)"
                >
                  <MdDeleteForever className="h-4 w-4" aria-hidden />
                  Supprimer
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.balance > 0 ? (
                <button
                  type="button"
                  onClick={onRefund}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-black/10 px-3 text-xs font-bold text-amber-700 dark:border-white/10"
                >
                  <MdUndo className="h-4 w-4" aria-hidden />
                  Rembourser le reliquat ({formatCurrency(plan.balance)})
                </button>
              ) : null}
              {onDeletePlan && plan.status === "cancelled" ? (
                <button
                  type="button"
                  onClick={onDeletePlan}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-red-500/40 px-3 text-xs font-bold text-red-600"
                >
                  <MdDeleteForever className="h-4 w-4" aria-hidden />
                  Supprimer définitivement
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {/* Sélection du client + facture proforma */}
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                <MdShoppingCart className="h-4 w-4 text-fs-accent" aria-hidden />
                Sélection du client
              </h4>
              <button
                type="button"
                onClick={onQuote}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-fs-accent/50 px-3 text-xs font-bold text-fs-accent"
              >
                <MdDescription className="h-4 w-4" aria-hidden />
                Facture A4
              </button>
            </div>

            {itemsQ.isLoading ? (
              <div className="flex min-h-[60px] items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
              </div>
            ) : selection.length === 0 ? (
              <p className="rounded-xl border border-dashed border-black/15 p-4 text-center text-xs text-neutral-500 dark:border-white/15">
                Aucun {terms.singular} choisi. Utilisez « Modifier » pour composer la sélection
                du client (plusieurs {terms.plural}, quantité et prix convenus).
              </p>
            ) : (
              <>
                <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.07] dark:divide-white/10 dark:border-white/10">
                  {selection.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] px-1.5 text-xs font-bold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                        {it.quantity}×
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-fs-text">{it.label}</p>
                        <p className="truncate text-[11px] text-neutral-500">
                          {formatCurrency(it.unitPrice)} l&apos;unité
                          {it.currentPrice != null &&
                          Math.round(it.currentPrice) !== Math.round(it.unitPrice)
                            ? ` · prix catalogue ${formatCurrency(it.currentPrice)}`
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-fs-text">
                        {formatCurrency(it.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-baseline justify-between gap-2 rounded-lg bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)] px-3 py-2">
                  <span className="text-xs font-semibold text-neutral-600">
                    Total de la sélection
                  </span>
                  <span className="text-base font-extrabold tabular-nums text-fs-accent">
                    {formatCurrency(selectionTotal)}
                  </span>
                </div>
                {isOpen ? (
                  <button
                    type="button"
                    onClick={onConvertSelection}
                    disabled={!selectionCovered}
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-40"
                    title={
                      selectionCovered
                        ? "Enregistrer la vente de toute la sélection"
                        : `Il manque ${formatCurrency(Math.max(0, selectionTotal - plan.balance))} pour toute la sélection`
                    }
                  >
                    <MdInventory2 className="h-4 w-4" aria-hidden />
                    {selectionCovered
                      ? "Remettre toute la sélection au client"
                      : `Il manque ${formatCurrency(Math.max(0, selectionTotal - plan.balance))}`}
                  </button>
                ) : null}
              </>
            )}
          </section>

          {/* Articles accessibles avec l'épargne */}
          {isOpen ? (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                <MdInventory2 className="h-4 w-4 text-emerald-600" aria-hidden />
                Ce que son argent vaut aujourd&apos;hui
              </h4>
              {eligible.length === 0 ? (
                <div className="rounded-xl border border-dashed border-black/15 p-4 text-center text-xs text-neutral-500 dark:border-white/15">
                  L&apos;épargne ne couvre encore aucun {terms.singular} disponible en boutique.
                  {nearly.length > 0 ? (
                    <div className="mt-3 space-y-1.5 text-left">
                      {nearly.map((e) => (
                        <p key={e.productId} className="text-xs text-neutral-600">
                          <span className="font-semibold text-fs-text">{e.name}</span> —
                          il manque{" "}
                          <span className="font-bold text-fs-accent">
                            {formatCurrency(e.missing)}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="mb-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Son épargne couvre {eligible.length}{" "}
                    {eligible.length > 1 ? terms.plural : terms.singular} disponible
                    {eligible.length > 1 ? "s" : ""} — il peut repartir avec dès maintenant.
                  </p>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {eligible.map((e) => (
                      <li
                        key={e.productId}
                        className="flex gap-3 rounded-xl border border-black/[0.07] bg-fs-surface-container/60 p-2.5 dark:border-white/10"
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
                          {e.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={productThumbUrl(e.imageUrl)!}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <MdInventory2 className="h-6 w-6 text-neutral-400" aria-hidden />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-fs-text">{e.name}</p>
                          <p className="text-xs font-semibold tabular-nums text-fs-accent">
                            {formatCurrency(e.price)}
                          </p>
                          <p className="text-[11px] text-neutral-500">{e.stock} en stock</p>
                          <button
                            type="button"
                            onClick={() => onConvert(e)}
                            className="mt-1.5 inline-flex min-h-8 items-center rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white"
                          >
                            {terms.handOverAction}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : null}

          {/* Relevé */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
              <MdOutlineReceiptLong className="h-4 w-4" aria-hidden />
              Relevé des mouvements
            </h4>
            {ledgerQ.isLoading ? (
              <div className="flex min-h-[80px] items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
              </div>
            ) : (ledgerQ.data ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-black/15 p-4 text-center text-xs text-neutral-500 dark:border-white/15">
                Aucun mouvement — enregistrez le premier versement.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(ledgerQ.data ?? []).map((entry) => (
                  <LedgerRow key={entry.id} entry={entry} onReprint={onReprint} />
                ))}
              </ul>
            )}
          </section>

          {plan.notes ? (
            <section>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
                Note interne
              </h4>
              <p className="whitespace-pre-line rounded-xl border border-black/[0.07] p-3 text-sm text-neutral-700 dark:border-white/10 dark:text-neutral-200">
                {plan.notes}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LedgerRow({
  entry,
  onReprint,
}: {
  entry: ProgressiveLedgerEntry;
  onReprint: (ledgerId: string) => void;
}) {
  const isDeposit = entry.kind === "deposit";
  const isSettlement = entry.kind === "settlement";
  return (
    <li className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-fs-surface-container/50 px-3 py-2 dark:border-white/10">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black",
          isDeposit
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : isSettlement
              ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        )}
        aria-hidden
      >
        {isDeposit ? "+" : "−"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold tabular-nums text-fs-text">
          {formatCurrency(entry.amount)}
          {entry.method ? (
            <span className="ml-2 text-[11px] font-medium text-neutral-500">
              {PROGRESSIVE_METHOD_LABELS[entry.method]}
            </span>
          ) : null}
        </p>
        <p className="truncate text-[11px] text-neutral-500">
          {dateTimeFr(entry.createdAt)}
          {entry.receiptNumber ? ` · ${entry.receiptNumber}` : ""}
          {entry.createdByName ? ` · ${entry.createdByName}` : ""}
        </p>
        {entry.note ? (
          <p className="truncate text-[11px] italic text-neutral-500">{entry.note}</p>
        ) : null}
      </div>
      {entry.receiptNumber ? (
        <button
          type="button"
          onClick={() => onReprint(entry.id)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 text-neutral-600 transition-colors hover:border-fs-accent hover:text-fs-accent dark:border-white/10 dark:text-neutral-300"
          aria-label={`Réimprimer le ticket ${entry.receiptNumber}`}
          title="Réimprimer le ticket"
        >
          <MdPrint className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
