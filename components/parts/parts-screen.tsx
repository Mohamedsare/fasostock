"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdBookmarkBorder,
  MdCallSplit,
  MdCategory,
  MdDelete,
  MdEdit,
  MdInventory2,
  MdLock,
  MdPointOfSale,
  MdSearch,
  MdSwapHoriz,
  MdTune,
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
import { queryKeys } from "@/lib/query/query-keys";
import {
  deletePartModel,
  deleteVariantGroup,
  listEquivalencesOverview,
  listPartModels,
  listProductEquivalents,
  listVariantGroups,
  searchCompatibleParts,
} from "@/lib/features/parts/api";
import {
  EQUIVALENCE_KIND_LABELS,
  type PartModel,
  type VariantGroup,
} from "@/lib/features/parts/types";
import {
  fetchPartsPosModelsEnabled,
  peekPartsPosModelsEnabled,
  setPartsPosModelsEnabled,
} from "@/lib/features/settings/parts-pos-models";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { PartModelFormDialog } from "./part-model-form-dialog";
import { ProductCompatDialog, partModelLabel } from "./product-compat-dialog";
import { ProductEquivalentsDialog } from "./product-equivalents-dialog";
import { VariantGroupDialog } from "./variant-group-dialog";

type Tab = "search" | "models" | "equivalences" | "variants";

const TABS: { key: Tab; label: string; icon: typeof MdSearch }[] = [
  { key: "search", label: "Recherche", icon: MdSearch },
  { key: "models", label: "Modèles", icon: MdCategory },
  { key: "equivalences", label: "Équivalences", icon: MdSwapHoriz },
  { key: "variants", label: "Variantes", icon: MdCallSplit },
];

/** Pastille de stock : rouge en rupture, ambre si faible, vert sinon. */
function stockPillClass(stock: number): string {
  if (stock <= 0) return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (stock <= 3) return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
}

export function PartsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const canManage = h?.canParts ?? false;
  const moduleOn = h?.partsModuleOn ?? false;

  const [tab, setTab] = useState<Tab>("search");

  // Recherche par modèle
  const [modelId, setModelId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Dialogues
  const [modelDialog, setModelDialog] = useState<{ open: boolean; editing: PartModel | null }>({
    open: false,
    editing: null,
  });
  const [compatDialog, setCompatDialog] = useState<{ open: boolean; productId: string | null }>({
    open: false,
    productId: null,
  });
  const [equivDialog, setEquivDialog] = useState<{ open: boolean; productId: string | null }>({
    open: false,
    productId: null,
  });
  const [variantDialog, setVariantDialog] = useState<{
    open: boolean;
    editing: VariantGroup | null;
  }>({ open: false, editing: null });
  const [modelToDelete, setModelToDelete] = useState<PartModel | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<VariantGroup | null>(null);
  /** Produit dont on déplie les remplaçants dans l'onglet Équivalences. */
  const [expandedEquiv, setExpandedEquiv] = useState<string | null>(null);

  const enabled = !!companyId && canManage;

  const modelsQ = useQuery({
    queryKey: queryKeys.partModels(companyId),
    queryFn: () => listPartModels(companyId),
    enabled,
    staleTime: 60_000,
  });

  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled,
    staleTime: 60_000,
  });

  const compatQ = useQuery({
    queryKey: queryKeys.partsCompatible({ companyId, storeId, modelId, query: query.trim() }),
    queryFn: () =>
      searchCompatibleParts({ companyId, storeId, modelId, query: query.trim() }),
    enabled: enabled && tab === "search" && (!!modelId || query.trim() !== ""),
    staleTime: 15_000,
  });

  const equivQ = useQuery({
    queryKey: queryKeys.partsEquivalencesOverview(companyId, storeId),
    queryFn: () => listEquivalencesOverview(companyId, storeId),
    enabled: enabled && tab === "equivalences",
    staleTime: 30_000,
  });

  const variantsQ = useQuery({
    queryKey: queryKeys.partsVariantGroups(companyId, storeId),
    queryFn: () => listVariantGroups(companyId, storeId),
    enabled: enabled && tab === "variants",
    staleTime: 30_000,
  });

  const expandedEquivQ = useQuery({
    queryKey: queryKeys.partsEquivalencesFor(expandedEquiv ?? "", storeId),
    queryFn: () => listProductEquivalents(expandedEquiv ?? "", storeId),
    enabled: enabled && !!expandedEquiv,
    staleTime: 15_000,
  });

  const models = useMemo(() => modelsQ.data ?? [], [modelsQ.data]);
  const products = useMemo(() => productsQ.data ?? [], [productsQ.data]);

  function invalidateParts() {
    void qc.invalidateQueries({ queryKey: ["parts"] });
  }

  const deleteModelMut = useMutation({
    mutationFn: (id: string) => deletePartModel(id),
    onSuccess: () => {
      toast.success("Modèle supprimé.");
      setModelToDelete(null);
      if (modelId && modelToDelete?.id === modelId) setModelId(null);
      invalidateParts();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Suppression impossible.")),
  });

  /**
   * Réglage « Afficher le modèle compatible en caisse ». Il vit ici, au plus près
   * des compatibilités qu'il expose : c'est sur cette page qu'on déclare « cette
   * pièce va sur ce modèle », c'est ici qu'on décide si le caissier le voit.
   */
  const peekPosModels = companyId ? peekPartsPosModelsEnabled(companyId) : undefined;
  const posModelsQ = useQuery({
    queryKey: queryKeys.partsPosModelsEnabled(companyId),
    queryFn: () => fetchPartsPosModelsEnabled(companyId),
    enabled,
    staleTime: 30_000,
    ...(peekPosModels !== undefined ? { initialData: peekPosModels } : {}),
  });

  const posModelsMut = useMutation({
    mutationFn: (on: boolean) => setPartsPosModelsEnabled(companyId, on),
    onSuccess: (_d, on) => {
      toast.success(
        on
          ? "Le modèle compatible s'affiche désormais en caisse, au choix du conditionnement."
          : "Le modèle compatible n'est plus affiché en caisse.",
      );
      void qc.invalidateQueries({ queryKey: queryKeys.partsPosModelsEnabled(companyId) });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Modification impossible.")),
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id: string) => deleteVariantGroup(id),
    onSuccess: () => {
      toast.success("Famille supprimée. Les fiches produit sont conservées.");
      setGroupToDelete(null);
      invalidateParts();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Suppression impossible.")),
  });

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
          title="Pièces & Variantes"
          subtitle="Compatibilités par modèle, équivalences et déclinaisons"
        />
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              {moduleOn
                ? "Vous n'avez pas accès à cette section."
                : "Le module Pièces n'est pas activé pour cette boutique."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const compatRows = compatQ.data ?? [];
  const hasSearch = !!modelId || query.trim() !== "";

  return (
    <FsPage>
      <FsScreenHeader
        title="Pièces & Variantes"
        subtitle="Trouvez ce qui va sur un modèle, ce qui remplace une pièce en rupture, et regroupez vos déclinaisons"
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
      />

      <FsCard className="mb-3 rounded-sm sm:rounded-sm" padding="p-0">
        <label
          className={cn(
            "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
            posModelsMut.isPending && "pointer-events-none opacity-60",
          )}
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-bold text-fs-text">
              <MdPointOfSale className="h-4 w-4 text-fs-accent" aria-hidden />
              Afficher le modèle compatible en caisse
            </span>
            <span className="mt-0.5 block text-xs text-neutral-600">
              {posModelsQ.data
                ? "Le caissier voit « Va sur : Yamaha · Crypton 115 » au moment de choisir le conditionnement, en caisse rapide comme en facture A4."
                : "Désactivé : la caisse reste inchangée. Activez pour que le vendeur sache à quel engin la pièce correspond."}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
            checked={posModelsQ.data === true}
            disabled={posModelsMut.isPending || posModelsQ.isLoading}
            onChange={(e) => void posModelsMut.mutateAsync(e.target.checked)}
          />
        </label>
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

      {/* ───────────────────────── Recherche par modèle ───────────────────────── */}
      {tab === "search" ? (
        <>
          <FsCard className="mb-3 rounded-sm sm:rounded-sm" padding="p-3 sm:p-4">
            <div className="relative">
              <MdSearch
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                className={fsInputClass("pl-10 rounded-sm")}
                placeholder="Tapez un modèle : Crypton, Corolla, KDK…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  // La saisie libre prend la main sur le modèle épinglé.
                  if (modelId) setModelId(null);
                }}
                enterKeyHint="search"
              />
            </div>

            {models.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Modèles les plus fournis
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...models]
                    .sort((a, b) => b.productCount - a.productCount)
                    .slice(0, 12)
                    .map((m) => {
                      const on = modelId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setModelId(on ? null : m.id);
                            setQuery("");
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                            on
                              ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                              : "border-black/10 text-neutral-700 hover:bg-black/5 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/5",
                          )}
                        >
                          {partModelLabel(m)}
                          <span className="rounded-sm bg-black/6 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                            {m.productCount}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : null}
          </FsCard>

          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setCompatDialog({ open: true, productId: null })}
              className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-fs-accent px-4 text-sm font-bold text-white"
            >
              <MdTune className="h-5 w-5" aria-hidden />
              Déclarer une compatibilité
            </button>
          </div>

          {compatQ.isError ? (
            <FsQueryErrorPanel error={compatQ.error} onRetry={() => void compatQ.refetch()} />
          ) : (
            <FsCard className="overflow-hidden rounded-sm p-0 sm:rounded-sm" padding="p-0">
              {!hasSearch ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <MdSearch className="h-10 w-10 text-neutral-400" aria-hidden />
                  <p className="max-w-sm text-sm text-neutral-600">
                    Choisissez un modèle ou tapez son nom : toutes les pièces compatibles
                    s&apos;affichent avec leur stock.
                  </p>
                </div>
              ) : compatQ.isLoading ? (
                <div className="flex justify-center py-16">
                  <div
                    className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                    aria-hidden
                  />
                </div>
              ) : compatRows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <MdInventory2 className="h-10 w-10 text-neutral-400" aria-hidden />
                  <p className="text-sm text-neutral-600">Aucune pièce compatible enregistrée.</p>
                  <button
                    type="button"
                    onClick={() => setCompatDialog({ open: true, productId: null })}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-fs-accent px-4 py-2 text-sm font-bold text-white"
                  >
                    <MdAdd className="h-5 w-5" aria-hidden />
                    Déclarer une compatibilité
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-black/6 dark:divide-white/6">
                  {compatRows.map((r) => (
                    <li
                      key={`${r.productId}-${r.modelId}`}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-fs-text">
                            {r.productName}
                          </span>
                          <span
                            className={cn(
                              "rounded-sm px-2 py-0.5 text-[11px] font-bold",
                              stockPillClass(r.stock),
                            )}
                          >
                            {r.stock <= 0 ? "Rupture" : `${r.stock} ${r.unit}`}
                          </span>
                          {!r.isActive ? (
                            <span className="rounded-sm bg-neutral-500/15 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                              Inactif
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                          <MdBookmarkBorder className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="truncate">
                            {r.modelMaker ? `${r.modelMaker} · ` : ""}
                            {r.modelName}
                          </span>
                          {r.sku ? <span className="shrink-0">· {r.sku}</span> : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-bold text-fs-accent">
                          {formatCurrency(r.salePrice)}
                        </span>
                        {r.stock <= 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setEquivDialog({ open: true, productId: r.productId })
                            }
                            className="rounded-sm bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-200"
                          >
                            Remplaçants
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setCompatDialog({ open: true, productId: r.productId })}
                          className="rounded-sm bg-fs-accent/15 p-2 text-fs-accent"
                          aria-label="Modifier les compatibilités"
                        >
                          <MdEdit className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </FsCard>
          )}
        </>
      ) : null}

      {/* ───────────────────────────── Modèles ───────────────────────────── */}
      {tab === "models" ? (
        <>
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setModelDialog({ open: true, editing: null })}
              className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-fs-accent px-4 text-sm font-bold text-white"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
              Nouveau modèle
            </button>
          </div>

          {modelsQ.isError ? (
            <FsQueryErrorPanel error={modelsQ.error} onRetry={() => void modelsQ.refetch()} />
          ) : (
            <FsCard className="overflow-hidden rounded-sm p-0 sm:rounded-sm" padding="p-0">
              {modelsQ.isLoading ? (
                <div className="flex justify-center py-16">
                  <div
                    className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                    aria-hidden
                  />
                </div>
              ) : models.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <MdCategory className="h-10 w-10 text-neutral-400" aria-hidden />
                  <p className="max-w-sm text-sm text-neutral-600">
                    Créez vos modèles (Yamaha Crypton, Toyota Corolla…) puis rattachez-y vos
                    pièces : la recherche fera le reste.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModelDialog({ open: true, editing: null })}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-fs-accent px-4 py-2 text-sm font-bold text-white"
                  >
                    <MdAdd className="h-5 w-5" aria-hidden />
                    Créer le premier
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-black/6 dark:divide-white/6">
                  {models.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2 p-3 sm:p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-fs-text">
                          {partModelLabel(m)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-neutral-500">
                          {m.productCount} pièce(s) compatible(s)
                          {m.years ? ` · ${m.years}` : ""}
                          {m.note ? ` · ${m.note}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setModelId(m.id);
                            setQuery("");
                            setTab("search");
                          }}
                          className="rounded-sm bg-fs-surface-container px-2.5 py-1.5 text-xs font-bold text-neutral-700 dark:text-neutral-200"
                        >
                          Voir les pièces
                        </button>
                        <button
                          type="button"
                          onClick={() => setModelDialog({ open: true, editing: m })}
                          className="rounded-sm bg-fs-accent/15 p-2 text-fs-accent"
                          aria-label="Modifier"
                        >
                          <MdEdit className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModelToDelete(m)}
                          className="rounded-sm bg-red-500/10 p-2 text-red-600"
                          aria-label="Supprimer"
                        >
                          <MdDelete className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </FsCard>
          )}
        </>
      ) : null}

      {/* ─────────────────────────── Équivalences ─────────────────────────── */}
      {tab === "equivalences" ? (
        <>
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setEquivDialog({ open: true, productId: null })}
              className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-fs-accent px-4 text-sm font-bold text-white"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
              Déclarer une équivalence
            </button>
          </div>

          {equivQ.isError ? (
            <FsQueryErrorPanel error={equivQ.error} onRetry={() => void equivQ.refetch()} />
          ) : (
            <FsCard className="overflow-hidden rounded-sm p-0 sm:rounded-sm" padding="p-0">
              {equivQ.isLoading ? (
                <div className="flex justify-center py-16">
                  <div
                    className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                    aria-hidden
                  />
                </div>
              ) : (equivQ.data ?? []).length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <MdSwapHoriz className="h-10 w-10 text-neutral-400" aria-hidden />
                  <p className="max-w-sm text-sm text-neutral-600">
                    Aucune équivalence. Déclarez les pièces interchangeables : quand
                    l&apos;origine manque, vous proposez le générique en un coup d&apos;œil.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-black/6 dark:divide-white/6">
                  {(equivQ.data ?? []).map((row) => {
                    const open = expandedEquiv === row.productId;
                    return (
                      <li key={row.productId}>
                        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                          <button
                            type="button"
                            onClick={() => setExpandedEquiv(open ? null : row.productId)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-bold text-fs-text">
                                {row.productName}
                              </span>
                              <span
                                className={cn(
                                  "rounded-sm px-2 py-0.5 text-[11px] font-bold",
                                  stockPillClass(row.stock),
                                )}
                              >
                                {row.stock <= 0 ? "Rupture" : `Stock ${row.stock}`}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-neutral-500">
                              {row.equivalentCount} remplaçant(s) ·{" "}
                              <span
                                className={
                                  row.inStockAlternatives > 0
                                    ? "font-semibold text-emerald-700 dark:text-emerald-400"
                                    : "text-neutral-500"
                                }
                              >
                                {row.inStockAlternatives} disponible(s)
                              </span>
                            </p>
                          </button>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedEquiv(open ? null : row.productId)}
                              className="rounded-sm bg-fs-surface-container px-2.5 py-1.5 text-xs font-bold text-neutral-700 dark:text-neutral-200"
                            >
                              {open ? "Masquer" : "Voir"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEquivDialog({ open: true, productId: row.productId })
                              }
                              className="rounded-sm bg-fs-accent/15 p-2 text-fs-accent"
                              aria-label="Modifier les équivalences"
                            >
                              <MdEdit className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>

                        {open ? (
                          <div className="border-t border-black/6 bg-fs-surface-container/60 px-3 py-2 sm:px-4 dark:border-white/6">
                            {expandedEquivQ.isLoading ? (
                              <p className="py-3 text-center text-xs text-neutral-500">
                                Chargement…
                              </p>
                            ) : (expandedEquivQ.data ?? []).length === 0 ? (
                              <p className="py-3 text-center text-xs text-neutral-500">
                                Aucun remplaçant.
                              </p>
                            ) : (
                              <ul className="space-y-1.5 py-1">
                                {(expandedEquivQ.data ?? []).map((e) => (
                                  <li
                                    key={e.equivalentId}
                                    className="flex items-center justify-between gap-2 rounded-sm bg-fs-card px-2.5 py-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-semibold text-fs-text">
                                        {e.productName}
                                      </p>
                                      <p className="truncate text-[11px] text-neutral-500">
                                        {EQUIVALENCE_KIND_LABELS[e.kind]}
                                        {e.note ? ` · ${e.note}` : ""}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span
                                        className={cn(
                                          "rounded-sm px-2 py-0.5 text-[11px] font-bold",
                                          stockPillClass(e.stock),
                                        )}
                                      >
                                        {e.stock <= 0 ? "Rupture" : `${e.stock} ${e.unit}`}
                                      </span>
                                      <span className="text-xs font-bold text-fs-accent">
                                        {formatCurrency(e.salePrice)}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </FsCard>
          )}
        </>
      ) : null}

      {/* ──────────────────────────── Variantes ──────────────────────────── */}
      {tab === "variants" ? (
        <>
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setVariantDialog({ open: true, editing: null })}
              className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-fs-accent px-4 text-sm font-bold text-white"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
              Nouvelle famille
            </button>
          </div>

          {variantsQ.isError ? (
            <FsQueryErrorPanel error={variantsQ.error} onRetry={() => void variantsQ.refetch()} />
          ) : variantsQ.isLoading ? (
            <FsCard className="rounded-sm sm:rounded-sm" padding="p-0">
              <div className="flex justify-center py-16">
                <div
                  className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                  aria-hidden
                />
              </div>
            </FsCard>
          ) : (variantsQ.data ?? []).length === 0 ? (
            <FsCard className="rounded-sm sm:rounded-sm" padding="p-0">
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <MdCallSplit className="h-10 w-10 text-neutral-400" aria-hidden />
                <p className="max-w-sm text-sm text-neutral-600">
                  Regroupez vos déclinaisons (tailles, couleurs, marques) en une seule
                  famille, au lieu de chercher vos fiches une par une.
                </p>
                <button
                  type="button"
                  onClick={() => setVariantDialog({ open: true, editing: null })}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-fs-accent px-4 py-2 text-sm font-bold text-white"
                >
                  <MdAdd className="h-5 w-5" aria-hidden />
                  Créer la première
                </button>
              </div>
            </FsCard>
          ) : (
            <div className="space-y-3">
              {(variantsQ.data ?? []).map((g) => (
                <FsCard key={g.id} className="rounded-sm sm:rounded-sm" padding="p-3 sm:p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-fs-text">{g.name}</p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {g.members.length} déclinaison(s) · stock total {g.totalStock} ·{" "}
                        {g.attributeNames.join(" × ") || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setVariantDialog({ open: true, editing: g })}
                        className="rounded-sm bg-fs-accent/15 p-2 text-fs-accent"
                        aria-label="Modifier"
                      >
                        <MdEdit className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupToDelete(g)}
                        className="rounded-sm bg-red-500/10 p-2 text-red-600"
                        aria-label="Supprimer"
                      >
                        <MdDelete className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {g.members.length === 0 ? (
                    <p className="rounded-sm border border-dashed border-black/10 px-3 py-4 text-center text-xs text-neutral-500 dark:border-white/10">
                      Aucune déclinaison rattachée.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {g.members.map((m) => (
                        <li
                          key={m.productId}
                          className="flex items-center justify-between gap-2 rounded-sm bg-fs-surface-container px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-fs-text">
                              {g.attributeNames
                                .map((a) => m.attributes[a])
                                .filter((v): v is string => !!v)
                                .join(" / ") || m.name}
                            </p>
                            <p className="truncate text-[11px] text-neutral-500">{m.name}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={cn(
                                "rounded-sm px-2 py-0.5 text-[11px] font-bold",
                                stockPillClass(m.stock),
                              )}
                            >
                              {m.stock}
                            </span>
                            <span className="text-xs font-bold text-fs-accent">
                              {formatCurrency(m.salePrice)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </FsCard>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ─────────────────────────── Dialogues ─────────────────────────── */}
      <PartModelFormDialog
        open={modelDialog.open}
        onClose={() => setModelDialog({ open: false, editing: null })}
        companyId={companyId}
        editing={modelDialog.editing}
        onSaved={invalidateParts}
      />

      <ProductCompatDialog
        open={compatDialog.open}
        onClose={() => setCompatDialog({ open: false, productId: null })}
        products={products}
        models={models}
        initialProductId={compatDialog.productId}
        onSaved={invalidateParts}
      />

      <ProductEquivalentsDialog
        open={equivDialog.open}
        onClose={() => setEquivDialog({ open: false, productId: null })}
        storeId={storeId}
        products={products}
        initialProductId={equivDialog.productId}
        onSaved={invalidateParts}
      />

      <VariantGroupDialog
        open={variantDialog.open}
        onClose={() => setVariantDialog({ open: false, editing: null })}
        companyId={companyId}
        products={products}
        editing={variantDialog.editing}
        onSaved={invalidateParts}
      />

      <FsConfirmDialog
        open={modelToDelete !== null}
        title="Supprimer le modèle ?"
        message={
          modelToDelete
            ? `« ${partModelLabel(modelToDelete)} » et ses ${modelToDelete.productCount} compatibilité(s) seront supprimés. Les fiches produit, elles, sont conservées.`
            : undefined
        }
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleteModelMut.isPending}
        onCancel={() => setModelToDelete(null)}
        onConfirm={() => modelToDelete && deleteModelMut.mutate(modelToDelete.id)}
      />

      <FsConfirmDialog
        open={groupToDelete !== null}
        title="Supprimer la famille ?"
        message={
          groupToDelete
            ? `« ${groupToDelete.name} » sera supprimée. Ses ${groupToDelete.members.length} fiche(s) produit sont conservées, simplement détachées.`
            : undefined
        }
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleteGroupMut.isPending}
        onCancel={() => setGroupToDelete(null)}
        onConfirm={() => groupToDelete && deleteGroupMut.mutate(groupToDelete.id)}
      />
    </FsPage>
  );
}
