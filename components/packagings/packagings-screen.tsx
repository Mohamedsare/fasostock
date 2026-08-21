"use client";

import {
  PackagingRowsEditor,
  type SavedLot,
} from "@/components/packagings/packaging-rows-editor";
import { downloadPackagingsPdf } from "@/lib/features/packagings/packagings-pdf";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { P } from "@/lib/constants/permissions";
import { ROUTES } from "@/lib/config/routes";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listCategories, listProducts } from "@/lib/features/products/api";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import {
  packagingPiecePrice,
  packagingPriceProblem,
  packagingTotalPrice,
} from "@/lib/features/products/packaging-price";
import { productNameMatches } from "@/lib/features/products/search-aliases";
import type { ProductItem } from "@/lib/features/products/types";
import {
  fetchPackagingPricePerPiece,
  peekPackagingPricePerPiece,
} from "@/lib/features/settings/packaging-price-mode";
import { filterByStoreCatalog } from "@/lib/features/stores/store-catalog";
import { useStoreCatalog } from "@/lib/features/stores/use-store-catalog";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  MdAllInbox,
  MdCheckCircle,
  MdEdit,
  MdInventory2,
  MdLock,
  MdPictureAsPdf,
  MdSearch,
  MdWarningAmber,
} from "react-icons/md";

/** Combien de produits affichés d'un coup (« Afficher plus » ensuite). */
const PAGE_SIZE = 25;

type Filter = "all" | "todo" | "done" | "issues";

const FILTERS: { key: Filter; label: string; icon: typeof MdAllInbox }[] = [
  { key: "all", label: "Tous", icon: MdInventory2 },
  { key: "todo", label: "À remplir", icon: MdAllInbox },
  { key: "done", label: "Déjà faits", icon: MdCheckCircle },
  { key: "issues", label: "Prix à revoir", icon: MdWarningAmber },
];

/** Conditionnements d'un produit, triés comme la caisse les propose. */
function packagingsOf(p: ProductItem) {
  return [...(p.product_packagings ?? [])].sort((a, b) => a.position - b.position);
}

/** Premier prix aberrant du produit (lot moins cher qu'une pièce, vente à perte). */
function firstPriceProblem(p: ProductItem): string | null {
  for (const pk of packagingsOf(p)) {
    const problem = packagingPriceProblem({
      label: pk.label,
      factor: pk.factor,
      price: pk.price ?? null,
      unitSalePrice: p.sale_price,
      purchasePrice: p.purchase_price,
    });
    if (problem) return problem;
  }
  return null;
}

/**
 * Page « Conditionnements » — le carton et le paquet de tout le catalogue, sur un seul
 * écran.
 *
 * La fiche produit sait déjà décrire un lot, mais une fiche à la fois : remplir deux
 * cents articles y demande deux cents ouvertures. Ici, la liste a la forme de la page
 * Stock (recherche, catégorie, filtres), le filtre « À remplir » isole ce qui manque,
 * et le lot se saisit directement sous la ligne du produit.
 *
 * La page n'invente aucune donnée : elle écrit `product_packagings`, exactement comme
 * la fiche produit. Elle est fermée par défaut et ouverte par le propriétaire
 * (Paramètres › « Page Conditionnements »).
 */
export function PackagingsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, hasPermission, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const pageOn = h?.packagingsPageOn ?? false;
  const canView = h?.canPackagings ?? false;
  const isOwner = h?.isOwner ?? false;
  const canEdit = isOwner || hasPermission(P.productsUpdate);

  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  /** Lots du dernier produit enregistré : proposés en un tap sur le suivant. */
  const [lastLots, setLastLots] = useState<SavedLot[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 60_000,
  });
  const categoriesQ = useQuery({
    queryKey: queryKeys.categories(companyId),
    queryFn: () => listCategories(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 60_000,
  });
  const { catalog } = useStoreCatalog(storeId);

  /*
   * Mode de saisie du prix (réglage propriétaire) : le champ demande le prix du lot
   * entier, ou celui d'une pièce du lot. Ce qui est enregistré ne change pas.
   */
  const peekMode = companyId.length > 0 ? peekPackagingPricePerPiece(companyId) : undefined;
  const perPieceQ = useQuery({
    queryKey: queryKeys.packagingPricePerPiece(companyId),
    queryFn: () => fetchPackagingPricePerPiece(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 60_000,
    ...(peekMode !== undefined ? { initialData: peekMode } : {}),
  });
  const perPiece = perPieceQ.data === true;

  const productAliasesOn = h?.productAliasesOn ?? false;

  /** Catalogue de la boutique courante, actif seulement (un produit retiré ne se vend plus). */
  const products = useMemo(
    () => filterByStoreCatalog(productsQ.data ?? [], catalog).filter((p) => p.is_active),
    [productsQ.data, catalog],
  );

  const counts = useMemo(() => {
    let done = 0;
    let issues = 0;
    for (const p of products) {
      if (packagingsOf(p).length > 0) done += 1;
      if (firstPriceProblem(p) != null) issues += 1;
    }
    return { total: products.length, done, todo: products.length - done, issues };
  }, [products]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId && p.category_id !== categoryId) return false;
      if (term) {
        const okName = productNameMatches(p, term, productAliasesOn);
        const okSku = (p.sku ?? "").toLowerCase().includes(term);
        const raw = q.trim();
        const okBarcode =
          (p.barcode ?? "").includes(raw) ||
          packagingsOf(p).some((pk) => (pk.barcode ?? "").includes(raw));
        if (!okName && !okSku && !okBarcode) return false;
      }
      const has = packagingsOf(p).length > 0;
      if (filter === "todo") return !has;
      if (filter === "done") return has;
      if (filter === "issues") return firstPriceProblem(p) != null;
      return true;
    });
  }, [products, q, categoryId, filter, productAliasesOn]);

  // Changer de recherche ou de filtre rend la pagination précédente sans objet.
  const listSignature = `${categoryId}|${filter}|${q.trim().toLowerCase()}`;
  const [pagerSig, setPagerSig] = useState(listSignature);
  const shownCount = pagerSig === listSignature ? visible : PAGE_SIZE;
  if (pagerSig !== listSignature) {
    setPagerSig(listSignature);
    setVisible(PAGE_SIZE);
  }
  const shown = filtered.slice(0, shownCount);

  /**
   * Produit suivant à traiter dans la liste affichée. On saute ceux qui ont déjà un
   * lot : la file de travail, c'est ce qui manque — sauf si le filtre courant dit le
   * contraire (« Déjà faits », « Prix à revoir »), auquel cas on suit simplement
   * l'ordre de la liste.
   */
  function nextProductId(afterId: string): string | null {
    const idx = filtered.findIndex((p) => p.id === afterId);
    if (idx < 0) return null;
    const rest = filtered.slice(idx + 1);
    if (filter === "todo" || filter === "all") {
      const todo = rest.find((p) => packagingsOf(p).length === 0);
      if (todo) return todo.id;
    }
    return rest[0]?.id ?? null;
  }

  const scopeLabel = [
    filter === "todo"
      ? "À remplir"
      : filter === "done"
        ? "Déjà faits"
        : filter === "issues"
          ? "Prix à revoir"
          : "Tous les produits",
    categoryId
      ? (categoriesQ.data ?? []).find((c) => c.id === categoryId)?.name ?? "Catégorie"
      : null,
    q.trim() ? `« ${q.trim()} »` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function exportPdf() {
    if (exporting || filtered.length === 0) return;
    setExporting(true);
    try {
      await downloadPackagingsPdf({
        companyId,
        companyName: ctx.data?.companyName ?? "",
        companyLogoUrl: ctx.data?.companyLogoUrl ?? null,
        storeName: ctx.data?.stores.find((st) => st.id === storeId)?.name ?? "",
        scopeLabel,
        products: filtered,
      });
      toast.success("PDF enregistré.");
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Export PDF impossible."));
    } finally {
      setExporting(false);
    }
  }

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.products(companyId) }),
      qc.invalidateQueries({ queryKey: queryKeys.categories(companyId) }),
    ]);
  }

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

  if (!canView) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Conditionnements"
          subtitle="Ce que contient chaque carton, paquet ou sachet — et son prix"
        />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            {pageOn ? (
              <p className="max-w-md text-sm leading-relaxed text-neutral-600">
                Vous n&apos;avez pas accès à cette section : le droit de voir le
                catalogue est nécessaire.
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold text-fs-text">
                  Cette page n&apos;est pas encore activée
                </p>
                <p className="max-w-md text-sm leading-relaxed text-neutral-600">
                  {isOwner
                    ? "Ouvrez-la dans Paramètres › « Page Conditionnements ». Elle apparaîtra alors dans le menu."
                    : "Le propriétaire peut l'ouvrir dans Paramètres › « Page Conditionnements »."}
                </p>
                {isOwner ? (
                  <Link
                    href={ROUTES.settings}
                    className="mt-1 inline-flex items-center gap-2 rounded-lg bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
                  >
                    Ouvrir les Paramètres
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsPullToRefresh onRefresh={refreshAll}>
        <div className="flex flex-col gap-3 sm:gap-4 min-[560px]:flex-row min-[560px]:items-start min-[560px]:justify-between">
          <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
            <MdAllInbox
              className="mt-0.5 h-[22px] w-[22px] shrink-0 text-fs-accent sm:h-7 sm:w-7"
              aria-hidden
            />
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold leading-tight tracking-tight text-fs-text min-[900px]:text-2xl">
                Conditionnements
              </h1>
              <p className="mt-0.5 text-sm text-neutral-600 sm:mt-1">
                Ce que contient chaque carton ou paquet, et à quel prix il se vend
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 min-[560px]:shrink-0 min-[560px]:justify-end">
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={exporting || filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-fs-accent px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
            >
              {exporting ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
              ) : (
                <MdPictureAsPdf className="h-5 w-5" aria-hidden />
              )}
              {exporting ? "Préparation…" : "Exporter en PDF"}
            </button>
            <Link
              href={ROUTES.products}
              className="inline-flex items-center gap-2 rounded-lg bg-fs-surface-container px-3.5 py-2.5 text-sm font-semibold text-fs-text shadow-sm ring-1 ring-black/[0.06]"
            >
              <MdInventory2 className="h-5 w-5" aria-hidden />
              Catalogue
            </Link>
          </div>
        </div>

        {/* Où en est le catalogue : le chiffre qui dit s'il reste du travail. */}
        <FsCard padding="p-3 sm:p-4" className="mt-4 rounded-[10px] sm:rounded-[10px]">
          <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Produits
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-fs-text">{counts.total}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Avec un lot
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-fs-text">{counts.done}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                À remplir
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-fs-accent">{counts.todo}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Prix à revoir
              </p>
              <p
                className={cn(
                  "mt-0.5 text-lg font-bold tabular-nums",
                  counts.issues > 0 ? "text-red-600" : "text-fs-text",
                )}
              >
                {counts.issues}
              </p>
            </div>
          </div>
          {/* Voir le travail avancer : c'est ce qui fait finir une liste de 200 articles. */}
          {counts.total > 0 ? (
            <div className="mt-3">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-fs-surface-container"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={counts.total}
                aria-valuenow={counts.done}
                aria-label="Produits ayant un conditionnement"
              >
                <div
                  className="h-full rounded-full bg-fs-accent transition-[width] duration-500"
                  style={{ width: `${Math.round((counts.done / counts.total) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-600">
                {counts.todo === 0
                  ? "Tout le catalogue est renseigné."
                  : `${Math.round((counts.done / counts.total) * 100)} % du catalogue renseigné — ${counts.todo} produit${counts.todo > 1 ? "s" : ""} à remplir.`}
              </p>
            </div>
          ) : null}
        </FsCard>

        <FsCard padding="p-0" className="mt-4 overflow-hidden rounded-[10px] sm:rounded-[10px]">
          <div className="border-b border-black/[0.06] p-4 sm:p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="relative min-w-0 flex-1 basis-[min(100%,280px)]">
                <MdSearch
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  className={fsInputClass("pl-10")}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher produit, SKU, code-barres..."
                />
              </div>
              <select
                className={cn(fsInputClass(), "w-[180px] shrink-0")}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Catégorie"
              >
                <option value="">Toutes</option>
                {(categoriesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {FILTERS.filter((f) => f.key !== "issues" || counts.issues > 0).map((f) => (
                <FsFilterChip
                  key={f.key}
                  icon={f.icon}
                  label={
                    f.key === "todo"
                      ? `À remplir (${counts.todo})`
                      : f.key === "issues"
                        ? `Prix à revoir (${counts.issues})`
                        : f.label
                  }
                  selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                />
              ))}
            </div>

            <p className="mt-3 text-xs text-neutral-600 sm:text-sm">
              {canEdit
                ? "Appuyez sur un produit pour décrire son carton ou son paquet : le nombre de pièces, le prix, et le code-barres du lot si vous en avez un."
                : "Consultation seule : le droit « Modifier des produits » est nécessaire pour changer un lot."}
            </p>
          </div>

          {productsQ.isError ? (
            <div className="p-4">
              <FsQueryErrorPanel error={productsQ.error} onRetry={() => void productsQ.refetch()} />
            </div>
          ) : productsQ.isPending ? (
            <div className="flex justify-center py-12">
              <div
                className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
                aria-hidden
              />
            </div>
          ) : shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-600 sm:px-5">
              {filter === "todo" && counts.todo === 0
                ? "Tous vos produits ont un conditionnement. Rien à remplir."
                : "Aucun produit correspondant. Changez la recherche ou les filtres."}
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {shown.map((p) => {
                const pkgs = packagingsOf(p);
                const problem = firstPriceProblem(p);
                const open = openId === p.id;
                return (
                  <li key={p.id} className="px-3 py-3 sm:px-5">
                    {/*
                      Toute la ligne ouvre l'éditeur : sur un téléphone tenu d'une main,
                      viser un bouton de 32 px en bout de ligne est le geste qui rate.
                    */}
                    <div
                      className="flex cursor-pointer items-start gap-3"
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(open ? null : p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(open ? null : p.id);
                        }
                      }}
                    >
                      <ProductListThumbnail
                        imageUrl={firstProductImageUrl(p)}
                        className="h-11 w-11 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold text-fs-text">{p.name}</p>
                        <p className="mt-0.5 text-xs text-neutral-600">
                          {p.sku || "—"} · pièce {formatCurrency(p.sale_price)}
                        </p>

                        {pkgs.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {pkgs.map((pk) => {
                              const total = packagingTotalPrice(pk.price, pk.factor, p.sale_price);
                              const bad =
                                packagingPriceProblem({
                                  label: pk.label,
                                  factor: pk.factor,
                                  price: pk.price ?? null,
                                  unitSalePrice: p.sale_price,
                                  purchasePrice: p.purchase_price,
                                }) != null;
                              return (
                                <span
                                  key={pk.id}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
                                    bad
                                      ? "bg-red-100 text-red-700"
                                      : "bg-fs-surface-container text-neutral-700",
                                  )}
                                  title={`${pk.label} = ${pk.factor} ${p.unit || "pce"} · ${formatCurrency(
                                    packagingPiecePrice(total, pk.factor),
                                  )} la pièce${pk.barcode ? ` · code-barres ${pk.barcode}` : ""}`}
                                >
                                  <span className="font-semibold">{pk.label}</span>
                                  <span className="opacity-70">×{pk.factor}</span>
                                  <span>{formatCurrency(total)}</span>
                                  {pk.factor > 1 ? (
                                    <span className="opacity-70">
                                      ({formatCurrency(packagingPiecePrice(total, pk.factor))}/
                                      {p.unit || "pce"})
                                    </span>
                                  ) : null}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                            Aucun lot — se vend seulement à la {p.unit || "pce"}
                          </p>
                        )}

                        {problem ? (
                          <p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-red-600">
                            {problem}
                          </p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        tabIndex={-1}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
                          open
                            ? "bg-fs-surface-container text-fs-text"
                            : pkgs.length === 0
                              ? "bg-fs-accent text-white"
                              : "text-fs-accent hover:bg-fs-accent/10",
                        )}
                      >
                        <MdEdit className="h-4 w-4" aria-hidden />
                        {open ? "Fermer" : pkgs.length === 0 ? "Remplir" : "Modifier"}
                      </button>
                    </div>

                    {open ? (
                      <div className="mt-3">
                        <PackagingRowsEditor
                          companyId={companyId}
                          product={p}
                          allProducts={productsQ.data ?? []}
                          perPiece={perPiece}
                          canEdit={canEdit}
                          template={packagingsOf(p).length === 0 ? lastLots : null}
                          hasNext={nextProductId(p.id) != null}
                          onClose={() => setOpenId(null)}
                          onSaved={async (saved, goNext) => {
                            // Le suivant est choisi AVANT le rafraîchissement : une fois
                            // la liste rechargée, ce produit peut avoir quitté le filtre.
                            const next = goNext ? nextProductId(p.id) : null;
                            setLastLots(saved.length > 0 ? saved : null);
                            setOpenId(next);
                            await qc.invalidateQueries({
                              queryKey: queryKeys.products(companyId),
                            });
                          }}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > shown.length ? (
            <div className="border-t border-black/[0.06] p-4 text-center">
              <button
                type="button"
                onClick={() => setVisible(shownCount + PAGE_SIZE)}
                className="inline-flex items-center gap-2 rounded-lg bg-fs-surface-container px-4 py-2.5 text-sm font-semibold text-fs-text ring-1 ring-black/[0.06]"
              >
                Afficher plus ({filtered.length - shown.length} restants)
              </button>
            </div>
          ) : null}
        </FsCard>
      </FsPullToRefresh>
    </FsPage>
  );
}
