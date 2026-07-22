"use client";

import { FsCard, FsQueryErrorPanel } from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { ProductListThumbnail, firstProductImageUrl } from "@/components/products/product-list-thumbnail";
import { listProducts } from "@/lib/features/products/api";
import { queryKeys } from "@/lib/query/query-keys";
import {
  cancelWarehouseInventorySession,
  deleteWarehouseInventorySession,
  getWarehouseInventorySession,
  listWarehouseInventorySessionItems,
  listWarehouseInventorySessions,
  setWarehouseInventoryCount,
  startWarehouseInventorySession,
  validateWarehouseInventorySession,
} from "@/lib/features/warehouse/inventory-sessions/api";
import type {
  WarehouseInventorySessionItem,
  WarehouseInventorySessionStatus,
  WarehouseInventorySessionSummary,
} from "@/lib/features/warehouse/inventory-sessions/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MdAdd,
  MdArrowBack,
  MdArrowForward,
  MdCheck,
  MdCheckCircle,
  MdChecklist,
  MdClose,
  MdDeleteOutline,
  MdInventory2,
  MdPlayArrow,
  MdSearch,
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
  WarehouseInventorySessionStatus,
  { label: string; className: string; Icon: typeof MdChecklist }
> = {
  open: { label: "En cours", className: "bg-amber-500/12 text-amber-700", Icon: MdPlayArrow },
  closed: { label: "Validé", className: "bg-emerald-500/12 text-emerald-700", Icon: MdCheckCircle },
  cancelled: { label: "Annulé", className: "bg-neutral-400/15 text-neutral-500", Icon: MdClose },
};

type Props = {
  companyId: string;
  warehouseId: string | null;
  warehouseName: string;
  canManage: boolean;
};

/**
 * Onglet « Inventaire » du dépôt (magasin) — comptage physique par dépôt, écarts, validation
 * atomique. Miroir de l'inventaire boutique, scopé au dépôt actif. Deux sous-vues internes :
 * liste des sessions (+ démarrage) et comptage d'une session.
 */
export function WarehouseInventoryTab({ companyId, warehouseId, warehouseName, canManage }: Props) {
  const [countingId, setCountingId] = useState<string | null>(null);

  if (!canManage) {
    return (
      <FsCard className="mt-3" padding="p-8">
        <p className="text-center text-base text-neutral-600">
          Vous n&apos;avez pas le droit de faire l&apos;inventaire du dépôt.
        </p>
      </FsCard>
    );
  }

  if (countingId) {
    return (
      <WarehouseInventoryCount
        sessionId={countingId}
        companyId={companyId}
        warehouseId={warehouseId}
        onBack={() => setCountingId(null)}
      />
    );
  }

  return (
    <WarehouseInventoryList
      companyId={companyId}
      warehouseId={warehouseId}
      warehouseName={warehouseName}
      onOpen={(id) => setCountingId(id)}
    />
  );
}

// ==========================================================================
// Liste des sessions + démarrage
// ==========================================================================
function WarehouseInventoryList({
  companyId,
  warehouseId,
  warehouseName,
  onOpen,
}: {
  companyId: string;
  warehouseId: string | null;
  warehouseName: string;
  onOpen: (sessionId: string) => void;
}) {
  const qc = useQueryClient();
  const sessionsKey = queryKeys.warehouseInventorySessions(companyId, warehouseId);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<
    { kind: "cancel" | "delete"; session: WarehouseInventorySessionSummary } | null
  >(null);

  const q = useQuery({
    queryKey: sessionsKey,
    queryFn: () => listWarehouseInventorySessions({ companyId, warehouseId }),
    enabled: Boolean(companyId),
  });

  const openSession = useMemo(
    () => (q.data ?? []).find((s) => s.status === "open") ?? null,
    [q.data],
  );

  const startMut = useMutation({
    mutationFn: () => startWarehouseInventorySession({ companyId, warehouseId, note }),
    onSuccess: (sessionId) => {
      setNote("");
      void qc.invalidateQueries({ queryKey: sessionsKey });
      onOpen(sessionId);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const cancelMut = useMutation({
    mutationFn: (sessionId: string) => cancelWarehouseInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Session annulée.");
      setConfirm(null);
      await qc.invalidateQueries({ queryKey: sessionsKey });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (sessionId: string) => deleteWarehouseInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Session supprimée.");
      setConfirm(null);
      await qc.invalidateQueries({ queryKey: sessionsKey });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const confirmBusy = cancelMut.isPending || deleteMut.isPending;

  return (
    <div className="mt-3">
      {/* Démarrer / reprendre */}
      {openSession ? (
        <FsCard className="border-l-4 border-l-amber-500" padding="p-4">
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
            <button
              type="button"
              onClick={() => onOpen(openSession.id)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-fs-accent px-5 text-sm font-bold text-white"
            >
              Reprendre le comptage
              <MdArrowForward className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </FsCard>
      ) : (
        <FsCard padding="p-4">
          <div className="flex items-center gap-2">
            <MdAdd className="h-5 w-5 text-fs-accent" aria-hidden />
            <p className="text-base font-bold text-fs-text">Nouvel inventaire du dépôt</p>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Un instantané du stock théorique du dépôt <span className="font-semibold">{warehouseName}</span> est
            créé. Vous comptez ensuite chaque produit ; la validation corrige le stock.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optionnel) — ex. Inventaire mensuel dépôt"
              className="min-h-11 flex-1 rounded-lg border border-black/10 bg-white px-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
              maxLength={120}
            />
            <button
              type="button"
              disabled={startMut.isPending || !warehouseId}
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
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-600">
          Historique des inventaires
        </h2>
      </div>

      {q.isError ? (
        <div className="mt-3">
          <FsQueryErrorPanel error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : q.isLoading ? (
        <FsCard className="mt-3" padding="p-6">
          <p className="text-sm text-neutral-600">Chargement…</p>
        </FsCard>
      ) : (q.data ?? []).length === 0 ? (
        <FsCard className="mt-3" padding="p-8">
          <div className="flex flex-col items-center text-center">
            <MdChecklist className="h-14 w-14 text-neutral-300" aria-hidden />
            <p className="mt-3 text-base font-semibold text-neutral-700">
              Aucun inventaire pour ce dépôt
            </p>
            <p className="mt-1 text-sm text-neutral-500">Démarrez votre premier inventaire ci-dessus.</p>
          </div>
        </FsCard>
      ) : (
        <div className="mt-3 grid gap-3 min-[720px]:grid-cols-2">
          {(q.data ?? []).map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onOpen={() => onOpen(s.id)}
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
            : "La session sera annulée. Le stock du dépôt ne sera pas modifié."
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
    </div>
  );
}

function SessionCard({
  session,
  onOpen,
  onCancel,
  onDelete,
}: {
  session: WarehouseInventorySessionSummary;
  onOpen: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const meta = STATUS_META[session.status];
  const progress =
    session.itemCount > 0 ? Math.round((session.countedCount / session.itemCount) * 100) : 0;
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
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 text-neutral-600 hover:bg-black/[0.03]"
          aria-label="Ouvrir la session"
        >
          <MdArrowForward className="h-5 w-5" aria-hidden />
        </button>
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
            className={cn(
              "h-full rounded-full",
              session.status === "closed" ? "bg-emerald-500" : "bg-fs-accent",
            )}
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
                varianceValue < 0
                  ? "text-red-600"
                  : varianceValue > 0
                    ? "text-emerald-700"
                    : "text-neutral-400",
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

// ==========================================================================
// Comptage d'une session
// ==========================================================================
type CountFilter = "all" | "todo" | "done" | "variance";

function WarehouseInventoryCount({
  sessionId,
  companyId,
  warehouseId,
  onBack,
}: {
  sessionId: string;
  companyId: string;
  warehouseId: string | null;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const sessionsKey = queryKeys.warehouseInventorySessions(companyId, warehouseId);
  const sessionKey = ["warehouse-inventory-session", sessionId] as const;
  const itemsKey = ["warehouse-inventory-session-items", sessionId] as const;

  // Miniatures produit — chargées en direct (hors snapshot de session).
  const imagesQ = useQuery({
    queryKey: ["warehouse-inventory-session-images", companyId] as const,
    queryFn: async () => {
      const products = await listProducts(companyId);
      const m = new Map<string, string | null>();
      for (const p of products) m.set(p.id, firstProductImageUrl(p));
      return m;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const imageMap = imagesQ.data;

  const sessionQ = useQuery({
    queryKey: sessionKey,
    queryFn: () => getWarehouseInventorySession(sessionId),
  });
  const itemsQ = useQuery({
    queryKey: itemsKey,
    queryFn: () => listWarehouseInventorySessionItems(sessionId),
  });

  const session = sessionQ.data ?? null;
  const isOpen = session?.status === "open";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CountFilter>("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<"validate" | "cancel" | null>(null);

  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);

  const stats = useMemo(() => {
    let counted = 0;
    let varianceCount = 0;
    let varianceValue = 0;
    for (const it of items) {
      if (it.countedQty != null) {
        counted += 1;
        const v = it.variance ?? 0;
        if (v !== 0) {
          varianceCount += 1;
          varianceValue += v * it.unitPurchasePrice;
        }
      }
    }
    return { total: items.length, counted, varianceCount, varianceValue };
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((it) => {
      if (term && !it.productName.toLowerCase().includes(term)) return false;
      if (filter === "todo") return it.countedQty == null;
      if (filter === "done") return it.countedQty != null;
      if (filter === "variance") return it.countedQty != null && (it.variance ?? 0) !== 0;
      return true;
    });
  }, [items, search, filter]);

  function patchItem(itemId: string, countedQty: number, expectedQty: number) {
    qc.setQueryData<WarehouseInventorySessionItem[]>(itemsKey, (prev) =>
      (prev ?? []).map((it) =>
        it.id === itemId
          ? { ...it, countedQty, variance: countedQty - expectedQty, countedAt: new Date().toISOString() }
          : it,
      ),
    );
  }

  const setCountMut = useMutation({
    mutationFn: (v: { itemId: string; countedQty: number }) => setWarehouseInventoryCount(v),
    onError: (e) => {
      toast.error(messageFromUnknownError(e));
      void itemsQ.refetch();
    },
  });

  const validateMut = useMutation({
    mutationFn: () => validateWarehouseInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Inventaire validé — le stock du dépôt a été mis à jour.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: sessionsKey }),
        qc.invalidateQueries({ queryKey: sessionKey }),
        qc.invalidateQueries({ queryKey: itemsKey }),
        // Rafraîchit stock dépôt + mouvements (préfixe ["warehouse", companyId]).
        qc.invalidateQueries({ queryKey: ["warehouse", companyId] }),
      ]);
      onBack();
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelWarehouseInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Session annulée.");
      await qc.invalidateQueries({ queryKey: sessionsKey });
      onBack();
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function commitCount(it: WarehouseInventorySessionItem, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) return;
    if (it.countedQty === n) return;
    patchItem(it.id, n, it.expectedQty);
    setCountMut.mutate({ itemId: it.id, countedQty: n });
  }

  if (sessionQ.isError) {
    return (
      <div className="mt-3">
        <BackLink onBack={onBack} />
        <div className="mt-3">
          <FsQueryErrorPanel error={sessionQ.error} onRetry={() => sessionQ.refetch()} />
        </div>
      </div>
    );
  }
  if (sessionQ.isLoading || !session) {
    return (
      <div className="mt-3">
        <BackLink onBack={onBack} />
        <FsCard className="mt-3" padding="p-6">
          <p className="text-sm text-neutral-600">Chargement…</p>
        </FsCard>
      </div>
    );
  }

  const progress = stats.total > 0 ? Math.round((stats.counted / stats.total) * 100) : 0;

  return (
    <div className="mt-3">
      <BackLink onBack={onBack} />

      {/* En-tête session */}
      <FsCard className="mt-2" padding="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-fs-text">{session.note || "Inventaire du dépôt"}</h1>
              <StatusBadge status={session.status} />
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {new Date(session.startedAt).toLocaleString("fr-FR")}
            </p>
          </div>
        </div>

        {/* Progression */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-neutral-600">
            <span>
              {stats.counted}/{stats.total} produits comptés
            </span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className={cn(
                "h-full rounded-full",
                session.status === "closed" ? "bg-emerald-500" : "bg-fs-accent",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Résumé écarts */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniStat label="Comptés" value={String(stats.counted)} />
          <MiniStat label="Écarts" value={String(stats.varianceCount)} />
          <MiniStat
            label="Valeur écarts (coût)"
            value={`${stats.varianceValue > 0 ? "+" : ""}${formatCurrency(stats.varianceValue)}`}
            tone={stats.varianceValue < 0 ? "red" : stats.varianceValue > 0 ? "green" : "muted"}
          />
        </div>
      </FsCard>

      {/* Recherche + filtres */}
      <FsCard className="mt-3" padding="p-3">
        <div className="relative">
          <MdSearch
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            className="min-h-11 w-full rounded-lg border border-black/10 bg-white pl-10 pr-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(
            [
              { id: "all", label: `Tous (${stats.total})` },
              { id: "todo", label: `À compter (${stats.total - stats.counted})` },
              { id: "done", label: `Comptés (${stats.counted})` },
              { id: "variance", label: `Écarts (${stats.varianceCount})` },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                filter === f.id ? "bg-fs-accent text-white" : "bg-fs-surface-container text-neutral-600",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </FsCard>

      {/* Liste des produits */}
      {itemsQ.isLoading ? (
        <FsCard className="mt-3" padding="p-6">
          <p className="text-sm text-neutral-600">Chargement des produits…</p>
        </FsCard>
      ) : filtered.length === 0 ? (
        <FsCard className="mt-3" padding="p-8">
          <p className="text-center text-sm text-neutral-500">Aucun produit pour ce filtre.</p>
        </FsCard>
      ) : (
        <FsCard className="mt-3" padding="p-0">
          <ul className="divide-y divide-black/[0.06]">
            {filtered.map((it) => (
              <CountRow
                key={it.id}
                item={it}
                imageUrl={imageMap?.get(it.productId) ?? null}
                editable={isOpen}
                draft={drafts[it.id] ?? (it.countedQty != null ? String(it.countedQty) : "")}
                onDraftChange={(v) => setDrafts((d) => ({ ...d, [it.id]: v }))}
                onCommit={(v) => commitCount(it, v)}
                onAcceptExpected={() => {
                  setDrafts((d) => ({ ...d, [it.id]: String(it.expectedQty) }));
                  commitCount(it, String(it.expectedQty));
                }}
              />
            ))}
          </ul>
        </FsCard>
      )}

      {/* Actions */}
      {isOpen ? (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-col gap-2 border-t border-black/[0.06] bg-fs-card/95 py-3 backdrop-blur sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={cancelMut.isPending || validateMut.isPending}
            onClick={() => setConfirm("cancel")}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-5 text-sm font-bold text-red-600 disabled:opacity-50 sm:order-1"
          >
            <MdClose className="h-5 w-5" aria-hidden />
            Annuler la session
          </button>
          <button
            type="button"
            disabled={validateMut.isPending || cancelMut.isPending || stats.counted === 0}
            onClick={() => setConfirm("validate")}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-fs-accent px-6 text-sm font-bold text-white disabled:opacity-50 sm:order-2"
          >
            <MdCheckCircle className="h-5 w-5" aria-hidden />
            {validateMut.isPending ? "Validation…" : "Valider l'inventaire"}
          </button>
        </div>
      ) : null}

      <FsConfirmDialog
        open={confirm != null}
        tone={confirm === "cancel" ? "danger" : "default"}
        busy={validateMut.isPending || cancelMut.isPending}
        title={confirm === "cancel" ? "Annuler l'inventaire" : "Valider l'inventaire"}
        message={
          confirm === "cancel"
            ? "La session sera annulée. Le stock du dépôt ne sera pas modifié."
            : stats.counted < stats.total
              ? `${stats.counted}/${stats.total} produits comptés. Les non comptés resteront inchangés.\n\n${stats.varianceCount} écart(s) seront appliqués au stock du dépôt.`
              : `${stats.varianceCount} écart(s) seront appliqués au stock du dépôt.`
        }
        confirmLabel={confirm === "cancel" ? "Annuler la session" : "Valider"}
        cancelLabel="Retour"
        onCancel={() => {
          if (!validateMut.isPending && !cancelMut.isPending) setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm === "cancel") cancelMut.mutate();
          else if (confirm === "validate") validateMut.mutate();
        }}
      />
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-fs-accent"
    >
      <MdArrowBack className="h-5 w-5" aria-hidden />
      Inventaires du dépôt
    </button>
  );
}

function StatusBadge({ status }: { status: WarehouseInventorySessionStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold", m.className)}>
      {m.label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "red" | "green" | "muted";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-emerald-700"
        : tone === "muted"
          ? "text-neutral-400"
          : "text-fs-text";
  return (
    <div className="rounded-lg border border-black/[0.06] bg-fs-surface-container/60 px-3 py-2">
      <p className="text-[11px] font-medium leading-tight text-neutral-500">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-bold", toneClass)}>{value}</p>
    </div>
  );
}

function CountRow({
  item,
  imageUrl,
  editable,
  draft,
  onDraftChange,
  onCommit,
  onAcceptExpected,
}: {
  item: WarehouseInventorySessionItem;
  imageUrl: string | null;
  editable: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onCommit: (v: string) => void;
  onAcceptExpected: () => void;
}) {
  const counted = item.countedQty;
  const variance = item.variance ?? 0;
  const hasVariance = counted != null && variance !== 0;

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <ProductListThumbnail imageUrl={imageUrl} previewOnTap />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fs-text">{item.productName}</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Théorique : <span className="font-semibold text-neutral-700">{item.expectedQty}</span>
          {counted != null ? (
            <span
              className={cn(
                "ml-2 font-bold",
                variance < 0 ? "text-red-600" : variance > 0 ? "text-emerald-700" : "text-neutral-400",
              )}
            >
              {hasVariance ? `Écart ${variance > 0 ? "+" : ""}${variance}` : "Conforme"}
            </span>
          ) : null}
        </p>
      </div>

      {editable ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            inputMode="numeric"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={(e) => onCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder={String(item.expectedQty)}
            className={cn(
              "h-10 w-20 rounded-lg border bg-white px-2 text-center text-sm font-bold text-fs-text outline-none focus:ring-2 focus:ring-fs-accent/20",
              counted != null ? "border-fs-accent/40" : "border-black/10",
            )}
            aria-label={`Quantité comptée ${item.productName}`}
          />
          <button
            type="button"
            onClick={onAcceptExpected}
            title="Confirmer la quantité théorique"
            aria-label="Confirmer la quantité théorique"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 text-emerald-600 hover:bg-emerald-50"
          >
            <MdCheck className="h-5 w-5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="shrink-0 text-right">
          <p className="text-xs text-neutral-500">Compté</p>
          <p className="text-sm font-bold text-fs-text">{counted != null ? counted : "—"}</p>
        </div>
      )}
    </li>
  );
}
