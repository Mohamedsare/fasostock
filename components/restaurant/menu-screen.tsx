"use client";

/**
 * « Menu » — la carte, et le geste le plus fréquent du service : retirer un plat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX PUBLICS, UN SEUL ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * • LE SERVEUR, dix fois par semaine, à 21 h : « il n'y a plus de poisson ». Il lui
 *   faut UN interrupteur, trouvable en trois secondes, sans quitter la salle. C'est
 *   pour lui que la bascule « disponible » est un gros interrupteur en bout de
 *   ligne, et que les articles épuisés remontent en tête.
 * • LE PATRON, une fois par mois : ranger la carte, poser les stations de
 *   production, dire quel plat prend combien de temps. C'est le dialogue de
 *   réglage, ouvert en touchant le nom de l'article.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « RETIRER DE LA CARTE » NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ça ne touche ni au stock, ni au prix, ni à `products.is_active`. Le poisson
 * retiré ce soir doit revenir demain matin sans qu'on le recrée. La bascule écrit
 * dans `restaurant_menu_items`, une table qui ne contient AUCUNE colonne d'argent —
 * c'est ce qui permet de l'ouvrir aux serveurs sans risque (voir 00220).
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdBolt,
  MdOutlineRestaurantMenu,
  MdSearch,
  MdTune,
  MdWarningAmber,
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
  btnPrimary,
  dateTimeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import {
  listGroupsForProduct,
  listMenu,
  listModifierGroups,
  listStations,
  setAvailability,
  setGroupsForProduct,
  upsertMenuSettings,
} from "@/lib/features/restaurant/api-menu";
import {
  MENU_COURSE_LABELS,
  MENU_COURSE_ORDER,
  type MenuCourse,
  type MenuItem,
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

/**
 * L'entrée de menu par laquelle on arrive pré-filtre la carte. « Boissons » et
 * « Plats » sont la même page vue par deux portes — le serveur qui cherche une
 * bière ne doit pas défiler les entrées.
 */
export type MenuView = "all" | "dishes" | "drinks" | "availability";

const VIEW_COPY: Record<MenuView, { title: string; subtitle: string }> = {
  all: {
    title: "Carte",
    subtitle: "Tous vos articles. Touchez l'interrupteur pour retirer ou remettre un article.",
  },
  dishes: {
    title: "Plats",
    subtitle: "Entrées, plats, accompagnements et desserts.",
  },
  drinks: {
    title: "Boissons",
    subtitle: "Tout ce qui se sert au bar ou au frigo.",
  },
  availability: {
    title: "Disponibilité",
    subtitle: "Ce qui manque ce soir. Un doigt pour retirer, un doigt pour remettre.",
  },
};

const COURSES_FOR_VIEW: Record<MenuView, MenuCourse[] | null> = {
  all: null,
  dishes: ["starter", "main", "side", "dessert"],
  drinks: ["drink"],
  availability: null,
};

export function RestaurantMenuScreen({ view = "all" }: { view?: MenuView }) {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const copy = VIEW_COPY[view];

  const [search, setSearch] = useState("");
  const [course, setCourse] = useState<MenuCourse | "all">("all");
  const [settingsFor, setSettingsFor] = useState<MenuItem | null>(null);
  const [unavailableFor, setUnavailableFor] = useState<MenuItem | null>(null);
  const [reason, setReason] = useState("");

  const menuQ = useQuery({
    queryKey: queryKeys.restaurantMenu(companyId, storeId),
    queryFn: () => listMenu({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const stationsQ = useQuery({
    queryKey: queryKeys.restaurantStations(companyId, storeId),
    queryFn: () => listStations({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
  });

  const groupsQ = useQuery({
    queryKey: queryKeys.restaurantModifierGroups(companyId),
    queryFn: () => listModifierGroups(companyId),
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
  });

  const availabilityMut = useMutation({
    mutationFn: (p: { productId: string; available: boolean; reason?: string | null }) =>
      setAvailability(p),
    /*
     * Optimiste, et sans exception. Le serveur touche l'interrupteur en marchant :
     * s'il doit attendre la réponse du serveur pour voir le basculement, il touche
     * une deuxième fois — et remet en carte ce qu'il vient de retirer.
     */
    onMutate: async (p) => {
      const key = queryKeys.restaurantMenu(companyId, storeId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MenuItem[]>(key);
      qc.setQueryData<MenuItem[]>(key, (old) =>
        (old ?? []).map((m) =>
          m.productId === p.productId
            ? {
                ...m,
                isAvailable: p.available,
                unavailableReason: p.available ? null : (p.reason ?? null),
                unavailableSince: p.available ? null : new Date().toISOString(),
              }
            : m,
        ),
      );
      return { previous, key };
    },
    onError: (e, _p, c) => {
      if (c?.previous) qc.setQueryData(c.key, c.previous);
      toastMutationError("restaurant-menu-availability", e);
    },
    onSuccess: () => {
      setUnavailableFor(null);
      setReason("");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
  });

  const settingsMut = useMutation({
    mutationFn: async (p: {
      productId: string;
      stationId: string | null;
      course: MenuCourse;
      prepMinutes: number | null;
      isFeatured: boolean;
      groupIds: string[];
    }) => {
      await upsertMenuSettings({
        companyId,
        productId: p.productId,
        stationId: p.stationId,
        course: p.course,
        prepMinutes: p.prepMinutes,
        isFeatured: p.isFeatured,
      });
      await setGroupsForProduct({
        companyId,
        productId: p.productId,
        groupIds: p.groupIds,
      });
    },
    onSuccess: async () => {
      setSettingsFor(null);
      toast.success("Article mis à jour.");
      await qc.invalidateQueries({ queryKey: ["restaurant", companyId] });
    },
    onError: (e) => toastMutationError("restaurant-menu-settings", e),
  });

  const menu = useMemo(() => menuQ.data ?? [], [menuQ.data]);
  const stations = useMemo(() => stationsQ.data ?? [], [stationsQ.data]);
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);

  const scoped = useMemo(() => {
    const allowed = COURSES_FOR_VIEW[view];
    return allowed ? menu.filter((m) => allowed.includes(m.course)) : menu;
  }, [menu, view]);

  const coursesPresent = useMemo(() => {
    const set = new Set(scoped.map((m) => m.course));
    return MENU_COURSE_ORDER.filter((c) => set.has(c));
  }, [scoped]);

  const visible = useMemo(() => {
    const q = norm(search);
    return scoped
      .filter((m) => (course === "all" ? true : m.course === course))
      .filter((m) => (q ? norm(m.name).includes(q) : true))
      .sort((a, b) => {
        // Les articles retirés en tête : c'est la liste que le serveur vient vérifier.
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? 1 : -1;
        return a.name.localeCompare(b.name, "fr");
      });
  }, [scoped, course, search]);

  const missing = useMemo(() => scoped.filter((m) => !m.isAvailable), [scoped]);

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
      <FsScreenHeader title={copy.title} subtitle={copy.subtitle} />

      {/*
        Le bandeau des manques. Toujours en haut, jamais masqué : c'est la seule
        information de cette page qui périme dans la journée.
      */}
      {missing.length > 0 ? (
        <FsCard className="mb-3 border-rose-500/25 bg-rose-500/[0.05]" padding="p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-rose-800 dark:text-rose-300">
            <MdWarningAmber className="h-4 w-4 shrink-0" aria-hidden />
            {missing.length} article{missing.length > 1 ? "s retirés" : " retiré"} de la carte
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missing.slice(0, 12).map((m) => (
              <button
                key={m.productId}
                type="button"
                disabled={availabilityMut.isPending}
                onClick={() =>
                  availabilityMut.mutate({ productId: m.productId, available: true })
                }
                className="fs-touch-target inline-flex items-center gap-1 rounded-full border border-rose-500/25 bg-fs-card px-2.5 py-1.5 text-xs font-semibold text-rose-700 active:bg-rose-500/10 disabled:opacity-40 dark:text-rose-400"
              >
                {m.name}
                <span className="text-[10px] font-bold uppercase">remettre</span>
              </button>
            ))}
            {missing.length > 12 ? (
              <span className="self-center text-xs text-neutral-500">
                +{missing.length - 12}
              </span>
            ) : null}
          </div>
        </FsCard>
      ) : null}

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
          placeholder="Chercher un article…"
          className={fsInputClass("pl-10")}
          aria-label="Chercher dans la carte"
        />
      </div>

      {coursesPresent.length > 1 ? (
        <div className="fs-scroll-x mt-2 flex gap-1.5 overflow-x-auto pb-1">
          <Chip label="Tout" selected={course === "all"} onClick={() => setCourse("all")} />
          {coursesPresent.map((c) => (
            <Chip
              key={c}
              label={MENU_COURSE_LABELS[c]}
              selected={course === c}
              onClick={() => setCourse(c)}
            />
          ))}
        </div>
      ) : null}

      {menuQ.isError ? (
        <FsQueryErrorPanel
          error={menuQ.error}
          onRetry={() => void menuQ.refetch()}
          className="mt-3"
        />
      ) : menuQ.isPending ? (
        <div className="mt-10 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdOutlineRestaurantMenu}
            title="Aucun article"
            message={
              search
                ? "Rien ne correspond à cette recherche."
                : "Vos plats et boissons sont des produits ordinaires du catalogue. Créez-les depuis la page Produits, ils apparaîtront ici."
            }
          />
        </div>
      ) : (
        <FsCard className="mt-3" padding="p-0">
          <ul className="divide-y divide-black/[0.06]">
            {visible.map((m) => (
              <li key={m.productId} className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                <button
                  type="button"
                  onClick={() => setSettingsFor(m)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p
                    className={cn(
                      "truncate text-sm font-semibold",
                      m.isAvailable ? "text-fs-text" : "text-neutral-500 line-through",
                    )}
                  >
                    {m.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
                    <span className="font-bold text-fs-accent">
                      {formatCurrency(m.salePrice)}
                    </span>
                    <span>{MENU_COURSE_LABELS[m.course]}</span>
                    {m.stationName ? <span>· {m.stationName}</span> : null}
                    {m.prepMinutes ? <span>· {m.prepMinutes} min</span> : null}
                    {m.optionGroupCount > 0 ? (
                      <span>· {m.optionGroupCount} choix</span>
                    ) : null}
                    {m.isFeatured ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600">
                        <MdBolt className="h-3 w-3" aria-hidden />
                        en avant
                      </span>
                    ) : null}
                  </p>
                  {!m.isAvailable && m.unavailableReason ? (
                    <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                      {m.unavailableReason}
                      {m.unavailableSince
                        ? ` · depuis ${dateTimeLabel(m.unavailableSince)}`
                        : ""}
                    </p>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsFor(m)}
                  className="fs-touch-target hidden shrink-0 rounded-lg p-2 text-neutral-500 active:bg-neutral-100 sm:inline-flex"
                  aria-label={`Régler ${m.name}`}
                >
                  <MdTune className="h-[18px] w-[18px]" aria-hidden />
                </button>

                {/*
                  L'interrupteur. Grand, en bout de ligne, atteignable au pouce droit :
                  c'est le geste que le serveur fait le plus souvent sur cette page.
                */}
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${m.name} disponible`}
                  checked={m.isAvailable}
                  disabled={availabilityMut.isPending}
                  onChange={(e) => {
                    if (e.target.checked) {
                      availabilityMut.mutate({ productId: m.productId, available: true });
                    } else {
                      setUnavailableFor(m);
                      setReason("");
                    }
                  }}
                  className="h-6 w-11 shrink-0 cursor-pointer accent-fs-accent"
                />
              </li>
            ))}
          </ul>
        </FsCard>
      )}

      {/* ── Retirer de la carte : motif facultatif mais proposé ── */}
      <RestaurantSheet
        open={unavailableFor !== null}
        title={unavailableFor ? `Retirer « ${unavailableFor.name} »` : ""}
        subtitle="L'article disparaît de la caisse jusqu'à ce que vous le remettiez."
        onClose={() => setUnavailableFor(null)}
        footer={
          <button
            type="button"
            disabled={availabilityMut.isPending}
            onClick={() =>
              unavailableFor &&
              availabilityMut.mutate({
                productId: unavailableFor.productId,
                available: false,
                reason: reason.trim() || null,
              })
            }
            className={cn(btnPrimary, "w-full min-h-12")}
          >
            Retirer de la carte
          </button>
        }
      >
        <p className="mb-3 rounded-[10px] bg-fs-surface-container px-3 py-2 text-xs leading-relaxed text-neutral-600">
          Rien n&apos;est supprimé : ni le prix, ni le stock, ni l&apos;historique. Vous le
          remettez d&apos;un doigt demain matin.
        </p>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Pourquoi ? (facultatif)"
          className={fsInputClass()}
          autoFocus
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Rupture", "Plus de poisson", "Four en panne", "Fin de service"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setReason(s)}
              className="fs-touch-target rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-neutral-700 active:bg-neutral-100"
            >
              {s}
            </button>
          ))}
        </div>
      </RestaurantSheet>

      {/* ── Réglages d'article ── */}
      {settingsFor ? (
        <MenuSettingsSheet
          key={settingsFor.productId}
          item={settingsFor}
          stations={stations}
          groups={groups}
          companyId={companyId}
          busy={settingsMut.isPending}
          onClose={() => setSettingsFor(null)}
          onSubmit={(p) => settingsMut.mutate({ productId: settingsFor.productId, ...p })}
        />
      ) : null}
    </FsPage>
  );
}

function MenuSettingsSheet({
  item,
  stations,
  groups,
  companyId,
  busy,
  onClose,
  onSubmit,
}: {
  item: MenuItem;
  stations: Array<{ id: string; name: string; kdsEnabled: boolean; isActive: boolean }>;
  groups: Array<{ id: string; name: string; minSelect: number; maxSelect: number }>;
  companyId: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    stationId: string | null;
    course: MenuCourse;
    prepMinutes: number | null;
    isFeatured: boolean;
    groupIds: string[];
  }) => void;
}) {
  const [stationId, setStationId] = useState<string | null>(item.stationId);
  const [course, setCourse] = useState<MenuCourse>(item.course);
  const [prep, setPrep] = useState(item.prepMinutes ? String(item.prepMinutes) : "");
  const [featured, setFeatured] = useState(item.isFeatured);
  const [groupIds, setGroupIds] = useState<string[] | null>(null);

  const currentGroupsQ = useQuery({
    queryKey: queryKeys.restaurantProductGroups(companyId, item.productId),
    queryFn: () => listGroupsForProduct(item.productId),
    staleTime: 60_000,
  });

  /* Tant que la lecture n'a pas répondu, on affiche ce qui est en base. */
  const effectiveGroupIds = groupIds ?? currentGroupsQ.data ?? [];

  return (
    <RestaurantSheet
      open
      title={item.name}
      subtitle={`${formatCurrency(item.salePrice)}${item.categoryName ? ` · ${item.categoryName}` : ""}`}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit({
              stationId,
              course,
              prepMinutes: prep.trim() ? Math.max(0, Number(prep) || 0) : null,
              isFeatured: featured,
              groupIds: effectiveGroupIds,
            })
          }
          className={cn(btnPrimary, "w-full")}
        >
          Enregistrer
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-700">Service</p>
          <div className="flex flex-wrap gap-1.5">
            {MENU_COURSE_ORDER.map((c) => (
              <Chip
                key={c}
                label={MENU_COURSE_LABELS[c]}
                selected={course === c}
                onClick={() => setCourse(c)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-700">
            Station de production
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              label="Aucune (servi directement)"
              selected={stationId === null}
              onClick={() => setStationId(null)}
            />
            {stations
              .filter((s) => s.isActive)
              .map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={stationId === s.id}
                  onClick={() => setStationId(s.id)}
                />
              ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">
            Sans station, l&apos;article ne passe pas par la cuisine : il est servi dès
            l&apos;envoi. C&apos;est le bon réglage pour les bières et les sucreries.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Temps de préparation (minutes)
          </span>
          <input
            type="number"
            min={0}
            max={600}
            inputMode="numeric"
            value={prep}
            onChange={(e) => setPrep(e.target.value)}
            placeholder="15"
            className={fsInputClass()}
          />
        </label>

        {groups.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-700">
              Choix proposés en caisse
            </p>
            {currentGroupsQ.isPending ? (
              <p className="text-xs text-neutral-500">Chargement…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = effectiveGroupIds.includes(g.id);
                  return (
                    <Chip
                      key={g.id}
                      label={`${g.name} (${g.minSelect === 1 && g.maxSelect === 1 ? "variante" : "supplément"})`}
                      selected={on}
                      onClick={() =>
                        setGroupIds(
                          on
                            ? effectiveGroupIds.filter((x) => x !== g.id)
                            : [...effectiveGroupIds, g.id],
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-[10px] bg-fs-surface-container px-3 py-2 text-[11px] leading-relaxed text-neutral-600">
            Vous n&apos;avez pas encore créé de suppléments ni de variantes. Ils se
            créent dans Menu › Suppléments.
          </p>
        )}

        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border border-black/[0.08] px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fs-text">
              Mettre en avant en caisse
            </span>
            <span className="mt-0.5 block text-xs text-neutral-600">
              Les articles mis en avant remontent en tête de la prise de commande.
              Réservez-le aux six qui font le chiffre.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
          />
        </label>
      </div>
    </RestaurantSheet>
  );
}

function Chip({
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
        "fs-touch-target shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        selected
          ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
          : "border-black/[0.08] bg-fs-card text-neutral-700",
      )}
    >
      {label}
    </button>
  );
}
