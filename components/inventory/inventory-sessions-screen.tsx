"use client";

import { FsCard, FsPage, FsQueryErrorPanel, FsScreenHeader } from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { P } from "@/lib/constants/permissions";
import { ROUTES } from "@/lib/config/routes";
import {
  cancelInventorySession,
  deleteInventorySession,
  listInventorySessions,
  startInventorySession,
} from "@/lib/features/inventory/sessions/api";
import type { InventorySessionStatus, InventorySessionSummary } from "@/lib/features/inventory/sessions/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MdAdd,
  MdArrowForward,
  MdCheckCircle,
  MdChecklist,
  MdClose,
  MdDeleteOutline,
  MdInventory2,
  MdLockOutline,
  MdPlayArrow,
  MdStorefront,
} from "react-icons/md";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_META: Record<
  InventorySessionStatus,
  { label: string; className: string; Icon: typeof MdChecklist }
> = {
  open: { label: "En cours", className: "bg-amber-500/12 text-amber-700", Icon: MdPlayArrow },
  closed: { label: "Validé", className: "bg-emerald-500/12 text-emerald-700", Icon: MdCheckCircle },
  cancelled: { label: "Annulé", className: "bg-neutral-400/15 text-neutral-500", Icon: MdClose },
};

export function InventorySessionsScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: ctx, isLoading: permLoading, hasPermission } = usePermissions();
  const storeId = ctx?.storeId ?? null;
  const storeName = ctx?.stores?.find((s) => s.id === storeId)?.name ?? null;
  const isOwner = ctx?.roleSlug === "owner";
  const canDoInventory = isOwner || hasPermission(P.inventoryManage);

  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<
    { kind: "cancel" | "delete"; session: InventorySessionSummary } | null
  >(null);

  const q = useQuery({
    queryKey: ["inventory-sessions", storeId] as const,
    queryFn: () => listInventorySessions(storeId),
    enabled: !!storeId && canDoInventory,
  });

  const openSession = useMemo(
    () => (q.data ?? []).find((s) => s.status === "open") ?? null,
    [q.data],
  );

  const startMut = useMutation({
    mutationFn: () => startInventorySession({ storeId: storeId ?? "", note }),
    onSuccess: (sessionId) => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["inventory-sessions", storeId] });
      router.push(`${ROUTES.inventorySessions}/${sessionId}`);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const cancelMut = useMutation({
    mutationFn: (sessionId: string) => cancelInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Session annulée.");
      setConfirm(null);
      await qc.invalidateQueries({ queryKey: ["inventory-sessions", storeId] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (sessionId: string) => deleteInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Session supprimée.");
      setConfirm(null);
      await qc.invalidateQueries({ queryKey: ["inventory-sessions", storeId] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const confirmBusy = cancelMut.isPending || deleteMut.isPending;

  if (permLoading) {
    return (
      <FsPage>
        <FsScreenHeader title="Inventaire" />
        <FsCard className="mt-4" padding="p-6">
          <p className="text-sm text-neutral-600">Chargement…</p>
        </FsCard>
      </FsPage>
    );
  }

  if (!canDoInventory) {
    return (
      <FsPage>
        <FsScreenHeader title="Inventaire" subtitle="Comptage physique et écarts de stock" />
        <FsCard className="mt-6" padding="p-8">
          <div className="flex flex-col items-center text-center">
            <MdLockOutline className="h-14 w-14 text-neutral-400" aria-hidden />
            <p className="mt-3 text-base font-semibold text-neutral-700">Accès réservé</p>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Vous avez besoin du droit « Ajuster le stock » pour faire un inventaire.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title="Inventaire" subtitle="Comptage physique et écarts de stock" />
        <FsCard className="mt-6" padding="p-8">
          <div className="flex flex-col items-center text-center">
            <MdStorefront className="h-14 w-14 text-fs-accent/80" aria-hidden />
            <p className="mt-3 text-base font-semibold text-neutral-700">Choisissez une boutique</p>
            <p className="mt-1 text-sm text-neutral-500">
              Sélectionnez une boutique dans le menu pour démarrer un inventaire.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Inventaire"
        subtitle={storeName ? `Comptage physique — ${storeName}` : "Comptage physique et écarts de stock"}
      />

      {/* Démarrer / reprendre */}
      {openSession ? (
        <FsCard className="mt-2 border-l-4 border-l-amber-500" padding="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600">
                <MdChecklist className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-fs-text">Inventaire en cours</p>
                <p className="mt-0.5 text-sm text-neutral-600">
                  {openSession.countedCount}/{openSession.itemCount} produits comptés · démarré le{" "}
                  {fmtDate(openSession.startedAt)}
                </p>
              </div>
            </div>
            <Link
              href={`${ROUTES.inventorySessions}/${openSession.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-fs-accent px-5 text-sm font-bold text-white"
            >
              Reprendre le comptage
              <MdArrowForward className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </FsCard>
      ) : (
        <FsCard className="mt-2" padding="p-4">
          <div className="flex items-center gap-2">
            <MdAdd className="h-5 w-5 text-fs-accent" aria-hidden />
            <p className="text-base font-bold text-fs-text">Nouvel inventaire</p>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Un instantané du stock théorique de la boutique est créé. Vous comptez ensuite chaque produit.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optionnel) — ex. Inventaire mensuel"
              className="min-h-11 flex-1 rounded-lg border border-black/10 bg-white px-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
              maxLength={120}
            />
            <button
              type="button"
              disabled={startMut.isPending}
              onClick={() => startMut.mutate()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-fs-accent px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              <MdPlayArrow className="h-5 w-5" aria-hidden />
              {startMut.isPending ? "Création…" : "Démarrer l'inventaire"}
            </button>
          </div>
        </FsCard>
      )}

      {/* Historique */}
      <div className="mt-5 flex items-center gap-2">
        <MdInventory2 className="h-5 w-5 text-neutral-500" aria-hidden />
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-600">Historique des inventaires</h2>
      </div>

      {q.isError ? (
        <FsQueryErrorPanel error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <FsCard className="mt-3" padding="p-6">
          <p className="text-sm text-neutral-600">Chargement…</p>
        </FsCard>
      ) : (q.data ?? []).length === 0 ? (
        <FsCard className="mt-3" padding="p-8">
          <div className="flex flex-col items-center text-center">
            <MdChecklist className="h-14 w-14 text-neutral-300" aria-hidden />
            <p className="mt-3 text-base font-semibold text-neutral-700">Aucun inventaire pour le moment</p>
            <p className="mt-1 text-sm text-neutral-500">Démarrez votre premier inventaire ci-dessus.</p>
          </div>
        </FsCard>
      ) : (
        <div className="mt-3 grid gap-3 min-[720px]:grid-cols-2">
          {(q.data ?? []).map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onCancel={() => setConfirm({ kind: "cancel", session: s })}
              onDelete={() => setConfirm({ kind: "delete", session: s })}
            />
          ))}
        </div>
      )}

      <FsConfirmDialog
        open={confirm != null}
        tone="danger"
        busy={confirmBusy}
        title={confirm?.kind === "delete" ? "Supprimer l'inventaire" : "Annuler l'inventaire"}
        message={
          confirm?.kind === "delete"
            ? "Cette session annulée sera définitivement supprimée. Cette action est irréversible."
            : "La session sera annulée. Le stock ne sera pas modifié."
        }
        confirmLabel={confirm?.kind === "delete" ? "Supprimer" : "Annuler la session"}
        cancelLabel="Retour"
        onCancel={() => (confirmBusy ? undefined : setConfirm(null))}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "delete") deleteMut.mutate(confirm.session.id);
          else cancelMut.mutate(confirm.session.id);
        }}
      />
    </FsPage>
  );
}

function SessionCard({
  session,
  onCancel,
  onDelete,
}: {
  session: InventorySessionSummary;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const meta = STATUS_META[session.status];
  const progress = session.itemCount > 0 ? Math.round((session.countedCount / session.itemCount) * 100) : 0;
  const varianceValue = session.varianceValuePurchase;

  return (
    <FsCard padding="p-4" className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              meta.className,
            )}
          >
            <meta.Icon className="h-3.5 w-3.5" aria-hidden />
            {meta.label}
          </span>
          <p className="mt-2 truncate text-sm font-bold text-fs-text">
            {session.note || `Inventaire du ${fmtDate(session.startedAt)}`}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Démarré {fmtDate(session.startedAt)}
            {session.status !== "open" && session.closedAt ? ` · clôturé ${fmtDate(session.closedAt)}` : ""}
          </p>
        </div>
        <Link
          href={`${ROUTES.inventorySessions}/${session.id}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 text-neutral-600 hover:bg-black/[0.03]"
          aria-label="Ouvrir la session"
        >
          <MdArrowForward className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-neutral-600">
          <span>
            {session.countedCount}/{session.itemCount} comptés
          </span>
          <span>{progress}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className={cn("h-full rounded-full", session.status === "closed" ? "bg-emerald-500" : "bg-fs-accent")}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
        <div className="text-xs">
          <span className="font-semibold text-neutral-700">{session.varianceCount}</span>
          <span className="text-neutral-500"> écart{session.varianceCount > 1 ? "s" : ""}</span>
          {session.countedCount > 0 ? (
            <span
              className={cn(
                "ml-2 font-bold",
                varianceValue < 0 ? "text-red-600" : varianceValue > 0 ? "text-emerald-700" : "text-neutral-400",
              )}
            >
              {varianceValue > 0 ? "+" : ""}
              {formatCurrency(varianceValue)}
            </span>
          ) : null}
        </div>
        {session.status === "open" ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-red-600 hover:underline"
          >
            Annuler
          </button>
        ) : session.status === "cancelled" ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
          >
            <MdDeleteOutline className="h-4 w-4" aria-hidden />
            Supprimer
          </button>
        ) : null}
      </div>
    </FsCard>
  );
}
