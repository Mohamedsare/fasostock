"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAddCard,
  MdCheckCircle,
  MdLock,
  MdPersonAdd,
  MdRefresh,
  MdSavings,
  MdInventory2,
  MdSearch,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { ProgressiveConvertDialog } from "@/components/progressive/progressive-convert-dialog";
import { ProgressiveConvertSelectionDialog } from "@/components/progressive/progressive-convert-selection-dialog";
import { ProgressiveQuoteDialog } from "@/components/progressive/progressive-quote-dialog";
import { ProgressiveMovementDialog } from "@/components/progressive/progressive-movement-dialog";
import { ProgressivePlanDetail } from "@/components/progressive/progressive-plan-detail";
import { ProgressivePlanFormDialog } from "@/components/progressive/progressive-plan-form-dialog";
import { ProgressiveTicketDialog } from "@/components/progressive/progressive-ticket-dialog";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listProducts, listStoreInventory } from "@/lib/features/products/api";
import { filterByStoreCatalog } from "@/lib/features/stores/store-catalog";
import { useStoreCatalog } from "@/lib/features/stores/use-store-catalog";
import {
  cancelProgressivePlan,
  deleteProgressivePlan,
  listProgressivePlans,
} from "@/lib/features/progressive/api";
import {
  cheapestAvailablePrice,
  eligibleItems,
  isPlanReady,
  planGoal,
} from "@/lib/features/progressive/progressive-math";
import {
  progressiveStatusLabels,
  progressiveTerms,
  type ProgressiveTerms,
} from "@/lib/features/progressive/progressive-terms";
import type {
  ProgressiveEligibleItem,
  ProgressivePlan,
} from "@/lib/features/progressive/types";
import { queryKeys } from "@/lib/query/query-keys";
import { ensureStringNumberMap } from "@/lib/utils/string-number-map";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

type StatusFilter = "all" | "ready" | "open" | "converted" | "cancelled";

function statusFilters(handedOverLabel: string): { key: StatusFilter; label: string }[] {
  return [
    { key: "all", label: "Tous" },
    { key: "ready", label: "Prêts" },
    { key: "open", label: "En cours" },
    { key: "converted", label: handedOverLabel },
    { key: "cancelled", label: "Annulés" },
  ];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function daysAgoLabel(iso: string | null): string {
  if (!iso) return "aucun versement";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 31) return `il y a ${days} jours`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

/**
 * Page « Achats Progressifs » : les clients versent de l'argent petit à petit
 * jusqu'à pouvoir prendre un article de la boutique (moto, téléviseur, salon,
 * groupe électrogène…). Chaque versement donne un ticket thermique, et la page
 * signale dès que l'épargne couvre un article disponible en stock.
 */
export function ProgressiveScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const store = ctx.data?.stores.find((s) => s.id === storeId) ?? null;
  const storeEnabled = store?.progressivePurchasesEnabled === true;
  const engineModuleOn = store?.engineSalesEnabled === true;
  const canManage = (h?.canProgressive ?? false) && storeEnabled;
  // Suppression définitive : propriétaire uniquement (le RPC le revérifie).
  const isOwner = h?.isOwner ?? false;
  // Vocabulaire adapté au métier (engin / article / produit) — le module vaut
  // pour toutes les activités, pas seulement la vente de motos.
  const businessTypeSlug = ctx.data?.businessTypeSlug ?? null;
  const terms = progressiveTerms(businessTypeSlug);
  const statusLabels = progressiveStatusLabels(businessTypeSlug);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProgressivePlan | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [movement, setMovement] = useState<{ planId: string; mode: "deposit" | "refund" } | null>(
    null,
  );
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [converting, setConverting] = useState<{
    planId: string;
    item: ProgressiveEligibleItem;
  } | null>(null);
  const [convertingSelection, setConvertingSelection] = useState<string | null>(null);
  const [quotePlanId, setQuotePlanId] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<ProgressivePlan | null>(null);
  const [toDelete, setToDelete] = useState<ProgressivePlan | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const plansQ = useQuery({
    queryKey: queryKeys.progressivePlans({ companyId, storeId }),
    queryFn: () => listProgressivePlans({ companyId, storeId }),
    enabled: !!companyId && canManage,
    staleTime: 10_000,
  });
  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: !!companyId && canManage,
    staleTime: 60_000,
  });
  const stockQ = useQuery({
    queryKey: queryKeys.productInventory(storeId),
    queryFn: () => listStoreInventory(storeId),
    enabled: !!storeId && canManage,
    staleTime: 30_000,
  });

  const { catalog } = useStoreCatalog(storeId);
  const products = useMemo(
    () => filterByStoreCatalog((productsQ.data ?? []).filter((p) => p.is_active), catalog),
    [productsQ.data, catalog],
  );
  // `listStoreInventory` renvoie un objet simple (cache persisté en JSON) → normaliser en `Map`.
  const stockByProductId = useMemo(
    () => ensureStringNumberMap(stockQ.data),
    [stockQ.data],
  );
  const cheapest = useMemo(
    () => cheapestAvailablePrice({ products, stockByProductId }),
    [products, stockByProductId],
  );

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);

  const kpis = useMemo(() => {
    let openCount = 0;
    let held = 0;
    let ready = 0;
    let converted = 0;
    for (const p of plans) {
      held += p.balance;
      if (p.status === "open") openCount += 1;
      if (p.status === "converted") converted += 1;
      if (isPlanReady({ plan: p, cheapestPrice: cheapest })) ready += 1;
    }
    return { openCount, held, ready, converted };
  }, [plans, cheapest]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\s/g, "");
    return plans.filter((p) => {
      if (filter === "ready" && !isPlanReady({ plan: p, cheapestPrice: cheapest })) return false;
      if (filter !== "all" && filter !== "ready" && p.status !== filter) return false;
      if (!q) return true;
      return (
        p.clientName.toLowerCase().includes(q) ||
        p.planNumber.toLowerCase().includes(q) ||
        (p.clientPhone ?? "").replace(/\s/g, "").includes(digits)
      );
    });
  }, [plans, filter, search, cheapest]);

  const detailPlan = plans.find((p) => p.id === detailId) ?? null;
  const movementPlan = plans.find((p) => p.id === movement?.planId) ?? null;
  const convertPlan = plans.find((p) => p.id === converting?.planId) ?? null;
  const selectionPlan = plans.find((p) => p.id === convertingSelection) ?? null;

  function refreshAll(planId?: string) {
    void qc.invalidateQueries({ queryKey: queryKeys.progressivePlans({ companyId, storeId }) });
    if (planId) {
      void qc.invalidateQueries({ queryKey: queryKeys.progressiveLedger(planId) });
      void qc.invalidateQueries({ queryKey: queryKeys.progressivePlanItems(planId) });
    }
  }

  /** Annulation : le solde éventuel est remboursé au client, ticket à la clé. */
  async function confirmCancel() {
    if (!toCancel) return;
    const planId = toCancel.id;
    setActionBusy(true);
    try {
      const res = await cancelProgressivePlan({ planId });
      setToCancel(null);
      setDetailId(null);
      refreshAll(planId);
      if (res.refundLedgerId) {
        toast.success(
          `Dossier annulé — ${formatCurrency(res.refundedAmount)} remboursés au client.`,
        );
        // Ticket de remboursement à remettre au client.
        setTicketId(res.refundLedgerId);
      } else {
        toast.success("Dossier annulé.");
      }
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Annulation impossible."));
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const planId = toDelete.id;
    setActionBusy(true);
    try {
      await deleteProgressivePlan(planId);
      toast.success("Dossier supprimé définitivement.");
      setToDelete(null);
      setDetailId(null);
      refreshAll(planId);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Suppression impossible."));
    } finally {
      setActionBusy(false);
    }
  }

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

  if (!canManage) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Achats Progressifs"
          subtitle="Épargne des clients par versements successifs vers un achat"
        />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-400" aria-hidden />
            <p className="max-w-md text-sm font-medium text-neutral-600">
              {storeEnabled
                ? "Vous n'avez pas le droit de gérer les achats progressifs."
                : "Le module Achats Progressifs n'est pas activé pour cette boutique. Demandez son activation à FasoStock."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 sm:mb-3">
        <FsScreenHeader
          className="mb-0"
          title="Achats Progressifs"
          subtitle={`Versements « petit à petit » jusqu'à ${terms.theSingular} — ${store?.name ?? "boutique"}`}
          titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshAll()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-fs-surface-container text-neutral-600 dark:border-white/10 dark:text-neutral-300"
            aria-label="Actualiser"
          >
            <MdRefresh className={cn("h-5 w-5", plansQ.isFetching && "animate-spin")} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-fs-accent px-3.5 text-xs font-bold text-white shadow-sm sm:text-sm"
          >
            <MdPersonAdd className="h-4.5 w-4.5" aria-hidden />
            Nouveau dossier
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:gap-3 min-[900px]:grid-cols-4">
        <Kpi
          label="Épargne détenue"
          value={formatCurrency(kpis.held)}
          hint="argent des clients en caisse"
          tone="accent"
          icon={<MdSavings className="h-5 w-5" aria-hidden />}
        />
        <Kpi
          label="Dossiers en cours"
          value={String(kpis.openCount)}
          hint={
            cheapest != null
              ? `${terms.singular} le moins cher : ${formatCurrency(cheapest)}`
              : undefined
          }
          icon={<MdAddCard className="h-5 w-5" aria-hidden />}
        />
        <Kpi
          label={`Prêts à prendre un ${terms.singular}`}
          value={String(kpis.ready)}
          hint={`l'épargne couvre un ${terms.singular} en stock`}
          tone="success"
          icon={<MdCheckCircle className="h-5 w-5" aria-hidden />}
        />
        <Kpi
          label={`${terms.pluralCap} remis`}
          value={String(kpis.converted)}
          hint="dossiers convertis en vente"
          icon={<MdInventory2 className="h-5 w-5" aria-hidden />}
        />
      </div>

      {/* Filtres */}
      <FsCard className="mb-3" padding="p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <MdSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              className={fsInputClass("pl-9")}
              placeholder="Rechercher un client, un téléphone, un n° de dossier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {statusFilters(`${terms.pluralCap} remis`).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                  filter === f.key
                    ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                    : "border-black/10 text-neutral-600 hover:bg-black/[0.04] dark:border-white/10 dark:text-neutral-300",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </FsCard>

      {plansQ.isError ? (
        <FsQueryErrorPanel error={plansQ.error} onRetry={() => void plansQ.refetch()} />
      ) : plansQ.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
        </div>
      ) : filtered.length === 0 ? (
        <FsCard padding="p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <MdSavings className="h-12 w-12 text-neutral-300" aria-hidden />
            <p className="text-sm font-semibold text-fs-text">
              {plans.length === 0 ? "Aucun dossier d'épargne" : "Aucun dossier pour ce filtre"}
            </p>
            <p className="max-w-md text-xs text-neutral-500">
              Ouvrez un dossier pour un client qui souhaite payer son achat petit à petit. À
              chaque versement, imprimez-lui son ticket.
            </p>
            {plans.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-fs-accent px-5 text-sm font-bold text-white"
              >
                <MdPersonAdd className="h-5 w-5" aria-hidden />
                Ouvrir le premier dossier
              </button>
            ) : null}
          </div>
        </FsCard>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-2 min-[1400px]:grid-cols-3">
          {filtered.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              ready={isPlanReady({ plan, cheapestPrice: cheapest })}
              terms={terms}
              statusLabels={statusLabels}
              eligibleCount={
                plan.status === "open"
                  ? eligibleItems({ balance: plan.balance, products, stockByProductId }).length
                  : 0
              }
              onOpen={() => setDetailId(plan.id)}
              onDeposit={() => setMovement({ planId: plan.id, mode: "deposit" })}
            />
          ))}
        </ul>
      )}

      {/* Dialogues */}
      <ProgressivePlanFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        companyId={companyId}
        storeId={storeId ?? ""}
        storeName={store?.name ?? ""}
        terms={terms}
        products={products}
        stockByProductId={stockByProductId}
        editing={editing}
        onSaved={(planId, isNew) => {
          refreshAll(planId);
          if (isNew) {
            // Enchaîne directement sur le premier versement (flux caisse).
            setMovement({ planId, mode: "deposit" });
          }
        }}
      />

      {detailPlan ? (
        <ProgressivePlanDetail
          plan={detailPlan}
          terms={terms}
          businessTypeSlug={businessTypeSlug}
          products={products}
          stockByProductId={stockByProductId}
          onClose={() => setDetailId(null)}
          onDeposit={() => setMovement({ planId: detailPlan.id, mode: "deposit" })}
          onRefund={() => setMovement({ planId: detailPlan.id, mode: "refund" })}
          onEdit={() => {
            setEditing(detailPlan);
            setFormOpen(true);
          }}
          onConvert={(item) => setConverting({ planId: detailPlan.id, item })}
          onConvertSelection={() => setConvertingSelection(detailPlan.id)}
          onQuote={() => setQuotePlanId(detailPlan.id)}
          onReprint={(ledgerId) => setTicketId(ledgerId)}
          onCancelPlan={() => setToCancel(detailPlan)}
          onDeletePlan={isOwner ? () => setToDelete(detailPlan) : undefined}
        />
      ) : null}

      {movement && movementPlan ? (
        <ProgressiveMovementDialog
          plan={movementPlan}
          mode={movement.mode}
          onClose={() => setMovement(null)}
          onDone={(ledgerId) => {
            const planId = movementPlan.id;
            setMovement(null);
            refreshAll(planId);
            setTicketId(ledgerId);
          }}
        />
      ) : null}

      {converting && convertPlan ? (
        <ProgressiveConvertDialog
          plan={convertPlan}
          item={converting.item}
          terms={terms}
          engineModuleOn={engineModuleOn}
          onClose={() => setConverting(null)}
          onConverted={(_saleId, residual) => {
            const planId = convertPlan.id;
            setConverting(null);
            refreshAll(planId);
            void qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) });
            if (residual > 0) {
              toast.info(
                `Reliquat de ${formatCurrency(residual)} à rembourser au client depuis le dossier.`,
              );
            }
          }}
        />
      ) : null}

      {selectionPlan ? (
        <ProgressiveConvertSelectionDialog
          plan={selectionPlan}
          terms={terms}
          onClose={() => setConvertingSelection(null)}
          onConverted={(_saleId, residual) => {
            const planId = selectionPlan.id;
            setConvertingSelection(null);
            refreshAll(planId);
            void qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) });
            if (residual > 0) {
              toast.info(
                `Reliquat de ${formatCurrency(residual)} à rembourser au client depuis le dossier.`,
              );
            }
          }}
        />
      ) : null}

      {quotePlanId ? (
        <ProgressiveQuoteDialog planId={quotePlanId} onClose={() => setQuotePlanId(null)} />
      ) : null}

      {ticketId ? (
        <ProgressiveTicketDialog ledgerId={ticketId} onClose={() => setTicketId(null)} />
      ) : null}

      <FsConfirmDialog
        open={toCancel !== null}
        title="Annuler ce dossier ?"
        message={
          toCancel
            ? toCancel.balance > 0
              ? `Le dossier ${toCancel.planNumber} de ${toCancel.clientName} sera clôturé et ses ${formatCurrency(
                  toCancel.balance,
                )} d'épargne seront remboursés au client.

Remettez-lui bien l'argent : le ticket de remboursement s'ouvre juste après pour impression.`
              : `Le dossier ${toCancel.planNumber} de ${toCancel.clientName} sera clôturé. Il n'a plus d'épargne à rembourser.`
            : undefined
        }
        tone="danger"
        confirmLabel={
          toCancel && toCancel.balance > 0
            ? `Rembourser ${formatCurrency(toCancel.balance)} et annuler`
            : "Annuler le dossier"
        }
        cancelLabel="Retour"
        busy={actionBusy}
        onCancel={() => setToCancel(null)}
        onConfirm={() => void confirmCancel()}
      />

      <FsConfirmDialog
        open={toDelete !== null}
        title="Supprimer définitivement ?"
        message={
          toDelete
            ? toDelete.balance > 0
              ? `Impossible pour l'instant : ${toDelete.clientName} a encore ${formatCurrency(
                  toDelete.balance,
                )} d'épargne.

Remboursez-le d'abord (bouton « Rembourser » ou annulation du dossier), puis supprimez.`
              : `Le dossier ${toDelete.planNumber} de ${toDelete.clientName} et ses ${
                  toDelete.depositCount
                } versement${toDelete.depositCount > 1 ? "s" : ""} seront effacés. Cette action est irréversible.`
            : undefined
        }
        tone="danger"
        confirmLabel={
          toDelete && toDelete.balance > 0 ? "Rembourser d'abord" : "Supprimer définitivement"
        }
        cancelLabel="Retour"
        busy={actionBusy}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete && toDelete.balance > 0) {
            // Raccourci : on bascule sur le remboursement du solde.
            const plan = toDelete;
            setToDelete(null);
            setMovement({ planId: plan.id, mode: "refund" });
            return;
          }
          void confirmDelete();
        }}
      />
    </FsPage>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "success";
  icon: React.ReactNode;
}) {
  return (
    <FsCard padding="p-3 sm:p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            tone === "accent"
              ? "bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
              : tone === "success"
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-black/[0.05] text-neutral-500 dark:bg-white/10 dark:text-neutral-300",
          )}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-neutral-500">{label}</p>
          <p
            className={cn(
              "truncate text-lg font-extrabold tabular-nums sm:text-xl",
              tone === "success" ? "text-emerald-600" : "text-fs-text",
            )}
          >
            {value}
          </p>
          {hint ? <p className="truncate text-[11px] text-neutral-400">{hint}</p> : null}
        </div>
      </div>
    </FsCard>
  );
}

function PlanCard({
  plan,
  ready,
  terms,
  statusLabels,
  eligibleCount,
  onOpen,
  onDeposit,
}: {
  plan: ProgressivePlan;
  ready: boolean;
  terms: ProgressiveTerms;
  statusLabels: Record<ProgressivePlan["status"], string>;
  eligibleCount: number;
  onOpen: () => void;
  onDeposit: () => void;
}) {
  const goal = planGoal(plan);
  const ratio = goal != null && goal > 0 ? Math.min(1, plan.balance / goal) : 0;
  const isOpen = plan.status === "open";

  return (
    <li>
      <FsCard
        className={cn(
          "h-full transition-shadow hover:shadow-md",
          ready && "ring-1 ring-emerald-500/40",
        )}
        padding="p-3"
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] text-sm font-black text-fs-accent"
            aria-label={`Ouvrir le dossier de ${plan.clientName}`}
          >
            {initials(plan.clientName)}
          </button>
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-bold text-fs-text">{plan.clientName}</p>
            <p className="truncate text-[11px] text-neutral-500">
              {plan.planNumber}
              {plan.clientPhone ? ` · ${plan.clientPhone}` : ""}
            </p>
          </button>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              isOpen
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                : plan.status === "converted"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300",
            )}
          >
            {statusLabels[plan.status]}
          </span>
        </div>

        <button type="button" onClick={onOpen} className="mt-3 block w-full text-left">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-extrabold tabular-nums text-fs-text">
              {formatCurrency(plan.balance)}
            </span>
            {goal != null ? (
              <span className="text-[11px] text-neutral-500">
                / {formatCurrency(goal)} · {Math.round(ratio * 100)} %
              </span>
            ) : (
              <span className="text-[11px] text-neutral-400">{terms.singular} non choisi</span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                ready ? "bg-emerald-500" : "bg-fs-accent",
              )}
              style={{ width: `${goal != null ? Math.round(ratio * 100) : ready ? 100 : 8}%` }}
            />
          </div>
          <p className="mt-1.5 truncate text-[11px] text-neutral-500">
            {plan.depositCount} versement{plan.depositCount > 1 ? "s" : ""} ·{" "}
            {daysAgoLabel(plan.lastDepositAt)}
            {plan.targetProductName ? ` · vise ${plan.targetProductName}` : ""}
          </p>
        </button>

        {ready ? (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
            <MdCheckCircle className="h-4 w-4 shrink-0" aria-hidden />
            Son argent vaut déjà {eligibleCount}{" "}
            {eligibleCount > 1 ? terms.plural : terms.singular} en boutique
          </p>
        ) : null}

        {isOpen ? (
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={onDeposit}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-fs-accent px-3 text-xs font-bold text-white"
            >
              <MdAddCard className="h-4 w-4" aria-hidden />
              Versement
            </button>
            <button
              type="button"
              onClick={onOpen}
              className={cn(
                "inline-flex min-h-9 items-center justify-center rounded-lg border px-3 text-xs font-bold",
                ready
                  ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-300"
                  : "border-black/10 text-neutral-600 dark:border-white/10 dark:text-neutral-300",
              )}
            >
              {ready ? `Voir les ${terms.plural}` : "Détails"}
            </button>
          </div>
        ) : null}
      </FsCard>
    </li>
  );
}
