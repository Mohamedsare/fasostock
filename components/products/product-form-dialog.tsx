"use client";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  createBrand,
  createCategory,
} from "@/lib/features/products/api";
import type {
  ProductFormSavePayload,
  ProductItem,
  ProductScope,
} from "@/lib/features/products/types";
import { cn } from "@/lib/utils/cn";
import { toNumber } from "@/lib/utils/currency";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdAddPhotoAlternate, MdClose } from "react-icons/md";

const UNIT_OPTIONS: string[] = [
  "pce",
  "kg",
  "L",
  "m",
  "m²",
  "lot",
  "paquet",
  "carton",
  "boîte",
  "sachet",
];

function unitChoices(current: string): string[] {
  const out = [...UNIT_OPTIONS];
  const t = current.trim();
  if (t && !out.includes(t)) {
    out.unshift(t);
  }
  return out;
}

function effectiveUnitValue(current: string): string {
  const choices = unitChoices(current);
  const t = current.trim();
  if (t && choices.includes(t)) return t;
  return choices.includes("pce") ? "pce" : choices[0] ?? "pce";
}

const SCOPE_OPTIONS: { value: ProductScope; label: string }[] = [
  { value: "both", label: "Dépôt et boutiques" },
  { value: "warehouse_only", label: "Dépôt uniquement (magasin)" },
  { value: "boutique_only", label: "Boutiques uniquement" },
];

function parseScope(v: string | null | undefined): ProductScope {
  if (v === "warehouse_only" || v === "boutique_only" || v === "both") return v;
  return "both";
}

type Props = {
  companyId: string;
  storeId: string | null;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  initial: ProductItem | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: ProductFormSavePayload) => void | Promise<void>;
  onCategoriesChanged: () => void;
  onBrandsChanged: () => void;
};

export function ProductFormDialog({
  companyId,
  storeId,
  categories,
  brands,
  initial,
  loading,
  onClose,
  onSubmit,
  onCategoriesChanged,
  onBrandsChanged,
}: Props) {
  const isEdit = initial != null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "pce");
  const [purchasePrice, setPurchasePrice] = useState(
    String(initial?.purchase_price ?? 0),
  );
  const [salePrice, setSalePrice] = useState(String(initial?.sale_price ?? 0));
  const [stockMin, setStockMin] = useState(
    String(initial != null ? initial.stock_min ?? 0 : 5),
  );
  const [initialStock, setInitialStock] = useState("0");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [brandId, setBrandId] = useState(initial?.brand_id ?? "");
  const [productScope, setProductScope] = useState<ProductScope>(() =>
    parseScope(initial?.product_scope),
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [newCategory, setNewCategory] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inlineBusy, setInlineBusy] = useState(false);

  const existingImages = useMemo(() => {
    const imgs = initial?.product_images ?? [];
    return imgs.filter((img) => !removedImageIds.includes(img.id));
  }, [initial?.product_images, removedImageIds]);

  useEffect(() => {
    return () => {
      for (const u of pendingPreviews) URL.revokeObjectURL(u);
    };
  }, [pendingPreviews]);

  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const next: File[] = [];
    const urls: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.type.startsWith("image/")) {
        next.push(f);
        urls.push(URL.createObjectURL(f));
      }
    }
    setPendingFiles((p) => [...p, ...next]);
    setPendingPreviews((p) => [...p, ...urls]);
    setErrorMsg(null);
    e.target.value = "";
  }, []);

  const removePending = useCallback((index: number) => {
    setPendingFiles((p) => p.filter((_, i) => i !== index));
    setPendingPreviews((p) => {
      const u = p[index];
      if (u) URL.revokeObjectURL(u);
      return p.filter((_, i) => i !== index);
    });
  }, []);

  const markImageRemoved = useCallback((id: string) => {
    setRemovedImageIds((s) => [...s, id]);
  }, []);

  async function handleAddCategory() {
    const n = newCategory.trim();
    if (!n || !companyId) return;
    setInlineBusy(true);
    setErrorMsg(null);
    try {
      const id = await createCategory(companyId, n);
      if (id) setCategoryId(id);
      setNewCategory("");
      onCategoriesChanged();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Catégorie impossible.");
    } finally {
      setInlineBusy(false);
    }
  }

  async function handleAddBrand() {
    const n = newBrand.trim();
    if (!n || !companyId) return;
    setInlineBusy(true);
    setErrorMsg(null);
    try {
      const id = await createBrand(companyId, n);
      if (id) setBrandId(id);
      setNewBrand("");
      onBrandsChanged();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Marque impossible.");
    } finally {
      setInlineBusy(false);
    }
  }

  function validate(): string | null {
    const nm = name.trim();
    if (nm.length < 2) return "Nom requis (2 caractères minimum).";
    const pp = toNumber(purchasePrice);
    if (pp < 0) return "Prix d'achat doit être ≥ 0.";
    const sp = toNumber(salePrice);
    if (sp < 0) return "Prix de vente doit être ≥ 0.";
    if (pp > sp) {
      return "Le prix d'achat ne peut pas dépasser le prix de vente. Réduisez le prix d'achat ou augmentez le prix de vente.";
    }
    return null;
  }

  function buildPayload(): ProductFormSavePayload {
    const input = {
      name: name.trim(),
      sku: sku.trim(),
      barcode: barcode.trim(),
      unit: effectiveUnitValue(unit),
      purchasePrice: toNumber(purchasePrice),
      salePrice: toNumber(salePrice),
      stockMin: Math.max(0, Math.round(toNumber(stockMin))),
      description: description.trim(),
      categoryId,
      brandId,
      productScope,
      isActive,
    };
    return {
      input,
      pendingImages: pendingFiles,
      removedImageIds,
      initialStock: Math.max(0, Math.round(toNumber(initialStock))),
    };
  }

  async function handleSubmit() {
    const v = validate();
    if (v) {
      setErrorMsg(v);
      return;
    }
    setErrorMsg(null);
    await onSubmit(buildPayload());
  }

  const showInitialStock =
    !isEdit &&
    (productScope === "both" || productScope === "boutique_only");

  const unitSelectValue = effectiveUnitValue(unit);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <div
        className="flex max-h-[min(700px,88vh)] w-full max-w-[520px] flex-col rounded-t-2xl border border-black/[0.08] bg-fs-card shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-labelledby="product-form-title"
      >
        <div className="shrink-0 border-b border-black/[0.06] px-4 py-4 sm:px-6">
          <h2 id="product-form-title" className="text-lg font-bold text-fs-text">
            {isEdit ? "Modifier le produit" : "Nouveau produit"}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {/* Images — aligné Flutter _buildImagesSection */}
          <div className="mb-3">
            <p className="text-sm font-semibold text-fs-text">Images</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {existingImages.map((img) => (
                <div key={img.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-black/[0.08] object-cover"
                  />
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow"
                    aria-label="Retirer l'image"
                    onClick={() => markImageRemoved(img.id)}
                  >
                    <MdClose className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {pendingPreviews.map((src, i) => (
                <div key={src} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-black/[0.08] object-cover"
                  />
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow"
                    aria-label="Retirer"
                    onClick={() => removePending(i)}
                  >
                    <MdClose className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onPickFiles}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-black/[0.2] text-neutral-400 transition hover:border-fs-accent hover:text-fs-accent"
                aria-label="Ajouter des images"
              >
                <MdAddPhotoAlternate className="h-8 w-8" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                Nom *
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fsInputClass()}
                autoCapitalize="words"
                autoComplete="off"
              />
            </label>

            <div
              className={cn(
                "flex flex-col gap-3 min-[401px]:flex-row min-[401px]:gap-3",
              )}
            >
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  SKU
                </span>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className={fsInputClass()}
                />
              </label>
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  Code-barres
                </span>
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className={fsInputClass()}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                Unité
              </span>
              <select
                value={unitSelectValue}
                onChange={(e) => setUnit(e.target.value)}
                className={fsInputClass()}
              >
                {unitChoices(unit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                Portée du produit
              </span>
              <select
                value={productScope}
                onChange={(e) =>
                  setProductScope(e.target.value as ProductScope)
                }
                className={fsInputClass()}
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <div
              className={cn(
                "flex flex-col gap-3 min-[401px]:flex-row min-[401px]:gap-3",
              )}
            >
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  Prix d&apos;achat
                </span>
                <input
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  inputMode="decimal"
                  className={fsInputClass()}
                />
              </label>
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  Prix de vente *
                </span>
                <input
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  inputMode="decimal"
                  className={fsInputClass()}
                />
              </label>
            </div>

            <div
              className={cn(
                "flex flex-col gap-3 min-[401px]:flex-row min-[401px]:gap-3",
              )}
            >
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  Stock minimum
                </span>
                <input
                  value={stockMin}
                  onChange={(e) => setStockMin(e.target.value)}
                  inputMode="numeric"
                  className={fsInputClass()}
                />
              </label>
              {showInitialStock ? (
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    Stock entrant
                  </span>
                  <input
                    value={initialStock}
                    onChange={(e) => setInitialStock(e.target.value)}
                    inputMode="numeric"
                    placeholder={
                      storeId
                        ? "Quantité pour la boutique"
                        : "Choisir une boutique"
                    }
                    className={fsInputClass()}
                    disabled={!storeId}
                  />
                </label>
              ) : null}
            </div>

            {/* Catégorie — ligne Flutter dropdown + nouvelle + bouton */}
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                Catégorie
              </span>
              <div className="flex flex-col gap-2 min-[321px]:flex-row min-[321px]:items-start">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={cn(fsInputClass(), "min-[321px]:min-w-0 min-[321px]:flex-[2]")}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex min-w-0 flex-1 items-start gap-1">
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Nouvelle"
                    className={cn(fsInputClass(), "min-w-0 flex-1")}
                    autoCapitalize="words"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddCategory()}
                    disabled={inlineBusy || !newCategory.trim()}
                    className={cn(
                      "fs-touch-target inline-flex shrink-0 items-center justify-center rounded-[10px] border-0",
                      "bg-[var(--fs-pos-orange)] text-white shadow-sm outline-none",
                      "transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50",
                    )}
                    aria-label="Ajouter catégorie"
                  >
                    <MdAdd className="h-6 w-6" aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                Marque
              </span>
              <div className="flex flex-col gap-2 min-[321px]:flex-row min-[321px]:items-start">
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  className={cn(fsInputClass(), "min-[321px]:min-w-0 min-[321px]:flex-[2]")}
                >
                  <option value="">—</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <div className="flex min-w-0 flex-1 items-start gap-1">
                  <input
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    placeholder="Nouvelle"
                    className={cn(fsInputClass(), "min-w-0 flex-1")}
                    autoCapitalize="words"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddBrand()}
                    disabled={inlineBusy || !newBrand.trim()}
                    className={cn(
                      "fs-touch-target inline-flex shrink-0 items-center justify-center rounded-[10px] border-0",
                      "bg-[var(--fs-pos-orange)] text-white shadow-sm outline-none",
                      "transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50",
                    )}
                    aria-label="Ajouter marque"
                  >
                    <MdAdd className="h-6 w-6" aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={fsInputClass("min-h-[4.5rem] resize-y")}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-black/[0.2] text-fs-accent focus:ring-fs-accent"
              />
              <span className="text-sm text-fs-text">Produit actif</span>
            </label>

            {errorMsg ? (
              <p className="text-sm text-red-600" role="alert">
                {errorMsg}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-black/[0.06] px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="fs-touch-target min-h-11 rounded-xl border border-black/[0.1] px-4 text-sm font-semibold text-fs-text hover:bg-fs-surface-container disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading || inlineBusy}
            onClick={() => void handleSubmit()}
            className="fs-touch-target min-h-11 min-w-[7rem] rounded-xl bg-fs-accent px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : isEdit ? (
              "Mettre à jour"
            ) : (
              "Créer"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
