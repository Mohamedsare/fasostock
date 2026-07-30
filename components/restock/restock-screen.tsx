"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAutoAwesome,
  MdCheckCircle,
  MdInfoOutline,
  MdInventory2,
  MdLock,
  MdRefresh,
  MdShoppingCart,
} from "react-icons/md";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
} from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { fetchRestockAdvice, listRestockCandidates } from "@/lib/features/restock/api";
import {
  RESTOCK_URGENCY_LABELS,
  type RestockAdvice,
  type RestockCandidate,
  type RestockUrgency,
} from "@/lib/features/restock/types";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { RestockOrderDialog } from "./restock-order-dialog";

/** Fenêtres d'analyse proposées — libellés parlants plutôt que « p_days ». */
const PERIODS: { days: number; label: string }[] = [
  { days: 14, label: "14 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "3 mois" },
];

/** Durée que la commande doit couvrir. */
const COVERS: { days: number; label: string }[] = [
  { days: 15, label: "15 j" },
  { days: 30, label: "1 mois" },
  { days: 60, label: "2 mois" },
];

function urgencyPillClass(u: RestockUrgency): string {
  switch (u) {
    case "rupture":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "critique":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    default:
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  }
}

function coverLabel(c: RestockCandidate): string {
  if (c.stock <= 0) return "stock épuisé";
  if (c.coverDays == null) return "couverture inconnue";
  if (c.coverDays < 1) return "moins d'un jour de stock";
  return `${Math.round(c.coverDays)} jour(s) de stock`;
}

export function RestockScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const stores = useMemo(
    () => (ctx.data?.stores ?? []).map((s) => ({ id: s.id, name: s.name })),
    [ctx.data?.stores],
  );
  const canView = h?.canRestock ?? false;
  const moduleOn = h?.restockModuleOn ?? false;

  const [days, setDays] = useState(30);
  const [coverDays, setCoverDays] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * Quantités MODIFIÉES seulement (par le gérant ou par l'IA). Les autres lignes
   * suivent le calcul statistique : pas de copie d'état à resynchroniser quand la
   * période change, donc jamais de quantité périmée affichée.
   */
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [advice, setAdvice] = useState<RestockAdvice | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);

  const enabled = !!companyId && canView && moduleOn;

  const candidatesQ = useQuery({
    queryKey: queryKeys.restockCandidates({ companyId, storeId, days, coverDays }),
    queryFn: () => listRestockCandidates({ companyId, storeId, days, coverDays }),
    enabled,
    staleTime: 60_000,
  });

  const candidates = useMemo(() => candidatesQ.data ?? [], [candidatesQ.data]);

  /** Quantité affichée pour une ligne : la valeur modifiée, sinon le calcul. */
  function qtyOf(c: RestockCandidate): number {
    return qtyOverrides[c.productId] ?? c.suggestedQty;
  }

  /**
   * Changer de période change tous les chiffres : l'avis de l'IA et les quantités
   * ajustées portaient sur les anciens, on repart proprement du calcul.
   */
  function resetForNewPeriod() {
    setAdvice(null);
    setQtyOverrides({});
    setSelected(new Set());
  }

  const adviceById = useMemo(() => {
    const m = new Map<string, RestockAdvice["items"][number]>();
    for (const i of advice?.items ?? []) m.set(i.productId, i);
    return m;
  }, [advice]);

  const adviceMut = useMutation({
    mutationFn: () => fetchRestockAdvice({ companyId, storeId, days, coverDays }),
    onSuccess: (res) => {
      setAdvice(res);
      // On applique les quantités conseillées par l'IA aux lignes concernées.
      setQtyOverrides((prev) => {
        const next = { ...prev };
        for (const i of res.items) {
          if (i.quantity > 0) next[i.productId] = i.quantity;
        }
        return next;
      });
      toast.success("Quantités conseillées mises à jour par l'IA.");
    },
    onError: (e) =>
      toast.error(
        messageFromUnknownError(
          e,
          "L'avis de l'IA n'a pas pu être obtenu. Les quantités calculées restent utilisables.",
        ),
      ),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(candidates.map((c) => c.productId)));
  }

  function selectUrgent() {
    setSelected(
      new Set(
        candidates
          .filter((c) => c.urgency === "rupture" || c.urgency === "critique")
          .map((c) => c.productId),
      ),
    );
  }

  const orderLines = useMemo(
    () =>
      candidates
        .filter((c) => selected.has(c.productId))
        .map((c) => ({
          productId: c.productId,
          productName: c.productName,
          quantity: Math.max(1, qtyOverrides[c.productId] ?? c.suggestedQty),
          unitPrice: c.lastPurchasePrice ?? c.purchasePrice,
        })),
    [candidates, selected, qtyOverrides],
  );

  const estimatedCost = useMemo(
    () => orderLines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0),
    [orderLines],
  );

  const kpis = useMemo(() => {
    let rupture = 0;
    let critique = 0;
    for (const c of candidates) {
      if (c.urgency === "rupture") rupture += 1;
      else if (c.urgency === "critique") critique += 1;
    }
    return { total: candidates.length, rupture, critique };
  }, [candidates]);

  if (permLoading || ctx.isLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
        </div>
      </FsPage>
    );
  }

  if (!moduleOn || !canView) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Réassort"
          subtitle="Ce qui se vend bien et qui va manquer"
        />
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              {moduleOn
                ? "Vous n'avez pas accès à cette section."
                : "Le module Réassort n'est pas activé pour cette boutique."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Réassort"
        subtitle="Vos meilleures ventes dont le stock descend — avec la quantité à commander, calculée sur vos ventes passées"
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
      />

      <div className="mb-3 grid grid-cols-3 gap-2 sm:gap-3">
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-3 sm:p-4">
          <p className="text-xs text-neutral-500">À recommander</p>
          <p className="mt-1 text-xl font-bold text-fs-text">{kpis.total}</p>
        </FsCard>
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-3 sm:p-4">
          <p className="text-xs text-neutral-500">En rupture</p>
          <p className="mt-1 text-xl font-bold text-red-600">{kpis.rupture}</p>
        </FsCard>
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-3 sm:p-4">
          <p className="text-xs text-neutral-500">Critiques</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{kpis.critique}</p>
        </FsCard>
      </div>

      <FsCard className="mb-3 rounded-sm sm:rounded-sm" padding="p-3 sm:p-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Ventes analysées
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <FsFilterChip
              key={p.days}
              icon={MdInventory2}
              label={p.label}
              selected={days === p.days}
              onClick={() => {
                setDays(p.days);
                resetForNewPeriod();
              }}
            />
          ))}
        </div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Commander pour tenir
        </p>
        <div className="flex flex-wrap gap-2">
          {COVERS.map((c) => (
            <FsFilterChip
              key={c.days}
              icon={MdShoppingCart}
              label={c.label}
              selected={coverDays === c.days}
              onClick={() => {
                setCoverDays(c.days);
                resetForNewPeriod();
              }}
            />
          ))}
        </div>
      </FsCard>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void candidatesQ.refetch()}
          className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-black/10 bg-fs-surface-container px-3 text-sm font-semibold dark:border-white/10"
        >
          <MdRefresh
            className={cn("h-4 w-4", candidatesQ.isFetching && "animate-spin")}
            aria-hidden
          />
          Actualiser
        </button>
        <button
          type="button"
          onClick={() => adviceMut.mutate()}
          disabled={adviceMut.isPending || candidates.length === 0}
          className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-linear-to-r from-fuchsia-600 to-fs-accent px-4 text-sm font-bold text-white disabled:opacity-40"
        >
          <MdAutoAwesome
            className={cn("h-5 w-5", adviceMut.isPending && "animate-pulse")}
            aria-hidden
          />
          {adviceMut.isPending ? "L'IA calcule…" : "Combien commander ? (IA)"}
        </button>
        <div className="ms-auto flex gap-2">
          <button
            type="button"
            onClick={selectUrgent}
            className="inline-flex h-10 items-center rounded-sm border border-black/10 px-3 text-xs font-bold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
          >
            Cocher les urgents
          </button>
          <button
            type="button"
            onClick={selectAll}
            className="inline-flex h-10 items-center rounded-sm border border-black/10 px-3 text-xs font-bold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
          >
            Tout cocher
          </button>
        </div>
      </div>

      {advice?.summary ? (
        <FsCard
          className="mb-3 rounded-sm border-fuchsia-500/20 sm:rounded-sm"
          padding="p-3 sm:p-4"
        >
          <div className="flex items-start gap-2.5">
            <MdAutoAwesome className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-400">
                Avis de l&apos;IA
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-fs-text">
                {advice.summary}
              </p>
            </div>
          </div>
        </FsCard>
      ) : null}

      {candidatesQ.isError ? (
        <FsQueryErrorPanel
          error={candidatesQ.error}
          onRetry={() => void candidatesQ.refetch()}
        />
      ) : (
        <FsCard className="overflow-hidden rounded-sm p-0 sm:rounded-sm" padding="p-0">
          {candidatesQ.isLoading ? (
            <div className="flex justify-center py-16">
              <div
                className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                aria-hidden
              />
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <MdCheckCircle className="h-10 w-10 text-emerald-500" aria-hidden />
              <p className="max-w-sm text-sm text-neutral-600">
                Rien à recommander sur cette période : vos produits qui se vendent ont
                encore assez de stock.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-black/6 dark:divide-white/6">
              {candidates.map((c) => {
                const on = selected.has(c.productId);
                const qty = qtyOf(c);
                const ai = adviceById.get(c.productId);
                return (
                  <li key={c.productId} className={cn("p-3 sm:p-4", on && "bg-fs-accent/4")}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(c.productId)}
                        className="mt-1 h-4 w-4 shrink-0 accent-fs-accent"
                        aria-label={`Sélectionner ${c.productName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-fs-text">
                            {c.productName}
                          </span>
                          <span
                            className={cn(
                              "rounded-sm px-2 py-0.5 text-[11px] font-bold",
                              urgencyPillClass(c.urgency),
                            )}
                          >
                            {RESTOCK_URGENCY_LABELS[c.urgency]}
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-neutral-500">
                          Vendu {c.soldQty} sur {days} j ({c.dailyRate}/jour) · stock{" "}
                          {c.stock} {c.unit} · {coverLabel(c)}
                        </p>

                        {c.supplierName ? (
                          <p className="mt-0.5 truncate text-xs text-neutral-500">
                            Dernier fournisseur : {c.supplierName}
                          </p>
                        ) : null}

                        {ai?.reason ? (
                          <p className="mt-1.5 flex items-start gap-1.5 rounded-sm bg-fuchsia-500/8 px-2 py-1.5 text-xs leading-relaxed text-fuchsia-900 dark:text-fuchsia-200">
                            <MdAutoAwesome className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span>{ai.reason}</span>
                          </p>
                        ) : null}
                      </div>

                      <div className="w-24 shrink-0 text-right sm:w-32">
                        <label className="mb-1 block text-[11px] font-semibold text-neutral-500">
                          À commander
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={qty}
                          onChange={(e) =>
                            setQtyOverrides((prev) => ({
                              ...prev,
                              [c.productId]: Math.max(
                                1,
                                Math.trunc(Number(e.target.value) || 1),
                              ),
                            }))
                          }
                          className="w-full rounded-sm border border-black/10 bg-fs-surface-container px-2 py-1.5 text-right text-sm font-bold text-fs-text outline-none focus:border-fs-accent dark:border-white/10"
                        />
                        <p className="mt-1 text-[11px] text-neutral-500">
                          ≈ {formatCurrency(qty * (c.lastPurchasePrice ?? c.purchasePrice))}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </FsCard>
      )}

      {candidates.length > 0 ? (
        <FsCard className="mt-3 rounded-sm sm:rounded-sm" padding="p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-fs-text">
                {orderLines.length} produit(s) sélectionné(s)
              </p>
              <p className="text-xs text-neutral-500">
                Coût estimé : {formatCurrency(estimatedCost)}
              </p>
            </div>
            <button
              type="button"
              disabled={orderLines.length === 0}
              onClick={() => setOrderOpen(true)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-sm px-5 text-sm font-bold text-white",
                orderLines.length > 0
                  ? "bg-fs-accent"
                  : "cursor-not-allowed bg-neutral-300 text-neutral-500 dark:bg-neutral-700",
              )}
            >
              <MdShoppingCart className="h-5 w-5" aria-hidden />
              Passer la commande
            </button>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
            <MdInfoOutline className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Les quantités viennent de vos ventes réelles sur {days} jours, pour tenir{" "}
              {coverDays} jours. Ajustez-les librement avant de commander.
            </span>
          </p>
        </FsCard>
      ) : null}

      <RestockOrderDialog
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        companyId={companyId}
        stores={stores}
        defaultStoreId={storeId}
        lines={orderLines}
        onOrdered={() => {
          setSelected(new Set());
          void qc.invalidateQueries({ queryKey: ["restock"] });
          void qc.invalidateQueries({ queryKey: ["purchases"] });
        }}
      />
    </FsPage>
  );
}
