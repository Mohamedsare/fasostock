"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdBadge,
  MdDelete,
  MdEdit,
  MdLock,
  MdRefresh,
  MdStorefront,
} from "react-icons/md";
import { FsCard, FsPage, FsScreenHeader } from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listProducts } from "@/lib/features/products/api";
import {
  deletePromotion,
  listPromotions,
  setPromotionActive,
} from "@/lib/features/promotions/api";
import { PROMO_STATUS_LABELS, promotionStatus } from "@/lib/features/promotions/promo-math";
import type { Promotion, PromotionStatus } from "@/lib/features/promotions/types";
import { formatOperationCalendarDayYmd } from "@/lib/utils/operation-datetime";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { PromotionFormDialog } from "./promotion-form-dialog";

function statusPillClass(s: PromotionStatus): string {
  switch (s) {
    case "active":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "scheduled":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "expired":
      return "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300";
    case "inactive":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    default:
      return "bg-neutral-400/15 text-neutral-600";
  }
}

function formatDateIso(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatOperationCalendarDayYmd(`${y}-${m}-${day}`);
}

export function PromotionsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const stores = useMemo(
    () => (ctx.data?.stores ?? []).map((s) => ({ id: s.id, name: s.name })),
    [ctx.data?.stores],
  );
  const isPharmacy = ctx.data?.businessTypeSlug === "pharmacie";
  const canManage = h?.canPromotions ?? false;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [toDelete, setToDelete] = useState<Promotion | null>(null);

  const promosQ = useQuery({
    queryKey: ["promotions", companyId],
    queryFn: () => listPromotions(companyId),
    enabled: !!companyId && canManage && !isPharmacy,
    staleTime: 15_000,
  });
  const productsQ = useQuery({
    queryKey: ["promotions-products", companyId],
    queryFn: () => listProducts(companyId),
    enabled: !!companyId && canManage && !isPharmacy,
    staleTime: 60_000,
  });

  const promos = useMemo(() => promosQ.data ?? [], [promosQ.data]);
  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  const kpis = useMemo(() => {
    let active = 0;
    const productSet = new Set<string>();
    for (const p of promos) {
      if (promotionStatus(p) === "active") active += 1;
      for (const id of p.productIds) productSet.add(id);
    }
    return { total: promos.length, active, products: productSet.size };
  }, [promos]);

  const activeMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => setPromotionActive(v.id, v.active),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promotions", companyId] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Modification impossible.")),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePromotion(id),
    onSuccess: () => {
      toast.success("Promotion supprimée.");
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ["promotions", companyId] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Suppression impossible.")),
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(p: Promotion) {
    setEditing(p);
    setDialogOpen(true);
  }

  if (permLoading || ctx.isLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (isPharmacy || !canManage) {
    return (
      <FsPage>
        <FsScreenHeader title="Promotions" subtitle="Remises commerciales par produit et boutique" />
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              {isPharmacy
                ? "Le module Promotions n'est pas disponible pour les pharmacies."
                : "Vous n'avez pas accès à cette section."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Promotions"
        subtitle="Remises en % par produit et par boutique, avec période — appliquées automatiquement en caisse"
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-4">
          <p className="text-xs text-neutral-500">Promotions</p>
          <p className="mt-1 text-xl font-bold text-fs-text">{kpis.total}</p>
        </FsCard>
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-4">
          <p className="text-xs text-neutral-500">En cours</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{kpis.active}</p>
        </FsCard>
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-4">
          <p className="text-xs text-neutral-500">Produits en promo</p>
          <p className="mt-1 text-xl font-bold text-fs-accent">{kpis.products}</p>
        </FsCard>
      </div>

      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void promosQ.refetch()}
          className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-black/10 bg-fs-surface-container px-3 text-sm font-semibold dark:border-white/10"
        >
          <MdRefresh className={cn("h-4 w-4", promosQ.isFetching && "animate-spin")} aria-hidden />
          Actualiser
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-fs-accent px-4 text-sm font-bold text-white"
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Nouvelle promotion
        </button>
      </div>

      <FsCard className="overflow-hidden rounded-sm p-0 sm:rounded-sm" padding="p-0">
        {promosQ.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
          </div>
        ) : promos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <MdBadge className="h-10 w-10 text-neutral-400" aria-hidden />
            <p className="text-sm text-neutral-600">Aucune promotion pour le moment.</p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-sm bg-fs-accent px-4 py-2 text-sm font-bold text-white"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
              Créer la première
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-black/6 dark:divide-white/6">
            {promos.map((p) => {
              const st = promotionStatus(p);
              return (
                <li key={p.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-fs-text">{p.name}</span>
                      <span className="rounded-sm bg-fs-accent px-2 py-0.5 text-[11px] font-bold text-white">
                        -{p.discountPercent}%
                      </span>
                      <span className={cn("rounded-sm px-2 py-0.5 text-[11px] font-bold", statusPillClass(st))}>
                        {PROMO_STATUS_LABELS[st]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {formatDateIso(p.startsAt)} → {formatDateIso(p.endsAt)} · {p.productCount} produit(s)
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                      <MdStorefront className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        {p.storeIds.length === 0
                          ? "Aucune boutique"
                          : p.storeIds.map((id) => storeName.get(id) ?? "?").join(", ")}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => activeMut.mutate({ id: p.id, active: !p.isActive })}
                      disabled={activeMut.isPending}
                      className={cn(
                        "rounded-sm px-2.5 py-1.5 text-xs font-bold",
                        p.isActive
                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                          : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                      )}
                    >
                      {p.isActive ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded-sm bg-fs-accent/15 p-2 text-fs-accent"
                      aria-label="Modifier"
                    >
                      <MdEdit className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setToDelete(p)}
                      className="rounded-sm bg-red-500/10 p-2 text-red-600"
                      aria-label="Supprimer"
                    >
                      <MdDelete className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </FsCard>

      <PromotionFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        companyId={companyId}
        stores={stores}
        products={productsQ.data ?? []}
        editing={editing}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["promotions", companyId] })}
      />

      <FsConfirmDialog
        open={toDelete !== null}
        title="Supprimer la promotion ?"
        message={
          toDelete
            ? `« ${toDelete.name} » sera définitivement supprimée. Les produits ne seront plus remisés.`
            : undefined
        }
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMut.mutate(toDelete.id)}
      />
    </FsPage>
  );
}
