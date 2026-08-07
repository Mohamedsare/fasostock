"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdAllInclusive,
  MdChevronRight,
  MdEditNote,
  MdInventory2,
  MdLock,
  MdLocalShipping,
  MdSavings,
} from "react-icons/md";
import {
  FsCard,
  FsFab,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  FsStickyMobileActions,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { ROUTES } from "@/lib/config/routes";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  cancelCostBatch,
  deleteCostBatch,
  duplicateCostBatch,
  listCostBatches,
  saveCostBatch,
} from "@/lib/features/landed-cost/api";
import { formatCost, formatDateFr, formatPercent } from "@/lib/features/landed-cost/format";
import type { CostBatch } from "@/lib/features/landed-cost/types";
import { listSuppliers } from "@/lib/features/purchases/api";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { BatchFormDialog } from "./batch-form-dialog";
import { LandedCostGuide, LandedCostGuideButton } from "./landed-cost-guide";
import { BatchWorkspace, StatusChip } from "./batch-workspace";

type Filter = "all" | "draft" | "applied";

const FILTERS: { key: Filter; label: string; icon: typeof MdAllInclusive }[] = [
  { key: "all", label: "Tous", icon: MdAllInclusive },
  { key: "draft", label: "Brouillons", icon: MdEditNote },
  { key: "applied", label: "Appliqués", icon: MdLock },
];

/** Carte chiffrée du bandeau — trois indicateurs suffisent, au-delà on ne les lit plus. */
function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof MdSavings;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <FsCard padding="p-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      </div>
      <p className="mt-2 truncate text-lg font-bold text-fs-text">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-neutral-500">{hint}</p> : null}
    </FsCard>
  );
}

export function LandedCostScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const stores = useMemo(() => ctx.data?.stores ?? [], [ctx.data?.stores]);
  const moduleOn = h?.landedCostOn ?? false;
  const canManage = h?.canLandedCost ?? false;

  const [filter, setFilter] = useState<Filter>("all");
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const [formDialog, setFormDialog] = useState<{ open: boolean; editing: CostBatch | null }>({
    open: false,
    editing: null,
  });
  const [toDelete, setToDelete] = useState<CostBatch | null>(null);
  const [toCancel, setToCancel] = useState<CostBatch | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const enabled = moduleOn && canManage && Boolean(companyId);

  const batchesQ = useQuery({
    queryKey: queryKeys.costBatches(companyId, storeId),
    queryFn: () => listCostBatches({ companyId, storeId }),
    enabled,
    staleTime: 20_000,
  });

  // Chargée d'avance (liste courte, mise en cache) : à l'ouverture du dialogue, le
  // fournisseur déjà associé à l'arrivage doit s'afficher tout de suite, pas après coup.
  const suppliersQ = useQuery({
    queryKey: queryKeys.suppliers(companyId),
    queryFn: () => listSuppliers(companyId),
    enabled,
    staleTime: 5 * 60_000,
  });

  const batches = useMemo(() => batchesQ.data ?? [], [batchesQ.data]);
  const openBatch = useMemo(
    () => batches.find((b) => b.id === openBatchId) ?? null,
    [batches, openBatchId],
  );

  const visible = useMemo(() => {
    if (filter === "all") return batches;
    if (filter === "draft") return batches.filter((b) => b.status === "draft");
    return batches.filter((b) => b.status === "applied");
  }, [batches, filter]);

  /** Indicateurs sur les arrivages APPLIQUÉS : les brouillons ne sont que des hypothèses. */
  const kpi = useMemo(() => {
    const applied = batches.filter((b) => b.status === "applied");
    let goods = 0;
    let charges = 0;
    for (const b of applied) {
      goods += b.goodsTotal;
      charges += b.chargesTotal;
    }
    const landed = goods + charges;
    return {
      count: applied.length,
      drafts: batches.filter((b) => b.status === "draft").length,
      landed,
      charges,
      chargesRate: landed > 0 ? (charges / landed) * 100 : 0,
    };
  }, [batches]);

  async function refreshList() {
    await qc.invalidateQueries({ queryKey: queryKeys.costBatches(companyId, storeId) });
    await qc.invalidateQueries({ queryKey: queryKeys.costBatches(companyId, null) });
  }

  const saveMut = useMutation({
    mutationFn: saveCostBatch,
    onSuccess: async (id) => {
      const wasNew = formDialog.editing == null;
      setFormDialog({ open: false, editing: null });
      await refreshList();
      if (wasNew) {
        setOpenBatchId(id);
        toast.success("Arrivage créé. Ajoutez la marchandise puis les frais.");
      } else {
        toast.success("Réglages enregistrés.");
      }
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCostBatch(id),
    onSuccess: async () => {
      const wasOpen = toDelete?.id === openBatchId;
      setToDelete(null);
      if (wasOpen) setOpenBatchId(null);
      await refreshList();
      toast.success("Arrivage supprimé.");
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelCostBatch(id),
    onSuccess: async () => {
      setToCancel(null);
      await refreshList();
      toast.success("Arrivage abandonné. Aucun prix n'a été touché.");
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => duplicateCostBatch(id),
    onSuccess: async (id) => {
      await refreshList();
      setOpenBatchId(id);
      toast.success("Copie créée. Ajustez les montants qui ont changé.");
    },
    onError: (e) => toastMutationError("prix-revient", e),
  });

  // ── Gardes d'accès ─────────────────────────────────────────────────────────
  if (permLoading || ctx.isLoading) {
    return (
      <FsPage>
        <FsScreenHeader title="Prix de revient" />
        <FsCard padding="p-5">
          <p className="text-sm text-neutral-500">Chargement…</p>
        </FsCard>
      </FsPage>
    );
  }

  if (!moduleOn) {
    return (
      <FsPage>
        <FsScreenHeader title="Prix de revient" />
        <FsCard padding="p-5">
          <p className="text-sm font-bold text-fs-text">Module non activé</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Le module « Prix de revient » répartit vos frais de transport, de douane et de
            manutention sur chaque article, pour connaître ce que la marchandise vous coûte
            vraiment et fixer un prix de vente juste.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Le propriétaire peut l&apos;activer dans Paramètres.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={ROUTES.settings}
              className="inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir les paramètres
              <MdChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <LandedCostGuideButton onClick={() => setGuideOpen(true)} label="À quoi ça sert ?" />
          </div>
        </FsCard>
        {guideOpen ? <LandedCostGuide onClose={() => setGuideOpen(false)} /> : null}
      </FsPage>
    );
  }

  if (!canManage) {
    return (
      <FsPage>
        <FsScreenHeader title="Prix de revient" />
        <FsCard padding="p-5">
          <p className="text-sm font-bold text-fs-text">Accès réservé</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Cette page touche aux prix d&apos;achat et de vente du catalogue. Demandez au
            propriétaire le droit « Gérer le prix de revient » dans Employés.
          </p>
        </FsCard>
      </FsPage>
    );
  }

  // ── Détail d'un arrivage ───────────────────────────────────────────────────
  if (openBatch) {
    return (
      <FsPage>
        <BatchWorkspace
          batch={openBatch}
          companyId={companyId}
          canManage={canManage}
          onBack={() => setOpenBatchId(null)}
          onEditSettings={() => setFormDialog({ open: true, editing: openBatch })}
          onDuplicate={() => duplicateMut.mutate(openBatch.id)}
          onCancelBatch={() => setToCancel(openBatch)}
          onDeleteBatch={() => setToDelete(openBatch)}
          onOpenGuide={() => setGuideOpen(true)}
        />

        {guideOpen ? <LandedCostGuide onClose={() => setGuideOpen(false)} /> : null}

        {formDialog.open ? (
          <BatchFormDialog
            key={formDialog.editing?.id ?? "new-batch"}
            editing={formDialog.editing}
            stores={stores}
            suppliers={suppliersQ.data ?? []}
            defaultStoreId={storeId}
            busy={saveMut.isPending}
            onClose={() => setFormDialog({ open: false, editing: null })}
            onSubmit={(v) => saveMut.mutate({ id: formDialog.editing?.id ?? null, ...v })}
          />
        ) : null}

        <FsConfirmDialog
          open={toDelete != null}
          title="Supprimer cet arrivage ?"
          message={`« ${toDelete?.label ?? ""} », ses lignes et ses frais seront perdus. Aucun prix ni stock n'a été touché par cet arrivage.`}
          confirmLabel="Supprimer"
          tone="danger"
          busy={deleteMut.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => toDelete && deleteMut.mutate(toDelete.id)}
        />

        <FsConfirmDialog
          open={toCancel != null}
          title="Abandonner cet arrivage ?"
          message="Il sera conservé pour l'historique mais ne pourra plus être modifié ni appliqué."
          confirmLabel="Abandonner"
          tone="danger"
          busy={cancelMut.isPending}
          onCancel={() => setToCancel(null)}
          onConfirm={() => toCancel && cancelMut.mutate(toCancel.id)}
        />
      </FsPage>
    );
  }

  // ── Liste des arrivages ────────────────────────────────────────────────────
  return (
    <FsPage>
      <div className="flex items-start justify-between gap-3">
        <FsScreenHeader
          className="min-w-0 flex-1"
          title="Prix de revient"
          subtitle="Répartissez transport, douane et manutention sur chaque article, puis fixez le prix de vente qui vous laisse la marge voulue."
        />
        <LandedCostGuideButton onClick={() => setGuideOpen(true)} className="mt-0.5" />
      </div>

      <div className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-3">
        <KpiCard
          icon={MdInventory2}
          label="Arrivages appliqués"
          value={String(kpi.count)}
          hint={kpi.drafts > 0 ? `${kpi.drafts} brouillon(s) en cours` : "Aucun brouillon"}
        />
        <KpiCard
          icon={MdSavings}
          label="Prix de revient cumulé"
          value={formatCost(kpi.landed)}
          hint="Marchandise + frais"
        />
        <KpiCard
          icon={MdLocalShipping}
          label="Frais d'approche"
          value={formatCost(kpi.charges)}
          hint={
            kpi.landed > 0
              ? `${formatPercent(kpi.chargesRate)} de ce que vous payez`
              : "Aucun frais enregistré"
          }
        />
      </div>

      <FsStickyMobileActions className="mt-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <FsFilterChip
              key={f.key}
              icon={f.icon}
              label={f.label}
              selected={filter === f.key}
              onClick={() => setFilter(f.key)}
            />
          ))}
          <button
            type="button"
            onClick={() => setFormDialog({ open: true, editing: null })}
            className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-lg bg-fs-accent px-3 py-2 text-sm font-semibold text-white min-[900px]:inline-flex"
          >
            <MdAdd className="h-4 w-4" aria-hidden />
            Nouvel arrivage
          </button>
        </div>
      </FsStickyMobileActions>

      {batchesQ.isError ? (
        <FsQueryErrorPanel
          error={batchesQ.error}
          onRetry={() => void batchesQ.refetch()}
          className="mt-3"
        />
      ) : batchesQ.isLoading ? (
        <FsCard className="mt-3" padding="p-5">
          <p className="text-sm text-neutral-500">Chargement des arrivages…</p>
        </FsCard>
      ) : visible.length === 0 ? (
        <FsCard className="mt-3" padding="p-5">
          <p className="text-sm font-bold text-fs-text">
            {batches.length === 0 ? "Votre premier arrivage" : "Aucun arrivage dans ce filtre"}
          </p>
          {batches.length === 0 ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Un arrivage, c&apos;est une commande fournisseur avec tout ce qui s&apos;y
                ajoute : le transport, la douane, la manutention. L&apos;application répartit
                ces frais sur chaque article et vous dit à quel prix vendre pour garder votre
                marge.
              </p>
              <ol className="mt-3 space-y-1.5 text-xs leading-relaxed text-neutral-600">
                <li>
                  <span className="font-semibold text-fs-text">1.</span> Saisissez la
                  marchandise commandée et son prix fournisseur.
                </li>
                <li>
                  <span className="font-semibold text-fs-text">2.</span> Ajoutez les frais
                  payés et choisissez comment les répartir.
                </li>
                <li>
                  <span className="font-semibold text-fs-text">3.</span> Vérifiez les prix
                  conseillés, puis appliquez.
                </li>
              </ol>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormDialog({ open: true, editing: null })}
                  className="fs-touch-target inline-flex items-center gap-2 rounded-xl bg-fs-accent px-5 py-3 text-sm font-semibold text-white"
                >
                  <MdAdd className="h-4 w-4" aria-hidden />
                  Créer un arrivage
                </button>
                <LandedCostGuideButton
                  onClick={() => setGuideOpen(true)}
                  className="px-3 py-3"
                  label="Lire le guide d'abord"
                />
              </div>
            </>
          ) : null}
        </FsCard>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setOpenBatchId(b.id)}
                className="w-full text-left"
              >
                <FsCard
                  className="transition-colors hover:border-fs-accent/30"
                  padding="p-3 sm:p-3.5"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-fs-text">
                          {b.label}
                        </span>
                        <StatusChip batch={b} />
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                        {b.storeName}
                        {b.supplierName ? ` · ${b.supplierName}` : ""}
                        {b.reference ? ` · ${b.reference}` : ""}
                        {` · ${formatDateFr(b.receivedAt ?? b.createdAt)}`}
                      </p>
                    </div>
                    <MdChevronRight
                      className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400"
                      aria-hidden
                    />
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-black/[0.05] pt-2.5">
                    <span className="text-xs text-neutral-500">
                      {b.itemsCount} produit(s)
                    </span>
                    <span className="text-xs text-neutral-500">
                      Marchandise{" "}
                      <span className="font-semibold text-fs-text">
                        {formatCost(b.goodsTotal)}
                      </span>
                    </span>
                    <span className="text-xs text-neutral-500">
                      Frais{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          b.chargesTotal > 0 ? "text-amber-700 dark:text-amber-300" : "text-fs-text",
                        )}
                      >
                        {formatCost(b.chargesTotal)}
                      </span>
                      {b.landedTotal > 0 && b.chargesTotal > 0 ? (
                        <span className="text-neutral-400">
                          {" "}
                          ({formatPercent((b.chargesTotal / b.landedTotal) * 100, 0)})
                        </span>
                      ) : null}
                    </span>
                    <span className="ml-auto text-sm font-bold text-fs-text">
                      {formatCost(b.landedTotal)}
                    </span>
                  </div>
                </FsCard>
              </button>
            </li>
          ))}
        </ul>
      )}

      <FsFab ariaLabel="Nouvel arrivage" onClick={() => setFormDialog({ open: true, editing: null })}>
        <MdAdd className="h-6 w-6" aria-hidden />
      </FsFab>

      {formDialog.open ? (
        <BatchFormDialog
          key={formDialog.editing?.id ?? "new-batch"}
          editing={formDialog.editing}
          stores={stores}
          suppliers={suppliersQ.data ?? []}
          defaultStoreId={storeId}
          busy={saveMut.isPending}
          onClose={() => setFormDialog({ open: false, editing: null })}
          onSubmit={(v) => saveMut.mutate({ id: formDialog.editing?.id ?? null, ...v })}
        />
      ) : null}

      {guideOpen ? <LandedCostGuide onClose={() => setGuideOpen(false)} /> : null}

      <FsConfirmDialog
        open={toDelete != null}
        title="Supprimer cet arrivage ?"
        message={`« ${toDelete?.label ?? ""} », ses lignes et ses frais seront perdus.`}
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMut.mutate(toDelete.id)}
      />
    </FsPage>
  );
}
