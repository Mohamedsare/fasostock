"use client";

import { FsCard, FsQueryErrorPanel } from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { InventoryReportDialog } from "@/components/inventory/inventory-report-dialog";
import { ProductListThumbnail, firstProductImageUrl } from "@/components/products/product-list-thumbnail";
import {
  exportInventorySessionReport,
  type InventoryReportMode,
} from "@/lib/features/inventory/sessions/export-report";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listProducts } from "@/lib/features/products/api";
import { queryKeys } from "@/lib/query/query-keys";
import {
  cancelWarehouseInventorySession,
  deleteWarehouseInventorySession,
  getWarehouseInventorySession,
  listWarehouseInventorySessionItems,
  listWarehouseInventorySessions,
  reopenWarehouseInventorySession,
  setWarehouseInventoryCount,
  startWarehouseInventorySession,
  validateWarehouseInventorySession,
} from "@/lib/features/warehouse/inventory-sessions/api";
import type {
  WarehouseInventorySessionItem,
  WarehouseInventorySessionStatus,
  WarehouseInventorySessionSummary,
} from "@/lib/features/warehouse/inventory-sessions/types";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
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
  MdDownload,
  MdInventory2,
  MdPlayArrow,
  MdPrint,
  MdReplay,
  MdSearch,
} from "react-icons/md";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    timeZone: getActiveTimeZone(),
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
      <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-8">
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
        warehouseName={warehouseName}
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
  const { data: ctx } = usePermissions();
  const sessionsKey = queryKeys.warehouseInventorySessions(companyId, warehouseId);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<
    { kind: "cancel" | "delete" | "reopen"; session: WarehouseInventorySessionSummary } | null
  >(null);
  const [exportBusy, setExportBusy] = useState<{ id: string; mode: InventoryReportMode } | null>(
    null,
  );

  /** Rapport A4 d'un inventaire de dépôt passé. Les lignes sont relues : la carte n'a que les agrégats. */
  async function exportSession(mode: InventoryReportMode, s: WarehouseInventorySessionSummary) {
    if (exportBusy) return;
    setExportBusy({ id: s.id, mode });
    try {
      const items = await listWarehouseInventorySessionItems(s.id);
      if (items.length === 0) {
        toast.info("Aucun produit dans cette session.");
        return;
      }
      await exportInventorySessionReport(mode, {
        companyId,
        companyName: ctx?.companyName ?? "",
        companyLogoUrl: ctx?.companyLogoUrl ?? null,
        scopeKind: "Dépôt",
        scopeName: warehouseName,
        sessionNote: s.note,
        status: s.status,
        startedAt: s.startedAt,
        closedAt: s.closedAt,
        rows: items.map((it) => ({
          productName: it.productName,
          expectedQty: it.expectedQty,
          countedQty: it.countedQty,
          unitPurchasePrice: it.unitPurchasePrice,
        })),
      });
    } catch (e) {
      toastMutationError("warehouse-inventory-report-pdf", e);
    } finally {
      setExportBusy(null);
    }
  }

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

  const reopenMut = useMutation({
    mutationFn: (sessionId: string) => reopenWarehouseInventorySession(sessionId),
    onSuccess: async (_v, sessionId) => {
      setConfirm(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: sessionsKey }),
        qc.invalidateQueries({ queryKey: ["warehouse-inventory-session", sessionId] }),
        qc.invalidateQueries({ queryKey: ["warehouse-inventory-session-items", sessionId] }),
      ]);
      onOpen(sessionId);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const confirmBusy = cancelMut.isPending || deleteMut.isPending || reopenMut.isPending;

  return (
    <div className="mt-3">
      {/* Démarrer / reprendre */}
      {openSession ? (
        <FsCard className="rounded-md sm:rounded-md border-l-4 border-l-amber-500" padding="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-amber-500/12 text-amber-600">
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
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-fs-accent px-5 text-sm font-bold text-white"
            >
              Reprendre le comptage
              <MdArrowForward className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </FsCard>
      ) : (
        <FsCard padding="p-4" className="rounded-md sm:rounded-md">
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
              className="min-h-11 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
              maxLength={120}
            />
            <button
              type="button"
              disabled={startMut.isPending || !warehouseId}
              onClick={() => startMut.mutate()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-fs-accent px-5 text-sm font-bold text-white disabled:opacity-50"
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
        <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-6">
          <p className="text-sm text-neutral-600">Chargement…</p>
        </FsCard>
      ) : (q.data ?? []).length === 0 ? (
        <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-8">
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
              reopenBlocked={openSession != null}
              exportBusy={exportBusy?.id === s.id ? exportBusy.mode : null}
              onPrint={() => void exportSession("print", s)}
              onDownload={() => void exportSession("download", s)}
              onOpen={() => onOpen(s.id)}
              onCancel={() => setConfirm({ kind: "cancel", session: s })}
              onDelete={() => setConfirm({ kind: "delete", session: s })}
              onReopen={() => setConfirm({ kind: "reopen", session: s })}
            />
          ))}
        </div>
      )}

      <FsConfirmDialog
        open={confirm != null}
        tone={confirm?.kind === "reopen" ? "default" : "danger"}
        busy={confirmBusy}
        title={
          confirm?.kind === "delete"
            ? "Supprimer l'inventaire"
            : confirm?.kind === "reopen"
              ? "Reprendre l'inventaire"
              : "Annuler l'inventaire"
        }
        message={
          confirm?.kind === "delete"
            ? "Cette session annulée sera définitivement supprimée. Cette action est irréversible."
            : confirm?.kind === "reopen"
              ? `La session repasse « En cours » et vous continuez le comptage des ${Math.max(
                  0,
                  (confirm.session.itemCount ?? 0) - (confirm.session.countedCount ?? 0),
                )} produits restants.\n\nLe stock théorique du dépôt est remis à jour : les écarts déjà appliqués ne le seront pas une seconde fois.`
              : "La session sera annulée. Le stock du dépôt ne sera pas modifié."
        }
        confirmLabel={
          confirm?.kind === "delete"
            ? "Supprimer"
            : confirm?.kind === "reopen"
              ? "Reprendre"
              : "Annuler la session"
        }
        cancelLabel="Retour"
        onCancel={() => (confirmBusy ? undefined : setConfirm(null))}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "delete") deleteMut.mutate(confirm.session.id);
          else if (confirm.kind === "reopen") reopenMut.mutate(confirm.session.id);
          else cancelMut.mutate(confirm.session.id);
        }}
      />
    </div>
  );
}

function SessionCard({
  session,
  reopenBlocked,
  exportBusy,
  onPrint,
  onDownload,
  onOpen,
  onCancel,
  onDelete,
  onReopen,
}: {
  session: WarehouseInventorySessionSummary;
  /** Une autre session est ouverte : impossible d'en rouvrir une seconde. */
  reopenBlocked: boolean;
  /** Mode d'export en cours pour CETTE carte (les autres restent cliquables). */
  exportBusy: InventoryReportMode | null;
  onPrint: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onReopen: () => void;
}) {
  const meta = STATUS_META[session.status];
  const progress =
    session.itemCount > 0 ? Math.round((session.countedCount / session.itemCount) * 100) : 0;
  const varianceValue = session.varianceValuePurchase;

  return (
    <FsCard padding="p-4" className="flex flex-col rounded-md sm:rounded-md">
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
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onPrint}
            disabled={exportBusy != null}
            title="Imprimer le rapport A4"
            aria-label="Imprimer le rapport d'inventaire"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 text-neutral-600 hover:bg-black/[0.03] disabled:opacity-50"
          >
            <MdPrint className={cn("h-5 w-5", exportBusy === "print" && "animate-pulse text-fs-accent")} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={exportBusy != null}
            title="Télécharger le rapport A4 (PDF)"
            aria-label="Télécharger le rapport d'inventaire"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 text-neutral-600 hover:bg-black/[0.03] disabled:opacity-50"
          >
            <MdDownload className={cn("h-5 w-5", exportBusy === "download" && "animate-pulse text-fs-accent")} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 text-neutral-600 hover:bg-black/[0.03]"
            aria-label="Ouvrir la session"
          >
            <MdArrowForward className="h-5 w-5" aria-hidden />
          </button>
        </div>
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
        ) : (
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onReopen}
              disabled={reopenBlocked}
              title={
                reopenBlocked
                  ? "Un autre inventaire est en cours — terminez-le d'abord."
                  : "Continuer le comptage de cet inventaire"
              }
              className="inline-flex items-center gap-1 text-xs font-bold text-fs-accent hover:underline disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline"
            >
              <MdReplay className="h-4 w-4" aria-hidden />
              Reprendre
            </button>
            {session.status === "cancelled" ? (
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
        )}
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
  warehouseName,
  onBack,
}: {
  sessionId: string;
  companyId: string;
  warehouseId: string | null;
  warehouseName: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const { data: ctx } = usePermissions();
  const sessionsKey = queryKeys.warehouseInventorySessions(companyId, warehouseId);
  const sessionKey = ["warehouse-inventory-session", sessionId] as const;
  const itemsKey = ["warehouse-inventory-session-items", sessionId] as const;

  /*
   * Produits en direct — miniatures ET nom courant (hors snapshot de session) : un produit
   * renommé pendant le comptage doit apparaître sous son nouveau nom, sinon on le cherche
   * en vain dans la liste. Même règle côté base (trigger
   * `sync_open_inventory_session_product_name`).
   */
  const liveProductsQ = useQuery({
    queryKey: ["warehouse-inventory-session-images", companyId] as const,
    queryFn: async () => {
      const products = await listProducts(companyId);
      const images = new Map<string, string | null>();
      const names = new Map<string, string>();
      for (const p of products) {
        images.set(p.id, firstProductImageUrl(p));
        if (p.name?.trim()) names.set(p.id, p.name.trim());
      }
      return { images, names };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const imageMap = liveProductsQ.data?.images;
  const liveNames = liveProductsQ.data?.names;

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
  const [confirm, setConfirm] = useState<"validate" | "cancel" | "reopen" | null>(null);
  const [exportBusy, setExportBusy] = useState<InventoryReportMode | null>(null);
  /** Rapport proposé dès la validation : la trace se demande quand on l'a encore en tête. */
  const [reportOpen, setReportOpen] = useState(false);

  // Nom courant prioritaire sur le nom snapshoté, puis reclassement alphabétique
  // (le serveur trie sur le snapshot : un produit renommé se retrouverait mal placé).
  const namesUpdatedAt = liveProductsQ.dataUpdatedAt;
  const itemsUpdatedAt = itemsQ.dataUpdatedAt;
  const items = useMemo(() => {
    const raw = itemsQ.data ?? [];
    // Le snapshot serveur est déjà mis à jour par le trigger : ne le corriger avec le
    // catalogue local que si celui-ci a été chargé APRÈS, sinon un cache un peu vieux
    // réafficherait l'ancien nom.
    if (!liveNames || namesUpdatedAt < itemsUpdatedAt) return raw;
    let renamed = false;
    const merged = raw.map((it) => {
      const live = liveNames.get(it.productId);
      if (!live || live === it.productName) return it;
      renamed = true;
      return { ...it, productName: live };
    });
    if (!renamed) return raw;
    return merged.sort((a, b) => a.productName.localeCompare(b.productName, "fr"));
  }, [itemsQ.data, liveNames, namesUpdatedAt, itemsUpdatedAt]);

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

  /**
   * Rapport A4 de la session — imprimé ou téléchargé, c'est le même document. Il part des
   * lignes affichées : le papier doit dire ce que la personne avait sous les yeux.
   */
  async function runExport(mode: InventoryReportMode) {
    if (exportBusy || !session) return;
    if (items.length === 0) {
      toast.info("Aucun produit dans cette session.");
      return;
    }
    setExportBusy(mode);
    try {
      await exportInventorySessionReport(mode, {
        companyId,
        companyName: ctx?.companyName ?? "",
        companyLogoUrl: ctx?.companyLogoUrl ?? null,
        scopeKind: "Dépôt",
        scopeName: warehouseName,
        sessionNote: session.note,
        status: session.status,
        startedAt: session.startedAt,
        closedAt: session.closedAt,
        rows: items.map((it) => ({
          productName: it.productName,
          expectedQty: it.expectedQty,
          countedQty: it.countedQty,
          unitPurchasePrice: it.unitPurchasePrice,
        })),
      });
    } catch (e) {
      toastMutationError("warehouse-inventory-report-pdf", e);
    } finally {
      setExportBusy(null);
    }
  }

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
      // On ne referme pas tout de suite : le rapport se propose ici, au moment où l'on
      // veut la trace. « Terminer » revient à la liste.
      setConfirm(null);
      setReportOpen(true);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const reopenMut = useMutation({
    mutationFn: () => reopenWarehouseInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Inventaire repris — vous pouvez continuer le comptage.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: sessionsKey }),
        qc.invalidateQueries({ queryKey: sessionKey }),
        qc.invalidateQueries({ queryKey: itemsKey }),
      ]);
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
        <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-6">
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
      <FsCard className="rounded-md sm:rounded-md mt-2" padding="p-4">
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

        {/* Session terminée : on peut la rouvrir pour finir le comptage. */}
        {!isOpen ? (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-fs-accent/25 bg-fs-accent/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-neutral-700">
              {session.status === "closed"
                ? `Inventaire validé. Il reste ${Math.max(0, stats.total - stats.counted)} produits non comptés — vous pouvez reprendre là où vous en étiez.`
                : "Session annulée. Vous pouvez la reprendre pour continuer le comptage."}
            </p>
            <button
              type="button"
              disabled={reopenMut.isPending}
              onClick={() => setConfirm("reopen")}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-fs-accent px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              <MdReplay className="h-5 w-5" aria-hidden />
              {reopenMut.isPending ? "Reprise…" : "Reprendre le comptage"}
            </button>
          </div>
        ) : (
          /* Rassure sur l'enregistrement automatique : rien à cliquer pour continuer plus tard. */
          <p className="mt-2 text-xs text-neutral-500">
            Chaque quantité est enregistrée automatiquement. Vous pouvez quitter cette page et
            reprendre plus tard — ne validez qu&apos;une fois le comptage terminé.
          </p>
        )}

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

        {/* Le résultat sur papier, dès qu'il y a quelque chose à montrer. */}
        {stats.counted > 0 ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-black/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-neutral-500">
              Rapport A4 : résumé, écarts classés par valeur, détail du comptage et cases de
              signature.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void runExport("print")}
                disabled={exportBusy != null}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-fs-accent/40 px-3 text-xs font-bold text-fs-accent disabled:opacity-50"
              >
                <MdPrint className="h-4 w-4" aria-hidden />
                {exportBusy === "print" ? "Préparation…" : "Imprimer"}
              </button>
              <button
                type="button"
                onClick={() => void runExport("download")}
                disabled={exportBusy != null}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-bold text-neutral-700 disabled:opacity-50"
              >
                <MdDownload className="h-4 w-4" aria-hidden />
                {exportBusy === "download" ? "Préparation…" : "Télécharger"}
              </button>
            </div>
          </div>
        ) : null}
      </FsCard>

      {/* Recherche + filtres */}
      <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-3">
        <div className="relative">
          <MdSearch
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            className="min-h-11 w-full rounded-md border border-black/10 bg-white pl-10 pr-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
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
                "rounded-md px-3 py-1.5 text-xs font-semibold",
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
        <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-6">
          <p className="text-sm text-neutral-600">Chargement des produits…</p>
        </FsCard>
      ) : filtered.length === 0 ? (
        <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-8">
          <p className="text-center text-sm text-neutral-500">Aucun produit pour ce filtre.</p>
        </FsCard>
      ) : (
        <FsCard className="rounded-md sm:rounded-md mt-3" padding="p-0">
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
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-5 text-sm font-bold text-red-600 disabled:opacity-50 sm:order-1"
          >
            <MdClose className="h-5 w-5" aria-hidden />
            Annuler la session
          </button>
          <button
            type="button"
            disabled={validateMut.isPending || cancelMut.isPending || stats.counted === 0}
            onClick={() => setConfirm("validate")}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-fs-accent px-6 text-sm font-bold text-white disabled:opacity-50 sm:order-2"
          >
            <MdCheckCircle className="h-5 w-5" aria-hidden />
            {validateMut.isPending ? "Validation…" : "Valider l'inventaire"}
          </button>
        </div>
      ) : null}

      <FsConfirmDialog
        open={confirm != null}
        tone={confirm === "cancel" || (confirm === "validate" && stats.counted < stats.total) ? "danger" : "default"}
        busy={validateMut.isPending || cancelMut.isPending || reopenMut.isPending}
        title={
          confirm === "cancel"
            ? "Annuler l'inventaire"
            : confirm === "reopen"
              ? "Reprendre l'inventaire"
              : "Valider l'inventaire"
        }
        message={
          confirm === "cancel"
            ? "La session sera annulée. Le stock du dépôt ne sera pas modifié."
            : confirm === "reopen"
              ? "La session repasse « En cours ».\n\nLe stock théorique du dépôt est remis à jour : les écarts déjà appliqués ne le seront pas une seconde fois."
              : stats.counted < stats.total
                ? `Attention : ${stats.total - stats.counted} produits sur ${stats.total} ne sont pas encore comptés et resteront inchangés.\n\n${stats.varianceCount} écart(s) seront appliqués au stock du dépôt, et la session sera clôturée.\n\nPour continuer plus tard sans clôturer, revenez simplement en arrière : votre comptage est déjà enregistré.`
                : `${stats.varianceCount} écart(s) seront appliqués au stock du dépôt.`
        }
        confirmLabel={
          confirm === "cancel"
            ? "Annuler la session"
            : confirm === "reopen"
              ? "Reprendre"
              : stats.counted < stats.total
                ? "Valider quand même"
                : "Valider"
        }
        cancelLabel="Retour"
        onCancel={() => {
          if (!validateMut.isPending && !cancelMut.isPending && !reopenMut.isPending) setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm === "cancel") cancelMut.mutate();
          else if (confirm === "reopen") {
            setConfirm(null);
            reopenMut.mutate();
          } else if (confirm === "validate") validateMut.mutate();
        }}
      />

      <InventoryReportDialog
        open={reportOpen}
        subtitle={`Le stock du dépôt ${warehouseName} a été mis à jour.`}
        counted={stats.counted}
        total={stats.total}
        varianceCount={stats.varianceCount}
        varianceValue={stats.varianceValue}
        busy={exportBusy}
        onPrint={() => void runExport("print")}
        onDownload={() => void runExport("download")}
        onClose={() => {
          setReportOpen(false);
          onBack();
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
    <div className="rounded-md border border-black/[0.06] bg-fs-surface-container/60 px-3 py-2">
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
              "h-10 w-20 rounded-md border bg-white px-2 text-center text-sm font-bold text-fs-text outline-none focus:ring-2 focus:ring-fs-accent/20",
              counted != null ? "border-fs-accent/40" : "border-black/10",
            )}
            aria-label={`Quantité comptée ${item.productName}`}
          />
          <button
            type="button"
            onClick={onAcceptExpected}
            title="Confirmer la quantité théorique"
            aria-label="Confirmer la quantité théorique"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-black/10 text-emerald-600 hover:bg-emerald-50"
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
