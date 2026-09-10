"use client";

/**
 * « Postes de production » — les stations qui alimentent l'écran de cuisine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN SANS LEQUEL LA CUISINE NE REÇOIT RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Un article sans station est considéré comme SERVI DIRECTEMENT : le serveur le
 * prend lui-même au frigo, il ne passe pas par la cuisine. C'est le bon
 * comportement pour une bière — mais si aucune station n'existe, TOUS les articles
 * tombent dans ce cas et l'écran de cuisine reste éternellement vide.
 *
 * D'où cet écran, et d'où la bannière d'alerte quand la liste est vide : c'est la
 * première chose à faire en installant le module, avant même de créer les tables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `kdsEnabled`, LA SUBTILITÉ QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une station SANS écran (« Bar » dans un petit maquis) sert à ranger la carte et
 * à filtrer les rapports, mais ses articles ne partent pas en cuisine : le serveur
 * les sert au moment de l'envoi. Une station AVEC écran fait tomber le bon devant
 * le cuisinier. Les deux sont légitimes, et c'est le patron qui tranche.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdDeleteOutline,
  MdEdit,
  MdOutlineSoupKitchen,
  MdTv,
  MdTvOff,
  MdWarningAmber,
} from "react-icons/md";

import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import {
  NeedStoreCard,
  NoAccessCard,
  RestaurantEmptyCard,
  RestaurantSheet,
  btnGhost,
  btnOutline,
  btnPrimary,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { P } from "@/lib/constants/permissions";
import {
  createStation,
  deleteStation,
  listMenu,
  listStations,
  updateStation,
} from "@/lib/features/restaurant/api-menu";
import type { RestaurantStation } from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

const STATION_COLORS = ["#F97316", "#DC2626", "#0EA5E9", "#16A34A", "#A855F7", "#64748B"];

/**
 * Les postes d'un maquis ordinaire. Proposés en un geste : créer « Cuisine »,
 * « Grill » et « Bar » à la main, c'est trois fois le même dialogue au moment
 * précis où le client juge si le logiciel lui fait gagner du temps.
 */
const PRESETS: Array<{ name: string; color: string; kds: boolean }> = [
  { name: "Cuisine", color: "#F97316", kds: true },
  { name: "Grill", color: "#DC2626", kds: true },
  { name: "Bar", color: "#0EA5E9", kds: false },
];

export function RestaurantStationsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { hasPermission } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const canConfigure =
    ctx.data?.roleSlug === "owner" ||
    ctx.data?.roleSlug === "manager" ||
    hasPermission(P.settingsManage);

  const [sheet, setSheet] = useState<RestaurantStation | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RestaurantStation | null>(null);

  const listQ = useQuery({
    queryKey: queryKeys.restaurantStations(companyId, storeId),
    queryFn: () => listStations({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  /** Combien d'articles sont rattachés à chaque poste — et combien n'en ont aucun. */
  const menuQ = useQuery({
    queryKey: queryKeys.restaurantMenu(companyId, storeId),
    queryFn: () => listMenu({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["restaurant", companyId] });

  const saveMut = useMutation({
    mutationFn: async (p: {
      id?: string;
      name: string;
      color: string;
      kdsEnabled: boolean;
      isActive: boolean;
    }) => {
      if (p.id) {
        return updateStation({
          id: p.id,
          name: p.name,
          color: p.color,
          kdsEnabled: p.kdsEnabled,
          isActive: p.isActive,
        });
      }
      return createStation({
        companyId,
        storeId,
        name: p.name,
        color: p.color,
        kdsEnabled: p.kdsEnabled,
      });
    },
    onSuccess: async () => {
      setSheet(null);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-station-save", e),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStation(id),
    onSuccess: async () => {
      setConfirmDelete(null);
      toast.success("Poste supprimé.");
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-station-delete", e),
  });

  const presetMut = useMutation({
    mutationFn: async () => {
      const existing = new Set((listQ.data ?? []).map((s) => s.name.toLowerCase()));
      let made = 0;
      for (const [i, p] of PRESETS.entries()) {
        if (existing.has(p.name.toLowerCase())) continue;
        await createStation({
          companyId,
          storeId,
          name: p.name,
          color: p.color,
          kdsEnabled: p.kds,
          position: i,
        });
        made += 1;
      }
      return made;
    },
    onSuccess: async (made) => {
      toast.success(
        made === 0 ? "Ces postes existaient déjà." : `${made} poste${made > 1 ? "s créés" : " créé"}.`,
      );
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-station-presets", e),
  });

  const stations = useMemo(() => listQ.data ?? [], [listQ.data]);
  const menu = useMemo(() => menuQ.data ?? [], [menuQ.data]);

  const countByStation = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of menu) {
      if (!item.stationId) continue;
      m.set(item.stationId, (m.get(item.stationId) ?? 0) + 1);
    }
    return m;
  }, [menu]);

  const unassigned = useMemo(() => menu.filter((m) => !m.stationId).length, [menu]);
  const hasKdsStation = stations.some((s) => s.isActive && s.kdsEnabled);

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Postes de production"
          subtitle="Ce qui décide de l'écran sur lequel un bon tombe."
        />
        <NeedStoreCard />
      </FsPage>
    );
  }
  if (!canConfigure) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Postes de production"
          subtitle="Ce qui décide de l'écran sur lequel un bon tombe."
        />
        <NoAccessCard what="Seul le propriétaire ou le gérant organise la cuisine." />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Postes de production"
          subtitle="Cuisine, grill, bar… C'est le poste d'un article qui décide s'il part en cuisine ou s'il est servi directement."
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setSheet("new")}
          className={cn(btnPrimary, "min-h-11 shrink-0")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Nouveau poste
        </button>
      </div>

      {/*
        L'avertissement qui évite l'appel au support. Sans poste avec écran, le KDS
        reste vide quoi qu'on fasse — et rien à l'écran ne le dirait.
      */}
      {!listQ.isPending && !hasKdsStation ? (
        <FsCard className="mt-3 border-amber-500/30 bg-amber-500/[0.07]" padding="p-3.5">
          <p className="flex items-start gap-2 text-sm font-bold text-amber-900 dark:text-amber-300">
            <MdWarningAmber className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            Votre écran de cuisine ne recevra rien
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-900/85 dark:text-amber-300/85">
            Tant qu&apos;aucun poste n&apos;a d&apos;écran, tous les articles sont
            considérés comme servis directement par le serveur : les bons ne partent
            jamais en cuisine. Créez au moins un poste avec écran.
          </p>
          <button
            type="button"
            disabled={presetMut.isPending}
            onClick={() => presetMut.mutate()}
            className={cn(btnPrimary, "mt-3 w-full sm:w-auto")}
          >
            <MdAdd className="h-5 w-5" aria-hidden />
            Créer Cuisine, Grill et Bar
          </button>
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
      ) : stations.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdOutlineSoupKitchen}
            title="Aucun poste de production"
            message="Un poste, c'est un endroit où l'on prépare : la cuisine, le grill, le bar. C'est la première chose à créer — sans lui, l'écran de cuisine reste vide."
            action={
              <button
                type="button"
                disabled={presetMut.isPending}
                onClick={() => presetMut.mutate()}
                className={btnPrimary}
              >
                <MdAdd className="h-5 w-5" aria-hidden />
                Créer Cuisine, Grill et Bar
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-2 min-[720px]:grid-cols-2">
            {stations.map((s) => {
              const count = countByStation.get(s.id) ?? 0;
              return (
                <FsCard
                  key={s.id}
                  padding="p-3"
                  className={cn(!s.isActive && "border-dashed opacity-65")}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 h-9 w-9 shrink-0 rounded-[10px]"
                      style={{ backgroundColor: s.color ?? "#94a3b8" }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-fs-text">{s.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-600">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold",
                            s.kdsEnabled
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                              : "bg-neutral-500/10 text-neutral-600",
                          )}
                        >
                          {s.kdsEnabled ? (
                            <MdTv className="h-3 w-3" aria-hidden />
                          ) : (
                            <MdTvOff className="h-3 w-3" aria-hidden />
                          )}
                          {s.kdsEnabled ? "Écran cuisine" : "Servi directement"}
                        </span>
                        <span>
                          {count} article{count > 1 ? "s" : ""}
                        </span>
                        {s.isActive ? null : <span>· inactif</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <button
                        type="button"
                        onClick={() => setSheet(s)}
                        className={cn(btnGhost, "min-h-9 min-w-9")}
                        aria-label={`Modifier ${s.name}`}
                      >
                        <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(s)}
                        className={cn(btnGhost, "min-h-9 min-w-9 text-rose-600")}
                        aria-label={`Supprimer ${s.name}`}
                      >
                        <MdDeleteOutline className="h-[18px] w-[18px]" aria-hidden />
                      </button>
                    </div>
                  </div>
                </FsCard>
              );
            })}
          </div>

          {/*
            Le compte des articles sans poste. C'est l'étape suivante logique : créer
            les postes ne sert à rien tant que les plats n'y sont pas rattachés.
          */}
          {unassigned > 0 && hasKdsStation ? (
            <FsCard className="mt-3" padding="p-3">
              <p className="text-sm font-semibold text-fs-text">
                {unassigned} article{unassigned > 1 ? "s" : ""} sans poste
              </p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                Ils seront servis directement par le serveur, sans passer par la
                cuisine. C&apos;est juste pour les boissons — rattachez les plats à
                leur poste depuis la carte.
              </p>
              <Link href="/restaurant/menu/plats" className={cn(btnOutline, "mt-3")}>
                Rattacher les plats
              </Link>
            </FsCard>
          ) : null}
        </>
      )}

      {sheet !== null ? (
        <StationSheet
          key={sheet === "new" ? "new" : sheet.id}
          initial={sheet === "new" ? null : sheet}
          busy={saveMut.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(p) => saveMut.mutate(p)}
        />
      ) : null}

      <FsConfirmDialog
        open={confirmDelete !== null}
        title={`Supprimer « ${confirmDelete?.name ?? ""} » ?`}
        message="Les articles qui y étaient rattachés repassent en « servi directement » : ils ne partiront plus en cuisine tant que vous ne leur aurez pas donné un autre poste."
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
      />
    </FsPage>
  );
}

function StationSheet({
  initial,
  busy,
  onClose,
  onSubmit,
}: {
  initial: RestaurantStation | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    id?: string;
    name: string;
    color: string;
    kdsEnabled: boolean;
    isActive: boolean;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? STATION_COLORS[0]);
  const [kds, setKds] = useState(initial?.kdsEnabled ?? true);
  const [active, setActive] = useState(initial?.isActive ?? true);

  return (
    <RestaurantSheet
      open
      title={initial ? initial.name : "Nouveau poste de production"}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || name.trim().length === 0}
          onClick={() =>
            onSubmit({
              id: initial?.id,
              name: name.trim(),
              color,
              kdsEnabled: kds,
              isActive: active,
            })
          }
          className={cn(btnPrimary, "w-full")}
        >
          Enregistrer
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">Nom</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cuisine, Grill, Bar, Pâtisserie…"
            className={fsInputClass()}
            autoFocus
          />
        </label>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-700">
            Couleur sur l&apos;écran de cuisine
          </p>
          <div className="flex flex-wrap gap-2">
            {STATION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-9 w-9 rounded-full border-2 transition-transform active:scale-95",
                  color === c ? "border-fs-text" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Couleur ${c}`}
              />
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border border-black/[0.08] px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fs-text">
              Ce poste a un écran de cuisine
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
              {kds
                ? "Les bons de ce poste tombent sur l'écran de cuisine et suivent le parcours « je prends » → « c'est prêt »."
                : "Pas d'écran : le serveur sert lui-même au moment de l'envoi. C'est le bon réglage pour le bar et le frigo."}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={kds}
            onChange={(e) => setKds(e.target.checked)}
            className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
          />
        </label>

        {initial ? (
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border border-black/[0.08] px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Poste en service</span>
              <span className="mt-0.5 block text-xs text-neutral-600">
                Inactif, il disparaît des filtres du KDS et de la carte, sans rien perdre.
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
