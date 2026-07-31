"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdCheckCircle,
  MdDelete,
  MdEdit,
  MdEditLocationAlt,
  MdInfoOutline,
  MdLock,
  MdMap,
  MdPlace,
  MdSearch,
  MdStorefront,
  MdTravelExplore,
} from "react-icons/md";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listProducts } from "@/lib/features/products/api";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { filterByStoreCatalog } from "@/lib/features/stores/store-catalog";
import { useStoreCatalog } from "@/lib/features/stores/use-store-catalog";
import {
  bulkSetProductLocations,
  deleteLocation,
  fetchLocationScheme,
  fetchLocationTree,
  fetchProductLocations,
  findProductLocations,
  saveLocation,
  saveLocationScheme,
  setLocationSchemeStatus,
  setProductLocation,
} from "@/lib/features/product-locations/api";
import { levelLabel } from "@/lib/features/product-locations/templates";
import {
  buildLocationTree,
  type LocationTreeNode,
} from "@/lib/features/product-locations/tree";
import type {
  LocationLevel,
  LocationNode,
  ProductLocation,
} from "@/lib/features/product-locations/types";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { LocationFormDialog } from "./location-form-dialog";
import { LocationPickerDialog } from "./location-picker-dialog";
import { SchemeSetup } from "./scheme-setup";

type Tab = "plan" | "ranger" | "trouver";

const TABS: { key: Tab; label: string; icon: typeof MdMap }[] = [
  { key: "plan", label: "Plan", icon: MdMap },
  { key: "ranger", label: "Ranger", icon: MdEditLocationAlt },
  { key: "trouver", label: "Trouver", icon: MdTravelExplore },
];

/** Combien de produits on affiche d'un coup dans l'onglet « Ranger ». */
const PAGE_SIZE = 60;

/** Sélection vide partagée — évite un `new Set()` par rendu (identité stable). */
const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();

/** Pastille de chemin réutilisée partout (liste produits, recherche, plan). */
function LocationBadge({
  pathLabel,
  code,
  detail,
  className,
}: {
  pathLabel: string;
  code?: string | null;
  detail?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 dark:text-sky-200",
        className,
      )}
      title={detail ? `${pathLabel} — ${detail}` : pathLabel}
    >
      <MdPlace className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{pathLabel}</span>
      {code ? <span className="shrink-0 opacity-70">· {code}</span> : null}
    </span>
  );
}

export function ProductLocationsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const storeName =
    ctx.data?.stores.find((s) => s.id === storeId)?.name ?? "cette boutique";
  const moduleOn = h?.productLocationsOn ?? false;
  const canManage = h?.canProductLocations ?? false;

  const [tab, setTab] = useState<Tab>("plan");
  const [editingModel, setEditingModel] = useState(false);

  // Onglet « Ranger »
  const [productQuery, setProductQuery] = useState("");
  const [rangeFilter, setRangeFilter] = useState<"all" | "unplaced" | "placed">("all");
  /**
   * Pagination et sélection sont rattachées à la liste qui les a produites : changer
   * de boutique ou de filtre les périme d'office, sans effet de bord ni re-rendu en
   * cascade (on ne « remet pas à zéro » depuis un `useEffect`).
   */
  const [pager, setPager] = useState<{ sig: string; count: number }>({
    sig: "",
    count: PAGE_SIZE,
  });
  const [selection, setSelection] = useState<{ storeId: string | null; ids: Set<string> }>({
    storeId: null,
    ids: new Set(),
  });

  // Onglet « Trouver »
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Dialogues
  const [nodeDialog, setNodeDialog] = useState<{
    open: boolean;
    editing: LocationNode | null;
    parent: LocationTreeNode | null;
    depth: number;
  }>({ open: false, editing: null, parent: null, depth: 0 });
  const [nodeToDelete, setNodeToDelete] = useState<LocationTreeNode | null>(null);
  const [forceDelete, setForceDelete] = useState<LocationTreeNode | null>(null);
  const [picker, setPicker] = useState<
    | { kind: "single"; productId: string; productName: string; current: string | null }
    | { kind: "bulk" }
    | null
  >(null);

  const enabled = Boolean(storeId) && moduleOn && canManage;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const listSignature = `${storeId ?? ""}|${rangeFilter}|${productQuery.trim().toLowerCase()}`;
  const visibleCount = pager.sig === listSignature ? pager.count : PAGE_SIZE;
  const selected = selection.storeId === storeId ? selection.ids : EMPTY_SELECTION;

  const schemeQ = useQuery({
    queryKey: queryKeys.locationScheme(storeId),
    queryFn: () => fetchLocationScheme(storeId ?? ""),
    enabled,
    staleTime: 60_000,
  });
  const scheme = schemeQ.data ?? null;
  const levels: LocationLevel[] = scheme?.levels ?? [];

  const treeQ = useQuery({
    queryKey: queryKeys.locationTree(storeId),
    queryFn: () => fetchLocationTree(storeId ?? ""),
    enabled: enabled && Boolean(scheme),
    staleTime: 30_000,
  });
  const roots = useMemo(() => buildLocationTree(treeQ.data ?? []), [treeQ.data]);

  const assignmentsQ = useQuery({
    queryKey: queryKeys.productLocations(storeId),
    queryFn: () => fetchProductLocations(storeId ?? ""),
    enabled: enabled && Boolean(scheme),
    staleTime: 30_000,
  });
  const assignments = useMemo(() => {
    const m = new Map<string, ProductLocation>();
    for (const r of assignmentsQ.data ?? []) m.set(r.productId, r);
    return m;
  }, [assignmentsQ.data]);

  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: enabled && Boolean(companyId) && tab === "ranger",
    staleTime: 60_000,
  });
  const { catalog } = useStoreCatalog(storeId);

  const searchQ = useQuery({
    queryKey: queryKeys.productLocationSearch(storeId, debouncedSearch),
    queryFn: () => findProductLocations({ storeId: storeId ?? "", query: debouncedSearch }),
    enabled: enabled && tab === "trouver" && debouncedSearch.length >= 2,
    staleTime: 15_000,
  });

  async function refreshLocations() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.locationScheme(storeId) }),
      qc.invalidateQueries({ queryKey: queryKeys.locationTree(storeId) }),
      qc.invalidateQueries({ queryKey: queryKeys.productLocations(storeId) }),
      qc.invalidateQueries({ queryKey: ["product-locations", storeId ?? "__none__", "search"] }),
    ]);
  }

  const schemeMut = useMutation({
    mutationFn: (params: { templateSlug: string | null; levels: LocationLevel[] }) =>
      saveLocationScheme({
        storeId: storeId ?? "",
        name: scheme?.name ?? "Plan de rangement",
        templateSlug: params.templateSlug,
        levels: params.levels,
      }),
    onSuccess: async () => {
      const first = scheme == null;
      setEditingModel(false);
      setTab("plan");
      await refreshLocations();
      toast.success(
        first
          ? "Modèle créé. Ajoutez maintenant vos emplacements."
          : "Modèle mis à jour.",
      );
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const statusMut = useMutation({
    mutationFn: (status: "draft" | "active") =>
      setLocationSchemeStatus(storeId ?? "", status),
    onSuccess: async (_, status) => {
      await refreshLocations();
      toast.success(
        status === "active"
          ? "Plan activé : vos équipes voient où sont rangés les produits."
          : "Plan rouvert à l'édition. Rien n'a été supprimé.",
      );
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const nodeMut = useMutation({
    mutationFn: (params: { id: string | null; parentId: string | null; name: string; code: string | null }) =>
      saveLocation({
        id: params.id,
        storeId: storeId ?? "",
        parentId: params.parentId,
        name: params.name,
        code: params.code,
        sortOrder: 0,
      }),
    onSuccess: async () => {
      setNodeDialog({ open: false, editing: null, parent: null, depth: 0 });
      await refreshLocations();
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (params: { id: string; force: boolean }) =>
      deleteLocation(params.id, params.force),
    onSuccess: async (detached) => {
      setNodeToDelete(null);
      setForceDelete(null);
      await refreshLocations();
      toast.success(
        detached > 0
          ? `Emplacement supprimé. ${detached} produit(s) sont maintenant sans emplacement.`
          : "Emplacement supprimé.",
      );
    },
    onError: (e) => {
      // Refus « l'emplacement n'est pas vide » : on propose la suppression forcée.
      // Tout autre refus (droit, réseau) reste une vraie erreur à afficher.
      const msg = messageFromUnknownError(e);
      const node = nodeToDelete;
      setNodeToDelete(null);
      if (node && msg.includes("contient")) setForceDelete(node);
      else toast.error(msg);
    },
  });

  const assignMut = useMutation({
    mutationFn: (params: { productId: string; locationId: string | null }) =>
      setProductLocation({
        storeId: storeId ?? "",
        productId: params.productId,
        locationId: params.locationId,
        detail: null,
      }),
    onSuccess: async (_, params) => {
      setPicker(null);
      await refreshLocations();
      toast.success(params.locationId ? "Produit rangé." : "Emplacement retiré.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const bulkMut = useMutation({
    mutationFn: (locationId: string | null) =>
      bulkSetProductLocations({
        storeId: storeId ?? "",
        productIds: [...selected],
        locationId,
      }),
    onSuccess: async (count, locationId) => {
      setPicker(null);
      setSelection({ storeId, ids: new Set() });
      await refreshLocations();
      toast.success(
        locationId
          ? `${count} produit(s) rangé(s).`
          : `${count} produit(s) sans emplacement.`,
      );
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  // ───────────────────────────── Gardes d'accès ─────────────────────────────
  if (permLoading || ctx.isLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
        </div>
      </FsPage>
    );
  }

  if (!moduleOn || !canManage) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Emplacements"
          subtitle="Où se trouve physiquement chaque produit dans la boutique"
        />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              {moduleOn
                ? "Vous n'avez pas accès à cette section."
                : "Le module Emplacements n'est pas activé. Le propriétaire peut l'activer dans Paramètres."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Emplacements"
          subtitle="Où se trouve physiquement chaque produit dans la boutique"
        />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <MdStorefront className="h-12 w-12 text-neutral-400" aria-hidden />
            <p className="text-sm font-semibold text-fs-text">Choisissez une boutique</p>
            <p className="max-w-md text-sm leading-relaxed text-neutral-600">
              Chaque boutique a son propre rangement : sélectionnez-en une dans le
              sélecteur en haut (vue « Toutes » désactivée ici) pour construire son plan.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  if (schemeQ.isError) {
    return (
      <FsPage>
        <FsScreenHeader title="Emplacements" />
        <FsQueryErrorPanel error={schemeQ.error} onRetry={() => void schemeQ.refetch()} />
      </FsPage>
    );
  }

  if (schemeQ.isPending) {
    return (
      <FsPage>
        <FsScreenHeader title="Emplacements" />
        <div className="flex min-h-[30vh] items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
        </div>
      </FsPage>
    );
  }

  // ───────────────────────── Aucun plan : on en construit un ─────────────────────────
  if (!scheme || editingModel) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Emplacements"
          subtitle={`Plan de rangement de « ${storeName} »`}
          titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        />
        <SchemeSetup
          storeName={storeName}
          initialLevels={scheme?.levels ?? []}
          initialTemplateSlug={scheme?.templateSlug ?? null}
          editing={Boolean(scheme)}
          busy={schemeMut.isPending}
          onSubmit={(p) => void schemeMut.mutateAsync(p)}
          onCancel={scheme ? () => setEditingModel(false) : undefined}
        />
      </FsPage>
    );
  }

  const isDraft = scheme.status === "draft";
  const totalLocations = treeQ.data?.length ?? 0;
  const placedCount = assignments.size;

  // ───────────────────────────── Onglet « Ranger » ─────────────────────────────
  const storeProducts = filterByStoreCatalog(productsQ.data ?? [], catalog);
  const pq = productQuery.trim().toLowerCase();
  const filteredProducts = storeProducts.filter((p) => {
    const loc = assignments.get(p.id);
    if (rangeFilter === "unplaced" && loc) return false;
    if (rangeFilter === "placed" && !loc) return false;
    if (pq === "") return true;
    return (
      p.name.toLowerCase().includes(pq) ||
      (p.sku ?? "").toLowerCase().includes(pq) ||
      (p.barcode ?? "").toLowerCase().includes(pq) ||
      (loc?.pathLabel ?? "").toLowerCase().includes(pq)
    );
  });
  const shownProducts = filteredProducts.slice(0, visibleCount);
  const unplacedTotal = storeProducts.filter((p) => !assignments.has(p.id)).length;

  function toggleSelected(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection({ storeId, ids: next });
  }

  function clearSelection() {
    setSelection({ storeId, ids: new Set() });
  }

  // ───────────────────────────── Arbre du plan ─────────────────────────────
  function renderNode(node: LocationTreeNode): React.ReactElement {
    const canHaveChildren = node.depth + 1 < levels.length;
    return (
      <li key={node.id}>
        <div
          className="group flex items-center gap-2 rounded-[10px] border border-black/[0.06] bg-fs-card px-2.5 py-2 shadow-sm"
          style={{ marginLeft: `${node.depth * 0.85}rem` }}
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fs-accent/10">
            <MdPlace className="h-4 w-4 text-fs-accent" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-fs-text">{node.name}</span>
              {node.code ? (
                <span className="shrink-0 rounded bg-fs-surface-container px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">
                  {node.code}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-neutral-500">
              {levelLabel(levels, node.depth)}
              {node.totalProductCount > 0
                ? ` · ${node.totalProductCount} produit${node.totalProductCount > 1 ? "s" : ""}`
                : " · vide"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canHaveChildren ? (
              <button
                type="button"
                onClick={() =>
                  setNodeDialog({
                    open: true,
                    editing: null,
                    parent: node,
                    depth: node.depth + 1,
                  })
                }
                className="inline-flex items-center gap-1 rounded-md border border-fs-accent/30 bg-fs-accent/[0.06] px-2 py-1 text-[11px] font-semibold text-fs-accent"
                title={`Ajouter un(e) ${levelLabel(levels, node.depth + 1).toLowerCase()}`}
              >
                <MdAdd className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden min-[420px]:inline">
                  {levelLabel(levels, node.depth + 1)}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                setNodeDialog({ open: true, editing: node, parent: null, depth: node.depth })
              }
              className="rounded-md border border-black/[0.08] px-1.5 py-1 text-neutral-600"
              aria-label="Renommer"
            >
              <MdEdit className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setNodeToDelete(node)}
              className="rounded-md border border-black/[0.08] px-1.5 py-1 text-red-600"
              aria-label="Supprimer"
            >
              <MdDelete className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
        {node.children.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5">{node.children.map(renderNode)}</ul>
        ) : null}
      </li>
    );
  }

  const pickerRoots = roots;

  return (
    <FsPage>
      <FsScreenHeader
        title="Emplacements"
        subtitle={`Plan de rangement de « ${storeName} »`}
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
      />

      {/* Bandeau d'état du plan */}
      <FsCard className="mb-3" padding="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
              isDraft
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
            )}
          >
            {isDraft ? "Brouillon" : "En service"}
          </span>
          <span className="text-xs text-neutral-600 sm:text-sm">
            {levels.map((l) => l.name).join(" › ")}
          </span>
          <span className="text-xs text-neutral-500">
            · {totalLocations} emplacement{totalLocations > 1 ? "s" : ""} · {placedCount} produit
            {placedCount > 1 ? "s" : ""} rangé{placedCount > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditingModel(true)}
              className="rounded-[10px] border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-700"
            >
              Modifier le modèle
            </button>
            {isDraft ? (
              <button
                type="button"
                disabled={statusMut.isPending || totalLocations === 0}
                onClick={() => void statusMut.mutateAsync("active")}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-fs-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                title={
                  totalLocations === 0
                    ? "Créez au moins un emplacement avant d'activer"
                    : undefined
                }
              >
                <MdCheckCircle className="h-4 w-4" aria-hidden />
                Activer le plan
              </button>
            ) : (
              <button
                type="button"
                disabled={statusMut.isPending}
                onClick={() => void statusMut.mutateAsync("draft")}
                className="rounded-[10px] border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-50"
              >
                Repasser en brouillon
              </button>
            )}
          </div>
        </div>
        {isDraft ? (
          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-600 sm:text-xs">
            <MdInfoOutline className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
            Créez vos emplacements dans l&apos;onglet Plan, puis activez : les
            emplacements apparaîtront alors sur vos produits.
          </p>
        ) : null}
      </FsCard>

      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <FsFilterChip
            key={t.key}
            icon={t.icon}
            label={t.label}
            selected={tab === t.key}
            onClick={() => setTab(t.key)}
          />
        ))}
      </div>

      {/* ───────────────────────────── Plan ───────────────────────────── */}
      {tab === "plan" ? (
        <>
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() =>
                setNodeDialog({ open: true, editing: null, parent: null, depth: 0 })
              }
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-fs-accent px-3.5 py-2.5 text-sm font-semibold text-white"
            >
              <MdAdd className="h-4 w-4" aria-hidden />
              Ajouter : {levelLabel(levels, 0)}
            </button>
          </div>

          {treeQ.isError ? (
            <FsQueryErrorPanel error={treeQ.error} onRetry={() => void treeQ.refetch()} />
          ) : treeQ.isPending ? (
            <div className="flex justify-center py-10">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                aria-hidden
              />
            </div>
          ) : roots.length === 0 ? (
            <FsCard padding="p-8">
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <MdMap className="h-12 w-12 text-neutral-300" aria-hidden />
                <p className="text-sm font-semibold text-fs-text">
                  Votre plan est encore vide
                </p>
                <p className="max-w-md text-sm leading-relaxed text-neutral-600">
                  Commencez par créer vos {levelLabel(levels, 0).toLowerCase()}s (par
                  exemple « Boissons », « Cosmétiques »), puis descendez niveau par
                  niveau jusqu&apos;au détail utile à vos vendeurs.
                </p>
              </div>
            </FsCard>
          ) : (
            <ul className="space-y-1.5 pb-24">{roots.map(renderNode)}</ul>
          )}
        </>
      ) : null}

      {/* ───────────────────────────── Ranger ───────────────────────────── */}
      {tab === "ranger" ? (
        <>
          <FsCard className="mb-3" padding="p-3 sm:p-4">
            <div className="relative">
              <MdSearch
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                className={fsInputClass("pl-10")}
                placeholder="Chercher un produit à ranger…"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                enterKeyHint="search"
              />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {(
                [
                  { key: "all" as const, label: `Tous (${storeProducts.length})` },
                  { key: "unplaced" as const, label: `Sans emplacement (${unplacedTotal})` },
                  { key: "placed" as const, label: `Rangés (${placedCount})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setRangeFilter(f.key)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    rangeFilter === f.key
                      ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                      : "border-black/[0.08] bg-fs-card text-neutral-700",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </FsCard>

          {productsQ.isError ? (
            <FsQueryErrorPanel
              error={productsQ.error}
              onRetry={() => void productsQ.refetch()}
            />
          ) : productsQ.isPending ? (
            <div className="flex justify-center py-10">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                aria-hidden
              />
            </div>
          ) : filteredProducts.length === 0 ? (
            <FsCard padding="p-8">
              <p className="text-center text-sm text-neutral-600">
                {rangeFilter === "unplaced"
                  ? "Tous les produits de cette boutique ont un emplacement. Beau travail."
                  : "Aucun produit ne correspond."}
              </p>
            </FsCard>
          ) : (
            <>
              <ul className="space-y-1.5 pb-28">
                {shownProducts.map((p) => {
                  const loc = assignments.get(p.id);
                  const checked = selected.has(p.id);
                  return (
                    <li key={p.id}>
                      <div
                        className={cn(
                          "flex items-center gap-2.5 rounded-[10px] border bg-fs-card px-2.5 py-2.5 shadow-sm transition-colors",
                          checked ? "border-fs-accent/60 bg-fs-accent/[0.04]" : "border-black/[0.06]",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 cursor-pointer accent-fs-accent"
                          checked={checked}
                          onChange={() => toggleSelected(p.id)}
                          aria-label={`Sélectionner ${p.name}`}
                        />
                        <ProductListThumbnail
                          imageUrl={firstProductImageUrl(p)}
                          previewOnTap
                          className="h-11 w-11 rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPicker({
                              kind: "single",
                              productId: p.id,
                              productName: p.name,
                              current: loc?.locationId ?? null,
                            })
                          }
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-sm font-semibold text-fs-text">
                            {p.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                            {p.sku || "—"}
                            {p.barcode ? ` · ${p.barcode}` : ""}
                          </span>
                          <span className="mt-1 block">
                            {loc ? (
                              <LocationBadge
                                pathLabel={loc.pathLabel}
                                code={loc.code}
                                detail={loc.detail}
                              />
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-neutral-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500">
                                Sans emplacement
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPicker({
                              kind: "single",
                              productId: p.id,
                              productName: p.name,
                              current: loc?.locationId ?? null,
                            })
                          }
                          className="shrink-0 rounded-md border border-fs-accent/30 bg-fs-accent/[0.06] px-2 py-1.5 text-xs font-semibold text-fs-accent"
                          aria-label={`Ranger ${p.name}`}
                        >
                          <MdEditLocationAlt className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {filteredProducts.length > shownProducts.length ? (
                <div className="pb-28 text-center">
                  <button
                    type="button"
                    onClick={() => setPager({ sig: listSignature, count: visibleCount + PAGE_SIZE })}
                    className="rounded-[10px] border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-700"
                  >
                    Afficher plus ({filteredProducts.length - shownProducts.length} restants)
                  </button>
                </div>
              ) : null}
            </>
          )}

          {/* Barre d'action multi-sélection */}
          {selected.size > 0 ? (
            <div className="fixed inset-x-0 bottom-[calc(3.75rem+var(--fs-safe-bottom))] z-30 mx-auto w-full max-w-3xl px-3 min-[900px]:bottom-5">
              <div className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-fs-card px-3 py-2.5 shadow-lg">
                <span className="text-sm font-semibold text-fs-text">
                  {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs font-semibold text-neutral-500 hover:text-fs-text"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => setPicker({ kind: "bulk" })}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] bg-fs-accent px-3.5 py-2 text-sm font-semibold text-white"
                >
                  <MdEditLocationAlt className="h-4 w-4" aria-hidden />
                  Ranger
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* ───────────────────────────── Trouver ───────────────────────────── */}
      {tab === "trouver" ? (
        <>
          <FsCard className="mb-3" padding="p-3 sm:p-4">
            <div className="relative">
              <MdSearch
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                className={fsInputClass("pl-10")}
                placeholder="Nom, code-barres, référence… « c'est où ? »"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                enterKeyHint="search"
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              Tapez au moins 2 caractères. La recherche fonctionne aussi sur
              l&apos;emplacement : « Allée 2 » liste tout ce qui s&apos;y trouve.
            </p>
          </FsCard>

          {debouncedSearch.length < 2 ? (
            <FsCard padding="p-8">
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <MdTravelExplore className="h-12 w-12 text-neutral-300" aria-hidden />
                <p className="max-w-md text-sm leading-relaxed text-neutral-600">
                  Un client demande un article ? Tapez son nom : vous obtenez son
                  emplacement exact et le stock disponible dans cette boutique.
                </p>
              </div>
            </FsCard>
          ) : searchQ.isError ? (
            <FsQueryErrorPanel error={searchQ.error} onRetry={() => void searchQ.refetch()} />
          ) : searchQ.isPending ? (
            <div className="flex justify-center py-10">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                aria-hidden
              />
            </div>
          ) : (searchQ.data ?? []).length === 0 ? (
            <FsCard padding="p-8">
              <p className="text-center text-sm text-neutral-600">
                Aucun produit trouvé pour « {debouncedSearch} ».
              </p>
            </FsCard>
          ) : (
            <ul className="space-y-1.5 pb-24">
              {(searchQ.data ?? []).map((hit) => (
                <li
                  key={hit.productId}
                  className="rounded-[10px] border border-black/[0.06] bg-fs-card p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <ProductListThumbnail
                      imageUrl={hit.imageUrl}
                      previewOnTap
                      className="h-11 w-11 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fs-text">
                        {hit.productName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                        {hit.sku || "—"}
                        {hit.barcode ? ` · ${hit.barcode}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-1 text-[11px] font-bold",
                        hit.quantity <= 0
                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                          : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                      )}
                    >
                      {hit.quantity} en stock
                    </span>
                  </div>
                  {hit.pathLabel ? (
                    <div className="mt-2 rounded-[10px] bg-sky-500/[0.08] px-3 py-2">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-sky-900 dark:text-sky-200">
                        <MdPlace className="h-4 w-4 shrink-0" aria-hidden />
                        {hit.pathLabel}
                        {hit.code ? (
                          <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px]">
                            {hit.code}
                          </span>
                        ) : null}
                      </p>
                      {hit.detail ? (
                        <p className="mt-1 text-xs text-sky-900/80 dark:text-sky-200/80">
                          {hit.detail}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] bg-neutral-500/[0.08] px-3 py-2">
                      <p className="text-sm font-semibold text-neutral-600">
                        Pas encore rangé
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setPicker({
                            kind: "single",
                            productId: hit.productId,
                            productName: hit.productName,
                            current: null,
                          })
                        }
                        className="ml-auto rounded-md border border-fs-accent/30 bg-fs-accent/[0.06] px-2.5 py-1.5 text-xs font-semibold text-fs-accent"
                      >
                        Lui donner un emplacement
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {/* ───────────────────────────── Dialogues ───────────────────────────── */}
      <LocationFormDialog
        key={`${nodeDialog.editing?.id ?? "new"}-${nodeDialog.parent?.id ?? "root"}-${String(nodeDialog.open)}`}
        open={nodeDialog.open}
        levelName={levelLabel(levels, nodeDialog.depth)}
        parentPath={nodeDialog.parent?.pathLabel ?? null}
        initialName={nodeDialog.editing?.name ?? ""}
        initialCode={nodeDialog.editing?.code ?? ""}
        busy={nodeMut.isPending}
        onClose={() => setNodeDialog({ open: false, editing: null, parent: null, depth: 0 })}
        onSubmit={({ name, code }) =>
          void nodeMut.mutateAsync({
            id: nodeDialog.editing?.id ?? null,
            parentId: nodeDialog.editing ? null : (nodeDialog.parent?.id ?? null),
            name,
            code,
          })
        }
      />

      <LocationPickerDialog
        open={picker !== null}
        title={picker?.kind === "bulk" ? `Ranger ${selected.size} produit(s)` : "Ranger le produit"}
        subtitle={picker?.kind === "single" ? picker.productName : undefined}
        roots={pickerRoots}
        levels={levels}
        selectedId={picker?.kind === "single" ? picker.current : null}
        allowClear={picker?.kind === "bulk" || (picker?.kind === "single" && picker.current !== null)}
        busy={assignMut.isPending || bulkMut.isPending}
        onClose={() => setPicker(null)}
        onPick={(locationId) => {
          if (!picker) return;
          if (picker.kind === "bulk") void bulkMut.mutateAsync(locationId);
          else void assignMut.mutateAsync({ productId: picker.productId, locationId });
        }}
      />

      <FsConfirmDialog
        open={nodeToDelete !== null}
        title="Supprimer cet emplacement ?"
        message={
          nodeToDelete
            ? `« ${nodeToDelete.pathLabel} » sera retiré du plan. Aucun produit n'est supprimé.`
            : undefined
        }
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setNodeToDelete(null)}
        onConfirm={() => {
          if (nodeToDelete) void deleteMut.mutateAsync({ id: nodeToDelete.id, force: false });
        }}
      />

      <FsConfirmDialog
        open={forceDelete !== null}
        title="Cet emplacement n'est pas vide"
        message={
          forceDelete
            ? `« ${forceDelete.pathLabel} » contient des sous-emplacements ou ${forceDelete.totalProductCount} produit(s).\n\nEn confirmant, la branche entière est supprimée et ces produits redeviennent « sans emplacement ». Vos produits, votre stock et vos ventes ne sont pas touchés.`
            : undefined
        }
        confirmLabel="Supprimer quand même"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setForceDelete(null)}
        onConfirm={() => {
          if (forceDelete) void deleteMut.mutateAsync({ id: forceDelete.id, force: true });
        }}
      />
    </FsPage>
  );
}
