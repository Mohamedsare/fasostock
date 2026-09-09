"use client";

/**
 * « Plan de salle » — la salle vue d'en haut, en temps réel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN QUE LE PATRON REGARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une liste de tables répond à « quelles tables ai-je ? ». Un plan répond à la
 * seule question qui compte pendant le service : « où en est ma salle ? ». Le
 * gérant lève les yeux de sa caisse et voit d'un coup d'œil ce qui est occupé, ce
 * qui attend au passe depuis dix minutes, et ce qui est libre pour le groupe qui
 * vient d'entrer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX MODES, ET UNE SEULE RÈGLE DE COULEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * • CONSULTATION (par défaut) : toucher une table l'ouvre ou rejoint sa commande.
 * • DISPOSITION (bouton « Déplacer ») : on fait glisser les tables pour dessiner
 *   la salle. Les positions sont en POURCENTAGE de la surface — le patron dessine
 *   sur un téléphone de 360 px et le serveur consulte sur une tablette de 1024 :
 *   des pixels donneraient deux plans différents.
 *
 * La couleur ne dit qu'UNE chose : le degré d'urgence. Gris = libre, orange =
 * occupée, ambre pulsé = un plat attend au passe. Rien d'autre n'est en couleur,
 * pour que l'ambre se voie de l'autre bout de la salle.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdCheck,
  MdOpenWith,
  MdOutlineTableBar,
  MdRefresh,
  MdSchedule,
} from "react-icons/md";

import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
} from "@/components/ui/fs-screen-primitives";
import {
  NeedStoreCard,
  RestaurantEmptyCard,
  btnOutline,
  btnPrimary,
  elapsedMinutes,
  timeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { listOrders, openOrder } from "@/lib/features/restaurant/api-orders";
import {
  listAreas,
  listTables,
  listUpcomingReservations,
  saveTablePositions,
} from "@/lib/features/restaurant/api-floor";
import type {
  RestaurantOrderSummary,
  RestaurantReservation,
  RestaurantTable,
} from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

/** Diamètre d'une table sur le plan, en % de la largeur. Deux tailles seulement. */
function tableSizePercent(seats: number): number {
  return seats >= 6 ? 15 : 12;
}

export function RestaurantFloorPlanScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const [arranging, setArranging] = useState(false);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { x: number; y: number }>>({});
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<string | null>(null);

  const areasQ = useQuery({
    queryKey: queryKeys.restaurantAreas(companyId, storeId),
    queryFn: () => listAreas({ companyId, storeId }),
    enabled: Boolean(companyId && storeId),
    staleTime: 60_000,
  });

  const tablesQ = useQuery({
    queryKey: queryKeys.restaurantTables(companyId, storeId),
    queryFn: () => listTables({ companyId, storeId }),
    enabled: Boolean(companyId && storeId),
    staleTime: 60_000,
  });

  const ordersQ = useQuery({
    queryKey: queryKeys.restaurantOrders({ companyId, storeId, scope: "open-plan" }),
    queryFn: () =>
      listOrders({ companyId, storeId, statuses: ["open"], limit: 200 }),
    enabled: Boolean(companyId && storeId),
    // Même rythme que la salle : au-delà de dix secondes, la pastille « prêt » ment.
    refetchInterval: arranging ? false : 10_000,
  });

  const reservationsQ = useQuery({
    queryKey: queryKeys.restaurantReservations({
      companyId,
      storeId,
      from: "now",
      to: "+3h",
    }),
    queryFn: () => listUpcomingReservations({ companyId, storeId }),
    enabled: Boolean(companyId && storeId),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (positions: Array<{ id: string; x: number; y: number }>) =>
      saveTablePositions(positions),
    onSuccess: async () => {
      setArranging(false);
      setDraft({});
      toast.success("Plan enregistré.");
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
    onError: (e) => toastMutationError("restaurant-floor-save", e),
  });

  const openMut = useMutation({
    mutationFn: (tableId: string) =>
      openOrder({
        companyId,
        storeId: storeId!,
        serviceType: "dine_in",
        tableId,
        covers: 2,
      }),
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
      router.push(`/restaurant/commande/${id}`);
    },
    onError: (e) => toastMutationError("restaurant-floor-open", e),
  });

  const areas = useMemo(() => areasQ.data ?? [], [areasQ.data]);
  const tables = useMemo(() => tablesQ.data ?? [], [tablesQ.data]);
  const orders = useMemo(() => ordersQ.data?.rows ?? [], [ordersQ.data]);
  const reservations = useMemo(() => reservationsQ.data ?? [], [reservationsQ.data]);

  const orderByTable = useMemo(() => {
    const m = new Map<string, RestaurantOrderSummary>();
    for (const o of orders) if (o.tableId) m.set(o.tableId, o);
    return m;
  }, [orders]);

  const reservationByTable = useMemo(() => {
    const m = new Map<string, RestaurantReservation>();
    for (const r of reservations) {
      if (!r.tableId) continue;
      if (r.status !== "booked") continue;
      const prev = m.get(r.tableId);
      // La plus proche dans le temps gagne : c'est celle qui bloque la table.
      if (!prev || Date.parse(r.reservedAt) < Date.parse(prev.reservedAt)) {
        m.set(r.tableId, r);
      }
    }
    return m;
  }, [reservations]);

  const visibleTables = useMemo(
    () => (areaFilter ? tables.filter((t) => t.areaId === areaFilter) : tables),
    [tables, areaFilter],
  );

  /**
   * Les tables jamais posées sur le plan reçoivent une position de départ en grille.
   * Sans cela, un restaurant qui vient de créer douze tables verrait douze pastilles
   * empilées dans le coin supérieur gauche — et conclurait que le plan ne marche pas.
   */
  const positioned = useMemo(() => {
    const perRow = 4;
    // Les tables jamais posées sont numérotées d'abord : leur rang dans CETTE liste
    // décide de leur case de départ, indépendamment de celles déjà placées.
    const unplaced = visibleTables.filter(
      (t) => !draft[t.id] && (t.x === null || t.y === null),
    );
    const slotOf = new Map(unplaced.map((t, i) => [t.id, i]));

    return visibleTables.map((t) => {
      const d = draft[t.id];
      if (d) return { table: t, x: d.x, y: d.y };
      if (t.x !== null && t.y !== null) return { table: t, x: t.x, y: t.y };
      const slot = slotOf.get(t.id) ?? 0;
      const col = slot % perRow;
      const row = Math.floor(slot / perRow);
      return { table: t, x: 12 + col * 25, y: 12 + row * 22 };
    });
  }, [visibleTables, draft]);

  const moveTo = useCallback(
    (id: string, clientX: number, clientY: number) => {
      const el = surfaceRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const x = ((clientX - r.left) / r.width) * 100;
      const y = ((clientY - r.top) / r.height) * 100;
      setDraft((prev) => ({
        ...prev,
        [id]: {
          x: Math.min(94, Math.max(4, Number(x.toFixed(2)))),
          y: Math.min(92, Math.max(4, Number(y.toFixed(2)))),
        },
      }));
    },
    [],
  );

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title="Plan de salle" subtitle="Votre salle, vue d'en haut." />
        <NeedStoreCard />
      </FsPage>
    );
  }

  const busy = orders.filter((o) => o.tableId).length;
  const ready = orders.filter((o) => o.hasReadyItems).length;

  return (
    <FsPage className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Plan de salle"
          subtitle={
            arranging
              ? "Faites glisser les tables pour dessiner votre salle, puis enregistrez."
              : "Touchez une table pour ouvrir ou rejoindre sa commande."
          }
          className="mb-0 min-w-0 flex-1"
        />
        <div className="flex shrink-0 gap-2">
          {arranging ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setArranging(false);
                  setDraft({});
                }}
                className={cn(btnOutline, "min-h-11")}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={saveMut.isPending}
                onClick={() =>
                  saveMut.mutate(
                    positioned.map((p) => ({ id: p.table.id, x: p.x, y: p.y })),
                  )
                }
                className={cn(btnPrimary, "min-h-11")}
              >
                <MdCheck className="h-5 w-5" aria-hidden />
                Enregistrer
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void ordersQ.refetch()}
                className={cn(btnOutline, "min-h-11 px-3")}
                aria-label="Actualiser"
              >
                <MdRefresh
                  className={cn("h-5 w-5", ordersQ.isFetching && "animate-spin")}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={() => setArranging(true)}
                className={cn(btnOutline, "min-h-11")}
              >
                <MdOpenWith className="h-5 w-5" aria-hidden />
                Déplacer
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Synthèse : trois chiffres, pas un de plus ── */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Tables" value={String(tables.length)} tone="neutral" />
        <MiniStat label="Occupées" value={String(busy)} tone="accent" />
        <MiniStat label="Prêt au passe" value={String(ready)} tone="warn" />
      </div>

      {areas.length > 0 ? (
        <div className="fs-scroll-x mt-3 flex gap-1.5 overflow-x-auto pb-1">
          <AreaChip
            label="Toute la salle"
            color={null}
            selected={areaFilter === null}
            onClick={() => setAreaFilter(null)}
          />
          {areas.map((a) => (
            <AreaChip
              key={a.id}
              label={a.name}
              color={a.color}
              selected={areaFilter === a.id}
              onClick={() => setAreaFilter(a.id)}
            />
          ))}
        </div>
      ) : null}

      {tablesQ.isError ? (
        <FsQueryErrorPanel
          error={tablesQ.error}
          onRetry={() => void tablesQ.refetch()}
          className="mt-3"
        />
      ) : tables.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdOutlineTableBar}
            title="Votre salle est vide"
            message="Créez d'abord vos tables : elles apparaîtront ici, et vous pourrez les disposer comme dans la réalité."
            action={
              <Link href="/restaurant/salle/tables" className={btnPrimary}>
                Créer mes tables
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {/*
            La surface. `aspect-[4/3]` plutôt qu'une hauteur fixe : le plan garde les
            mêmes proportions sur un téléphone et sur une tablette, donc les positions
            en pourcentage donnent exactement le même dessin partout.
          */}
          <div
            ref={surfaceRef}
            className={cn(
              "relative mt-3 w-full overflow-hidden rounded-[16px] border bg-fs-surface-container/50",
              "aspect-[4/3] min-[900px]:aspect-[16/9]",
              arranging
                ? "border-dashed border-fs-accent/50 touch-none"
                : "border-black/[0.07]",
            )}
            onPointerMove={(e) => {
              if (!arranging || !dragRef.current) return;
              e.preventDefault();
              moveTo(dragRef.current, e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerLeave={() => {
              dragRef.current = null;
            }}
          >
            {/* Trame discrète : donne l'échelle sans attirer l'œil. */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.06) 1px, transparent 1px)",
                backgroundSize: "10% 12.5%",
              }}
              aria-hidden
            />

            {positioned.map(({ table, x, y }) => (
              <TableDot
                key={table.id}
                table={table}
                x={x}
                y={y}
                order={orderByTable.get(table.id) ?? null}
                reservation={reservationByTable.get(table.id) ?? null}
                arranging={arranging}
                busy={openMut.isPending}
                onPointerDown={() => {
                  if (arranging) dragRef.current = table.id;
                }}
                onActivate={() => {
                  if (arranging) return;
                  const existing = orderByTable.get(table.id);
                  if (existing) {
                    router.push(`/restaurant/commande/${existing.id}`);
                    return;
                  }
                  openMut.mutate(table.id);
                }}
              />
            ))}
          </div>

          <Legend />
        </>
      )}
    </FsPage>
  );
}

/**
 * Une table sur le plan. Le bouton fait au moins 56 px : on le touche debout, en
 * marchant, parfois avec un plateau dans l'autre main.
 */
function TableDot({
  table,
  x,
  y,
  order,
  reservation,
  arranging,
  busy,
  onPointerDown,
  onActivate,
}: {
  table: RestaurantTable;
  x: number;
  y: number;
  order: RestaurantOrderSummary | null;
  reservation: RestaurantReservation | null;
  arranging: boolean;
  busy: boolean;
  onPointerDown: () => void;
  onActivate: () => void;
}) {
  const size = tableSizePercent(table.seats);
  const minutes = order ? elapsedMinutes(order.openedAt) : null;
  const late = minutes !== null && minutes >= 90;

  const tone = order
    ? order.hasReadyItems
      ? "border-amber-500 bg-amber-500/25 text-amber-900 dark:text-amber-200"
      : late
        ? "border-rose-500/70 bg-rose-500/15 text-rose-900 dark:text-rose-200"
        : "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)] text-fs-accent"
    : reservation
      ? "border-violet-500/60 bg-violet-500/12 text-violet-800 dark:text-violet-300"
      : "border-black/12 bg-fs-card text-neutral-600";

  const radius =
    table.shape === "round" ? "rounded-full" : table.shape === "square" ? "rounded-xl" : "rounded-lg";

  return (
    <button
      type="button"
      disabled={busy}
      onPointerDown={onPointerDown}
      onClick={onActivate}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}%`,
        minWidth: 56,
      }}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 border-2 shadow-sm transition-transform",
        radius,
        tone,
        arranging ? "cursor-grab active:cursor-grabbing active:scale-110" : "active:scale-95",
        table.shape === "rect" ? "aspect-[3/2]" : "aspect-square",
        order?.hasReadyItems && !arranging ? "animate-pulse" : "",
      )}
      aria-label={
        order
          ? `Table ${table.label}, occupée depuis ${minutes ?? 0} minutes`
          : `Table ${table.label}, libre`
      }
    >
      <span className="flex h-full w-full flex-col items-center justify-center px-1 leading-none">
        <span className="text-[13px] font-extrabold sm:text-sm">{table.label}</span>
        {order ? (
          <>
            <span className="mt-0.5 text-[10px] font-bold tabular-nums">
              {minutes !== null ? `${minutes}′` : ""}
            </span>
            <span className="mt-0.5 hidden text-[9px] font-semibold tabular-nums opacity-80 min-[560px]:block">
              {formatCurrency(order.total)}
            </span>
          </>
        ) : reservation ? (
          <span className="mt-0.5 text-[9px] font-semibold">
            {timeLabel(reservation.reservedAt)}
          </span>
        ) : (
          <span className="mt-0.5 text-[10px] font-medium opacity-70">
            {table.seats} pl.
          </span>
        )}
      </span>
    </button>
  );
}

function Legend() {
  return (
    <FsCard className="mt-3" padding="p-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-neutral-600">
        <LegendDot className="border-black/12 bg-fs-card" label="Libre" />
        <LegendDot
          className="border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)]"
          label="Occupée"
        />
        <LegendDot className="border-amber-500 bg-amber-500/25" label="Prêt au passe" />
        <LegendDot className="border-rose-500/70 bg-rose-500/15" label="Plus de 1 h 30" />
        <LegendDot className="border-violet-500/60 bg-violet-500/12" label="Réservée" />
      </div>
    </FsCard>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 shrink-0 rounded-full border-2", className)} aria-hidden />
      {label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "accent" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border px-3 py-2",
        tone === "accent"
          ? "border-fs-accent/25 bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)]"
          : tone === "warn"
            ? "border-amber-500/25 bg-amber-500/[0.07]"
            : "border-black/[0.07] bg-fs-card",
      )}
    >
      <p className="text-[11px] font-medium text-neutral-600">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-extrabold tabular-nums leading-none",
          tone === "accent"
            ? "text-fs-accent"
            : tone === "warn"
              ? "text-amber-700 dark:text-amber-400"
              : "text-fs-text",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function AreaChip({
  label,
  color,
  selected,
  onClick,
}: {
  label: string;
  color: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fs-touch-target inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        selected
          ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
          : "border-black/[0.08] bg-fs-card text-neutral-700",
      )}
    >
      {color ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : (
        <MdSchedule className="hidden" aria-hidden />
      )}
      {label}
    </button>
  );
}
