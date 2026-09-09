"use client";

/**
 * « Commandes en salle » / « À emporter » / « Livraisons » — le même écran, trois
 * services.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SEUL ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois services posent la même question au serveur : « qu'est-ce qui est en
 * cours, et depuis combien de temps ». Ce qui change, c'est l'identité de la
 * commande — un numéro de table, un nom au comptoir, une adresse — et le geste
 * d'ouverture. Trois écrans auraient été trois fois le même code avec trois
 * occasions de diverger, et un serveur qui doit réapprendre l'application selon
 * qu'il sert une table ou prend un appel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN MET EN AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TEMPS. Pas le montant — le montant, on le voit à l'addition. Ce qui coûte des
 * clients, c'est une table ouverte depuis 40 minutes sans que rien ne soit parti en
 * cuisine, et un plat prêt qui refroidit au passe. Ces deux-là sont les seules
 * choses en couleur de l'écran.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdCheckCircle,
  MdDeliveryDining,
  MdLocalDining,
  MdNotificationsActive,
  MdOutlineTableBar,
  MdPerson,
  MdPhone,
  MdPlace,
  MdShoppingBag,
} from "react-icons/md";

import {
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
  btnOutline,
  btnPrimary,
  timeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { listOrders, openOrder } from "@/lib/features/restaurant/api-orders";
import { listTables } from "@/lib/features/restaurant/api-floor";
import { listDeliveryZones } from "@/lib/features/restaurant/api-ops";
import {
  DELIVERY_STATE_LABELS,
  SERVICE_TYPE_LABELS,
  type RestaurantOrderSummary,
  type ServiceType,
} from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

const SERVICE_COPY: Record<
  ServiceType,
  { title: string; subtitle: string; empty: string; newLabel: string }
> = {
  dine_in: {
    title: "Commandes en salle",
    subtitle: "Ce qui est en cours sur vos tables, et depuis combien de temps.",
    empty: "Aucune table occupée. Touchez « Ouvrir une table » pour commencer un service.",
    newLabel: "Ouvrir une table",
  },
  takeaway: {
    title: "À emporter",
    subtitle: "Les commandes qui attendent au comptoir.",
    empty: "Rien à emporter pour l'instant.",
    newLabel: "Nouvelle commande",
  },
  delivery: {
    title: "Livraisons",
    subtitle: "Ce qui part, ce qui est en route, ce qui est arrivé.",
    empty: "Aucune livraison en cours.",
    newLabel: "Nouvelle livraison",
  },
};

export function RestaurantServiceScreen({ service }: { service: ServiceType }) {
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const copy = SERVICE_COPY[service];

  const [newOpen, setNewOpen] = useState(false);

  const ordersQ = useQuery({
    queryKey: queryKeys.restaurantOrders({
      companyId,
      storeId,
      scope: `open-${service}`,
    }),
    queryFn: () =>
      listOrders({
        companyId,
        storeId,
        statuses: ["open"],
        serviceTypes: [service],
        limit: 100,
      }),
    enabled: Boolean(companyId && storeId),
    /*
     * Dix secondes. C'est le rythme du service : entre le moment où la cuisine
     * touche « prêt » et celui où le serveur le voit, chaque seconde est un plat
     * qui refroidit. Plus court noierait la connexion d'un maquis ; plus long
     * rendrait la pastille « prêt » inutile.
     */
    refetchInterval: 10_000,
  });

  const orders = useMemo(() => ordersQ.data?.rows ?? [], [ordersQ.data]);

  /* Les tables encore libres — seules celles-là peuvent recevoir une commande. */
  const tablesQ = useQuery({
    queryKey: queryKeys.restaurantTables(companyId, storeId),
    queryFn: () => listTables({ companyId, storeId }),
    enabled: Boolean(companyId && storeId && service === "dine_in"),
    staleTime: 60_000,
  });

  const zonesQ = useQuery({
    queryKey: queryKeys.restaurantZones(companyId, storeId),
    queryFn: () => listDeliveryZones({ companyId, storeId }),
    enabled: Boolean(companyId && service === "delivery"),
    staleTime: 5 * 60_000,
  });

  const openMut = useMutation({
    mutationFn: (p: {
      tableId?: string | null;
      covers?: number;
      contactName?: string | null;
      contactPhone?: string | null;
      deliveryAddress?: string | null;
    }) =>
      openOrder({
        companyId,
        storeId: storeId!,
        serviceType: service,
        ...p,
      }),
    onSuccess: async (id) => {
      setNewOpen(false);
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
      router.push(`/restaurant/commande/${id}`);
    },
    onError: (e) => toastMutationError("restaurant-open-order", e),
  });

  const busyTableIds = useMemo(
    () => new Set(orders.map((o) => o.tableId).filter((v): v is string => Boolean(v))),
    [orders],
  );

  const readyCount = orders.filter((o) => o.hasReadyItems).length;

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title={copy.title} subtitle={copy.subtitle} />
        <NeedStoreCard />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title={copy.title}
          subtitle={copy.subtitle}
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className={cn(btnPrimary, "min-h-11 shrink-0")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          {copy.newLabel}
        </button>
      </div>

      {/*
        Une seule bannière, et seulement quand elle a quelque chose à dire : des
        plats attendent au passe. C'est l'information la plus périssable de la salle.
      */}
      {readyCount > 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
          <MdNotificationsActive
            className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {readyCount} commande{readyCount > 1 ? "s ont" : " a"} des plats prêts au passe.
          </p>
        </div>
      ) : null}

      {ordersQ.isError ? (
        <FsQueryErrorPanel
          error={ordersQ.error}
          onRetry={() => void ordersQ.refetch()}
          className="mt-3"
        />
      ) : ordersQ.isPending ? (
        <div className="mt-8 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={
              service === "dine_in"
                ? MdLocalDining
                : service === "takeaway"
                  ? MdShoppingBag
                  : MdDeliveryDining
            }
            title="Rien en cours"
            message={copy.empty}
            action={
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className={btnPrimary}
              >
                <MdAdd className="h-5 w-5" aria-hidden />
                {copy.newLabel}
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 min-[720px]:grid-cols-2 min-[1200px]:grid-cols-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}

      <NewOrderSheet
        open={newOpen}
        service={service}
        busy={openMut.isPending}
        tables={(tablesQ.data ?? []).filter((t) => !busyTableIds.has(t.id))}
        zones={zonesQ.data ?? []}
        onClose={() => setNewOpen(false)}
        onSubmit={(p) => openMut.mutate(p)}
      />
    </FsPage>
  );
}

/**
 * La carte d'une commande. Trois informations, dans cet ordre : QUI (table, nom),
 * DEPUIS QUAND, et OÙ ÇA EN EST. Le montant vient en dernier — il ne décide rien
 * pendant le service.
 */
function OrderCard({ order }: { order: RestaurantOrderSummary }) {
  const identity =
    order.tableLabel
      ? `Table ${order.tableLabel}`
      : (order.customerName ?? order.contactName ?? order.orderNumber);

  return (
    <Link
      href={`/restaurant/commande/${order.id}`}
      className={cn(
        "block rounded-[12px] border bg-fs-card p-3 shadow-sm transition-transform active:scale-[0.99]",
        order.hasReadyItems
          ? "border-amber-500/40 ring-1 ring-amber-500/20"
          : "border-black/[0.07]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-fs-text">
            {identity}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-500">
            {order.orderNumber} · ouverte à {timeLabel(order.openedAt)}
            {order.serverName ? ` · ${order.serverName}` : ""}
          </p>
        </div>
        <WaitBadge since={order.openedAt} warnAfter={45} lateAfter={90} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {order.hasReadyItems ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/16 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
            <MdCheckCircle className="h-3 w-3" aria-hidden />
            Prêt au passe
          </span>
        ) : null}
        {order.pendingKitchenCount > 0 && !order.hasReadyItems ? (
          <span className="rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-400">
            {order.pendingKitchenCount} en cuisine
          </span>
        ) : null}
        {order.itemCount === 0 ? (
          <span className="rounded-md bg-neutral-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600">
            Rien de commandé
          </span>
        ) : null}
        {order.serviceType === "delivery" && order.deliveryState ? (
          <span className="rounded-md bg-violet-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-400">
            {DELIVERY_STATE_LABELS[order.deliveryState]}
            {order.courierName ? ` · ${order.courierName}` : ""}
          </span>
        ) : null}
      </div>

      {order.serviceType === "delivery" && order.deliveryAddress ? (
        <p className="mt-1.5 flex items-start gap-1 text-xs text-neutral-600">
          <MdPlace className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-1">{order.deliveryAddress}</span>
        </p>
      ) : null}

      <div className="mt-2 flex items-end justify-between gap-2 border-t border-black/[0.06] pt-2">
        <span className="text-[11px] text-neutral-500">
          {order.itemCount} article{order.itemCount > 1 ? "s" : ""}
          {order.serviceType === "dine_in"
            ? ` · ${order.covers} couvert${order.covers > 1 ? "s" : ""}`
            : ""}
        </span>
        <span className="text-base font-extrabold tabular-nums text-fs-text">
          {formatCurrency(order.total)}
        </span>
      </div>
    </Link>
  );
}

/**
 * L'ouverture d'une commande. Le formulaire ne demande QUE ce qui est indispensable
 * pour porter l'addition : une table en salle, un nom au comptoir, une adresse en
 * livraison. Tout le reste se renseigne plus tard, ou jamais.
 */
function NewOrderSheet({
  open,
  service,
  busy,
  tables,
  zones,
  onClose,
  onSubmit,
}: {
  open: boolean;
  service: ServiceType;
  busy: boolean;
  tables: Array<{ id: string; label: string; seats: number; areaName: string | null }>;
  zones: Array<{ id: string; name: string; fee: number; etaMinutes: number }>;
  onClose: () => void;
  onSubmit: (p: {
    tableId?: string | null;
    covers?: number;
    contactName?: string | null;
    contactPhone?: string | null;
    deliveryAddress?: string | null;
  }) => void;
}) {
  const [tableId, setTableId] = useState<string | null>(null);
  const [covers, setCovers] = useState("2");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const canSubmit =
    service === "dine_in"
      ? Boolean(tableId)
      : service === "delivery"
        ? address.trim().length > 0 || name.trim().length > 0
        : name.trim().length > 0;

  return (
    <RestaurantSheet
      open={open}
      title={SERVICE_COPY[service].newLabel}
      subtitle={SERVICE_TYPE_LABELS[service]}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() =>
            onSubmit({
              tableId: service === "dine_in" ? tableId : null,
              covers: Number(covers) || 1,
              contactName: name.trim() || null,
              contactPhone: phone.trim() || null,
              deliveryAddress: service === "delivery" ? address.trim() || null : null,
            })
          }
          className={cn(btnPrimary, "w-full min-h-12")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Ouvrir la commande
        </button>
      }
    >
      {service === "dine_in" ? (
        tables.length === 0 ? (
          <div className="py-6 text-center">
            <MdOutlineTableBar className="mx-auto h-10 w-10 text-neutral-300" aria-hidden />
            <p className="mt-2 text-sm text-neutral-600">
              Toutes vos tables sont occupées — ou vous n&apos;en avez pas encore créé.
            </p>
            <Link href="/restaurant/salle/tables" className={cn(btnOutline, "mt-4")}>
              Gérer les tables
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs font-semibold text-neutral-700">Table libre</p>
            <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4">
              {tables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTableId(t.id);
                    setCovers(String(Math.min(t.seats, 4)));
                  }}
                  className={cn(
                    "fs-touch-target flex min-h-16 flex-col items-center justify-center rounded-[12px] border px-2 py-2 transition-colors",
                    tableId === t.id
                      ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)]"
                      : "border-black/10 bg-fs-card active:bg-neutral-50",
                  )}
                >
                  <span
                    className={cn(
                      "text-base font-bold",
                      tableId === t.id ? "text-fs-accent" : "text-fs-text",
                    )}
                  >
                    {t.label}
                  </span>
                  <span className="text-[11px] text-neutral-500">{t.seats} pl.</span>
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold text-neutral-700">
                Nombre de couverts
              </span>
              <input
                type="number"
                min={1}
                max={200}
                inputMode="numeric"
                value={covers}
                onChange={(e) => setCovers(e.target.value)}
                className={fsInputClass()}
              />
            </label>
          </>
        )
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              <MdPerson className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Nom du client
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Le nom qu'on criera au comptoir"
              className={fsInputClass()}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              <MdPhone className="mr-1 inline h-3.5 w-3.5" aria-hidden />
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
          {service === "delivery" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-700">
                  <MdPlace className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  Adresse de livraison
                </span>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Quartier, repère, numéro de porte…"
                  className={fsInputClass("resize-none")}
                />
              </label>
              {zones.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-neutral-700">
                    Zone (pour rappel du tarif)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {zones.map((z) => (
                      <span
                        key={z.id}
                        className="rounded-full bg-fs-surface-container px-2.5 py-1 text-[11px] font-medium text-neutral-600"
                      >
                        {z.name} · {formatCurrency(z.fee)} · {z.etaMinutes} min
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-neutral-500">
                    Le livreur et la zone se choisissent depuis le suivi, une fois la
                    commande prête.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </RestaurantSheet>
  );
}
