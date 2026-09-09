"use client";

/**
 * « Pertes / Gaspillage » — la deuxième cause de disparition du bénéfice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le plat renvoyé, la marmite brûlée, les dix bières périmées, le poisson qui a
 * tourné parce que le congélateur s'est arrêté. Dans une boutique c'est rare ; dans
 * un restaurant c'est quotidien. Non enregistré, ça devient un manquant à
 * l'inventaire de fin de mois que personne ne sait expliquer — et qu'on finit par
 * mettre sur le dos du personnel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRAIREMENT À LA COMMANDE, LA PERTE TOUCHE AU STOCK
 * ─────────────────────────────────────────────────────────────────────────────
 * La marchandise est réellement partie. Le RPC écrit un vrai mouvement `loss`,
 * comme le reste de l'application. Mais il ne REFUSE pas la saisie quand le stock
 * est absent ou insuffisant : un ingrédient jamais compté (l'huile au litre) n'a
 * pas de ligne d'inventaire, et bloquer là ferait renoncer à enregistrer la perte —
 * donc perdre l'information ET l'argent. La ligne dit ensuite lequel des deux cas
 * s'est produit.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdDeleteSweep,
  MdInfoOutline,
  MdSearch,
} from "react-icons/md";

import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsPager } from "@/components/ui/fs-pager";
import {
  NeedStoreCard,
  RestaurantEmptyCard,
  RestaurantSheet,
  btnPrimary,
  dateTimeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { listWaste, recordWaste } from "@/lib/features/restaurant/api-ops";
import { listMenu } from "@/lib/features/restaurant/api-menu";
import {
  RESTAURANT_PAGE_SIZE,
  WASTE_REASON_LABELS,
  type MenuItem,
  type WasteReason,
} from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

function norm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Les bornes de la période affichée. Le mois en cours par défaut. */
function monthBounds(): { fromIso: string; toIso: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { fromIso: first.toISOString(), toIso: now.toISOString() };
}

export function RestaurantWasteScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const [page, setPage] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const bounds = useMemo(() => monthBounds(), []);

  const storeNames = useMemo(
    () => new Map((ctx.data?.stores ?? []).map((s) => [s.id, s.name])),
    [ctx.data?.stores],
  );

  const listQ = useQuery({
    queryKey: queryKeys.restaurantWaste({ companyId, storeId, scope: "month", page }),
    queryFn: () =>
      listWaste({
        companyId,
        storeId,
        storeNames,
        fromIso: bounds.fromIso,
        toIso: bounds.toIso,
        limit: RESTAURANT_PAGE_SIZE,
        offset: page * RESTAURANT_PAGE_SIZE,
      }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const menuQ = useQuery({
    queryKey: queryKeys.restaurantMenu(companyId, storeId),
    queryFn: () => listMenu({ companyId, storeId }),
    enabled: Boolean(companyId && newOpen),
    staleTime: 60_000,
  });

  const recordMut = useMutation({
    mutationFn: (p: {
      productId: string;
      quantity: number;
      reason: WasteReason;
      note: string | null;
    }) => recordWaste({ companyId, storeId: storeId!, ...p }),
    onSuccess: async () => {
      setNewOpen(false);
      toast.success("Perte enregistrée. Le stock a été ajusté.");
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
      await qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) });
    },
    onError: (e) => toastMutationError("restaurant-waste-record", e),
  });

  const rows = useMemo(() => listQ.data?.rows ?? [], [listQ.data]);

  /**
   * Le total du mois, calculé sur la PAGE affichée seulement — et dit comme tel.
   * Annoncer « total du mois » à partir de vingt lignes serait un chiffre faux, et
   * un chiffre faux sur de l'argent perdu vaut moins que pas de chiffre du tout.
   */
  const pageCost = rows.reduce((s, r) => s + r.unitCost * r.quantity, 0);

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title="Pertes" subtitle="Ce qui est jeté, cassé ou renvoyé." />
        <NeedStoreCard />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Pertes / Gaspillage"
          subtitle="Ce qui est jeté, cassé ou renvoyé. Enregistré ici, ce n'est plus un manquant inexpliqué à l'inventaire."
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className={cn(btnPrimary, "min-h-11 shrink-0")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Enregistrer une perte
        </button>
      </div>

      {rows.length > 0 ? (
        <FsCard className="mt-3" padding="p-3">
          <p className="text-xs font-medium text-neutral-600">
            Coût des {rows.length} perte{rows.length > 1 ? "s" : ""} affichée
            {rows.length > 1 ? "s" : ""}
          </p>
          <p className="mt-0.5 text-2xl font-extrabold tabular-nums leading-none text-rose-700 dark:text-rose-400">
            {formatCurrency(pageCost)}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">
            Au prix d&apos;achat, sur cette page uniquement. Le total du mois complet se
            lit dans Rapports.
          </p>
        </FsCard>
      ) : null}

      {listQ.isError ? (
        <FsQueryErrorPanel
          error={listQ.error}
          onRetry={() => void listQ.refetch()}
          className="mt-3"
        />
      ) : listQ.isPending ? (
        <div className="mt-10 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdDeleteSweep}
            title="Aucune perte enregistrée ce mois-ci"
            message="C'est une bonne nouvelle — ou le signe que personne ne les note. Les pertes non enregistrées reviennent en manquants à l'inventaire."
            action={
              <button type="button" onClick={() => setNewOpen(true)} className={btnPrimary}>
                <MdAdd className="h-5 w-5" aria-hidden />
                Enregistrer une perte
              </button>
            }
          />
        </div>
      ) : (
        <>
          <FsCard className="mt-3" padding="p-0">
            <ul className="divide-y divide-black/[0.06]">
              {rows.map((w) => (
                <li key={w.id} className="px-3 py-2.5 sm:px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fs-text">
                        {w.quantity} × {w.productName}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-500">
                        <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-700 dark:text-rose-400">
                          {WASTE_REASON_LABELS[w.reason]}
                        </span>
                        <span>{dateTimeLabel(w.createdAt)}</span>
                        {w.createdByName ? <span>· {w.createdByName}</span> : null}
                        {w.storeName ? <span>· {w.storeName}</span> : null}
                      </p>
                      {w.note ? (
                        <p className="mt-0.5 text-xs italic text-neutral-600">
                          « {w.note} »
                        </p>
                      ) : null}
                      {!w.stockDeducted ? (
                        <p className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                          <MdInfoOutline className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          Stock non déduit : cet article n&apos;est pas compté en
                          inventaire dans cette boutique.
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-rose-700 dark:text-rose-400">
                      {formatCurrency(w.unitCost * w.quantity)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </FsCard>

          <FsPager
            page={page}
            hasMore={listQ.data?.hasMore ?? false}
            pageSize={RESTAURANT_PAGE_SIZE}
            rowsOnPage={rows.length}
            busy={listQ.isFetching}
            onPageChange={setPage}
            itemLabel="Pertes"
            className="mt-3"
          />
        </>
      )}

      {newOpen ? (
        <WasteSheet
          menu={menuQ.data ?? []}
          loading={menuQ.isPending}
          busy={recordMut.isPending}
          onClose={() => setNewOpen(false)}
          onSubmit={(p) => recordMut.mutate(p)}
        />
      ) : null}
    </FsPage>
  );
}

function WasteSheet({
  menu,
  loading,
  busy,
  onClose,
  onSubmit,
}: {
  menu: MenuItem[];
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    productId: string;
    quantity: number;
    reason: WasteReason;
    note: string | null;
  }) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<MenuItem | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<WasteReason>("spoiled");
  const [note, setNote] = useState("");

  const results = useMemo(() => {
    const q = norm(search);
    if (!q) return menu.slice(0, 20);
    return menu.filter((m) => norm(m.name).includes(q)).slice(0, 30);
  }, [menu, search]);

  const cost = picked ? picked.purchasePrice * (Number(qty) || 0) : 0;

  return (
    <RestaurantSheet
      open
      title="Enregistrer une perte"
      subtitle="Le stock sera déduit, et le coût gardé en mémoire."
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || !picked || (Number(qty) || 0) <= 0}
          onClick={() =>
            picked &&
            onSubmit({
              productId: picked.productId,
              quantity: Math.max(1, Math.trunc(Number(qty) || 1)),
              reason,
              note: note.trim() || null,
            })
          }
          className={cn(btnPrimary, "w-full min-h-12")}
        >
          Enregistrer{cost > 0 ? ` · ${formatCurrency(cost)}` : ""}
        </button>
      }
    >
      {picked ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)] px-3 py-2.5 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-fs-accent">
                {picked.name}
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-600">
                Coût unitaire {formatCurrency(picked.purchasePrice)}
                {picked.stock !== null ? ` · ${picked.stock} en stock` : ""}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-fs-accent">changer</span>
          </button>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Quantité perdue
            </span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={fsInputClass()}
              autoFocus
            />
            {picked.stock !== null && Number(qty) > picked.stock ? (
              <span className="mt-1 block text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                Vous déclarez plus que le stock connu ({picked.stock}). La perte sera
                quand même enregistrée, le stock descendra à zéro sans passer en négatif.
              </span>
            ) : null}
          </label>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-700">Cause</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(WASTE_REASON_LABELS) as WasteReason[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "fs-touch-target rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    reason === r
                      ? "border-rose-500/40 bg-rose-500/[0.12] text-rose-700 dark:text-rose-400"
                      : "border-black/[0.08] bg-fs-card text-neutral-700",
                  )}
                >
                  {WASTE_REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Précision
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Congélateur en panne, client a renvoyé le plat…"
              className={fsInputClass()}
            />
          </label>
        </div>
      ) : (
        <>
          <div className="relative">
            <MdSearch
              className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              type="search"
              inputMode="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Quel article ?"
              className={fsInputClass("pl-10")}
              autoFocus
            />
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-neutral-600">Chargement…</p>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-600">
              Aucun article ne correspond.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-black/[0.06]">
              {results.map((m) => (
                <li key={m.productId}>
                  <button
                    type="button"
                    onClick={() => setPicked(m)}
                    className="fs-touch-target flex w-full items-center justify-between gap-2 py-2.5 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fs-text">
                        {m.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-neutral-500">
                        Coût {formatCurrency(m.purchasePrice)}
                        {m.stock !== null ? ` · ${m.stock} en stock` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </RestaurantSheet>
  );
}
