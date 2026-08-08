"use client";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { FsSearchSelect } from "@/components/ui/fs-search-select";
import {
  createBrand,
  createCategory,
} from "@/lib/features/products/api";
import type {
  ActivityProductFieldValues,
  ProductFormSavePayload,
  ProductItem,
  ProductPackagingDraft,
  ProductScope,
} from "@/lib/features/products/types";
import {
  MAX_SEARCH_ALIASES,
  normalizeSearchAliases,
  productSearchAliases,
} from "@/lib/features/products/search-aliases";
import { activityConfig } from "@/lib/features/activity/activity-config";
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

/** Types de conditionnement proposés (libellé = choix obligatoire dans une liste). */
const PACKAGING_LABELS = [
  "Carton",
  "Paquet",
  "Sachet",
  "Boîte",
  "Sac",
  "Fardeau",
  "Casier",
  "Lot",
  "Douzaine",
  "Plaquette",
  "Rouleau",
  "Palette",
] as const;

/** Ligne de conditionnement éditable (champs numériques en chaînes). */
type PackagingRow = {
  key: string;
  id?: string;
  label: string;
  barcode: string;
  factor: string;
  price: string;
};

function newRowKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pkg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Props = {
  companyId: string;
  storeId: string | null;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  initial: ProductItem | null;
  loading: boolean;
  /** Type d'activité de l'entreprise → champs métier (ex. pharmacie). */
  businessTypeSlug?: string | null;
  /** Suivi de péremption ouvert par la plateforme (entreprise ou boutique). */
  expiryModuleEnabled?: boolean;
  /** SKU pré-rempli à la création (auto-généré, propre au tenant ; modifiable). */
  suggestedSku?: string;
  /**
   * « Autres noms » activés par le propriétaire (Paramètres). À false, la section
   * n'est pas affichée ET le formulaire n'envoie pas la colonne : les alias déjà
   * enregistrés restent en base, intacts.
   */
  searchAliasesEnabled?: boolean;
  onClose: () => void;
  onSubmit: (payload: ProductFormSavePayload) => void | Promise<void>;
  onCategoriesChanged: () => void;
  onBrandsChanged: () => void;
};

function initialActivityFields(
  initial: ProductItem | null,
): ActivityProductFieldValues {
  return {
    dci: initial?.dci ?? "",
    dosage_form: initial?.dosage_form ?? "",
    therapeutic_class: initial?.therapeutic_class ?? "",
    laboratory: initial?.laboratory ?? "",
    prescription_required: initial?.prescription_required ?? false,
    storage_conditions: initial?.storage_conditions ?? "",
  };
}

export function ProductFormDialog({
  companyId,
  storeId,
  categories,
  brands,
  initial,
  loading,
  businessTypeSlug,
  expiryModuleEnabled,
  suggestedSku,
  searchAliasesEnabled = false,
  onClose,
  onSubmit,
  onCategoriesChanged,
  onBrandsChanged,
}: Props) {
  const isEdit = initial != null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = useMemo(
    () => activityConfig(businessTypeSlug, { expiryModule: expiryModuleEnabled }),
    [businessTypeSlug, expiryModuleEnabled],
  );
  const [activityFields, setActivityFields] = useState<ActivityProductFieldValues>(
    () => initialActivityFields(initial),
  );

  const setActivityField = useCallback(
    (key: keyof ActivityProductFieldValues, value: string | boolean) => {
      setActivityFields((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const [name, setName] = useState(initial?.name ?? "");
  /**
   * Autres noms (recherche seule). Une ligne = un champ ; on garde les chaînes
   * telles que saisies, le nettoyage (vides, doublons, plafond) est fait à
   * l'enregistrement par `normalizeSearchAliases` — et re-fait par la base.
   */
  const [aliases, setAliases] = useState<string[]>(
    () => productSearchAliases(initial ?? { search_aliases: null }),
  );
  const addAlias = useCallback(() => {
    setAliases((rows) =>
      rows.length >= MAX_SEARCH_ALIASES ? rows : [...rows, ""],
    );
  }, []);
  const updateAlias = useCallback((index: number, value: string) => {
    setAliases((rows) => rows.map((r, i) => (i === index ? value : r)));
  }, []);
  const removeAlias = useCallback((index: number) => {
    setAliases((rows) => rows.filter((_, i) => i !== index));
  }, []);
  const [sku, setSku] = useState(
    initial ? (initial.sku ?? "") : (suggestedSku ?? ""),
  );
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "pce");
  const [purchasePrice, setPurchasePrice] = useState(
    initial?.purchase_price != null ? String(initial.purchase_price) : "",
  );
  const [salePrice, setSalePrice] = useState(
    initial?.sale_price != null ? String(initial.sale_price) : "",
  );
  // Prix gros / seuil gros : masqués du formulaire (la vente en gros passe par les
  // conditionnements). Valeurs conservées telles quelles à l'édition ; « 0 » pour un
  // nouveau produit. La logique caisse (posEffectiveUnitPrice) et les colonnes DB restent.
  const wholesalePrice = initial?.wholesale_price != null ? String(initial.wholesale_price) : "";
  const wholesaleQty = initial?.wholesale_qty != null ? String(initial.wholesale_qty) : "";
  const [stockMin, setStockMin] = useState(
    String(initial != null ? initial.stock_min ?? 0 : 5),
  );
  const [initialStock, setInitialStock] = useState("");
  // Lot daté initial (création, métiers à suivi de péremption).
  const [batchExpiry, setBatchExpiry] = useState("");
  const [batchQty, setBatchQty] = useState("");
  const [batchLot, setBatchLot] = useState("");
  // Champ Description retiré du formulaire ; on conserve la valeur existante
  // (produits déjà décrits) pour ne pas l'effacer lors d'une mise à jour.
  const [description] = useState(initial?.description ?? "");
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
  // Conditionnements (paquet/carton). `factor`/`price` en chaînes pour la saisie.
  const [packagings, setPackagings] = useState<PackagingRow[]>(() =>
    (initial?.product_packagings ?? []).map((p) => ({
      key: p.id,
      id: p.id,
      label: p.label,
      barcode: p.barcode ?? "",
      factor: String(p.factor),
      price: p.price != null ? String(p.price) : "",
    })),
  );
  const [removedPackagingIds, setRemovedPackagingIds] = useState<string[]>([]);

  const addPackaging = useCallback(() => {
    setPackagings((rows) => [
      ...rows,
      { key: newRowKey(), label: "", barcode: "", factor: "", price: "" },
    ]);
  }, []);
  const updatePackaging = useCallback(
    (key: string, field: keyof Omit<PackagingRow, "key" | "id">, value: string) => {
      setPackagings((rows) =>
        rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
      );
    },
    [],
  );
  const removePackaging = useCallback((key: string) => {
    setPackagings((rows) => {
      const row = rows.find((r) => r.key === key);
      if (row?.id) setRemovedPackagingIds((ids) => [...ids, row.id as string]);
      return rows.filter((r) => r.key !== key);
    });
  }, []);
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
    const wp = toNumber(wholesalePrice);
    if (wp < 0) return "Prix gros doit être ≥ 0.";
    const wq = Math.max(0, Math.round(toNumber(wholesaleQty)));
    if (wq > 0 && wp <= 0) {
      return "Renseignez un prix gros (> 0) si la quantité seuil est > 0.";
    }
    if (pp > sp) {
      return "Le prix d'achat ne peut pas dépasser le prix de vente. Réduisez le prix d'achat ou augmentez le prix de vente.";
    }
    // Conditionnements : libellé requis, nombre de pièces ≥ 1, codes-barres uniques.
    const seenBarcodes = new Set<string>();
    const mainBarcode = barcode.trim().toLowerCase();
    if (mainBarcode) seenBarcodes.add(mainBarcode);
    for (const r of packagings) {
      const label = r.label.trim();
      const f = Math.round(toNumber(r.factor));
      const bc = r.barcode.trim().toLowerCase();
      if (!label && !bc && !r.factor.trim() && !r.price.trim()) continue; // ligne vide ignorée
      if (!label) return "Donnez un libellé à chaque conditionnement (ex. Carton).";
      if (f < 1) return `Conditionnement « ${label} » : le nombre de pièces doit être ≥ 1.`;
      if (bc) {
        if (seenBarcodes.has(bc)) {
          return `Code-barres en double (« ${label} ») : chaque conditionnement doit avoir un code-barres unique.`;
        }
        seenBarcodes.add(bc);
      }
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
      wholesalePrice: Math.max(0, toNumber(wholesalePrice)),
      wholesaleQty: Math.max(0, Math.round(toNumber(wholesaleQty))),
      stockMin: Math.max(0, Math.round(toNumber(stockMin))),
      description: description.trim(),
      categoryId,
      brandId,
      productScope,
      isActive,
      // Non géré (fonction désactivée) ⇒ `undefined` : la colonne n'est pas écrite.
      searchAliases: searchAliasesEnabled
        ? normalizeSearchAliases(aliases, name)
        : undefined,
      activityFields:
        config.productFields.length > 0 ? activityFields : undefined,
    };
    const initialBatch =
      config.batchTracking && !isEdit && batchExpiry.trim()
        ? {
            expiryDate: batchExpiry,
            quantity: Math.max(0, Math.round(toNumber(batchQty))),
            lotNumber: batchLot.trim(),
          }
        : null;
    // Conditionnements : on garde les lignes nommées ; une ligne existante vidée
    // est traitée comme supprimée.
    const cleanPackagings: ProductPackagingDraft[] = [];
    const droppedExistingIds: string[] = [];
    for (const r of packagings) {
      const label = r.label.trim();
      if (!label) {
        if (r.id) droppedExistingIds.push(r.id);
        continue;
      }
      cleanPackagings.push({
        id: r.id,
        label,
        barcode: r.barcode.trim(),
        factor: Math.max(1, Math.round(toNumber(r.factor)) || 1),
        price: r.price.trim() ? Math.max(0, toNumber(r.price)) : null,
      });
    }
    return {
      input,
      pendingImages: pendingFiles,
      removedImageIds,
      packagings: cleanPackagings,
      removedPackagingIds: [...removedPackagingIds, ...droppedExistingIds],
      initialStock: Math.max(0, Math.round(toNumber(initialStock))),
      initialBatch,
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
  const canAddCategory = !inlineBusy && newCategory.trim().length > 0;
  const canAddBrand = !inlineBusy && newBrand.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <div
        className="flex max-h-[min(700px,88vh)] w-full max-w-[520px] flex-col rounded-t-lg border border-black/[0.08] bg-fs-card shadow-2xl sm:rounded-lg"
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
                    className="h-16 w-16 rounded-md border border-black/[0.08] object-cover"
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
                    className="h-16 w-16 rounded-md border border-black/[0.08] object-cover"
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
                className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-dashed border-black/[0.2] text-neutral-400 transition hover:border-fs-accent hover:text-fs-accent"
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

            {/* Autres noms : uniquement des clés de recherche. Le nom ci-dessus
                reste celui affiché partout (tickets, factures, rapports). */}
            {searchAliasesEnabled ? (
              <div className="rounded-md border border-black/[0.08] p-3">
                <p className="text-sm font-semibold text-fs-text">
                  Autres noms (recherche)
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
                  Les autres appellations du produit ({MAX_SEARCH_ALIASES} au
                  maximum) : « Omo » pour « savon en poudre », « cube » pour
                  « Maggi »… On retrouvera l&apos;article en cherchant l&apos;un de ces
                  noms. Le nom affiché sur les tickets et les factures reste le nom
                  ci-dessus.
                </p>

                {aliases.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {aliases.map((value, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          value={value}
                          onChange={(e) => updateAlias(index, e.target.value)}
                          className={fsInputClass()}
                          placeholder={`Autre nom ${index + 1}`}
                          aria-label={`Autre nom ${index + 1}`}
                          autoCapitalize="words"
                          autoComplete="off"
                          maxLength={120}
                        />
                        <button
                          type="button"
                          onClick={() => removeAlias(index)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-200 text-red-600"
                          aria-label={`Retirer l'autre nom ${index + 1}`}
                        >
                          <MdClose className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {aliases.length < MAX_SEARCH_ALIASES ? (
                  <button
                    type="button"
                    onClick={addAlias}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-fs-accent/40 bg-fs-accent/[0.06] px-3 py-2 text-xs font-semibold text-fs-accent"
                  >
                    <MdAdd className="h-4 w-4" aria-hidden />
                    Ajouter un autre nom
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] text-neutral-500">
                    Maximum atteint ({MAX_SEARCH_ALIASES} autres noms).
                  </p>
                )}
              </div>
            ) : null}

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
                {!isEdit ? (
                  <span className="mt-1 block text-[11px] text-neutral-400">
                    Généré automatiquement — modifiable.
                  </span>
                ) : null}
              </label>
              {config.showBarcodeField ? (
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
              ) : null}
            </div>

            {config.productFields.length > 0 ? (
              <fieldset className="rounded-md border border-fs-accent/30 bg-fs-accent/[0.04] p-3">
                <legend className="px-1 text-xs font-semibold text-fs-accent">
                  {config.productFieldsSectionTitle ?? "Informations métier"}
                </legend>
                <div className="space-y-3">
                  {(() => {
                    const fields = config.productFields;
                    const rows: typeof fields[] = [];
                    let i = 0;
                    while (i < fields.length) {
                      const f = fields[i]!;
                      const next = fields[i + 1];
                      if (f.type === "text" && f.half && next?.type === "text" && next.half) {
                        rows.push([f, next]);
                        i += 2;
                      } else {
                        rows.push([f]);
                        i += 1;
                      }
                    }
                    return rows.map((row, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex flex-col gap-3",
                          row.length === 2 &&
                            "min-[401px]:flex-row min-[401px]:gap-3",
                        )}
                      >
                        {row.map((field) => {
                          if (field.type === "bool") {
                            return (
                              <label
                                key={field.key}
                                className="flex flex-1 cursor-pointer items-center gap-2 py-1"
                              >
                                <input
                                  type="checkbox"
                                  checked={activityFields[field.key] === true}
                                  onChange={(e) =>
                                    setActivityField(field.key, e.target.checked)
                                  }
                                  className="h-4 w-4 rounded border-black/[0.2] text-fs-accent focus:ring-fs-accent"
                                />
                                <span className="text-sm text-fs-text">
                                  {field.label}
                                </span>
                              </label>
                            );
                          }
                          return (
                            <label key={field.key} className="block min-w-0 flex-1">
                              <span className="mb-1 block text-xs font-medium text-neutral-600">
                                {field.label}
                              </span>
                              <input
                                value={String(activityFields[field.key] ?? "")}
                                onChange={(e) =>
                                  setActivityField(field.key, e.target.value)
                                }
                                className={fsInputClass()}
                                placeholder={field.hint}
                                autoComplete="off"
                              />
                            </label>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              </fieldset>
            ) : null}

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

            {/* Conditionnements : paquet / carton avec leur code-barres et prix.
                Le stock reste compté en pièces ; scanner un conditionnement ajoute
                `factor` pièces au panier (caisse rapide). */}
            <div className="rounded-md border border-black/[0.08] p-3">
              <p className="text-sm font-semibold text-fs-text">
                Conditionnements
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
                Paquet, carton… Indiquez le nombre de pièces, le code-barres et le
                prix. À la caisse, scanner ce code ajoute automatiquement le bon
                nombre de pièces. Le stock reste compté en {unitSelectValue || "pce"}.
              </p>

              {packagings.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {packagings.map((r) => (
                    <div
                      key={r.key}
                      className="rounded-md border border-black/[0.08] bg-fs-surface-container/40 p-2.5"
                    >
                      <div className="flex items-end gap-2">
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                            Type *
                          </span>
                          <select
                            value={r.label}
                            onChange={(e) =>
                              updatePackaging(r.key, "label", e.target.value)
                            }
                            className={fsInputClass()}
                            aria-label="Type de conditionnement"
                          >
                            <option value="">Choisir…</option>
                            {r.label && !PACKAGING_LABELS.includes(r.label as (typeof PACKAGING_LABELS)[number]) ? (
                              <option value={r.label}>{r.label}</option>
                            ) : null}
                            {PACKAGING_LABELS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => removePackaging(r.key)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-200 text-red-600"
                          aria-label="Retirer le conditionnement"
                        >
                          <MdClose className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-col gap-2 min-[401px]:flex-row">
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                            Nb de pièces *
                          </span>
                          <input
                            value={r.factor}
                            onChange={(e) =>
                              updatePackaging(r.key, "factor", e.target.value)
                            }
                            inputMode="numeric"
                            placeholder="Ex. 24"
                            className={fsInputClass()}
                          />
                        </label>
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                            Prix (optionnel)
                          </span>
                          <input
                            value={r.price}
                            onChange={(e) =>
                              updatePackaging(r.key, "price", e.target.value)
                            }
                            inputMode="decimal"
                            placeholder="Sinon nb × prix pièce"
                            className={fsInputClass()}
                          />
                        </label>
                      </div>
                      <label className="mt-2 block">
                        <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                          Code-barres
                        </span>
                        <input
                          value={r.barcode}
                          onChange={(e) =>
                            updatePackaging(r.key, "barcode", e.target.value)
                          }
                          placeholder="Code-barres du paquet / carton"
                          className={fsInputClass()}
                          autoComplete="off"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={addPackaging}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-fs-accent/40 bg-fs-accent/[0.06] px-3 py-2 text-xs font-semibold text-fs-accent"
              >
                <MdAdd className="h-4 w-4" aria-hidden />
                Ajouter un conditionnement
              </button>
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

            {/* Suivi de péremption — métiers à suivi de lots, à la création */}
            {config.batchTracking && !isEdit ? (
              <div className="rounded-md border border-fs-accent/30 bg-fs-accent/[0.04] p-3">
                <p className="mb-1 text-xs font-semibold text-fs-accent">
                  Date de péremption (optionnel)
                </p>
                <p className="mb-2.5 text-[11px] leading-relaxed text-neutral-500">
                  Enregistrez la date du premier lot. Le produit apparaîtra dans la page
                  Péremptions. Vous pourrez ajouter d&apos;autres lots plus tard via le
                  bouton « Péremption ».
                </p>
                <div className="flex flex-col gap-2.5 min-[401px]:flex-row">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-medium text-neutral-600">
                      Date de péremption
                    </span>
                    <input
                      type="date"
                      value={batchExpiry}
                      onChange={(e) => setBatchExpiry(e.target.value)}
                      className={fsInputClass()}
                    />
                  </label>
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-medium text-neutral-600">
                      Quantité du lot
                    </span>
                    <input
                      value={batchQty}
                      onChange={(e) => setBatchQty(e.target.value)}
                      inputMode="numeric"
                      placeholder="Ex. 50"
                      className={fsInputClass()}
                    />
                  </label>
                </div>
                <label className="mt-2.5 block">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    N° de lot (optionnel)
                  </span>
                  <input
                    value={batchLot}
                    onChange={(e) => setBatchLot(e.target.value)}
                    className={fsInputClass()}
                    autoComplete="off"
                  />
                </label>
              </div>
            ) : null}

            {/* Catégorie — ligne Flutter dropdown + nouvelle + bouton */}
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                Catégorie
              </span>
              <div className="flex flex-col gap-2 min-[321px]:flex-row min-[321px]:items-start">
                <FsSearchSelect
                  value={categoryId}
                  options={categories}
                  onChange={setCategoryId}
                  ariaLabel="Catégorie"
                  searchPlaceholder="Rechercher une catégorie…"
                  className="min-[321px]:min-w-0 min-[321px]:flex-[2]"
                />
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
                    disabled={!canAddCategory}
                    className={cn(
                      "fs-touch-target inline-flex shrink-0 items-center justify-center rounded-md border-0",
                      canAddCategory
                        ? "bg-[var(--fs-pos-orange)] text-white shadow-sm"
                        : "bg-neutral-200 text-neutral-500",
                      "outline-none transition active:scale-[0.99] disabled:cursor-not-allowed",
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
                <FsSearchSelect
                  value={brandId}
                  options={brands}
                  onChange={setBrandId}
                  ariaLabel="Marque"
                  searchPlaceholder="Rechercher une marque…"
                  className="min-[321px]:min-w-0 min-[321px]:flex-[2]"
                />
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
                    disabled={!canAddBrand}
                    className={cn(
                      "fs-touch-target inline-flex shrink-0 items-center justify-center rounded-md border-0",
                      canAddBrand
                        ? "bg-[var(--fs-pos-orange)] text-white shadow-sm"
                        : "bg-neutral-200 text-neutral-500",
                      "outline-none transition active:scale-[0.99] disabled:cursor-not-allowed",
                    )}
                    aria-label="Ajouter marque"
                  >
                    <MdAdd className="h-6 w-6" aria-hidden />
                  </button>
                </div>
              </div>
            </div>

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
            className="fs-touch-target min-h-11 rounded-md border border-black/[0.1] px-4 text-sm font-semibold text-fs-text hover:bg-fs-surface-container disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading || inlineBusy}
            onClick={() => void handleSubmit()}
            className="fs-touch-target min-h-11 min-w-[7rem] rounded-md bg-fs-accent px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
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
