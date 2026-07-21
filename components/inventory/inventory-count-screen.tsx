"use client";

import { FsCard, FsPage, FsQueryErrorPanel } from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { ProductListThumbnail, firstProductImageUrl } from "@/components/products/product-list-thumbnail";
import { P } from "@/lib/constants/permissions";
import { listProducts } from "@/lib/features/products/api";
import { ROUTES } from "@/lib/config/routes";
import {
  cancelInventorySession,
  getInventorySession,
  listInventorySessionItems,
  setInventoryCount,
  validateInventorySession,
} from "@/lib/features/inventory/sessions/api";
import type { InventorySessionItem } from "@/lib/features/inventory/sessions/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MdArrowBack,
  MdCheck,
  MdCheckCircle,
  MdClose,
  MdSearch,
} from "react-icons/md";

type CountFilter = "all" | "todo" | "done" | "variance";

export function InventoryCountScreen({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: ctx, hasPermission } = usePermissions();
  const isOwner = ctx?.roleSlug === "owner";
  const canDoInventory = isOwner || hasPermission(P.stockAdjust);
  const companyId = ctx?.companyId ?? "";

  // Miniatures produit — chargées en direct (pas dans le snapshot de session).
  const imagesQ = useQuery({
    queryKey: ["inventory-session-images", companyId] as const,
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

  const sessionKey = ["inventory-session", sessionId] as const;
  const itemsKey = ["inventory-session-items", sessionId] as const;

  const sessionQ = useQuery({
    queryKey: sessionKey,
    queryFn: () => getInventorySession(sessionId),
  });
  const itemsQ = useQuery({
    queryKey: itemsKey,
    queryFn: () => listInventorySessionItems(sessionId),
  });

  const session = sessionQ.data ?? null;
  const isOpen = session?.status === "open";
  const editable = isOpen && canDoInventory;

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

  /** Met à jour optimiste la ligne dans le cache. */
  function patchItem(itemId: string, countedQty: number, expectedQty: number) {
    qc.setQueryData<InventorySessionItem[]>(itemsKey, (prev) =>
      (prev ?? []).map((it) =>
        it.id === itemId
          ? { ...it, countedQty, variance: countedQty - expectedQty, countedAt: new Date().toISOString() }
          : it,
      ),
    );
  }

  const setCountMut = useMutation({
    mutationFn: (v: { itemId: string; countedQty: number }) => setInventoryCount(v),
    onError: (e) => {
      toast.error(messageFromUnknownError(e));
      void itemsQ.refetch();
    },
  });

  const validateMut = useMutation({
    mutationFn: () => validateInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Inventaire validé — le stock a été mis à jour.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["inventory-sessions", session?.storeId] }),
        qc.invalidateQueries({ queryKey: sessionKey }),
        qc.invalidateQueries({ queryKey: itemsKey }),
      ]);
      router.push(ROUTES.inventorySessions);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelInventorySession(sessionId),
    onSuccess: async () => {
      toast.success("Session annulée.");
      await qc.invalidateQueries({ queryKey: ["inventory-sessions", session?.storeId] });
      router.push(ROUTES.inventorySessions);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function commitCount(it: InventorySessionItem, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") return; // vide = on ne touche pas
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) return;
    if (it.countedQty === n) return; // inchangé
    patchItem(it.id, n, it.expectedQty);
    setCountMut.mutate({ itemId: it.id, countedQty: n });
  }

  if (sessionQ.isError) {
    return (
      <FsPage>
        <BackLink />
        <FsQueryErrorPanel error={sessionQ.error} onRetry={() => sessionQ.refetch()} />
      </FsPage>
    );
  }
  if (sessionQ.isLoading || !session) {
    return (
      <FsPage>
        <BackLink />
        <FsCard className="mt-3" padding="p-6">
          <p className="text-sm text-neutral-600">Chargement…</p>
        </FsCard>
      </FsPage>
    );
  }

  const progress = stats.total > 0 ? Math.round((stats.counted / stats.total) * 100) : 0;

  return (
    <FsPage>
      <BackLink />

      {/* En-tête session */}
      <FsCard className="mt-2" padding="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-fs-text">
                {session.note || "Inventaire"}
              </h1>
              <StatusBadge status={session.status} />
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {new Date(session.startedAt).toLocaleString("fr-FR")}
            </p>
          </div>
          {!editable && isOpen ? (
            <span className="text-xs font-semibold text-amber-600">Lecture seule (droit insuffisant)</span>
          ) : null}
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
              className={cn("h-full rounded-full", session.status === "closed" ? "bg-emerald-500" : "bg-fs-accent")}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Résumé écarts */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniStat label="Comptés" value={String(stats.counted)} />
          <MiniStat label="Écarts" value={String(stats.varianceCount)} />
          <MiniStat
            label="Valeur écarts (achat)"
            value={`${stats.varianceValue > 0 ? "+" : ""}${formatCurrency(stats.varianceValue)}`}
            tone={stats.varianceValue < 0 ? "red" : stats.varianceValue > 0 ? "green" : "muted"}
          />
        </div>
      </FsCard>

      {/* Recherche + filtres */}
      <FsCard className="mt-3" padding="p-3">
        <div className="relative">
          <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" aria-hidden />
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
                editable={editable}
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
      {editable ? (
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
            ? "La session sera annulée. Le stock ne sera pas modifié."
            : stats.counted < stats.total
              ? `${stats.counted}/${stats.total} produits comptés. Les non comptés resteront inchangés.\n\n${stats.varianceCount} écart(s) seront appliqués au stock.`
              : `${stats.varianceCount} écart(s) seront appliqués au stock.`
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
    </FsPage>
  );
}

function BackLink() {
  return (
    <Link
      href={ROUTES.inventorySessions}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-fs-accent"
    >
      <MdArrowBack className="h-5 w-5" aria-hidden />
      Inventaires
    </Link>
  );
}

function StatusBadge({ status }: { status: "open" | "closed" | "cancelled" }) {
  const map = {
    open: { label: "En cours", className: "bg-amber-500/12 text-amber-700" },
    closed: { label: "Validé", className: "bg-emerald-500/12 text-emerald-700" },
    cancelled: { label: "Annulé", className: "bg-neutral-400/15 text-neutral-500" },
  } as const;
  const m = map[status];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold", m.className)}>{m.label}</span>
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
    tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-700" : tone === "muted" ? "text-neutral-400" : "text-fs-text";
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
  item: InventorySessionItem;
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
