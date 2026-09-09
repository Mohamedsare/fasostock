"use client";

/**
 * « Tables » — la configuration de la salle.
 *
 * Écran de PATRON, pas de serveur : on y crée les tables et les zones une fois, à
 * l'installation, puis on n'y revient qu'au changement de saison (la terrasse qui
 * ouvre, deux tables ajoutées pour les matchs).
 *
 * L'état d'une table — libre, occupée — n'est PAS ici et n'est pas stocké : il se
 * déduit des commandes ouvertes (voir 00219). Une colonne « statut » aurait fini
 * par mentir, avec des tables occupées toute la nuit parce qu'un serveur a fermé
 * l'application avant d'encaisser.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdDeleteOutline,
  MdEdit,
  MdLayers,
  MdOutlineTableBar,
  MdPlaylistAdd,
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
  btnDanger,
  btnGhost,
  btnOutline,
  btnPrimary,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { P } from "@/lib/constants/permissions";
import {
  createArea,
  createTable,
  deleteArea,
  deleteTable,
  listAreas,
  listTables,
  updateArea,
  updateTable,
} from "@/lib/features/restaurant/api-floor";
import {
  TABLE_SHAPE_LABELS,
  type RestaurantArea,
  type RestaurantTable,
  type TableShape,
} from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

export function RestaurantTablesScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { hasPermission } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const isOwner = ctx.data?.roleSlug === "owner" || ctx.data?.roleSlug === "manager";
  const canConfigure = isOwner || hasPermission(P.settingsManage);

  const [tableSheet, setTableSheet] = useState<RestaurantTable | "new" | null>(null);
  const [areaSheet, setAreaSheet] = useState<RestaurantArea | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RestaurantTable | null>(null);

  const areasQ = useQuery({
    queryKey: queryKeys.restaurantAreas(companyId, storeId),
    queryFn: () => listAreas({ companyId, storeId }),
    enabled: Boolean(companyId && storeId),
    staleTime: 60_000,
  });

  const tablesQ = useQuery({
    queryKey: queryKeys.restaurantTables(companyId, storeId),
    queryFn: () => listTables({ companyId, storeId, includeInactive: true }),
    enabled: Boolean(companyId && storeId),
    staleTime: 60_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["restaurant", companyId] });

  const saveTableMut = useMutation({
    mutationFn: async (p: {
      id?: string;
      label: string;
      seats: number;
      areaId: string | null;
      shape: TableShape;
      isActive: boolean;
    }) => {
      if (p.id) {
        await updateTable({
          id: p.id,
          label: p.label,
          seats: p.seats,
          areaId: p.areaId,
          shape: p.shape,
          isActive: p.isActive,
        });
        return;
      }
      await createTable({
        companyId,
        storeId: storeId!,
        label: p.label,
        seats: p.seats,
        areaId: p.areaId,
        shape: p.shape,
      });
    },
    onSuccess: async () => {
      setTableSheet(null);
      await invalidate();
    },
    onError: (e) =>
      toastMutationError(
        "restaurant-table-save",
        e,
        "Impossible d'enregistrer cette table. Ce nom est peut-être déjà pris.",
      ),
  });

  const deleteTableMut = useMutation({
    mutationFn: (id: string) => deleteTable(id),
    onSuccess: async () => {
      setConfirmDelete(null);
      toast.success("Table supprimée.");
      await invalidate();
    },
    onError: (e) =>
      toastMutationError(
        "restaurant-table-delete",
        e,
        "Impossible de supprimer cette table. Désactivez-la plutôt : son historique de commandes la référence.",
      ),
  });

  const saveAreaMut = useMutation({
    mutationFn: async (p: { id?: string; name: string; color: string | null }) => {
      if (p.id) return updateArea({ id: p.id, name: p.name, color: p.color });
      return createArea({ companyId, storeId: storeId!, name: p.name, color: p.color });
    },
    onSuccess: async () => {
      setAreaSheet(null);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-area-save", e),
  });

  const deleteAreaMut = useMutation({
    mutationFn: (id: string) => deleteArea(id),
    onSuccess: async () => {
      setAreaSheet(null);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-area-delete", e),
  });

  /**
   * Créer douze tables une par une, c'est douze fois le même dialogue à
   * l'installation — le moment précis où un client décide si le logiciel lui fait
   * gagner du temps ou en perdre.
   */
  const bulkMut = useMutation({
    mutationFn: async (p: {
      prefix: string;
      from: number;
      to: number;
      seats: number;
      areaId: string | null;
    }) => {
      const existing = new Set((tablesQ.data ?? []).map((t) => t.label.toLowerCase()));
      let created = 0;
      for (let i = p.from; i <= p.to; i++) {
        const label = `${p.prefix}${i}`.trim();
        if (existing.has(label.toLowerCase())) continue;
        await createTable({
          companyId,
          storeId: storeId!,
          label,
          seats: p.seats,
          areaId: p.areaId,
        });
        created += 1;
      }
      return created;
    },
    onSuccess: async (created) => {
      setBulkOpen(false);
      toast.success(
        created === 0
          ? "Ces tables existaient déjà."
          : `${created} table${created > 1 ? "s créées" : " créée"}.`,
      );
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-tables-bulk", e),
  });

  const areas = useMemo(() => areasQ.data ?? [], [areasQ.data]);
  const tables = useMemo(() => tablesQ.data ?? [], [tablesQ.data]);

  /** Groupées par zone : c'est ainsi que le patron pense sa salle. */
  const grouped = useMemo(() => {
    const byArea = new Map<string, RestaurantTable[]>();
    for (const t of tables) {
      const key = t.areaId ?? "__none__";
      byArea.set(key, [...(byArea.get(key) ?? []), t]);
    }
    const out: Array<{ id: string; name: string; color: string | null; tables: RestaurantTable[] }> =
      areas.map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        tables: byArea.get(a.id) ?? [],
      }));
    const loose = byArea.get("__none__") ?? [];
    if (loose.length > 0) {
      out.push({ id: "__none__", name: "Sans zone", color: null, tables: loose });
    }
    return out;
  }, [areas, tables]);

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title="Tables" subtitle="La configuration de votre salle." />
        <NeedStoreCard />
      </FsPage>
    );
  }
  if (!canConfigure) {
    return (
      <FsPage>
        <FsScreenHeader title="Tables" subtitle="La configuration de votre salle." />
        <NoAccessCard what="Seul le propriétaire ou le gérant configure la salle." />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Tables"
          subtitle="Créez vos tables une fois. Leur occupation se lit toute seule depuis les commandes."
          className="mb-0 min-w-0 flex-1"
        />
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className={cn(btnOutline, "min-h-11")}
          >
            <MdPlaylistAdd className="h-5 w-5" aria-hidden />
            En série
          </button>
          <button
            type="button"
            onClick={() => setTableSheet("new")}
            className={cn(btnPrimary, "min-h-11")}
          >
            <MdAdd className="h-5 w-5" aria-hidden />
            Nouvelle table
          </button>
        </div>
      </div>

      {/* ── Zones ── */}
      <FsCard className="mt-3" padding="p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <MdLayers className="h-4 w-4" aria-hidden />
            Zones
          </p>
          <button
            type="button"
            onClick={() => setAreaSheet("new")}
            className="fs-touch-target rounded-lg px-2 py-1 text-xs font-semibold text-fs-accent active:bg-fs-accent/10"
          >
            + Ajouter
          </button>
        </div>
        {areas.length === 0 ? (
          <p className="text-xs leading-relaxed text-neutral-600">
            Terrasse, salle climatisée, étage… Facultatif : un petit restaurant n&apos;a
            rien à ranger.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAreaSheet(a)}
                className="fs-touch-target inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-fs-card px-3 py-1.5 text-xs font-semibold text-neutral-800 active:bg-neutral-50"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: a.color ?? "#94a3b8" }}
                  aria-hidden
                />
                {a.name}
                <span className="text-neutral-400">
                  {tables.filter((t) => t.areaId === a.id).length}
                </span>
              </button>
            ))}
          </div>
        )}
      </FsCard>

      {/* ── Tables ── */}
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
            title="Aucune table"
            message="Créez-les en série : « Table 1 » à « Table 12 » en un seul geste."
            action={
              <button type="button" onClick={() => setBulkOpen(true)} className={btnPrimary}>
                <MdPlaylistAdd className="h-5 w-5" aria-hidden />
                Créer en série
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {grouped.map((g) =>
            g.tables.length === 0 ? null : (
              <section key={g.id}>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: g.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  {g.name}
                </p>
                <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-3 min-[900px]:grid-cols-4">
                  {g.tables.map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        "flex items-center gap-2 rounded-[12px] border bg-fs-card p-2.5",
                        t.isActive ? "border-black/[0.07]" : "border-dashed border-black/15 opacity-60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-fs-text">{t.label}</p>
                        <p className="text-[11px] text-neutral-500">
                          {t.seats} place{t.seats > 1 ? "s" : ""} ·{" "}
                          {TABLE_SHAPE_LABELS[t.shape]}
                          {t.isActive ? "" : " · inactive"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTableSheet(t)}
                        className={cn(btnGhost, "min-h-9 min-w-9")}
                        aria-label={`Modifier ${t.label}`}
                      >
                        <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(t)}
                        className={cn(btnGhost, "min-h-9 min-w-9 text-rose-600")}
                        aria-label={`Supprimer ${t.label}`}
                      >
                        <MdDeleteOutline className="h-[18px] w-[18px]" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      )}

      {/* ── Dialogues ── */}

      {/*
        La feuille est MONTÉE à l'ouverture, avec une `key` d'identité. C'est ce qui
        garantit qu'elle repart des bonnes valeurs : sans démontage, rouvrir sur une
        autre table garderait les champs de la précédente — et on renommerait la
        table 3 en « 7 » sans s'en apercevoir.
      */}
      {tableSheet !== null ? (
        <TableSheet
          key={tableSheet === "new" ? "new" : tableSheet.id}
          initial={tableSheet === "new" ? null : tableSheet}
          areas={areas}
          busy={saveTableMut.isPending}
          onClose={() => setTableSheet(null)}
          onSubmit={(p) => saveTableMut.mutate(p)}
        />
      ) : null}

      {areaSheet !== null ? (
        <AreaSheet
          key={areaSheet === "new" ? "new" : areaSheet.id}
          initial={areaSheet === "new" ? null : areaSheet}
          busy={saveAreaMut.isPending || deleteAreaMut.isPending}
          onClose={() => setAreaSheet(null)}
          onSubmit={(p) => saveAreaMut.mutate(p)}
          onDelete={(id) => deleteAreaMut.mutate(id)}
        />
      ) : null}

      <BulkSheet
        open={bulkOpen}
        areas={areas}
        busy={bulkMut.isPending}
        onClose={() => setBulkOpen(false)}
        onSubmit={(p) => bulkMut.mutate(p)}
      />

      <FsConfirmDialog
        open={confirmDelete !== null}
        title={`Supprimer ${confirmDelete?.label ?? ""} ?`}
        message="Si des commandes s'y sont tenues, la suppression sera refusée — désactivez la table à la place."
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleteTableMut.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteTableMut.mutate(confirmDelete.id)}
      />
    </FsPage>
  );
}

const AREA_COLORS = ["#F97316", "#0EA5E9", "#16A34A", "#A855F7", "#DC2626", "#64748B"];

function TableSheet({
  initial,
  areas,
  busy,
  onClose,
  onSubmit,
}: {
  initial: RestaurantTable | null;
  areas: RestaurantArea[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    id?: string;
    label: string;
    seats: number;
    areaId: string | null;
    shape: TableShape;
    isActive: boolean;
  }) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [seats, setSeats] = useState(String(initial?.seats ?? 4));
  const [areaId, setAreaId] = useState<string | null>(initial?.areaId ?? null);
  const [shape, setShape] = useState<TableShape>(initial?.shape ?? "round");
  const [active, setActive] = useState(initial?.isActive ?? true);

  return (
    <RestaurantSheet
      open
      title={initial ? `Table ${initial.label}` : "Nouvelle table"}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || label.trim().length === 0}
          onClick={() =>
            onSubmit({
              id: initial?.id,
              label: label.trim(),
              seats: Math.max(1, Number(seats) || 1),
              areaId,
              shape,
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
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Nom de la table
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="7, T12, Terrasse A…"
            className={fsInputClass()}
            autoFocus
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            Court : c&apos;est ce que le serveur crie à la cuisine.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">Places</span>
          <input
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className={fsInputClass()}
          />
        </label>

        {areas.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-700">Zone</p>
            <div className="flex flex-wrap gap-1.5">
              <ChoiceChip
                label="Sans zone"
                selected={areaId === null}
                onClick={() => setAreaId(null)}
              />
              {areas.map((a) => (
                <ChoiceChip
                  key={a.id}
                  label={a.name}
                  selected={areaId === a.id}
                  onClick={() => setAreaId(a.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-700">Forme sur le plan</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TABLE_SHAPE_LABELS) as TableShape[]).map((sh) => (
              <ChoiceChip
                key={sh}
                label={TABLE_SHAPE_LABELS[sh]}
                selected={shape === sh}
                onClick={() => setShape(sh)}
              />
            ))}
          </div>
        </div>

        {initial ? (
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border border-black/[0.08] px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Table en service</span>
              <span className="mt-0.5 block text-xs text-neutral-600">
                Désactivée, elle disparaît du plan et de l&apos;ouverture de commande, sans
                rien perdre de son historique.
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

function AreaSheet({
  initial,
  busy,
  onClose,
  onSubmit,
  onDelete,
}: {
  initial: RestaurantArea | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: { id?: string; name: string; color: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const editing = initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string>(initial?.color ?? AREA_COLORS[0]);

  return (
    <RestaurantSheet
      open
      title={editing ? "Modifier la zone" : "Nouvelle zone"}
      subtitle="Terrasse, salle climatisée, étage, bar…"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {editing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(editing.id)}
              className={cn(btnDanger, "shrink-0")}
            >
              <MdDeleteOutline className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || name.trim().length === 0}
            onClick={() => onSubmit({ id: editing?.id, name: name.trim(), color })}
            className={cn(btnPrimary, "flex-1")}
          >
            Enregistrer
          </button>
        </div>
      }
    >
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-neutral-700">Nom</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Terrasse"
          className={fsInputClass()}
          autoFocus
        />
      </label>
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-semibold text-neutral-700">Couleur sur le plan</p>
        <div className="flex flex-wrap gap-2">
          {AREA_COLORS.map((c) => (
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
    </RestaurantSheet>
  );
}

function BulkSheet({
  open,
  areas,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  areas: RestaurantArea[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    prefix: string;
    from: number;
    to: number;
    seats: number;
    areaId: string | null;
  }) => void;
}) {
  const [prefix, setPrefix] = useState("Table ");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("12");
  const [seats, setSeats] = useState("4");
  const [areaId, setAreaId] = useState<string | null>(null);

  const f = Number(from) || 1;
  const t = Number(to) || 1;
  const count = Math.max(0, t - f + 1);

  return (
    <RestaurantSheet
      open={open}
      title="Créer des tables en série"
      subtitle="Le geste d'installation : douze tables en une fois."
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || count === 0 || count > 100}
          onClick={() =>
            onSubmit({
              prefix,
              from: f,
              to: t,
              seats: Math.max(1, Number(seats) || 1),
              areaId,
            })
          }
          className={cn(btnPrimary, "w-full")}
        >
          Créer {count} table{count > 1 ? "s" : ""}
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">Préfixe</span>
          <input
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className={fsInputClass()}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">De</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={fsInputClass()}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">À</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={fsInputClass()}
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Places par table
          </span>
          <input
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className={fsInputClass()}
          />
        </label>
        {areas.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-700">Zone</p>
            <div className="flex flex-wrap gap-1.5">
              <ChoiceChip
                label="Sans zone"
                selected={areaId === null}
                onClick={() => setAreaId(null)}
              />
              {areas.map((a) => (
                <ChoiceChip
                  key={a.id}
                  label={a.name}
                  selected={areaId === a.id}
                  onClick={() => setAreaId(a.id)}
                />
              ))}
            </div>
          </div>
        ) : null}
        <p className="rounded-[10px] bg-fs-surface-container px-3 py-2 text-[11px] leading-relaxed text-neutral-600">
          Aperçu : {prefix}
          {f}, {prefix}
          {f + 1}… {prefix}
          {t}. Les noms déjà pris sont ignorés.
        </p>
      </div>
    </RestaurantSheet>
  );
}

function ChoiceChip({
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
        "fs-touch-target rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        selected
          ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
          : "border-black/10 bg-fs-card text-neutral-700",
      )}
    >
      {label}
    </button>
  );
}
