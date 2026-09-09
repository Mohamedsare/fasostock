"use client";

/**
 * « Cuisine » — l'écran de production (KDS).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN ÉCRAN QU'ON REGARDE DE DEUX MÈTRES, LES MAINS SALES
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est pas une page de gestion. C'est un panneau d'affichage posé au-dessus du
 * passe, consulté par quelqu'un qui tient une poêle. Tout en découle :
 *
 * • GROS. Les noms de plats sont en 15-17 px minimum, les quantités en gras, le
 *   numéro de table plus gros que tout le reste. Rien d'inférieur à 11 px.
 * • UN SEUL BOUTON PAR BON. Pas de menu, pas d'icône à viser : une barre pleine
 *   largeur qui dit ce qui va se passer (« Je prends » → « C'est prêt »). Le
 *   cuisinier la touche avec le dos de la main s'il le faut.
 * • LE TEMPS EN COULEUR. La seule couleur de l'écran est celle de l'attente :
 *   neutre sous 10 minutes, ambre au-delà, rouge après 20. Un service se pilote au
 *   temps, pas au montant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne montre AUCUN prix. Un écran de cuisine qui affiche des montants pousse à
 * prioriser les grosses tables — ce qui est exactement la mauvaise règle : la file
 * juste est celle de l'ordre d'arrivée, et elle seule.
 *
 * Il ne permet pas non plus de revenir en arrière : `restaurant_advance_item`
 * refuse les retours (00219). Un écran mal touché ne doit pas faire ressortir un
 * plat déjà parti en salle.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdCheckCircle,
  MdOutlineSoupKitchen,
  MdRefresh,
  MdRestaurantMenu,
  MdSoupKitchen,
} from "react-icons/md";

import {
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
} from "@/components/ui/fs-screen-primitives";
import {
  NeedStoreCard,
  RestaurantEmptyCard,
  ServiceBadge,
  WaitBadge,
  btnOutline,
  elapsedMinutes,
  timeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { advanceItem, listKitchenTickets } from "@/lib/features/restaurant/api-orders";
import { listStations } from "@/lib/features/restaurant/api-menu";
import type { KitchenTicket } from "@/lib/features/restaurant/api-orders";
import type { ItemStatus } from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/** Ce que la page affiche selon l'entrée de menu par laquelle on est arrivé. */
export type KdsView = "all" | "preparing" | "ready";

const VIEW_COPY: Record<KdsView, { title: string; subtitle: string; empty: string }> = {
  all: {
    title: "Cuisine",
    subtitle: "Tout ce qui est parti en cuisine et n'est pas encore servi.",
    empty: "Rien en cuisine. Les bons apparaîtront ici dès qu'un serveur enverra.",
  },
  preparing: {
    title: "En préparation",
    subtitle: "Les plats qu'un cuisinier a pris en main.",
    empty: "Aucun plat en préparation.",
  },
  ready: {
    title: "Prêtes",
    subtitle: "Ce qui attend au passe. Chaque minute compte : un plat prêt refroidit.",
    empty: "Rien n'attend au passe.",
  },
};

/** L'étape suivante et son libellé. Un seul chemin possible, pas de choix à faire. */
const NEXT_STEP: Partial<Record<ItemStatus, { to: ItemStatus; label: string }>> = {
  sent: { to: "preparing", label: "Je prends" },
  preparing: { to: "ready", label: "C'est prêt" },
  ready: { to: "served", label: "Servi" },
};

export function RestaurantKdsScreen({ view = "all" }: { view?: KdsView }) {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const copy = VIEW_COPY[view];

  const [stationId, setStationId] = useState<string | null>(null);

  const stationsQ = useQuery({
    queryKey: queryKeys.restaurantStations(companyId, storeId),
    queryFn: () => listStations({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
  });

  const ticketsQ = useQuery({
    queryKey: queryKeys.restaurantKitchen(companyId, storeId, stationId ?? "__all__"),
    queryFn: () =>
      listKitchenTickets({
        companyId,
        storeId,
        stationIds: stationId ? [stationId] : null,
      }),
    enabled: Boolean(companyId && storeId),
    /*
     * Huit secondes. C'est le seul écran de l'application qui doit se rafraîchir plus
     * vite que la salle : entre le moment où un serveur envoie et celui où la cuisine
     * le voit, le client attend déjà. La requête est légère (une lecture indexée sur
     * trois statuts), elle supporte ce rythme même sur une connexion de marché.
     */
    refetchInterval: 8_000,
  });

  const advanceMut = useMutation({
    mutationFn: (p: { itemId: string; status: ItemStatus }) =>
      advanceItem(p.itemId, p.status),
    /*
     * Mise à jour optimiste : le cuisinier touche « C'est prêt », la carte doit
     * bouger TOUT DE SUITE. Attendre l'aller-retour serveur, c'est un bouton qui ne
     * réagit pas — donc touché trois fois, donc trois requêtes.
     */
    onMutate: async (p) => {
      const key = queryKeys.restaurantKitchen(companyId, storeId, stationId ?? "__all__");
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<KitchenTicket[]>(key);
      qc.setQueryData<KitchenTicket[]>(key, (old) =>
        (old ?? []).map((t) => ({
          ...t,
          items: t.items.map((i) =>
            i.id === p.itemId ? { ...i, status: p.status } : i,
          ),
        })),
      );
      return { previous, key };
    },
    onError: (e, _p, ctxData) => {
      if (ctxData?.previous) qc.setQueryData(ctxData.key, ctxData.previous);
      toastMutationError("restaurant-kds-advance", e);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
  });

  const stations = useMemo(
    () => (stationsQ.data ?? []).filter((s) => s.isActive && s.kdsEnabled),
    [stationsQ.data],
  );

  const tickets = useMemo(() => ticketsQ.data ?? [], [ticketsQ.data]);

  /**
   * La vue filtre les LIGNES, pas les bons : un bon dont deux plats sont prêts et
   * un troisième en cuisson doit apparaître dans « Prêtes » avec ses deux plats
   * seulement. Filtrer les bons entiers cacherait exactement ce qu'on cherche.
   */
  const visible = useMemo(() => {
    if (view === "all") return tickets;
    const wanted: ItemStatus = view === "preparing" ? "preparing" : "ready";
    return tickets
      .map((t) => ({ ...t, items: t.items.filter((i) => i.status === wanted) }))
      .filter((t) => t.items.length > 0);
  }, [tickets, view]);

  const lateCount = visible.filter((t) => (elapsedMinutes(t.sentAt) ?? 0) >= 20).length;

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
    <FsPage className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title={copy.title}
          subtitle={copy.subtitle}
          className="mb-0 min-w-0 flex-1"
          titleClassName="text-lg sm:text-2xl"
        />
        <button
          type="button"
          onClick={() => void ticketsQ.refetch()}
          className={cn(btnOutline, "min-h-11 shrink-0 px-3")}
          aria-label="Actualiser"
        >
          <MdRefresh
            className={cn("h-5 w-5", ticketsQ.isFetching && "animate-spin")}
            aria-hidden
          />
        </button>
      </div>

      {/* Un seul chiffre en tête : combien de bons sont en retard. */}
      {lateCount > 0 ? (
        <div className="mt-3 rounded-[12px] border border-rose-500/30 bg-rose-500/[0.08] px-3 py-2.5">
          <p className="text-sm font-bold text-rose-800 dark:text-rose-300">
            {lateCount} bon{lateCount > 1 ? "s" : ""} de plus de 20 minutes.
          </p>
        </div>
      ) : null}

      {stations.length > 1 ? (
        <div className="fs-scroll-x mt-3 flex gap-1.5 overflow-x-auto pb-1">
          <StationChip
            label="Toutes les stations"
            color={null}
            selected={stationId === null}
            onClick={() => setStationId(null)}
          />
          {stations.map((s) => (
            <StationChip
              key={s.id}
              label={s.name}
              color={s.color}
              selected={stationId === s.id}
              onClick={() => setStationId(s.id)}
            />
          ))}
        </div>
      ) : null}

      {ticketsQ.isError ? (
        <FsQueryErrorPanel
          error={ticketsQ.error}
          onRetry={() => void ticketsQ.refetch()}
          className="mt-3"
        />
      ) : ticketsQ.isPending ? (
        <div className="mt-10 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={view === "ready" ? MdCheckCircle : MdOutlineSoupKitchen}
            title="Rien à préparer"
            message={copy.empty}
          />
        </div>
      ) : (
        /*
          Colonnes fluides plutôt qu'un tableau : sur l'écran mural de la cuisine
          (souvent une tablette posée à l'horizontale), quatre bons tiennent côte à
          côte ; sur le téléphone du chef, un seul, en pleine largeur.
        */
        <div className="mt-3 grid gap-2.5 pb-[calc(1rem+var(--fs-safe-bottom))] min-[640px]:grid-cols-2 min-[1100px]:grid-cols-3 min-[1500px]:grid-cols-4">
          {visible.map((t) => (
            <KitchenTicketCard
              key={t.orderId}
              ticket={t}
              busy={advanceMut.isPending}
              onAdvance={(itemId, status) => advanceMut.mutate({ itemId, status })}
              onAdvanceAll={(items) => {
                for (const it of items) {
                  const next = NEXT_STEP[it.status];
                  if (next) advanceMut.mutate({ itemId: it.id, status: next.to });
                }
              }}
            />
          ))}
        </div>
      )}
    </FsPage>
  );
}

/**
 * Un bon. La carte entière est un bloc de lecture : table en très gros, plats en
 * dessous, une barre d'action en bas. Aucun élément décoratif — chaque pixel qui
 * n'aide pas à cuisiner est un pixel qui gêne.
 */
function KitchenTicketCard({
  ticket,
  busy,
  onAdvance,
  onAdvanceAll,
}: {
  ticket: KitchenTicket;
  busy: boolean;
  onAdvance: (itemId: string, status: ItemStatus) => void;
  onAdvanceAll: (items: KitchenTicket["items"]) => void;
}) {
  const minutes = elapsedMinutes(ticket.sentAt) ?? 0;
  const tone =
    minutes >= 20
      ? "border-rose-500/50 bg-rose-500/[0.05]"
      : minutes >= 10
        ? "border-amber-500/45 bg-amber-500/[0.05]"
        : "border-black/[0.09] bg-fs-card";

  /* Toutes les lignes à la même étape : on peut tout faire avancer d'un geste. */
  const uniformStatus =
    ticket.items.length > 0 &&
    ticket.items.every((i) => i.status === ticket.items[0].status)
      ? ticket.items[0].status
      : null;
  const bulkStep = uniformStatus ? NEXT_STEP[uniformStatus] : undefined;

  return (
    <article className={cn("flex flex-col overflow-hidden rounded-[14px] border", tone)}>
      <header className="flex items-start justify-between gap-2 border-b border-black/[0.07] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold leading-none text-fs-text">
            {ticket.tableLabel ? `Table ${ticket.tableLabel}` : ticket.orderNumber}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
            <ServiceBadge type={ticket.serviceType} />
            <span>{timeLabel(ticket.sentAt)}</span>
            {ticket.serverName ? <span>· {ticket.serverName}</span> : null}
          </p>
        </div>
        <WaitBadge since={ticket.sentAt} className="text-sm" />
      </header>

      {ticket.note ? (
        <p className="border-b border-black/[0.07] bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
          {ticket.note}
        </p>
      ) : null}

      <ul className="flex-1 divide-y divide-black/[0.05]">
        {ticket.items.map((it) => {
          const step = NEXT_STEP[it.status];
          return (
            <li key={it.id} className="px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="shrink-0 rounded-md bg-fs-text/90 px-1.5 py-0.5 text-sm font-extrabold leading-tight text-fs-card">
                  {it.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold leading-snug text-fs-text">
                    {it.productName}
                  </p>
                  {it.optionsLabel ? (
                    <p className="mt-0.5 text-xs font-medium text-neutral-600">
                      {it.optionsLabel}
                    </p>
                  ) : null}
                  {it.note ? (
                    <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                      {it.note}
                    </p>
                  ) : null}
                </div>
                {it.status === "ready" ? (
                  <MdCheckCircle
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden
                  />
                ) : it.status === "preparing" ? (
                  <MdSoupKitchen
                    className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400"
                    aria-hidden
                  />
                ) : null}
              </div>

              {/* Action par ligne : utile quand un bon avance plat par plat. */}
              {step && !uniformStatus ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAdvance(it.id, step.to)}
                  className="fs-touch-target mt-2 w-full rounded-[10px] border border-black/10 bg-fs-card py-2 text-xs font-bold text-neutral-800 active:bg-neutral-100 disabled:opacity-40"
                >
                  {step.label}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/*
        La barre d'action. Pleine largeur, 52 px de haut, un seul verbe. C'est le
        seul élément qu'on vise dans une cuisine — il doit être impossible à rater.
      */}
      {bulkStep ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdvanceAll(ticket.items)}
          className={cn(
            "flex min-h-[52px] w-full items-center justify-center gap-2 text-sm font-extrabold uppercase tracking-wide text-white transition-transform active:scale-[0.99] disabled:opacity-50",
            bulkStep.to === "preparing"
              ? "bg-violet-600"
              : bulkStep.to === "ready"
                ? "bg-amber-600"
                : "bg-emerald-600",
          )}
        >
          <MdRestaurantMenu className="h-5 w-5" aria-hidden />
          {bulkStep.label}
        </button>
      ) : null}
    </article>
  );
}

function StationChip({
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
        "fs-touch-target inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
        selected
          ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
          : "border-black/[0.08] bg-fs-card text-neutral-700",
      )}
    >
      {color ? (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : null}
      {label}
    </button>
  );
}
