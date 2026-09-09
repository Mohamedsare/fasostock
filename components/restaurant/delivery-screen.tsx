"use client";

/**
 * « Livraison » — livreurs, zones, et surtout le suivi des courses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ENDROIT OÙ L'ARGENT SORT SANS QU'UNE VENTE LE DISE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le livreur part avec trois commandes et de la monnaie. Il revient une heure plus
 * tard avec de l'argent, un client qui n'était pas là, et une commande dont
 * personne ne sait si elle a été payée. Aujourd'hui, tout ça tient dans sa tête et
 * dans celle du gérant — jusqu'au jour où les deux ne disent plus la même chose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS VUES, UNE SEULE DONNÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le suivi est la vue par défaut : c'est celle qu'on regarde pendant le service.
 * Les livreurs et les zones sont de la configuration, consultée une fois par mois.
 *
 * Un livreur n'a PAS besoin d'un compte applicatif. La plupart sont des jeunes du
 * quartier avec une moto et un téléphone ; exiger un compte reviendrait à ne
 * jamais se servir du module (voir 00221).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdCheckCircle,
  MdDeleteOutline,
  MdDeliveryDining,
  MdEdit,
  MdMap,
  MdPhone,
  MdPlace,
  MdTwoWheeler,
} from "react-icons/md";

import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import {
  NeedStoreCard,
  RestaurantEmptyCard,
  RestaurantSheet,
  WaitBadge,
  btnDanger,
  btnGhost,
  btnOutline,
  btnPrimary,
  timeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { listOrders } from "@/lib/features/restaurant/api-orders";
import {
  deleteCourier,
  deleteDeliveryZone,
  listCouriers,
  listDeliveryZones,
  setDelivery,
  upsertCourier,
  upsertDeliveryZone,
} from "@/lib/features/restaurant/api-ops";
import {
  COURIER_VEHICLE_LABELS,
  DELIVERY_STATE_LABELS,
  type Courier,
  type CourierVehicle,
  type DeliveryState,
  type DeliveryZone,
  type RestaurantOrderSummary,
} from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

export type DeliveryView = "tracking" | "couriers" | "zones";

/* ═══════════════════════════ Suivi ═══════════════════════════ */

const STATE_TONE: Record<DeliveryState, string> = {
  pending: "bg-neutral-500/10 text-neutral-600",
  assigned: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  on_route: "bg-fs-accent/15 text-fs-accent",
  delivered: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  failed: "bg-rose-500/12 text-rose-700 dark:text-rose-400",
};

export function RestaurantDeliveryScreen({ view }: { view: DeliveryView }) {
  if (view === "couriers") return <CouriersView />;
  if (view === "zones") return <ZonesView />;
  return <TrackingView />;
}

function TrackingView() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const [assignFor, setAssignFor] = useState<RestaurantOrderSummary | null>(null);
  const [failFor, setFailFor] = useState<RestaurantOrderSummary | null>(null);
  const [failReason, setFailReason] = useState("");

  const ordersQ = useQuery({
    queryKey: queryKeys.restaurantOrders({
      companyId,
      storeId,
      scope: "delivery-tracking",
    }),
    queryFn: () =>
      listOrders({
        companyId,
        storeId,
        serviceTypes: ["delivery"],
        statuses: ["open", "paid"],
        limit: 100,
      }),
    enabled: Boolean(companyId && storeId),
    refetchInterval: 15_000,
  });

  const couriersQ = useQuery({
    queryKey: queryKeys.restaurantCouriers(companyId, storeId),
    queryFn: () => listCouriers({ companyId, storeId, withActiveCount: true }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const zonesQ = useQuery({
    queryKey: queryKeys.restaurantZones(companyId, storeId),
    queryFn: () => listDeliveryZones({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
  });

  const setMut = useMutation({
    mutationFn: (p: {
      orderId: string;
      state: DeliveryState;
      courierId?: string | null;
      zoneId?: string | null;
      fee?: number | null;
      reason?: string | null;
    }) => setDelivery(p),
    onSuccess: async () => {
      setAssignFor(null);
      setFailFor(null);
      setFailReason("");
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
    onError: (e) => toastMutationError("restaurant-delivery-set", e),
  });

  const orders = useMemo(() => ordersQ.data?.rows ?? [], [ordersQ.data]);

  /* Les courses terminées descendent : ce qui est dehors se lit en premier. */
  const sorted = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const done = (o: RestaurantOrderSummary) =>
          o.deliveryState === "delivered" || o.deliveryState === "failed" ? 1 : 0;
        if (done(a) !== done(b)) return done(a) - done(b);
        return Date.parse(b.openedAt) - Date.parse(a.openedAt);
      }),
    [orders],
  );

  const outCount = orders.filter(
    (o) => o.deliveryState === "assigned" || o.deliveryState === "on_route",
  ).length;

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title="Suivi des livraisons" subtitle="Ce qui est dehors, maintenant." />
        <NeedStoreCard />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Suivi des livraisons"
        subtitle="Ce qui est prêt à partir, ce qui est dehors, ce qui est arrivé."
      />

      {outCount > 0 ? (
        <div className="mb-3 flex items-center gap-2 rounded-[12px] border border-fs-accent/25 bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)] px-3 py-2.5">
          <MdTwoWheeler className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
          <p className="text-sm font-semibold text-fs-accent">
            {outCount} course{outCount > 1 ? "s" : ""} en cours
          </p>
        </div>
      ) : null}

      {ordersQ.isError ? (
        <FsQueryErrorPanel error={ordersQ.error} onRetry={() => void ordersQ.refetch()} />
      ) : ordersQ.isPending ? (
        <div className="mt-10 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : sorted.length === 0 ? (
        <RestaurantEmptyCard
          icon={MdDeliveryDining}
          title="Aucune livraison"
          message="Les commandes en livraison apparaissent ici dès qu'un serveur en ouvre une."
          action={
            <Link href="/restaurant/ventes/livraisons" className={btnPrimary}>
              <MdAdd className="h-5 w-5" aria-hidden />
              Nouvelle livraison
            </Link>
          }
        />
      ) : (
        <div className="grid gap-2 min-[860px]:grid-cols-2">
          {sorted.map((o) => {
            const state = o.deliveryState ?? "pending";
            const done = state === "delivered" || state === "failed";
            return (
              <FsCard key={o.id} padding="p-3" className={cn(done && "opacity-75")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-fs-text">
                      {o.customerName ?? o.contactName ?? o.orderNumber}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {o.orderNumber} · {timeLabel(o.openedAt)} ·{" "}
                      {formatCurrency(o.total + o.deliveryFee)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      STATE_TONE[state],
                    )}
                  >
                    {DELIVERY_STATE_LABELS[state]}
                  </span>
                </div>

                {o.deliveryAddress ? (
                  <p className="mt-1.5 flex items-start gap-1 text-xs text-neutral-700">
                    <MdPlace className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {o.deliveryAddress}
                  </p>
                ) : null}

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
                  {o.contactPhone ? (
                    <a
                      href={`tel:${o.contactPhone.replace(/\s/g, "")}`}
                      className="fs-touch-target inline-flex items-center gap-1 font-semibold text-fs-accent"
                    >
                      <MdPhone className="h-3.5 w-3.5" aria-hidden />
                      {o.contactPhone}
                    </a>
                  ) : null}
                  {o.courierName ? <span>Livreur : {o.courierName}</span> : null}
                  {o.zoneName ? <span>Zone : {o.zoneName}</span> : null}
                  {o.deliveryFee > 0 ? (
                    <span>Course : {formatCurrency(o.deliveryFee)}</span>
                  ) : null}
                  {state === "on_route" ? <WaitBadge since={o.dispatchedAt} warnAfter={30} lateAfter={60} /> : null}
                </div>

                {o.deliveryFailureReason ? (
                  <p className="mt-1.5 rounded-[8px] bg-rose-500/[0.08] px-2.5 py-1.5 text-[11px] text-rose-800 dark:text-rose-300">
                    Échec : {o.deliveryFailureReason}
                  </p>
                ) : null}

                {!done ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {state === "pending" || !o.courierId ? (
                      <button
                        type="button"
                        onClick={() => setAssignFor(o)}
                        className={cn(btnPrimary, "min-h-10 flex-1 text-xs")}
                      >
                        <MdTwoWheeler className="h-4 w-4" aria-hidden />
                        Confier à un livreur
                      </button>
                    ) : state === "assigned" ? (
                      <button
                        type="button"
                        disabled={setMut.isPending}
                        onClick={() => setMut.mutate({ orderId: o.id, state: "on_route" })}
                        className={cn(btnPrimary, "min-h-10 flex-1 text-xs")}
                      >
                        Il est parti
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={setMut.isPending}
                        onClick={() => setMut.mutate({ orderId: o.id, state: "delivered" })}
                        className={cn(btnPrimary, "min-h-10 flex-1 text-xs")}
                      >
                        <MdCheckCircle className="h-4 w-4" aria-hidden />
                        Livrée
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setFailFor(o);
                        setFailReason("");
                      }}
                      className={cn(btnOutline, "min-h-10 text-xs")}
                    >
                      Échec
                    </button>
                    <Link
                      href={`/restaurant/commande/${o.id}`}
                      className={cn(btnOutline, "min-h-10 text-xs")}
                    >
                      Voir
                    </Link>
                  </div>
                ) : null}
              </FsCard>
            );
          })}
        </div>
      )}

      {assignFor ? (
        <AssignSheet
          order={assignFor}
          couriers={couriersQ.data ?? []}
          zones={zonesQ.data ?? []}
          busy={setMut.isPending}
          onClose={() => setAssignFor(null)}
          onSubmit={(p) => setMut.mutate({ orderId: assignFor.id, state: "assigned", ...p })}
        />
      ) : null}

      <RestaurantSheet
        open={failFor !== null}
        title="Livraison échouée"
        subtitle="Le motif est obligatoire : « client absent » et « adresse fausse » ne se corrigent pas pareil."
        onClose={() => setFailFor(null)}
        footer={
          <button
            type="button"
            disabled={setMut.isPending || failReason.trim().length === 0}
            onClick={() =>
              failFor &&
              setMut.mutate({ orderId: failFor.id, state: "failed", reason: failReason })
            }
            className={cn(btnDanger, "w-full")}
          >
            Marquer échouée
          </button>
        }
      >
        <input
          type="text"
          value={failReason}
          onChange={(e) => setFailReason(e.target.value)}
          placeholder="Client absent, adresse introuvable…"
          className={fsInputClass()}
          autoFocus
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Client absent", "Adresse introuvable", "Refus", "Téléphone éteint"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFailReason(s)}
              className="fs-touch-target rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-neutral-700 active:bg-neutral-100"
            >
              {s}
            </button>
          ))}
        </div>
      </RestaurantSheet>
    </FsPage>
  );
}

function AssignSheet({
  order,
  couriers,
  zones,
  busy,
  onClose,
  onSubmit,
}: {
  order: RestaurantOrderSummary;
  couriers: Courier[];
  zones: DeliveryZone[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: { courierId: string; zoneId: string | null; fee: number }) => void;
}) {
  const [courierId, setCourierId] = useState<string | null>(order.courierId);
  const [zoneId, setZoneId] = useState<string | null>(order.zoneId);
  const [fee, setFee] = useState(String(order.deliveryFee || 0));

  return (
    <RestaurantSheet
      open
      title="Confier la course"
      subtitle={order.deliveryAddress ?? order.orderNumber}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || !courierId}
          onClick={() =>
            courierId &&
            onSubmit({ courierId, zoneId, fee: Math.max(0, Number(fee) || 0) })
          }
          className={cn(btnPrimary, "w-full min-h-12")}
        >
          Confier
        </button>
      }
    >
      {couriers.length === 0 ? (
        <div className="py-6 text-center">
          <MdTwoWheeler className="mx-auto h-10 w-10 text-neutral-300" aria-hidden />
          <p className="mt-2 text-sm text-neutral-600">
            Aucun livreur enregistré. Un livreur n&apos;a pas besoin d&apos;un compte —
            un nom et un téléphone suffisent.
          </p>
          <Link href="/restaurant/livraison/livreurs" className={cn(btnOutline, "mt-4")}>
            Ajouter un livreur
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-700">Livreur</p>
            <div className="space-y-1.5">
              {couriers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCourierId(c.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-[10px] border px-3 py-2.5 text-left",
                    courierId === c.id
                      ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)]"
                      : "border-black/[0.08] bg-fs-card",
                  )}
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold",
                        courierId === c.id ? "text-fs-accent" : "text-fs-text",
                      )}
                    >
                      {c.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                      {COURIER_VEHICLE_LABELS[c.vehicle]}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </span>
                  </span>
                  {c.activeCount && c.activeCount > 0 ? (
                    <span className="shrink-0 rounded-md bg-amber-500/14 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      {c.activeCount} en cours
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {zones.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-700">Zone</p>
              <div className="flex flex-wrap gap-1.5">
                {zones.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => {
                      setZoneId(z.id);
                      setFee(String(z.fee));
                    }}
                    className={cn(
                      "fs-touch-target rounded-full border px-3 py-1.5 text-xs font-semibold",
                      zoneId === z.id
                        ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
                        : "border-black/[0.08] bg-fs-card text-neutral-700",
                    )}
                  >
                    {z.name} · {formatCurrency(z.fee)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Frais de course
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className={fsInputClass()}
            />
            <span className="mt-1 block text-[11px] leading-relaxed text-neutral-500">
              Rappel pour le livreur et le client. Les frais s&apos;encaissent avec
              l&apos;addition, en caisse rapide.
            </span>
          </label>
        </div>
      )}
    </RestaurantSheet>
  );
}

/* ═══════════════════════════ Livreurs ═══════════════════════════ */

function CouriersView() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const [sheet, setSheet] = useState<Courier | "new" | null>(null);

  const listQ = useQuery({
    queryKey: queryKeys.restaurantCouriers(companyId, storeId),
    queryFn: () =>
      listCouriers({ companyId, storeId, includeInactive: true, withActiveCount: true }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (p: {
      id?: string;
      name: string;
      phone: string | null;
      vehicle: CourierVehicle;
      plate: string | null;
      isActive: boolean;
    }) => upsertCourier({ companyId, storeId, ...p }),
    onSuccess: async () => {
      setSheet(null);
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
    onError: (e) => toastMutationError("restaurant-courier-save", e),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCourier(id),
    onSuccess: async () => {
      setSheet(null);
      toast.success("Livreur retiré.");
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
    onError: (e) =>
      toastMutationError(
        "restaurant-courier-delete",
        e,
        "Impossible de supprimer ce livreur : des courses lui sont rattachées. Désactivez-le plutôt.",
      ),
  });

  const couriers = useMemo(() => listQ.data ?? [], [listQ.data]);

  if (!companyId) return null;

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Livreurs"
          subtitle="Un nom et un téléphone suffisent — pas besoin d'un compte dans l'application."
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setSheet("new")}
          className={cn(btnPrimary, "min-h-11 shrink-0")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Nouveau livreur
        </button>
      </div>

      {listQ.isError ? (
        <FsQueryErrorPanel
          error={listQ.error}
          onRetry={() => void listQ.refetch()}
          className="mt-3"
        />
      ) : couriers.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdTwoWheeler}
            title="Aucun livreur"
            message="Inscrivez ceux qui tournent pour vous : c'est la seule façon de savoir qui a quelle commande, et combien de courses chacun a faites."
            action={
              <button type="button" onClick={() => setSheet("new")} className={btnPrimary}>
                <MdAdd className="h-5 w-5" aria-hidden />
                Ajouter un livreur
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 min-[720px]:grid-cols-2">
          {couriers.map((c) => (
            <FsCard
              key={c.id}
              padding="p-3"
              className={cn(!c.isActive && "border-dashed opacity-65")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-fs-text">{c.name}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {COURIER_VEHICLE_LABELS[c.vehicle]}
                    {c.plate ? ` · ${c.plate}` : ""}
                    {c.isActive ? "" : " · inactif"}
                  </p>
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone.replace(/\s/g, "")}`}
                      className="fs-touch-target mt-1 inline-flex items-center gap-1 text-xs font-semibold text-fs-accent"
                    >
                      <MdPhone className="h-3.5 w-3.5" aria-hidden />
                      {c.phone}
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {c.activeCount && c.activeCount > 0 ? (
                    <span className="rounded-md bg-amber-500/14 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      {c.activeCount}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSheet(c)}
                    className={cn(btnGhost, "min-h-9 min-w-9")}
                    aria-label={`Modifier ${c.name}`}
                  >
                    <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </div>
              </div>
            </FsCard>
          ))}
        </div>
      )}

      {sheet !== null ? (
        <CourierSheet
          key={sheet === "new" ? "new" : sheet.id}
          initial={sheet === "new" ? null : sheet}
          busy={saveMut.isPending || deleteMut.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(p) => saveMut.mutate(p)}
          onDelete={(id) => deleteMut.mutate(id)}
        />
      ) : null}
    </FsPage>
  );
}

function CourierSheet({
  initial,
  busy,
  onClose,
  onSubmit,
  onDelete,
}: {
  initial: Courier | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    id?: string;
    name: string;
    phone: string | null;
    vehicle: CourierVehicle;
    plate: string | null;
    isActive: boolean;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [vehicle, setVehicle] = useState<CourierVehicle>(initial?.vehicle ?? "moto");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [active, setActive] = useState(initial?.isActive ?? true);

  return (
    <RestaurantSheet
      open
      title={initial ? initial.name : "Nouveau livreur"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {initial ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(initial.id)}
              className={cn(btnDanger, "shrink-0")}
              aria-label="Supprimer"
            >
              <MdDeleteOutline className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || name.trim().length === 0}
            onClick={() =>
              onSubmit({
                id: initial?.id,
                name: name.trim(),
                phone: phone.trim() || null,
                vehicle,
                plate: plate.trim() || null,
                isActive: active,
              })
            }
            className={cn(btnPrimary, "flex-1")}
          >
            Enregistrer
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">Nom</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Issa"
            className={fsInputClass()}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Téléphone
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="70 00 00 00"
            className={fsInputClass()}
          />
        </label>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-700">Véhicule</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(COURIER_VEHICLE_LABELS) as CourierVehicle[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVehicle(v)}
                className={cn(
                  "fs-touch-target rounded-full border px-3 py-1.5 text-xs font-semibold",
                  vehicle === v
                    ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
                    : "border-black/[0.08] bg-fs-card text-neutral-700",
                )}
              >
                {COURIER_VEHICLE_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Immatriculation
          </span>
          <input
            type="text"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Facultatif"
            className={fsInputClass()}
          />
        </label>
        {initial ? (
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border border-black/[0.08] px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Livreur actif</span>
              <span className="mt-0.5 block text-xs text-neutral-600">
                Inactif, il n&apos;apparaît plus dans la liste des livreurs à qui confier
                une course. Son historique est conservé.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
            />
          </label>
        ) : null}
      </div>
    </RestaurantSheet>
  );
}

/* ═══════════════════════════ Zones ═══════════════════════════ */

function ZonesView() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const [sheet, setSheet] = useState<DeliveryZone | "new" | null>(null);

  const listQ = useQuery({
    queryKey: queryKeys.restaurantZones(companyId, storeId),
    queryFn: () => listDeliveryZones({ companyId, storeId, includeInactive: true }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (p: {
      id?: string;
      name: string;
      fee: number;
      etaMinutes: number;
      minOrder: number;
      note: string | null;
      isActive: boolean;
    }) => upsertDeliveryZone({ companyId, storeId, ...p }),
    onSuccess: async () => {
      setSheet(null);
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
    onError: (e) => toastMutationError("restaurant-zone-save", e),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDeliveryZone(id),
    onSuccess: async () => {
      setSheet(null);
      toast.success("Zone supprimée.");
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
    onError: (e) => toastMutationError("restaurant-zone-delete", e),
  });

  const zones = useMemo(() => listQ.data ?? [], [listQ.data]);

  if (!companyId) return null;

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Zones de livraison"
          subtitle="Le prix de la course et le délai annoncé, décidés une fois — plutôt que négociés à chaque appel."
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setSheet("new")}
          className={cn(btnPrimary, "min-h-11 shrink-0")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Nouvelle zone
        </button>
      </div>

      {listQ.isError ? (
        <FsQueryErrorPanel
          error={listQ.error}
          onRetry={() => void listQ.refetch()}
          className="mt-3"
        />
      ) : zones.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdMap}
            title="Aucune zone"
            message="« Ouaga 2000 : 1 000 F, 25 min ». Sans zones, chaque serveur invente son tarif au téléphone."
            action={
              <button type="button" onClick={() => setSheet("new")} className={btnPrimary}>
                <MdAdd className="h-5 w-5" aria-hidden />
                Créer une zone
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 min-[720px]:grid-cols-2">
          {zones.map((z) => (
            <FsCard
              key={z.id}
              padding="p-3"
              className={cn(!z.isActive && "border-dashed opacity-65")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-fs-text">{z.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-600">
                    <span className="font-bold text-fs-accent">
                      {formatCurrency(z.fee)}
                    </span>
                    <span>· {z.etaMinutes} min</span>
                    {z.minOrder > 0 ? (
                      <span>· min. {formatCurrency(z.minOrder)}</span>
                    ) : null}
                    {z.isActive ? null : <span>· inactive</span>}
                  </p>
                  {z.note ? (
                    <p className="mt-1 text-xs text-neutral-600">{z.note}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSheet(z)}
                  className={cn(btnGhost, "min-h-9 min-w-9 shrink-0")}
                  aria-label={`Modifier ${z.name}`}
                >
                  <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                </button>
              </div>
            </FsCard>
          ))}
        </div>
      )}

      {sheet !== null ? (
        <ZoneSheet
          key={sheet === "new" ? "new" : sheet.id}
          initial={sheet === "new" ? null : sheet}
          busy={saveMut.isPending || deleteMut.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(p) => saveMut.mutate(p)}
          onDelete={(id) => deleteMut.mutate(id)}
        />
      ) : null}
    </FsPage>
  );
}

function ZoneSheet({
  initial,
  busy,
  onClose,
  onSubmit,
  onDelete,
}: {
  initial: DeliveryZone | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    id?: string;
    name: string;
    fee: number;
    etaMinutes: number;
    minOrder: number;
    note: string | null;
    isActive: boolean;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [fee, setFee] = useState(String(initial?.fee ?? 1000));
  const [eta, setEta] = useState(String(initial?.etaMinutes ?? 30));
  const [minOrder, setMinOrder] = useState(String(initial?.minOrder ?? 0));
  const [note, setNote] = useState(initial?.note ?? "");
  const [active, setActive] = useState(initial?.isActive ?? true);

  return (
    <RestaurantSheet
      open
      title={initial ? initial.name : "Nouvelle zone"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {initial ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(initial.id)}
              className={cn(btnDanger, "shrink-0")}
              aria-label="Supprimer"
            >
              <MdDeleteOutline className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || name.trim().length === 0}
            onClick={() =>
              onSubmit({
                id: initial?.id,
                name: name.trim(),
                fee: Math.max(0, Number(fee) || 0),
                etaMinutes: Math.max(1, Number(eta) || 30),
                minOrder: Math.max(0, Number(minOrder) || 0),
                note: note.trim() || null,
                isActive: active,
              })
            }
            className={cn(btnPrimary, "flex-1")}
          >
            Enregistrer
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Nom de la zone
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ouaga 2000"
            className={fsInputClass()}
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Prix de la course
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className={fsInputClass()}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Délai (min)
            </span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              className={fsInputClass()}
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Commande minimum
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
            className={fsInputClass()}
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            0 = pas de minimum.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Quartiers couverts
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ouaga 2000, Bassinko, Kossodo…"
            className={fsInputClass()}
          />
        </label>
        {initial ? (
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border border-black/[0.08] px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Zone desservie</span>
              <span className="mt-0.5 block text-xs text-neutral-600">
                Inactive, elle n&apos;est plus proposée à la prise de commande.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
            />
          </label>
        ) : null}
      </div>
    </RestaurantSheet>
  );
}
