"use client";

/**
 * « Réservations » — le cahier posé près de la caisse, qui ne se perd plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE PERDAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une table de 8 samedi à 20 h au nom de M. Ouédraogo » se note aujourd'hui sur
 * un cahier que le serveur du soir n'a pas lu, ou sur le téléphone du gérant qui
 * n'est pas là ce soir-là. Le groupe arrive, la table est occupée, et la maison
 * perd huit couverts plus la réputation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « NON VENUE » EST UN ÉTAT À PART ENTIÈRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas un simple « annulé ». Bloquer sa meilleure table deux samedis de suite pour
 * quelqu'un qui ne vient jamais est une décision qu'on ne prend qu'une fois — à
 * condition de pouvoir le voir. C'est pourquoi le compteur de défections est
 * affiché à côté du nom quand il y en a.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdEventAvailable,
  MdEventBusy,
  MdOutlineEventNote,
  MdPhone,
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
  btnOutline,
  btnPrimary,
  timeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import {
  createReservation,
  listReservations,
  listTables,
  updateReservation,
} from "@/lib/features/restaurant/api-floor";
import { openOrder } from "@/lib/features/restaurant/api-orders";
import {
  RESERVATION_STATUS_LABELS,
  type ReservationStatus,
  type RestaurantReservation,
} from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";
import { useRouter } from "next/navigation";

/**
 * Les bornes d'un jour, dans le FUSEAU DE L'ENTREPRISE (00206). Un restaurant de
 * Ouagadougou qui consulte « aujourd'hui » ne doit pas voir la journée UTC : à
 * 23 h 30 locale, la moitié de son service basculerait au lendemain.
 */
function dayBounds(dayIso: string): { fromIso: string; toIso: string } {
  const tz = getActiveTimeZone();
  const start = new Date(`${dayIso}T00:00:00`);
  const end = new Date(`${dayIso}T23:59:59`);
  /*
   * `toLocaleString` avec le fuseau cible puis re-parse : c'est le décalage réel du
   * jour donné (heure d'été comprise), et non un offset supposé constant.
   */
  const offsetMs =
    new Date(start.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(start.toLocaleString("en-US", { timeZone: tz })).getTime();
  return {
    fromIso: new Date(start.getTime() + offsetMs).toISOString(),
    toIso: new Date(end.getTime() + offsetMs).toISOString(),
  };
}

function todayIso(): string {
  const tz = getActiveTimeZone();
  const now = new Date();
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

const STATUS_TONE: Record<ReservationStatus, string> = {
  booked: "bg-violet-500/12 text-violet-700 dark:text-violet-400",
  seated: "bg-fs-accent/15 text-fs-accent",
  honoured: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  no_show: "bg-rose-500/12 text-rose-700 dark:text-rose-400",
  cancelled: "bg-neutral-500/10 text-neutral-600",
};

export function RestaurantReservationsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const [day, setDay] = useState(todayIso);
  const [newOpen, setNewOpen] = useState(false);

  const bounds = useMemo(() => dayBounds(day), [day]);

  const listQ = useQuery({
    queryKey: queryKeys.restaurantReservations({
      companyId,
      storeId,
      from: bounds.fromIso,
      to: bounds.toIso,
    }),
    queryFn: () =>
      listReservations({
        companyId,
        storeId,
        fromIso: bounds.fromIso,
        toIso: bounds.toIso,
      }),
    enabled: Boolean(companyId && storeId),
    staleTime: 30_000,
  });

  const tablesQ = useQuery({
    queryKey: queryKeys.restaurantTables(companyId, storeId),
    queryFn: () => listTables({ companyId, storeId }),
    enabled: Boolean(companyId && storeId),
    staleTime: 60_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["restaurant", companyId] });

  const createMut = useMutation({
    mutationFn: (p: {
      guestName: string;
      guestPhone: string | null;
      tableId: string | null;
      partySize: number;
      reservedAtIso: string;
      note: string | null;
    }) => createReservation({ companyId, storeId: storeId!, ...p }),
    onSuccess: async () => {
      setNewOpen(false);
      toast.success("Réservation enregistrée.");
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-reservation-create", e),
  });

  const statusMut = useMutation({
    mutationFn: (p: { id: string; status: ReservationStatus }) => updateReservation(p),
    onSuccess: invalidate,
    onError: (e) => toastMutationError("restaurant-reservation-status", e),
  });

  /**
   * « Installer » fait deux choses d'un seul geste : ouvre la commande sur la table
   * et marque la réservation honorée. Les séparer aurait laissé la moitié des
   * réservations éternellement « réservées » — personne ne revient cocher un cahier.
   */
  const seatMut = useMutation({
    mutationFn: async (r: RestaurantReservation) => {
      if (!r.tableId) throw new Error("Cette réservation n'a pas de table.");
      const orderId = await openOrder({
        companyId,
        storeId: storeId!,
        serviceType: "dine_in",
        tableId: r.tableId,
        covers: r.partySize,
        contactName: r.guestName,
        contactPhone: r.guestPhone,
      });
      await updateReservation({ id: r.id, status: "seated", orderId });
      return orderId;
    },
    onSuccess: async (orderId) => {
      await invalidate();
      router.push(`/restaurant/commande/${orderId}`);
    },
    onError: (e) => toastMutationError("restaurant-reservation-seat", e),
  });

  const reservations = useMemo(() => listQ.data ?? [], [listQ.data]);
  const tables = useMemo(() => tablesQ.data ?? [], [tablesQ.data]);

  const covers = reservations
    .filter((r) => r.status === "booked" || r.status === "seated")
    .reduce((s, r) => s + r.partySize, 0);

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title="Réservations" subtitle="Le cahier qui ne se perd plus." />
        <NeedStoreCard />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Réservations"
          subtitle="Le cahier du comptoir, lisible par toute l'équipe."
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className={cn(btnPrimary, "min-h-11 shrink-0")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Réserver
        </button>
      </div>

      <FsCard className="mt-3" padding="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">Jour</span>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value || todayIso())}
              className={fsInputClass()}
            />
          </label>
          <button
            type="button"
            onClick={() => setDay(todayIso())}
            className={cn(btnOutline, "min-h-11")}
          >
            Aujourd&apos;hui
          </button>
        </div>
        {reservations.length > 0 ? (
          <p className="mt-2 text-xs text-neutral-600">
            {reservations.length} réservation{reservations.length > 1 ? "s" : ""} ·{" "}
            <span className="font-bold text-fs-text">{covers} couverts attendus</span>
          </p>
        ) : null}
      </FsCard>

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
      ) : reservations.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdOutlineEventNote}
            title="Aucune réservation ce jour-là"
            message="Notez-les ici plutôt que sur le cahier : toute l'équipe les voit, y compris le serveur du soir."
            action={
              <button type="button" onClick={() => setNewOpen(true)} className={btnPrimary}>
                <MdAdd className="h-5 w-5" aria-hidden />
                Réserver une table
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 min-[800px]:grid-cols-2">
          {reservations.map((r) => (
            <FsCard key={r.id} padding="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold leading-tight text-fs-text">
                    {r.guestName}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-neutral-600">
                    <span className="font-bold tabular-nums text-fs-text">
                      {timeLabel(r.reservedAt)}
                    </span>
                    <span>
                      {r.partySize} pers.
                      {r.tableLabel ? ` · Table ${r.tableLabel}` : " · sans table"}
                    </span>
                  </p>
                  {r.guestPhone ? (
                    <a
                      href={`tel:${r.guestPhone.replace(/\s/g, "")}`}
                      className="fs-touch-target mt-1 inline-flex items-center gap-1 text-xs font-semibold text-fs-accent"
                    >
                      <MdPhone className="h-3.5 w-3.5" aria-hidden />
                      {r.guestPhone}
                    </a>
                  ) : null}
                  {r.note ? (
                    <p className="mt-1 text-xs italic text-neutral-600">« {r.note} »</p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                    STATUS_TONE[r.status],
                  )}
                >
                  {RESERVATION_STATUS_LABELS[r.status]}
                </span>
              </div>

              {r.status === "booked" ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={seatMut.isPending || !r.tableId}
                    onClick={() => seatMut.mutate(r)}
                    className={cn(btnPrimary, "min-h-10 flex-1 text-xs")}
                  >
                    <MdEventAvailable className="h-4 w-4" aria-hidden />
                    Installer
                  </button>
                  <button
                    type="button"
                    disabled={statusMut.isPending}
                    onClick={() => statusMut.mutate({ id: r.id, status: "no_show" })}
                    className={cn(btnOutline, "min-h-10 text-xs")}
                  >
                    <MdEventBusy className="h-4 w-4" aria-hidden />
                    Pas venue
                  </button>
                  <button
                    type="button"
                    disabled={statusMut.isPending}
                    onClick={() => statusMut.mutate({ id: r.id, status: "cancelled" })}
                    className={cn(btnOutline, "min-h-10 text-xs")}
                  >
                    Annuler
                  </button>
                </div>
              ) : r.status === "seated" ? (
                <button
                  type="button"
                  disabled={statusMut.isPending}
                  onClick={() => statusMut.mutate({ id: r.id, status: "honoured" })}
                  className={cn(btnOutline, "mt-2.5 min-h-10 w-full text-xs")}
                >
                  Marquer terminée
                </button>
              ) : null}

              {!r.tableId && r.status === "booked" ? (
                <p className="mt-2 rounded-[8px] bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  Aucune table attribuée : « Installer » est indisponible tant que vous
                  n&apos;en avez pas choisi une.
                </p>
              ) : null}
            </FsCard>
          ))}
        </div>
      )}

      {newOpen ? (
        <NewReservationSheet
          day={day}
          tables={tables}
          busy={createMut.isPending}
          onClose={() => setNewOpen(false)}
          onSubmit={(p) => createMut.mutate(p)}
        />
      ) : null}
    </FsPage>
  );
}

function NewReservationSheet({
  day,
  tables,
  busy,
  onClose,
  onSubmit,
}: {
  day: string;
  tables: Array<{ id: string; label: string; seats: number }>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    guestName: string;
    guestPhone: string | null;
    tableId: string | null;
    partySize: number;
    reservedAtIso: string;
    note: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState("2");
  const [date, setDate] = useState(day);
  const [time, setTime] = useState("19:30");
  const [tableId, setTableId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const partySize = Math.max(1, Number(size) || 1);
  /* Les tables trop petites sont proposées, mais signalées : c'est au patron de décider. */
  const sorted = useMemo(
    () => [...tables].sort((a, b) => a.seats - b.seats),
    [tables],
  );

  return (
    <RestaurantSheet
      open
      title="Nouvelle réservation"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || name.trim().length === 0}
          onClick={() =>
            onSubmit({
              guestName: name.trim(),
              guestPhone: phone.trim() || null,
              tableId,
              partySize,
              /* Saisi en heure locale, converti par le navigateur — comme partout ailleurs. */
              reservedAtIso: new Date(`${date}T${time}:00`).toISOString(),
              note: note.trim() || null,
            })
          }
          className={cn(btnPrimary, "w-full min-h-12")}
        >
          Enregistrer
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Nom du client
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="M. Ouédraogo"
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
          <span className="mt-1 block text-[11px] text-neutral-500">
            Le seul moyen de prévenir si la table saute — ou de rappeler la veille.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fsInputClass()}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">Heure</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fsInputClass()}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Nombre de personnes
          </span>
          <input
            type="number"
            min={1}
            max={200}
            inputMode="numeric"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={fsInputClass()}
          />
        </label>

        {sorted.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-700">Table</p>
            <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4">
              <button
                type="button"
                onClick={() => setTableId(null)}
                className={cn(
                  "fs-touch-target flex min-h-14 items-center justify-center rounded-[12px] border px-2 text-xs font-semibold",
                  tableId === null
                    ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                    : "border-black/10 bg-fs-card text-neutral-700",
                )}
              >
                Plus tard
              </button>
              {sorted.map((t) => {
                const tight = t.seats < partySize;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTableId(t.id)}
                    className={cn(
                      "fs-touch-target flex min-h-14 flex-col items-center justify-center rounded-[12px] border px-2",
                      tableId === t.id
                        ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)]"
                        : tight
                          ? "border-dashed border-amber-500/40 bg-amber-500/[0.04]"
                          : "border-black/10 bg-fs-card",
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-bold",
                        tableId === t.id ? "text-fs-accent" : "text-fs-text",
                      )}
                    >
                      {t.label}
                    </span>
                    <span
                      className={cn(
                        "text-[10px]",
                        tight ? "font-semibold text-amber-700" : "text-neutral-500",
                      )}
                    >
                      {t.seats} pl.
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              Les tables en pointillé ambre sont plus petites que le groupe.
            </p>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">Note</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anniversaire, allergie, table près de la sortie…"
            className={fsInputClass()}
          />
        </label>
      </div>
    </RestaurantSheet>
  );
}
