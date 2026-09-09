"use client";

/**
 * « Commandes » — le carnet du serveur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN RATTRAPE
 * ─────────────────────────────────────────────────────────────────────────────
 * Entre le moment où un client s'assoit et celui où il paie, il se passe une heure
 * et demie pendant lesquelles il existe une commande réelle — de la marchandise
 * engagée, de la cuisine occupée, un serveur responsable — que rien n'enregistrait.
 *
 * C'est là que l'argent se perd : la ligne oubliée au moment de l'addition, la bière
 * servie et jamais notée, le plat refait parce que la cuisine n'a pas su qu'il était
 * prêt. Le carnet papier ne survit pas au samedi soir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS DÉCISIONS D'ERGONOMIE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. UNE SEULE COLONNE SUR TÉLÉPHONE, ET DE GRANDES CIBLES. Le serveur est debout,
 *    une main tient le téléphone, l'autre porte un plateau. Tout ce qui se touche
 *    fait au moins 44 px de haut, et rien d'important ne se trouve en haut de
 *    l'écran, hors de portée du pouce.
 *
 * 2. AJOUTER UN PLAT EST À UN SEUL DOIGT. Pas de dialogue, pas de quantité à
 *    saisir : on touche le plat, il entre. Toucher deux fois en met deux. Le
 *    dialogue d'options ne s'ouvre QUE pour les articles qui en ont vraiment.
 *
 * 3. « ENVOYER EN CUISINE » EST SÉPARÉ DE « AJOUTER ». Le serveur note trois
 *    choses, se ravise, corrige — puis envoie. Tant que la ligne est `pending`,
 *    elle se corrige librement ; une fois partie, elle s'annule avec un motif.
 *    C'est la différence entre « je me suis trompé en notant » et « on a jeté un
 *    plat », et cette différence vaut de l'argent.
 *
 * L'addition, elle, part vers la CAISSE RAPIDE ordinaire (`?commande=`) : même
 * encaissement, même stock, mêmes rapports que n'importe quelle vente.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdArrowBack,
  MdCheck,
  MdDeleteOutline,
  MdEditNote,
  MdOutlineRestaurantMenu,
  MdPointOfSale,
  MdRemove,
  MdSearch,
  MdSend,
  MdSwapHoriz,
  MdWarningAmber,
} from "react-icons/md";

import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import {
  ItemStatusPill,
  NeedStoreCard,
  RestaurantEmptyCard,
  RestaurantSheet,
  WaitBadge,
  btnDanger,
  btnGhost,
  btnOutline,
  btnPrimary,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import {
  addOrderItems,
  cancelOrder,
  getOrder,
  moveOrder,
  sendToKitchen,
  updateOrder,
  updateOrderItem,
  voidOrderItem,
} from "@/lib/features/restaurant/api-orders";
import { listMenu, listModifierGroups } from "@/lib/features/restaurant/api-menu";
import { listTables } from "@/lib/features/restaurant/api-floor";
import {
  MENU_COURSE_LABELS,
  MENU_COURSE_ORDER,
  SERVICE_TYPE_LABELS,
  orderItemTotal,
  type ChosenOption,
  type MenuCourse,
  type MenuItem,
  type ModifierGroup,
} from "@/lib/features/restaurant/types";
import { ROUTES } from "@/lib/config/routes";
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

export function RestaurantOrderScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const [search, setSearch] = useState("");
  const [course, setCourse] = useState<MenuCourse | "all">("all");
  const [optionsFor, setOptionsFor] = useState<MenuItem | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [headerOpen, setHeaderOpen] = useState(false);

  const orderQ = useQuery({
    queryKey: queryKeys.restaurantOrder(companyId, orderId),
    queryFn: () => getOrder(orderId),
    enabled: Boolean(companyId && orderId),
    /*
     * La cuisine fait avancer les lignes depuis un autre écran. Sans ce
     * rafraîchissement, le serveur ne verrait jamais « prêt » et continuerait
     * d'attendre au passe un plat qui refroidit.
     */
    refetchInterval: 15_000,
  });
  const order = orderQ.data ?? null;

  const menuQ = useQuery({
    queryKey: queryKeys.restaurantMenu(companyId, storeId),
    queryFn: () => listMenu({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const groupsQ = useQuery({
    queryKey: queryKeys.restaurantModifierGroups(companyId),
    queryFn: () => listModifierGroups(companyId),
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
  });

  const tablesQ = useQuery({
    queryKey: queryKeys.restaurantTables(companyId, storeId),
    queryFn: () => listTables({ companyId, storeId }),
    enabled: Boolean(companyId && moveOpen),
    staleTime: 60_000,
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
  };

  const addMut = useMutation({
    mutationFn: (p: {
      productId: string;
      unitPrice: number;
      options?: ChosenOption[];
    }) =>
      addOrderItems({
        orderId,
        items: [
          { productId: p.productId, quantity: 1, unitPrice: p.unitPrice, options: p.options },
        ],
      }),
    onSuccess: invalidate,
    onError: (e) => toastMutationError("restaurant-order-add", e),
  });

  const qtyMut = useMutation({
    mutationFn: (p: { itemId: string; quantity?: number; remove?: boolean }) =>
      updateOrderItem(p),
    onSuccess: invalidate,
    onError: (e) => toastMutationError("restaurant-order-qty", e),
  });

  const noteMut = useMutation({
    mutationFn: (p: { itemId: string; note: string }) =>
      updateOrderItem({ itemId: p.itemId, note: p.note }),
    onSuccess: async () => {
      setNoteFor(null);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-order-note", e),
  });

  const sendMut = useMutation({
    mutationFn: (directServeIds: string[]) => sendToKitchen({ orderId, directServeIds }),
    onSuccess: async (count) => {
      toast.success(
        count === 0
          ? "Rien de nouveau à envoyer."
          : `${count} article${count > 1 ? "s" : ""} envoyé${count > 1 ? "s" : ""} en cuisine.`,
      );
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-order-send", e),
  });

  const voidMut = useMutation({
    mutationFn: (p: { itemId: string; reason: string }) =>
      voidOrderItem(p.itemId, p.reason),
    onSuccess: async () => {
      setVoidFor(null);
      setVoidReason("");
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-order-void", e),
  });

  const moveMut = useMutation({
    mutationFn: (tableId: string) => moveOrder(orderId, tableId),
    onSuccess: async () => {
      setMoveOpen(false);
      toast.success("Commande déplacée.");
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-order-move", e),
  });

  const cancelMut = useMutation({
    mutationFn: (reason: string) => cancelOrder(orderId, reason),
    onSuccess: async () => {
      toast.success("Commande annulée.");
      await invalidate();
      router.push("/restaurant/ventes/salle");
    },
    onError: (e) => toastMutationError("restaurant-order-cancel", e),
  });

  const headerMut = useMutation({
    mutationFn: (p: { covers?: number; note?: string | null }) =>
      updateOrder({ orderId, ...p }),
    onSuccess: async () => {
      setHeaderOpen(false);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-order-header", e),
  });

  /* ── Carte filtrée ── */

  const menu = useMemo(() => menuQ.data ?? [], [menuQ.data]);
  const visibleMenu = useMemo(() => {
    const q = norm(search);
    return menu
      .filter((m) => (course === "all" ? true : m.course === course))
      .filter((m) => (q ? norm(m.name).includes(q) : true))
      .sort((a, b) => {
        // Les indisponibles descendent : on ne fait pas chercher au serveur ce qu'il
        // ne peut pas vendre, mais on ne les cache pas non plus — il doit pouvoir
        // répondre « il n'y en a plus » sans quitter l'écran.
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return a.name.localeCompare(b.name, "fr");
      });
  }, [menu, course, search]);

  const coursesPresent = useMemo(() => {
    const set = new Set(menu.map((m) => m.course));
    return MENU_COURSE_ORDER.filter((c) => set.has(c));
  }, [menu]);

  const groupsById = useMemo(
    () => new Map((groupsQ.data ?? []).map((g) => [g.id, g])),
    [groupsQ.data],
  );

  /* ── Lignes ── */

  const items = order?.items ?? [];
  const liveItems = items.filter((i) => i.status !== "void");
  const pendingItems = liveItems.filter((i) => i.status === "pending");
  const total = liveItems.reduce((s, i) => s + orderItemTotal(i), 0);

  /**
   * Ce qui ne passe pas par la cuisine : la station de l'article n'a pas d'écran
   * (bar, frigo). Ces lignes sont servies directement à l'envoi — sinon elles
   * resteraient éternellement « en attente » sur un écran que personne ne regarde.
   */
  const directServeIds = useMemo(() => {
    const byProduct = new Map(menu.map((m) => [m.productId, m]));
    return (order?.items ?? [])
      .filter((i) => i.status === "pending")
      .filter((i) => {
        const m = byProduct.get(i.productId);
        return !m?.stationId || !m.stationKdsEnabled;
      })
      .map((i) => i.id);
  }, [order, menu]);

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <NeedStoreCard />
      </FsPage>
    );
  }
  if (orderQ.isError) {
    return (
      <FsPage>
        <FsQueryErrorPanel error={orderQ.error} onRetry={() => void orderQ.refetch()} />
      </FsPage>
    );
  }
  if (orderQ.isPending) {
    return (
      <FsPage>
        <div className="flex min-h-[50vh] items-center justify-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }
  if (!order) {
    return (
      <FsPage>
        <RestaurantEmptyCard
          title="Commande introuvable"
          message="Elle a peut-être été annulée depuis un autre poste."
          action={
            <Link href="/restaurant/ventes/salle" className={btnOutline}>
              Retour à la salle
            </Link>
          }
        />
      </FsPage>
    );
  }

  const closed = order.status !== "open";
  const title = order.tableLabel ? `Table ${order.tableLabel}` : order.orderNumber;

  return (
    <FsPage className="flex min-h-0 flex-1 flex-col">
      {/* ── En-tête ── */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className={cn(btnGhost, "-ml-2 mt-0.5")}
          aria-label="Retour"
        >
          <MdArrowBack className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-bold leading-tight text-fs-text sm:text-xl">
              {title}
            </h1>
            {closed ? (
              <span className="rounded-md bg-neutral-500/10 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                {order.status === "paid" ? "Encaissée" : "Annulée"}
              </span>
            ) : (
              <WaitBadge since={order.openedAt} warnAfter={60} lateAfter={120} />
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-neutral-600 sm:text-sm">
            {order.orderNumber} · {SERVICE_TYPE_LABELS[order.serviceType]} ·{" "}
            {order.covers} couvert{order.covers > 1 ? "s" : ""}
            {order.serverName ? ` · ${order.serverName}` : ""}
          </p>
        </div>
        {!closed ? (
          <button
            type="button"
            onClick={() => setHeaderOpen(true)}
            className={cn(btnGhost, "mt-0.5")}
            aria-label="Modifier la commande"
          >
            <MdEditNote className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>

      {order.note ? (
        <p className="mt-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          {order.note}
        </p>
      ) : null}

      {/* ── Les lignes de la commande ── */}
      <FsCard className="mt-3" padding="p-0">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-600">
            Rien de commandé pour l&apos;instant. Touchez un plat ci-dessous.
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {items.map((it) => {
              const voided = it.status === "void";
              const editable = !closed && it.status === "pending";
              return (
                <li
                  key={it.id}
                  className={cn("px-3 py-2.5 sm:px-4", voided && "opacity-55")}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            "text-sm font-semibold text-fs-text",
                            voided && "line-through",
                          )}
                        >
                          {it.quantity} × {it.productName}
                        </span>
                        <ItemStatusPill status={it.status} />
                        {it.status === "sent" || it.status === "preparing" ? (
                          <WaitBadge since={it.sentAt} />
                        ) : null}
                      </div>
                      {it.optionsLabel ? (
                        <p className="mt-0.5 text-xs text-neutral-600">{it.optionsLabel}</p>
                      ) : null}
                      {it.note ? (
                        <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                          « {it.note} »
                        </p>
                      ) : null}
                      {voided && it.voidReason ? (
                        <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400">
                          Annulé : {it.voidReason}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-fs-text">
                      {voided ? "—" : formatCurrency(orderItemTotal(it))}
                    </span>
                  </div>

                  {!closed && !voided ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {editable ? (
                        <>
                          <div className="inline-flex items-center overflow-hidden rounded-[10px] border border-black/10">
                            <button
                              type="button"
                              disabled={qtyMut.isPending}
                              onClick={() =>
                                it.quantity <= 1
                                  ? qtyMut.mutate({ itemId: it.id, remove: true })
                                  : qtyMut.mutate({
                                      itemId: it.id,
                                      quantity: it.quantity - 1,
                                    })
                              }
                              className="fs-touch-target px-3 py-1.5 text-neutral-700 active:bg-neutral-100"
                              aria-label="Diminuer"
                            >
                              <MdRemove className="h-4 w-4" aria-hidden />
                            </button>
                            <span className="min-w-8 px-1 text-center text-sm font-bold tabular-nums">
                              {it.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={qtyMut.isPending}
                              onClick={() =>
                                qtyMut.mutate({ itemId: it.id, quantity: it.quantity + 1 })
                              }
                              className="fs-touch-target px-3 py-1.5 text-neutral-700 active:bg-neutral-100"
                              aria-label="Augmenter"
                            >
                              <MdAdd className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setNoteFor(it.id);
                              setNoteDraft(it.note ?? "");
                            }}
                            className={cn(btnGhost, "min-h-9 min-w-9")}
                            aria-label="Ajouter une précision"
                          >
                            <MdEditNote className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                          <button
                            type="button"
                            disabled={qtyMut.isPending}
                            onClick={() => qtyMut.mutate({ itemId: it.id, remove: true })}
                            className={cn(btnGhost, "min-h-9 min-w-9 text-rose-600")}
                            aria-label="Retirer la ligne"
                          >
                            <MdDeleteOutline className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidFor(it.id);
                            setVoidReason("");
                          }}
                          className="fs-touch-target rounded-[10px] px-2 py-1 text-xs font-semibold text-rose-600 active:bg-rose-500/10"
                        >
                          Annuler cet article
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-black/[0.08] bg-fs-surface-container/60 px-4 py-3">
          <span className="text-sm font-semibold text-neutral-700">Total</span>
          <span className="text-lg font-extrabold tabular-nums text-fs-text">
            {formatCurrency(total)}
          </span>
        </div>
      </FsCard>

      {/* ── Actions de service ── */}
      {!closed ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pendingItems.length === 0 || sendMut.isPending}
            onClick={() => sendMut.mutate(directServeIds)}
            className={cn(btnPrimary, "col-span-2 min-h-12")}
          >
            <MdSend className="h-5 w-5" aria-hidden />
            {pendingItems.length === 0
              ? "Tout est envoyé"
              : `Envoyer en cuisine (${pendingItems.length})`}
          </button>

          <Link
            href={`${ROUTES.stores}/${storeId}/pos-quick?commande=${encodeURIComponent(order.id)}`}
            className={cn(
              btnOutline,
              "min-h-12",
              liveItems.length === 0 && "pointer-events-none opacity-40",
            )}
            aria-disabled={liveItems.length === 0}
          >
            <MdPointOfSale className="h-5 w-5" aria-hidden />
            Encaisser
          </Link>

          {order.serviceType === "dine_in" ? (
            <button
              type="button"
              onClick={() => setMoveOpen(true)}
              className={cn(btnOutline, "min-h-12")}
            >
              <MdSwapHoriz className="h-5 w-5" aria-hidden />
              Changer de table
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className={cn(btnDanger, "min-h-12")}
            >
              Annuler
            </button>
          )}

          {order.serviceType === "dine_in" ? (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className={cn(btnDanger, "col-span-2 min-h-11")}
            >
              Annuler la commande
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          {order.saleId ? (
            <Link href={ROUTES.sales} className={cn(btnOutline, "w-full min-h-12")}>
              Voir la vente correspondante
            </Link>
          ) : null}
        </div>
      )}

      {/* ── La carte ── */}
      {!closed ? (
        <section className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="sticky top-0 z-10 -mx-2 bg-fs-surface/95 px-2 pb-2 pt-1 backdrop-blur-sm">
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
                placeholder="Chercher un plat, une boisson…"
                className={fsInputClass("pl-10")}
                aria-label="Chercher dans la carte"
              />
            </div>
            {coursesPresent.length > 1 ? (
              <div className="fs-scroll-x mt-2 flex gap-1.5 overflow-x-auto pb-1">
                <CourseChip
                  label="Tout"
                  selected={course === "all"}
                  onClick={() => setCourse("all")}
                />
                {coursesPresent.map((c) => (
                  <CourseChip
                    key={c}
                    label={MENU_COURSE_LABELS[c]}
                    selected={course === c}
                    onClick={() => setCourse(c)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {menuQ.isError ? (
            <FsQueryErrorPanel error={menuQ.error} onRetry={() => void menuQ.refetch()} />
          ) : visibleMenu.length === 0 ? (
            <RestaurantEmptyCard
              icon={MdOutlineRestaurantMenu}
              title="Aucun article"
              message={
                search
                  ? "Rien ne correspond à cette recherche."
                  : "Votre carte est vide. Ajoutez des plats depuis le menu Restaurant › Menu."
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 pb-[calc(1rem+var(--fs-safe-bottom))] min-[560px]:grid-cols-3 min-[900px]:grid-cols-4">
              {visibleMenu.map((m) => (
                <MenuTile
                  key={m.productId}
                  item={m}
                  busy={addMut.isPending}
                  onPick={() => {
                    if (!m.isAvailable) {
                      toast.error(
                        m.unavailableReason
                          ? `Indisponible : ${m.unavailableReason}`
                          : "Cet article n'est plus disponible.",
                      );
                      return;
                    }
                    if (m.optionGroupCount > 0) {
                      setOptionsFor(m);
                      return;
                    }
                    addMut.mutate({ productId: m.productId, unitPrice: m.salePrice });
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* ── Dialogues ── */}

      <OptionsSheet
        item={optionsFor}
        groupsById={groupsById}
        companyId={companyId}
        busy={addMut.isPending}
        onClose={() => setOptionsFor(null)}
        onConfirm={(options) => {
          if (!optionsFor) return;
          addMut.mutate(
            { productId: optionsFor.productId, unitPrice: optionsFor.salePrice, options },
            { onSuccess: () => setOptionsFor(null) },
          );
        }}
      />

      <RestaurantSheet
        open={noteFor !== null}
        title="Précision pour la cuisine"
        subtitle="S'imprime sur le bon."
        onClose={() => setNoteFor(null)}
        footer={
          <button
            type="button"
            disabled={noteMut.isPending}
            onClick={() => noteFor && noteMut.mutate({ itemId: noteFor, note: noteDraft })}
            className={cn(btnPrimary, "w-full")}
          >
            <MdCheck className="h-5 w-5" aria-hidden />
            Enregistrer
          </button>
        }
      >
        <input
          type="text"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Bien cuit, sans piment, à emporter…"
          className={fsInputClass()}
          autoFocus
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Sans piment", "Bien cuit", "Saignant", "Sans oignon", "À emporter"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setNoteDraft(s)}
              className="fs-touch-target rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-neutral-700 active:bg-neutral-100"
            >
              {s}
            </button>
          ))}
        </div>
      </RestaurantSheet>

      <RestaurantSheet
        open={voidFor !== null}
        title="Annuler cet article"
        subtitle="Il est déjà parti en cuisine : le motif est obligatoire."
        onClose={() => setVoidFor(null)}
        footer={
          <button
            type="button"
            disabled={voidMut.isPending || voidReason.trim().length === 0}
            onClick={() => voidFor && voidMut.mutate({ itemId: voidFor, reason: voidReason })}
            className={cn(btnDanger, "w-full")}
          >
            Annuler l&apos;article
          </button>
        }
      >
        <p className="mb-3 flex items-start gap-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          <MdWarningAmber className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          La ligne reste visible sur la commande, avec son motif. Elle ne sera pas facturée.
        </p>
        <input
          type="text"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          placeholder="Erreur de saisie, client parti, plat raté…"
          className={fsInputClass()}
          autoFocus
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Erreur de saisie", "Client s'est ravisé", "Plat raté", "Rupture"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setVoidReason(s)}
              className="fs-touch-target rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-neutral-700 active:bg-neutral-100"
            >
              {s}
            </button>
          ))}
        </div>
      </RestaurantSheet>

      <RestaurantSheet
        open={moveOpen}
        title="Changer de table"
        subtitle="La commande et ses articles suivent."
        onClose={() => setMoveOpen(false)}
      >
        {tablesQ.isPending ? (
          <p className="py-6 text-center text-sm text-neutral-600">Chargement…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4">
            {(tablesQ.data ?? [])
              .filter((t) => t.id !== order.tableId)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={moveMut.isPending}
                  onClick={() => moveMut.mutate(t.id)}
                  className="fs-touch-target flex min-h-16 flex-col items-center justify-center rounded-[12px] border border-black/10 bg-fs-card px-2 py-2 active:bg-neutral-50 disabled:opacity-40"
                >
                  <span className="text-base font-bold text-fs-text">{t.label}</span>
                  <span className="text-[11px] text-neutral-500">{t.seats} pl.</span>
                </button>
              ))}
          </div>
        )}
      </RestaurantSheet>

      <RestaurantSheet
        open={headerOpen}
        title="Modifier la commande"
        onClose={() => setHeaderOpen(false)}
        footer={
          <button
            type="button"
            disabled={headerMut.isPending}
            onClick={() => {
              const form = document.getElementById("ro-header") as HTMLFormElement | null;
              if (!form) return;
              const fd = new FormData(form);
              headerMut.mutate({
                covers: Number(fd.get("covers") ?? order.covers),
                note: String(fd.get("note") ?? ""),
              });
            }}
            className={cn(btnPrimary, "w-full")}
          >
            Enregistrer
          </button>
        }
      >
        <form id="ro-header" className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Nombre de couverts
            </span>
            <input
              type="number"
              name="covers"
              min={1}
              max={200}
              defaultValue={order.covers}
              inputMode="numeric"
              className={fsInputClass()}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Note de service
            </span>
            <input
              type="text"
              name="note"
              defaultValue={order.note ?? ""}
              placeholder="Anniversaire, client pressé…"
              className={fsInputClass()}
            />
          </label>
        </form>
      </RestaurantSheet>

      <RestaurantSheet
        open={cancelOpen}
        title="Annuler la commande"
        subtitle="Rien n'est supprimé : la commande reste lisible avec son motif."
        onClose={() => setCancelOpen(false)}
        footer={
          <button
            type="button"
            disabled={cancelMut.isPending || cancelReason.trim().length === 0}
            onClick={() => cancelMut.mutate(cancelReason)}
            className={cn(btnDanger, "w-full")}
          >
            Annuler la commande
          </button>
        }
      >
        <input
          type="text"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Table partie, erreur d'ouverture…"
          className={fsInputClass()}
          autoFocus
        />
      </RestaurantSheet>
    </FsPage>
  );
}

function CourseChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fs-touch-target shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
        selected
          ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent"
          : "border-black/[0.08] bg-fs-card text-neutral-700",
      )}
    >
      {label}
    </button>
  );
}

/**
 * La tuile d'un plat. Grande, lisible d'un coup d'œil, et TOUJOURS touchable même
 * indisponible : le serveur qui touche un plat épuisé doit apprendre pourquoi, pas
 * se demander si son écran a planté.
 */
function MenuTile({
  item,
  busy,
  onPick,
}: {
  item: MenuItem;
  busy: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      className={cn(
        "flex min-h-[76px] flex-col justify-between rounded-[12px] border p-2.5 text-left transition-transform active:scale-[0.97] disabled:opacity-60",
        item.isAvailable
          ? "border-black/[0.08] bg-fs-card"
          : "border-dashed border-rose-500/30 bg-rose-500/[0.04]",
      )}
    >
      <span
        className={cn(
          "line-clamp-2 text-[13px] font-semibold leading-snug",
          item.isAvailable ? "text-fs-text" : "text-neutral-500 line-through",
        )}
      >
        {item.name}
      </span>
      <span className="mt-1.5 flex items-end justify-between gap-1">
        <span className="text-sm font-bold tabular-nums text-fs-accent">
          {formatCurrency(item.salePrice)}
        </span>
        {!item.isAvailable ? (
          <span className="text-[10px] font-semibold uppercase text-rose-600">épuisé</span>
        ) : item.optionGroupCount > 0 ? (
          <span className="text-[10px] font-semibold text-neutral-400">
            {item.optionGroupCount} choix
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Le choix des options. Ouvert seulement pour les articles qui en ont : imposer ce
 * dialogue à chaque bière ajouterait un geste à quatre-vingts pour cent des touches
 * d'un service.
 */
function OptionsSheet({
  item,
  groupsById,
  companyId,
  busy,
  onClose,
  onConfirm,
}: {
  item: MenuItem | null;
  groupsById: Map<string, ModifierGroup>;
  companyId: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (options: ChosenOption[]) => void;
}) {
  const [chosen, setChosen] = useState<Record<string, string[]>>({});

  const groupIdsQ = useQuery({
    queryKey: queryKeys.restaurantProductGroups(companyId, item?.productId ?? ""),
    queryFn: async () => {
      const { listGroupsForProduct } = await import(
        "@/lib/features/restaurant/api-menu"
      );
      return listGroupsForProduct(item!.productId);
    },
    enabled: Boolean(item?.productId),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setChosen({});
  }, [item?.productId]);

  const groups = useMemo(
    () =>
      (groupIdsQ.data ?? [])
        .map((id) => groupsById.get(id))
        .filter((g): g is ModifierGroup => Boolean(g) && g!.isActive),
    [groupIdsQ.data, groupsById],
  );

  if (!item) return null;

  const options: ChosenOption[] = groups.flatMap((g) =>
    (chosen[g.id] ?? []).flatMap((mid) => {
      const m = g.modifiers.find((x) => x.id === mid);
      return m ? [{ modifierId: m.id, label: m.name, priceDelta: m.priceDelta }] : [];
    }),
  );
  const extra = options.reduce((s, o) => s + o.priceDelta, 0);

  /** Un groupe obligatoire non renseigné bloque : c'est une question sans réponse. */
  const missing = groups.filter((g) => (chosen[g.id]?.length ?? 0) < g.minSelect);

  return (
    <RestaurantSheet
      open
      title={item.name}
      subtitle={`${formatCurrency(item.salePrice + extra)}${extra > 0 ? ` (dont ${formatCurrency(extra)} d'options)` : ""}`}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || missing.length > 0}
          onClick={() => onConfirm(options)}
          className={cn(btnPrimary, "w-full min-h-12")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          {missing.length > 0
            ? `Choisissez : ${missing.map((g) => g.name).join(", ")}`
            : "Ajouter à la commande"}
        </button>
      }
    >
      {groupIdsQ.isPending ? (
        <p className="py-6 text-center text-sm text-neutral-600">Chargement…</p>
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-600">
          Aucune option pour cet article.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const picked = chosen[g.id] ?? [];
            const single = g.maxSelect === 1;
            return (
              <div key={g.id}>
                <p className="mb-1.5 text-xs font-semibold text-neutral-700">
                  {g.prompt || g.name}
                  {g.minSelect > 0 ? (
                    <span className="ml-1 text-rose-600">obligatoire</span>
                  ) : (
                    <span className="ml-1 font-normal text-neutral-500">
                      (max {g.maxSelect})
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.modifiers
                    .filter((m) => m.isAvailable)
                    .map((m) => {
                      const on = picked.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            setChosen((prev) => {
                              const cur = prev[g.id] ?? [];
                              if (on) {
                                return { ...prev, [g.id]: cur.filter((x) => x !== m.id) };
                              }
                              if (single) return { ...prev, [g.id]: [m.id] };
                              if (cur.length >= g.maxSelect) return prev;
                              return { ...prev, [g.id]: [...cur, m.id] };
                            })
                          }
                          className={cn(
                            "fs-touch-target rounded-[10px] border px-3 py-2 text-xs font-semibold transition-colors",
                            on
                              ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
                              : "border-black/10 bg-fs-card text-neutral-700",
                          )}
                        >
                          {m.name}
                          {m.priceDelta > 0 ? (
                            <span className="ml-1 font-bold">
                              +{formatCurrency(m.priceDelta)}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </RestaurantSheet>
  );
}
