"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProductImage,
  createBrand,
  createCategory,
  createProduct,
  deleteBrand,
  deleteCategory,
  deleteProductImage,
  listBrands,
  listCategories,
  listProducts,
  listStoreInventory,
  setProductActive,
  softDeleteProduct,
  updateBrand,
  updateCategory,
  updateProduct,
} from "@/lib/features/products/api";
import { adjustStockAtomic } from "@/lib/features/inventory/api";
import { P } from "@/lib/constants/permissions";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import type { AccessHelpers } from "@/lib/features/permissions/access";
import type { ProductFormSavePayload, ProductItem } from "@/lib/features/products/types";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ROUTES } from "@/lib/config/routes";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { productsToCsv } from "@/lib/features/products/csv";
import { downloadCsv } from "@/lib/utils/csv";
import {
  FsCard,
  FsFab,
  FsFilterChip,
  FsPage,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import {
  MdArrowBack,
  MdCategory,
  MdDeleteOutline,
  MdEdit,
  MdToggleOff,
  MdToggleOn,
  MdDownload,
  MdAdd,
  MdChevronLeft,
  MdChevronRight,
  MdInventory2,
  MdLockPerson,
  MdSearch,
  MdSell,
  MdUpload,
} from "react-icons/md";
import { StockRangeIndicator } from "@/components/products/stock-range-indicator";
import { ImportProductsCsvDialog } from "@/components/products/import-products-csv-dialog";
import {
  ProductListThumbnail,
  firstProductImageUrl,
} from "@/components/products/product-list-thumbnail";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { ensureStringNumberMap } from "@/lib/utils/string-number-map";

const PAGE_SIZE = 20;

/** Aligné sur `ProductsPageProvider.defaultStockThreshold` / tuile Flutter. */
const DEFAULT_STOCK_THRESHOLD = 5;

function getProductsFallbackRoute(h: AccessHelpers): string {
  if (h.canSales) return ROUTES.sales;
  if (h.canDashboard) return ROUTES.dashboard;
  if (h.canInventory) return h.isCashier ? ROUTES.stockCashier : ROUTES.inventory;
  if (h.canCustomers) return ROUTES.customers;
  if (h.canStores) return ROUTES.stores;
  return ROUTES.settings;
}

export function ProductsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"products" | "categories" | "brands">(
    "products",
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [newBrand, setNewBrand] = useState("");

  const ctx = useAppContext();
  const { hasPermission, helpers, isLoading: permLoading } = usePermissions();
  const canCreateProduct = hasPermission(P.productsCreate);
  const canUpdateProduct = hasPermission(P.productsUpdate);
  const canDeleteProduct = hasPermission(P.productsDelete);
  const canModifyProducts =
    canCreateProduct || canUpdateProduct || canDeleteProduct;
  const readOnlyCategoriesBrands = helpers?.isCashier ?? false;
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: !!companyId,
  });
  const categoriesQ = useQuery({
    queryKey: queryKeys.categories(companyId),
    queryFn: () => listCategories(companyId),
    enabled: !!companyId,
  });
  const brandsQ = useQuery({
    queryKey: queryKeys.brands(companyId),
    queryFn: () => listBrands(companyId),
    enabled: !!companyId,
  });
  const inventoryQ = useQuery({
    queryKey: queryKeys.productInventory(storeId),
    queryFn: () => listStoreInventory(storeId),
    enabled: !!storeId,
  });

  const mutateSaveProduct = useMutation({
    mutationFn: async ({
      editingId,
      payload,
    }: {
      editingId: string | null;
      payload: ProductFormSavePayload;
    }) => {
      if (editingId) {
        await updateProduct(editingId, payload.input);
        for (const imgId of payload.removedImageIds) {
          await deleteProductImage(imgId);
        }
        for (const file of payload.pendingImages) {
          await addProductImage(editingId, file);
        }
        return;
      }
      const created = await createProduct(companyId, payload.input);
      const productId = created?.id;
      if (
        productId &&
        storeId &&
        payload.initialStock > 0 &&
        (payload.input.productScope === "both" ||
          payload.input.productScope === "boutique_only")
      ) {
        await adjustStockAtomic({
          storeId,
          productId,
          delta: payload.initialStock,
          reason: "Stock entrant",
        });
      }
      if (productId) {
        for (const file of payload.pendingImages) {
          await addProductImage(productId, file);
        }
      }
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      if (storeId) {
        await qc.invalidateQueries({
          queryKey: queryKeys.productInventory(storeId),
        });
      }
      setShowForm(false);
      setEditing(null);
      toast.success(vars.editingId ? "Produit mis à jour" : "Produit créé");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mutateToggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setProductActive(id, active),
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      toast.success(vars.active ? "Produit activé" : "Produit désactivé");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mutateDelete = useMutation({
    mutationFn: (id: string) => softDeleteProduct(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      toast.success("Produit supprimé");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mutateCreateCategory = useMutation({
    mutationFn: (name: string) => createCategory(companyId, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.categories(companyId) });
      setNewCategory("");
      toast.success("Catégorie créée");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mutateCreateBrand = useMutation({
    mutationFn: (name: string) => createBrand(companyId, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.brands(companyId) });
      setNewBrand("");
      toast.success("Marque créée");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mutateUpdateCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.categories(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      toast.success("Catégorie mise à jour");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mutateDeleteCategory = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.categories(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      toast.success("Catégorie supprimée");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mutateUpdateBrand = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateBrand(id, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.brands(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      toast.success("Marque mise à jour");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mutateDeleteBrand = useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.brands(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      toast.success("Marque supprimée");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const products = productsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const stockByProduct = useMemo(
    () => ensureStringNumberMap(inventoryQ.data),
    [inventoryQ.data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const okName = p.name.toLowerCase().includes(q);
        const okSku = (p.sku ?? "").toLowerCase().includes(q);
        const okBarcode = (p.barcode ?? "").includes(search.trim());
        if (!okName && !okSku && !okBarcode) return false;
      }
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      if (brandFilter && p.brand_id !== brandFilter) return false;
      return true;
    });
  }, [products, search, categoryFilter, brandFilter]);

  const pageCount = filtered.length === 0 ? 0 : Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const paginated = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const rangeStart =
    filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(
    (safePage + 1) * PAGE_SIZE,
    filtered.length,
  );

  if (ctx.isLoading || permLoading) return <LoadingState />;
  if (!ctx.data) {
    return (
      <EmptyBlock text="Aucune entreprise disponible. Contactez l’administrateur." />
    );
  }
  if (helpers && !helpers.canProducts) {
    const fallback = getProductsFallbackRoute(helpers);
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-fs-card p-6 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <MdLockPerson className="h-14 w-14 text-red-600" aria-hidden />
            <h2 className="mt-3 text-xl font-extrabold text-neutral-900">
              Accès restreint
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Vous n&apos;avez pas accès à cette page.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                } else {
                  router.push(fallback);
                }
              }}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white"
            >
              <MdArrowBack className="h-4 w-4" aria-hidden />
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FsPage className="flex flex-col">
      <FsScreenHeader
        title="Produits"
        subtitle="Catalogue, catégories et marques"
        className="mb-0"
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        subtitleClassName="text-neutral-600 min-[900px]:text-base"
      />

      {tab === "products" && productsQ.isError ? (
        <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>
            {(productsQ.error as Error)?.message ??
              "Impossible de charger les produits."}
          </p>
          <button
            type="button"
            onClick={() => void productsQ.refetch()}
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-red-900 underline"
          >
            Réessayer
          </button>
        </div>
      ) : null}

      <div className="mb-4 mt-3 flex flex-wrap gap-2 sm:mt-4">
        <FsFilterChip
          icon={MdInventory2}
          label="Produits"
          selected={tab === "products"}
          onClick={() => setTab("products")}
        />
        <FsFilterChip
          icon={MdCategory}
          label="Catégories"
          selected={tab === "categories"}
          onClick={() => setTab("categories")}
        />
        <FsFilterChip
          icon={MdSell}
          label="Marques"
          selected={tab === "brands"}
          onClick={() => setTab("brands")}
        />
      </div>

      {tab === "products" ? (
        <>
          <div className="flex flex-col gap-3">
            {canModifyProducts ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={filtered.length === 0}
                  onClick={() => {
                    const d = new Date().toISOString().slice(0, 10);
                    downloadCsv(`produits-${d}.csv`, productsToCsv(filtered));
                    toast.success("CSV enregistré");
                  }}
                  className="fs-touch-target inline-flex items-center justify-center gap-2 rounded-[10px] border border-black/[0.1] bg-fs-card px-4 py-3 text-sm font-semibold text-neutral-800 disabled:opacity-40"
                >
                  <MdDownload className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  Enregistrer CSV
                </button>
                {canCreateProduct ? (
                  <button
                    type="button"
                    onClick={() => setShowImportCsv(true)}
                    className="fs-touch-target inline-flex items-center justify-center gap-2 rounded-[10px] border border-black/[0.1] bg-fs-card px-4 py-3 text-sm font-semibold text-neutral-800"
                  >
                    <MdUpload className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    Importer CSV
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="relative">
              <MdSearch
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Rechercher nom, SKU, code-barres..."
                className={fsInputClass("pl-9")}
              />
            </div>
            <div className="flex flex-col gap-2 min-[340px]:flex-row min-[340px]:gap-2">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  Catégorie
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(0);
                  }}
                  className={fsInputClass()}
                >
                  <option value="">Toutes</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  Marque
                </label>
                <select
                  value={brandFilter}
                  onChange={(e) => {
                    setBrandFilter(e.target.value);
                    setPage(0);
                  }}
                  className={fsInputClass()}
                >
                  <option value="">Toutes</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-2 space-y-2 pb-24">
            {productsQ.isLoading ? <LoadingState /> : null}
            {!productsQ.isError ? paginated.map((p) => {
              const qty = stockByProduct.get(p.id) ?? 0;
              const threshold =
                p.stock_min > 0 ? p.stock_min : DEFAULT_STOCK_THRESHOLD;
              const thumbUrl = firstProductImageUrl(p);
              return (
                <article
                  key={p.id}
                  className="rounded-xl border border-black/[0.06] bg-fs-card p-3 shadow-sm sm:rounded-2xl"
                >
                  <div className="flex items-start gap-3">
                    <ProductListThumbnail imageUrl={thumbUrl} />
                    <div className="min-w-0 flex-1">
                      <h3
                        className={cn(
                          "truncate text-sm font-semibold text-fs-text",
                          !p.is_active && "line-through opacity-70",
                        )}
                      >
                        {p.name}
                      </h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                        {p.sku || "—"} · {formatCurrency(p.sale_price)} ·{" "}
                        {p.category?.name ?? "—"} · {p.brand?.name ?? "—"}
                      </p>
                      {storeId ? (
                        <div className="mt-1">
                          <StockRangeIndicator
                            quantity={qty}
                            alertThreshold={threshold}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {canUpdateProduct ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(p);
                            setShowForm(true);
                          }}
                          className="rounded-lg border border-black/[0.08] bg-fs-card px-2 py-1 text-xs font-semibold text-fs-accent"
                          aria-label="Modifier"
                        >
                          <MdEdit className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                      {canUpdateProduct ? (
                        <button
                          type="button"
                          onClick={() =>
                            mutateToggle.mutate({ id: p.id, active: !p.is_active })
                          }
                          className="rounded-lg border border-black/[0.08] bg-fs-card px-2 py-1 text-xs font-semibold text-neutral-700"
                          aria-label={p.is_active ? "Désactiver" : "Activer"}
                        >
                          {p.is_active ? (
                            <MdToggleOn className="h-4 w-4 text-fs-accent" aria-hidden />
                          ) : (
                            <MdToggleOff className="h-4 w-4 text-neutral-500" aria-hidden />
                          )}
                        </button>
                      ) : null}
                      {canDeleteProduct ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Supprimer "${p.name}" ?`)) {
                              mutateDelete.mutate(p.id);
                            }
                          }}
                          className="rounded-lg border border-black/[0.08] bg-fs-card px-2 py-1 text-xs font-semibold text-red-600"
                          aria-label="Supprimer"
                        >
                          <MdDeleteOutline className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            }) : null}
            {!productsQ.isLoading &&
            !productsQ.isError &&
            filtered.length === 0 ? (
              <EmptyBlock
                text={
                  products.length === 0
                    ? "Aucun produit pour le moment."
                    : "Aucun résultat."
                }
                icon={MdInventory2}
                hint={
                  products.length === 0
                    ? "Tirez pour synchroniser ou créez un produit."
                    : undefined
                }
              />
            ) : null}
          </div>

          {pageCount > 1 ? (
            <div className="mb-24 mt-3 rounded-xl border border-black/[0.06] bg-fs-card px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="hidden text-sm text-neutral-500 min-[500px]:inline">
                  {rangeStart} – {rangeEnd} sur {filtered.length}
                </span>
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className={cn(
                    "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border px-2 py-2 text-sm disabled:opacity-40",
                    safePage <= 0
                      ? "border-black/[0.1] bg-fs-card text-neutral-500"
                      : "border-fs-accent bg-fs-accent text-white",
                  )}
                >
                  <MdChevronLeft className="h-[26px] w-[26px]" aria-hidden />
                </button>
                <p className="text-sm font-semibold text-neutral-900">
                  Page {safePage + 1} / {pageCount}
                </p>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className={cn(
                    "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border px-2 py-2 text-sm disabled:opacity-40",
                    safePage >= pageCount - 1
                      ? "border-black/[0.1] bg-fs-card text-neutral-500"
                      : "border-fs-accent bg-fs-accent text-white",
                  )}
                >
                  <MdChevronRight className="h-[26px] w-[26px]" aria-hidden />
                </button>
                <span className="w-full text-center text-xs text-neutral-500 min-[500px]:hidden">
                  {rangeStart} – {rangeEnd} / {filtered.length}
                </span>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "categories" ? (
        <FsCard padding="p-5">
          <h2 className="text-base font-semibold text-neutral-900">Catégories</h2>
          {!readOnlyCategoriesBrands ? (
            <div className="mt-3 flex gap-2">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nom"
                aria-label="Nouvelle catégorie"
                className={cn(fsInputClass(), "flex-1")}
              />
              <button
                type="button"
                onClick={() => {
                  if (!newCategory.trim()) return;
                  mutateCreateCategory.mutate(newCategory);
                }}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-200/90 text-neutral-800 active:bg-neutral-300/90"
                aria-label="Ajouter la catégorie"
              >
                <MdAdd className="h-6 w-6" aria-hidden />
              </button>
            </div>
          ) : null}
          <ul className="mt-4 space-y-2">
            {categories.length === 0 ? (
              <li className="text-sm text-neutral-600">Aucune catégorie.</li>
            ) : null}
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-xl bg-fs-surface-container px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {!readOnlyCategoriesBrands ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = prompt("Nouveau nom de catégorie", c.name);
                      if (next && next.trim()) {
                        mutateUpdateCategory.mutate({ id: c.id, name: next.trim() });
                      }
                    }}
                    className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg p-2 text-fs-accent"
                    title="Modifier"
                    aria-label={`Modifier ${c.name}`}
                  >
                    <MdEdit className="h-[22px] w-[22px]" aria-hidden />
                  </button>
                ) : null}
                {!readOnlyCategoriesBrands ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer "${c.name}" ?`)) mutateDeleteCategory.mutate(c.id);
                    }}
                    className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg p-2 text-red-600"
                    title="Supprimer"
                    aria-label={`Supprimer ${c.name}`}
                  >
                    <MdDeleteOutline className="h-[22px] w-[22px]" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </FsCard>
      ) : null}

      {tab === "brands" ? (
        <FsCard padding="p-4 sm:p-5">
          <h2 className="text-base font-semibold text-neutral-900">Marques</h2>
          {!readOnlyCategoriesBrands ? (
            <div className="mt-2.5 flex max-[259px]:flex-col max-[259px]:gap-2 min-[260px]:flex-row min-[260px]:gap-2">
              <input
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="Nom"
                aria-label="Nouvelle marque"
                className={cn(fsInputClass(), "min-w-0 flex-1")}
              />
              <button
                type="button"
                onClick={() => {
                  if (!newBrand.trim()) return;
                  mutateCreateBrand.mutate(newBrand);
                }}
                className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-xl bg-neutral-200/90 text-neutral-800 min-[260px]:w-11 active:bg-neutral-300/90"
                aria-label="Ajouter la marque"
              >
                <MdAdd className="h-6 w-6" aria-hidden />
              </button>
            </div>
          ) : null}
          <ul className="mt-3 space-y-1.5">
            {brands.length === 0 ? (
              <li className="text-sm text-neutral-600">Aucune marque.</li>
            ) : null}
            {brands.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 rounded-xl bg-fs-surface-container px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {!readOnlyCategoriesBrands ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = prompt("Nouveau nom de marque", b.name);
                      if (next && next.trim()) {
                        mutateUpdateBrand.mutate({ id: b.id, name: next.trim() });
                      }
                    }}
                    className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg p-2 text-fs-accent"
                    title="Modifier"
                    aria-label={`Modifier ${b.name}`}
                  >
                    <MdEdit className="h-[22px] w-[22px]" aria-hidden />
                  </button>
                ) : null}
                {!readOnlyCategoriesBrands ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer "${b.name}" ?`)) mutateDeleteBrand.mutate(b.id);
                    }}
                    className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg p-2 text-red-600"
                    title="Supprimer"
                    aria-label={`Supprimer ${b.name}`}
                  >
                    <MdDeleteOutline className="h-[22px] w-[22px]" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </FsCard>
      ) : null}

      {tab === "products" && canCreateProduct ? (
        <>
          <FsFab
            ariaLabel="Nouveau produit"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <MdAdd className="h-7 w-7" aria-hidden />
          </FsFab>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="fixed bottom-8 right-8 z-40 hidden items-center gap-2 rounded-2xl bg-[#f97316] px-5 py-3.5 text-sm font-semibold text-white shadow-lg min-[900px]:inline-flex"
          >
            <MdAdd className="h-5 w-5 shrink-0" aria-hidden />
            Nouveau produit
          </button>
        </>
      ) : null}

      {showForm ? (
        <ProductFormDialog
          companyId={companyId}
          storeId={storeId}
          categories={categories}
          brands={brands}
          initial={editing}
          loading={mutateSaveProduct.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onCategoriesChanged={() => {
            void qc.invalidateQueries({ queryKey: queryKeys.categories(companyId) });
          }}
          onBrandsChanged={() => {
            void qc.invalidateQueries({ queryKey: queryKeys.brands(companyId) });
          }}
          onSubmit={async (payload) => {
            await mutateSaveProduct.mutateAsync({
              editingId: editing?.id ?? null,
              payload,
            });
          }}
        />
      ) : null}
    </FsPage>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
    </div>
  );
}

function EmptyBlock({
  text,
  hint,
  icon: Icon,
}: {
  text: string;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-black/[0.12] bg-fs-card px-4 py-8 text-center text-sm text-neutral-600">
      {Icon ? (
        <Icon className="mx-auto mb-3 h-10 w-10 text-neutral-300" aria-hidden />
      ) : null}
      {text}
      {hint ? (
        <p className="mt-2 text-sm text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}
