"use client";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createStockTransfer } from "@/lib/features/transfers/api";
import type { CreateTransferLineInput } from "@/lib/features/transfers/types";
import { createCustomer, listCustomers } from "@/lib/features/customers/api";
import type { Customer } from "@/lib/features/customers/types";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { listCategories, listProducts } from "@/lib/features/products/api";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import type { ProductItem } from "@/lib/features/products/types";
import { listSales } from "@/lib/features/sales/api";
import type { SaleItem } from "@/lib/features/sales/types";
import {
  warehouseCreateDispatchInvoice,
  warehouseRegisterAdjustment,
  warehouseRegisterExitForSale,
  warehouseRegisterManualEntry,
  warehouseSetStockMinWarehouse,
} from "@/lib/features/warehouse/api";
import type { WarehouseDispatchLineInput } from "@/lib/features/warehouse/types";
import type { WarehouseStockLine } from "@/lib/features/warehouse/types";
import { WAREHOUSE_PACKAGING_LABELS } from "@/lib/features/warehouse/types";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  MdAdd,
  MdCheckCircle,
  MdClose,
  MdDeleteOutline,
  MdEditNote,
  MdInventory2,
  MdPerson,
  MdPersonAdd,
  MdReceiptLong,
  MdWarningAmber,
} from "react-icons/md";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import {
  DispatchStepCard,
  POS_Q,
  StepNumberChip,
  WarehousePosQuickHeader,
  WarehousePosQuickSearchInput,
  WhCategoryChipsRow,
  whPosFormFieldClass,
  whPosLabelClass,
} from "./warehouse-pos-quick";

const PACKAGING_KEYS = Object.keys(WAREHOUSE_PACKAGING_LABELS);

export function isAvailableInWarehouse(p: ProductItem): boolean {
  const s = p.product_scope ?? "both";
  return s === "both" || s === "warehouse_only";
}

export function canTransferFromDepotToStore(p: ProductItem): boolean {
  return (p.product_scope ?? "both") === "both";
}

export function WarehouseEntryDialog({
  open,
  onClose,
  companyId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const isWide = useMediaQuery("(min-width: 900px)");
  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: open && Boolean(companyId),
  });
  const categoriesQ = useQuery({
    queryKey: queryKeys.categories(companyId),
    queryFn: () => listCategories(companyId),
    enabled: open && Boolean(companyId),
  });

  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [packaging, setPackaging] = useState("unite");
  const [packs, setPacks] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 220);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setProductId("");
    setCategoryId(null);
    setSearch("");
    setSearchDebounced("");
    setQty("");
    setCost("");
    setPackaging("unite");
    setPacks("1");
    setNotes("");
  }, [open]);

  const products = productsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const listLoading = productsQ.isLoading && products.length === 0;
  const listError = productsQ.isError ? productsQ.error : null;

  const filtered = useMemo(() => {
    const list = products.filter((p) => p.is_active && isAvailableInWarehouse(p));
    const q = searchDebounced.toLowerCase();
    return list
      .filter((p) => {
        if (categoryId && p.category_id !== categoryId) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .slice(0, 400);
  }, [products, categoryId, searchDebounced]);

  const selected = products.find((p) => p.id === productId);
  const searching = search.trim() !== searchDebounced.trim();

  const qtyPreview = parseInt(qty.trim(), 10);
  const qtyPreviewSafe = Number.isFinite(qtyPreview) ? qtyPreview : 0;
  const costPreview = parseFloat(cost.trim().replace(",", "."));
  const costPreviewSafe = Number.isFinite(costPreview) ? costPreview : 0;
  const packsPreviewNum = parseFloat(packs.trim().replace(",", ".")) || 1;
  const packagingPreview = WAREHOUSE_PACKAGING_LABELS[packaging] ?? packaging;
  const unitPreview = selected?.unit ?? "unite";
  const productPreview = selected?.name ?? "Produit non selectionne";
  const estimatedTotal = qtyPreviewSafe * costPreviewSafe;

  function selectProduct(p: ProductItem) {
    setProductId(p.id);
    if ((p.purchase_price ?? 0) > 0) {
      setCost(String(p.purchase_price));
    } else {
      setCost("");
    }
  }

  async function submit() {
    if (!selected) {
      toast.error("Choisissez un produit.");
      return;
    }
    const qn = parseInt(qty.trim(), 10);
    if (!Number.isFinite(qn) || qn <= 0) {
      toast.error("Quantité invalide (nombre entier > 0).");
      return;
    }
    const unitCost = parseFloat(cost.trim().replace(",", "."));
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toast.error("Prix d’achat unitaire invalide.");
      return;
    }
    const packsNum = parseFloat(packs.trim().replace(",", ".")) || 1;
    if (packsNum <= 0) {
      toast.error("Nombre de colis / lots invalide.");
      return;
    }
    setSaving(true);
    try {
      await warehouseRegisterManualEntry({
        companyId,
        productId: selected.id,
        quantity: qn,
        unitCost,
        packagingType: packaging,
        packsQuantity: packsNum,
        notes: notes.trim() || null,
      });
      const shouldBackfill = (selected.purchase_price ?? 0) <= 0 && unitCost > 0;
      if (shouldBackfill) {
        try {
          const supabase = createClient();
          await supabase.from("products").update({ purchase_price: unitCost }).eq("id", selected.id);
          await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
        } catch {
          toast.info(
            "Réception enregistrée. Le prix d'achat du produit n'a pas pu être mis à jour.",
          );
        }
      }
      toast.success("Entrée enregistrée au dépôt.");
      onSuccess();
      setProductId("");
      setQty("");
      setCost("");
      setPacks("1");
      setNotes("");
    } catch (e) {
      toastMutationError("warehouse-entry", e);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const whActiveCount = products.filter((p) => p.is_active && isAvailableInWarehouse(p)).length;
  const listEmpty = !listLoading && !listError && whActiveCount === 0;
  const errMsg = listError instanceof Error ? listError.message : "Erreur de chargement";

  const leftColumn = (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col bg-white",
        isWide ? "flex-1" : "h-[min(300px,36svh)] min-[900px]:h-[380px]",
      )}
    >
      <div className="px-2.5 pb-1 pt-1.5 min-[900px]:px-4 min-[900px]:pb-2 min-[900px]:pt-3">
        <WarehousePosQuickSearchInput
          value={search}
          onChange={setSearch}
          hintText="Rechercher un produit (nom ou SKU)…"
          suffix={
            searching ? (
              <span className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
            ) : null
          }
        />
      </div>
      <WhCategoryChipsRow categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5 min-[900px]:mt-2 min-[900px]:px-4 min-[900px]:pb-4">
        {filtered.length === 0 ? (
          <p className="px-1 py-5 text-center text-[12px] text-[#1F2937]/65 min-[900px]:px-2 min-[900px]:py-8 min-[900px]:text-[15px]">
            Aucun produit ne correspond à la recherche.
          </p>
        ) : (
          <div
            className={cn(
              "grid gap-1.5 pb-1.5 min-[900px]:gap-2.5 min-[900px]:pb-2",
              "grid-cols-2 min-[420px]:grid-cols-3 min-[700px]:grid-cols-4",
            )}
          >
            {filtered.map((p) => {
              const thumb = firstProductImageUrl(p);
              const sel = productId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProduct(p)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-[10px] bg-white px-1.5 py-1.5 text-center transition active:scale-[0.98] min-[900px]:rounded-[14px] min-[900px]:px-2.5 min-[900px]:py-2.5",
                    sel ? "border-[3px] border-[#F97316]" : "border border-[#E5E7EB]",
                  )}
                >
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-[#F8F9FA] min-[900px]:h-12 min-[900px]:w-12 min-[900px]:rounded-lg">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <MdInventory2 className="h-5 w-5 text-[#F97316]/80 min-[900px]:h-7 min-[900px]:w-7" aria-hidden />
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 min-h-8 text-[11px] font-semibold leading-snug text-[#1F2937] min-[900px]:mt-1.5 min-[900px]:min-h-10 min-[900px]:text-[13px]">
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#F97316] min-[900px]:mt-1 min-[900px]:text-sm">
                    {formatCurrency(Number(p.sale_price ?? 0))}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const rightColumn = (
    <div className="flex min-h-0 min-w-0 flex-col bg-[#F8F9FA] min-[900px]:border-l min-[900px]:border-[#E5E7EB]">
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2 min-[900px]:px-4 min-[900px]:py-3">
        <h3 className="text-[14px] font-bold text-[#1F2937] min-[900px]:text-base">Détail de la réception</h3>
        <p className="mt-0.5 text-[11px] leading-[1.35] text-[#1F2937]/65 min-[900px]:mt-1 min-[900px]:text-[13px]">
          Le prix d&apos;achat saisi ici met aussi à jour le produit s&apos;il était vide.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 min-[900px]:mt-3.5 min-[900px]:gap-2.5">
          <div>
            <label className={cn(whPosLabelClass, "mb-0.5 min-[900px]:mb-1")}>Quantité</label>
            <input
              className={whPosFormFieldClass}
              inputMode="numeric"
              placeholder="Ex. 120"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <label className={cn(whPosLabelClass, "mb-0.5 min-[900px]:mb-1")}>Prix d&apos;achat unitaire</label>
            <input
              className={whPosFormFieldClass}
              inputMode="decimal"
              placeholder="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            <span className="mt-0.5 block text-right text-xs text-[#1F2937]/50">FCFA</span>
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 min-[900px]:mt-2.5 min-[900px]:gap-2.5">
          <div>
            <label className={cn(whPosLabelClass, "mb-0.5 min-[900px]:mb-1")}>Conditionnement</label>
            <select
              className={whPosFormFieldClass}
              value={packaging}
              onChange={(e) => setPackaging(e.target.value)}
            >
              {PACKAGING_KEYS.map((k) => (
                <option key={k} value={k}>
                  {WAREHOUSE_PACKAGING_LABELS[k] ?? k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={cn(whPosLabelClass, "mb-0.5 min-[900px]:mb-1")}>Colis / lots</label>
            <input
              className={whPosFormFieldClass}
              inputMode="decimal"
              placeholder="1"
              value={packs}
              onChange={(e) => setPacks(e.target.value)}
            />
          </div>
        </div>
        <label className={cn(whPosLabelClass, "mb-0.5 mt-1.5 block min-[900px]:mb-1 min-[900px]:mt-2.5")}>
          Notes (optionnel)
        </label>
        <textarea
          className={cn(whPosFormFieldClass, "min-h-[56px] resize-y min-[900px]:min-h-[72px]")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div
          className="mt-2 rounded-lg border border-[#E5E7EB] bg-white p-2.5 min-[900px]:mt-3.5 min-[900px]:rounded-xl min-[900px]:p-3.5"
          style={{ backgroundColor: POS_Q.bg }}
        >
          <div className="flex items-center gap-1 min-[900px]:gap-2">
            <MdReceiptLong className="h-3 w-3 shrink-0 text-[#F97316] min-[900px]:h-4 min-[900px]:w-4" aria-hidden />
            <span className="text-[11px] font-bold text-[#1F2937] min-[900px]:text-sm">Résumé</span>
          </div>
          <p className="mt-1 text-[12px] font-semibold text-[#1F2937] min-[900px]:mt-2 min-[900px]:text-sm">
            {productPreview}
          </p>
          <p className="mt-0.5 text-[10px] text-[#1F2937]/65 min-[900px]:mt-1 min-[900px]:text-xs">
            Quantité: {qtyPreviewSafe} {unitPreview} · Conditionnement: {packagingPreview} · Colis/lots:{" "}
            {packsPreviewNum}
          </p>
          <p className="mt-0.5 text-[14px] font-extrabold text-[#F97316] min-[900px]:mt-1.5 min-[900px]:text-base">
            Coût total estimé : {formatCurrency(estimatedTotal)}
          </p>
        </div>
      </div>
    </div>
  );

  const footer = (
    <div
      className="shrink-0 border-t border-[#E5E7EB] bg-[#F8F9FA] shadow-[0_-4px_4px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="flex gap-1.5 px-2.5 pt-1.5 min-[900px]:gap-2.5 min-[900px]:px-4 min-[900px]:pt-2.5">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="min-h-[40px] flex-1 rounded-[10px] border border-[#E5E7EB] bg-white py-2 text-[12px] font-semibold text-[#1F2937] disabled:opacity-50 min-[900px]:min-h-[48px] min-[900px]:py-3.5 min-[900px]:text-sm"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={saving || listLoading || listError != null || whActiveCount === 0}
          onClick={submit}
          className="min-h-[40px] flex-1 rounded-[10px] bg-[#F97316] py-2 text-[13px] font-bold leading-snug text-white disabled:opacity-50 min-[900px]:min-h-[52px] min-[900px]:py-4 min-[900px]:text-base"
        >
          {saving ? (
            <span className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            "Enregistrer la réception"
          )}
        </button>
      </div>
    </div>
  );

  let body: ReactNode;
  if (listLoading) {
    body = (
      <div className="flex min-h-[240px] flex-1 items-center justify-center bg-white">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
      </div>
    );
  } else if (listError) {
    body = (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <p className="text-sm text-[#1F2937]/80">{errMsg}</p>
        <button
          type="button"
          onClick={() => productsQ.refetch()}
          className="rounded-[10px] bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Réessayer
        </button>
      </div>
    );
  } else if (listEmpty) {
    body = (
      <div className="flex min-h-[200px] flex-1 items-center justify-center bg-white px-6">
        <p className="text-center text-sm text-[#1F2937]/70">
          Aucun produit pour le moment. Actualisez ou attendez la connexion.
        </p>
      </div>
    );
  } else if (isWide) {
    body = (
      <div className="flex min-h-0 flex-1 flex-row">
        <div className="flex min-h-0 min-w-0 flex-[65] flex-col">{leftColumn}</div>
        <div className="flex min-h-0 min-w-0 flex-[35] flex-col">{rightColumn}</div>
      </div>
    );
  } else {
    body = (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {leftColumn}
        {rightColumn}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-1.5 min-[900px]:p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wh-entry-title"
    >
      <div className="flex h-[min(96dvh,94svh)] w-full max-w-[560px] flex-col overflow-hidden rounded-none bg-white shadow-2xl min-[900px]:h-[min(94vh,92dvh)] min-[900px]:max-w-[1100px]">
        <WarehousePosQuickHeader
          titleId="wh-entry-title"
          title="Réception au dépôt"
          subtitle="Comme la caisse rapide — choisissez un produit puis les quantités"
          onClose={onClose}
          closeDisabled={saving}
        />
        {body}
        {!listLoading && !listError && !listEmpty ? footer : null}
      </div>
    </div>
  );
}

export function WarehouseAdjustmentDialog({
  open,
  onClose,
  companyId,
  line,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  line: WarehouseStockLine | null;
  onSuccess: () => void;
}) {
  const [delta, setDelta] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !line) return;
    setDelta("");
    setCost(line.purchasePrice > 0 ? String(line.purchasePrice) : "");
    setReason("");
  }, [open, line]);

  if (!open || !line) return null;

  const row = line;

  async function submit() {
    const raw = delta.trim();
    if (raw === "" || raw === "-" || raw === "+") {
      toast.error("Indiquez une variation (+ ou − en unités).");
      return;
    }
    const normalized = raw.startsWith("+") ? raw.slice(1) : raw;
    const d = parseInt(normalized, 10);
    if (!Number.isFinite(d) || d === 0) {
      toast.error("Variation invalide (nombre entier, ex. -3 ou +10).");
      return;
    }
    let unitCost: number | null = null;
    if (d > 0) {
      const c = parseFloat(cost.trim().replace(",", "."));
      if (!Number.isFinite(c) || c < 0) {
        toast.error("Indiquez un prix d’achat unitaire pour l’ajout en stock.");
        return;
      }
      unitCost = c;
    }
    setSaving(true);
    try {
      await warehouseRegisterAdjustment({
        companyId,
        productId: row.productId,
        delta: d,
        unitCost: d > 0 ? unitCost : null,
        reason: reason.trim() || null,
      });
      toast.success("Stock dépôt mis à jour.");
      onSuccess();
      onClose();
    } catch (e) {
      toastMutationError("warehouse-adjust", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-fs-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
          <h2 className="text-base font-bold text-fs-text">Ajuster le stock dépôt</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-neutral-600" aria-label="Fermer">
            <MdClose className="h-6 w-6" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-neutral-600">
            {row.productName} — {row.quantity} {row.unit}
          </p>
          <label className="mt-3 block text-[11px] font-semibold uppercase text-neutral-500">
            Variation (unités)
          </label>
          <input
            className={fsInputClass + " mt-1"}
            placeholder="ex. -5 ou +12"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
          {(() => {
            const raw = delta.trim();
            const normalized = raw.startsWith("+") ? raw.slice(1) : raw;
            const d = parseInt(normalized, 10);
            const showCost = Number.isFinite(d) && d > 0;
            return showCost ? (
              <>
                <label className="mt-3 block text-[11px] font-semibold uppercase text-neutral-500">
                  Prix d’achat unitaire (si ajout)
                </label>
                <input className={fsInputClass + " mt-1"} value={cost} onChange={(e) => setCost(e.target.value)} />
              </>
            ) : null;
          })()}
          <label className="mt-3 block text-[11px] font-semibold uppercase text-neutral-500">Motif</label>
          <textarea className={fsInputClass + " mt-1 min-h-[64px]"} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="mt-4 w-full rounded-[10px] bg-fs-accent py-3.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WarehouseThresholdDialog({
  open,
  onClose,
  companyId,
  line,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  line: WarehouseStockLine | null;
  onSuccess: () => void;
}) {
  const [v, setV] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !line) return;
    setV(line.stockMinWarehouse > 0 ? String(line.stockMinWarehouse) : "");
  }, [open, line]);

  if (!open || !line) return null;

  const row = line;

  async function submit() {
    const n = parseInt(v.trim(), 10);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Valeur invalide.");
      return;
    }
    setSaving(true);
    try {
      await warehouseSetStockMinWarehouse({
        companyId,
        productId: row.productId,
        minValue: n,
      });
      toast.success("Seuil enregistré");
      onSuccess();
      onClose();
    } catch (e) {
      toastMutationError("warehouse-threshold", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-fs-surface p-4 shadow-2xl">
        <h2 className="text-base font-bold text-fs-text">Seuil magasin — {row.productName}</h2>
        <p className="mt-2 text-xs text-neutral-600">
          0 = utiliser le seuil produit ({row.stockMin}). Sinon seuil dédié au dépôt.
        </p>
        <label className="mt-3 block text-[11px] font-semibold uppercase text-neutral-500">Seuil magasin</label>
        <input className={fsInputClass + " mt-1"} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700">
            Annuler
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="rounded-lg bg-fs-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

export function WarehouseExitSaleDialog({
  open,
  onClose,
  companyId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess: () => void;
}) {
  const [saleId, setSaleId] = useState("");
  const [saving, setSaving] = useState(false);

  const salesQ = useQuery({
    queryKey: ["warehouse-exit-sales", companyId] as const,
    queryFn: async () => {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const list = await listSales({
        companyId,
        storeId: null,
        status: "completed",
        from,
        to,
      });
      return list.slice(0, 60);
    },
    enabled: open && Boolean(companyId),
  });

  useEffect(() => {
    if (!open) return;
    setSaleId("");
  }, [open]);

  const sales = salesQ.data ?? [];

  async function submit() {
    if (!saleId) {
      toast.error("Sélectionnez une vente.");
      return;
    }
    setSaving(true);
    try {
      await warehouseRegisterExitForSale({ companyId, saleId });
      toast.success("Sortie magasin enregistrée pour cette vente.");
      onSuccess();
      onClose();
    } catch (e) {
      toastMutationError("warehouse-exit-sale", e);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[min(88dvh,640px)] w-full max-w-md flex-col rounded-2xl bg-fs-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
          <h2 className="text-base font-bold text-fs-text">Rattacher une vente au dépôt</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2" aria-label="Fermer">
            <MdClose className="h-6 w-6" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-xs leading-relaxed text-neutral-600">
            Flux habituel : ventes en caisse et transferts depuis ce dépôt. Utilisez cette option seulement pour une
            vente déjà « complétée », si le dépôt doit couvrir les lignes. Une vente ne peut être utilisée qu’une fois.
          </p>
          {salesQ.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
            </div>
          ) : salesQ.isError ? (
            <p className="mt-4 text-sm text-red-600">Impossible de charger les ventes.</p>
          ) : (
            <>
              <label className="mt-4 block text-[11px] font-semibold uppercase text-neutral-500">
                Vente complétée
              </label>
              <select
                className={fsInputClass + " mt-1"}
                value={saleId}
                onChange={(e) => setSaleId(e.target.value)}
              >
                <option value="">—</option>
                {sales.map((s: SaleItem) => (
                  <option key={s.id} value={s.id}>
                    {s.sale_number} · {s.total.toFixed(0)} · {s.store?.name ?? ""}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-black/6 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-lg px-4 py-2 text-sm">
            Annuler
          </button>
          <button
            type="button"
            disabled={saving || !saleId || sales.length === 0}
            onClick={submit}
            className="min-h-[44px] rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

type LineEd = { productId: string; quantity: string; unitPrice: string };

export function WarehouseDispatchDialog({
  open,
  onClose,
  companyId,
  warehouseQtyByProductId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  warehouseQtyByProductId: Record<string, number>;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const isWide = useMediaQuery("(min-width: 900px)");
  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: open && Boolean(companyId),
  });
  const customersQ = useQuery({
    queryKey: queryKeys.customers(companyId),
    queryFn: () => listCustomers(companyId),
    enabled: open && Boolean(companyId),
  });

  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineEd[]>([{ productId: "", quantity: "1", unitPrice: "" }]);
  const [creatingName, setCreatingName] = useState("");
  const [creatingPhone, setCreatingPhone] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerFilter, setCustomerFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productSearchDebounced, setProductSearchDebounced] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setProductSearchDebounced(productSearch.trim()), 220);
    return () => clearTimeout(t);
  }, [productSearch]);

  const productSearchBusy = productSearch.trim() !== productSearchDebounced.trim();

  useEffect(() => {
    if (!open) return;
    setCustomerId("");
    setNotes("");
    setLines([{ productId: "", quantity: "1", unitPrice: "" }]);
    setShowCreate(false);
    setCreatingName("");
    setCreatingPhone("");
    setCustomerFilter("");
    setProductSearch("");
    setProductSearchDebounced("");
  }, [open]);

  const products = productsQ.data ?? [];
  const whProducts = useMemo(
    () =>
      products
        .filter((p) => p.is_active && isAvailableInWarehouse(p))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [products],
  );

  const customers = customersQ.data ?? [];
  const hasCustomers = customers.length > 0;
  const sortedCustomers = useMemo(() => {
    const list = [...customers] as Customer[];
    list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "fr"));
    return list;
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const q = customerFilter.trim().toLowerCase();
    if (!q) return sortedCustomers;
    return sortedCustomers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      const p = c.phone ?? "";
      return p.toLowerCase().includes(q);
    });
  }, [sortedCustomers, customerFilter]);

  const filteredProductsForSelect = useMemo(() => {
    const q = productSearchDebounced.toLowerCase();
    const base = !q
      ? whProducts
      : whProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q),
        );
    return base.slice(0, 400);
  }, [whProducts, productSearchDebounced]);

  function optionsForLine(row: LineEd): ProductItem[] {
    const base = filteredProductsForSelect;
    const sel = whProducts.find((p) => p.id === row.productId);
    if (sel && !base.some((p) => p.id === sel.id)) return [sel, ...base];
    return base;
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: "", quantity: "1", unitPrice: "" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }
  function setLine(i: number, patch: Partial<LineEd>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function lineTotal(row: LineEd): number {
    const q = parseInt(row.quantity, 10);
    const price = parseFloat(row.unitPrice.replace(",", "."));
    const qn = Number.isFinite(q) ? q : 0;
    const pr = Number.isFinite(price) ? price : 0;
    return qn * pr;
  }

  const grandTotal = useMemo(() => lines.reduce((s, row) => s + lineTotal(row), 0), [lines]);

  const canSubmit =
    !saving && !creatingCustomer && hasCustomers && whProducts.length > 0;

  async function createCustomerQuick() {
    const name = creatingName.trim();
    if (name.length < 2) {
      toast.error("Au moins 2 lettres pour le nom.");
      return;
    }
    setCreatingCustomer(true);
    try {
      await createCustomer(companyId, {
        name,
        type: "individual",
        phone: creatingPhone.trim() || null,
        email: null,
        address: null,
        notes: null,
      });
      await qc.invalidateQueries({ queryKey: queryKeys.customers(companyId) });
      const list = await listCustomers(companyId);
      const created = list.find((c) => c.name.trim() === name.trim());
      if (created) setCustomerId(created.id);
      setShowCreate(false);
      setCreatingName("");
      setCreatingPhone("");
      toast.success("Client ajouté. Vous pouvez continuer le bon.");
    } catch (e) {
      toastMutationError("customer-create", e);
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function submit() {
    if (!customerId) {
      toast.info("Choisissez d’abord la personne ou le client qui reçoit la marchandise.");
      return;
    }
    const out: WarehouseDispatchLineInput[] = [];
    const seen = new Set<string>();
    for (const row of lines) {
      if (!row.productId) {
        toast.info("Choisissez un article sur chaque ligne.");
        return;
      }
      if (seen.has(row.productId)) {
        toast.info("Le même article est en double. Mettez la quantité sur une seule ligne.");
        return;
      }
      seen.add(row.productId);
      const q = parseInt(row.quantity, 10);
      const price = parseFloat(row.unitPrice.replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) {
        toast.info("Indiquez une quantité correcte (nombre entier).");
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        toast.info("Indiquez un prix correct pour chaque article.");
        return;
      }
      const stock = warehouseQtyByProductId[row.productId] ?? 0;
      if (q > stock) {
        const pname = whProducts.find((p) => p.id === row.productId)?.name ?? "Produit";
        toast.info(`Pas assez de stock pour « ${pname} ». Disponible : ${stock}.`);
        return;
      }
      out.push({ productId: row.productId, quantity: q, unitPrice: price });
    }
    setSaving(true);
    try {
      const res = await warehouseCreateDispatchInvoice({
        companyId,
        customerId,
        notes: notes.trim() || null,
        lines: out,
      });
      toast.success(`Bon enregistré : ${res.documentNumber}`);
      onSuccess();
      setCustomerId("");
      setNotes("");
      setLines([{ productId: "", quantity: "1", unitPrice: "" }]);
      setCustomerFilter("");
      setProductSearch("");
      setProductSearchDebounced("");
    } catch (e) {
      toastMutationError("warehouse-dispatch", e);
    } finally {
      setSaving(false);
    }
  }

  function onPickProduct(i: number, productId: string) {
    setLines((prev) => {
      const row = prev[i];
      const p = whProducts.find((x) => x.id === productId);
      const nextPrice =
        p && (!row.unitPrice || row.unitPrice.trim() === "") ? String(p.sale_price ?? 0) : row.unitPrice;
      return prev.map((r, j) => (j === i ? { ...r, productId, unitPrice: nextPrice } : r));
    });
  }

  const dispatchFooter = (
    <div
      className="shrink-0 shadow-[0_-4px_4px_rgba(0,0,0,0.06)]"
      style={{ backgroundColor: POS_Q.bg2, paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="px-2.5 pt-1.5 min-[900px]:px-4 min-[900px]:pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-bold text-[#1F2937] min-[900px]:text-lg">Total</span>
          <span className="text-[16px] font-extrabold tabular-nums text-[#F97316] min-[900px]:text-[22px]">
            {formatCurrency(grandTotal)}
          </span>
        </div>
        <button
          type="button"
          disabled={!canSubmit || saving}
          onClick={submit}
          className="mt-1.5 min-h-[40px] w-full rounded-[10px] bg-[#F97316] py-2 text-[13px] font-bold leading-snug text-white disabled:opacity-50 min-[900px]:mt-2.5 min-[900px]:min-h-0 min-[900px]:py-4 min-[900px]:text-base"
        >
          {saving ? (
            <span className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : hasCustomers ? (
            "Enregistrer le bon de sortie"
          ) : (
            "Ajoutez d’abord un client"
          )}
        </button>
      </div>
    </div>
  );

  const customerStepChild = !hasCustomers ? (
    <div className="space-y-2 min-[900px]:space-y-3">
      <div className="rounded-[10px] border border-neutral-200 bg-red-50/40 p-2.5 min-[900px]:rounded-[14px] min-[900px]:p-4">
        <div className="flex flex-col items-center text-center">
          <MdWarningAmber className="h-7 w-7 text-red-600 min-[900px]:h-9 min-[900px]:w-9" aria-hidden />
          <p className="mt-1 text-[12px] font-bold text-[#1F2937] min-[900px]:mt-2 min-[900px]:text-sm">
            Aucun client enregistré pour l’instant.
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[#1F2937]/70 min-[900px]:mt-1.5 min-[900px]:text-sm">
            Appuyez sur le bouton orange ci‑dessous pour créer un client tout de suite. Vous pouvez aussi aller dans le
            menu « Clients ».
          </p>
        </div>
      </div>
      {!showCreate ? (
        <button
          type="button"
          disabled={creatingCustomer}
          onClick={() => setShowCreate(true)}
          className="flex min-h-[40px] w-full items-center justify-center gap-1 rounded-[10px] bg-[#F97316] px-2 py-2 text-[13px] font-bold leading-snug text-white disabled:opacity-50 min-[900px]:min-h-[44px] min-[900px]:gap-2 min-[900px]:py-4 min-[900px]:text-base"
        >
          {creatingCustomer ? (
            <span className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>
              <MdPersonAdd className="h-[18px] w-[18px] shrink-0 min-[900px]:h-6 min-[900px]:w-6" aria-hidden />
              Créer un client maintenant
            </>
          )}
        </button>
      ) : (
        <div className="space-y-1.5 rounded-[10px] border border-[#E5E7EB] bg-white p-2 min-[900px]:space-y-2 min-[900px]:rounded-[14px] min-[900px]:p-3">
          <input
            className={whPosFormFieldClass}
            placeholder="Nom complet *"
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
          />
          <input
            className={whPosFormFieldClass}
            placeholder="Téléphone (facultatif)"
            value={creatingPhone}
            onChange={(e) => setCreatingPhone(e.target.value)}
          />
          <button
            type="button"
            disabled={creatingCustomer}
            onClick={createCustomerQuick}
            className="min-h-[40px] w-full rounded-[10px] bg-[#F97316] py-2 text-[13px] font-bold text-white disabled:opacity-50 min-[900px]:min-h-[44px] min-[900px]:py-3.5 min-[900px]:text-base"
          >
            {creatingCustomer ? (
              <span className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Enregistrer"
            )}
          </button>
        </div>
      )}
    </div>
  ) : (
    <div className="space-y-1.5 min-[900px]:space-y-2.5">
      <button
        type="button"
        disabled={creatingCustomer}
        onClick={() => setShowCreate((s) => !s)}
        className="flex min-h-[40px] w-full items-center gap-1.5 rounded-[10px] border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-2 text-left text-[12px] font-semibold text-[#1F2937] disabled:opacity-50 min-[900px]:min-h-[44px] min-[900px]:px-3.5 min-[900px]:py-3.5 min-[900px]:text-sm"
      >
        {creatingCustomer ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
        ) : (
          <MdPersonAdd className="h-5 w-5 shrink-0 text-[#F97316]" aria-hidden />
        )}
        Ajouter un nouveau client
      </button>
      {showCreate ? (
        <div className="space-y-1.5 rounded-[10px] border border-[#E5E7EB] bg-white p-2 min-[900px]:space-y-2 min-[900px]:rounded-[14px] min-[900px]:p-3">
          <input
            className={whPosFormFieldClass}
            placeholder="Nom complet *"
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
          />
          <input
            className={whPosFormFieldClass}
            placeholder="Téléphone"
            value={creatingPhone}
            onChange={(e) => setCreatingPhone(e.target.value)}
          />
          <button
            type="button"
            disabled={creatingCustomer}
            onClick={createCustomerQuick}
            className="min-h-[40px] w-full rounded-[10px] bg-[#F97316] py-2 text-[12px] font-bold text-white disabled:opacity-50 min-[900px]:min-h-[44px] min-[900px]:py-3 min-[900px]:text-sm"
          >
            {creatingCustomer ? "…" : "Enregistrer le client"}
          </button>
        </div>
      ) : null}
      <WarehousePosQuickSearchInput
        value={customerFilter}
        onChange={setCustomerFilter}
        hintText="Chercher par nom ou téléphone…"
      />
      <div className="max-h-[200px] space-y-1 overflow-y-auto pr-0.5 min-[900px]:max-h-[260px] min-[900px]:space-y-2">
        {filteredCustomers.map((c) => {
          const selected = customerId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCustomerId(c.id)}
              className={cn(
                "flex min-h-[40px] w-full items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-left transition-colors min-[900px]:min-h-[44px] min-[900px]:gap-3 min-[900px]:rounded-[14px] min-[900px]:px-3.5 min-[900px]:py-3.5",
                selected ? "bg-[color-mix(in_srgb,#FDBA74_45%,white)]" : "border border-[#E5E7EB] bg-white",
              )}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full min-[900px]:h-11 min-[900px]:w-11"
                style={{ backgroundColor: "rgba(249, 115, 22, 0.16)" }}
              >
                <MdPerson className="h-[18px] w-[18px] text-[#F97316] min-[900px]:h-6 min-[900px]:w-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-[#1F2937] min-[900px]:text-sm">{c.name}</p>
                {c.phone?.trim() ? (
                  <p className="text-[10px] text-neutral-600 min-[900px]:text-xs">{c.phone}</p>
                ) : null}
              </div>
              {selected ? (
                <MdCheckCircle className="h-[18px] w-[18px] shrink-0 text-[#F97316] min-[900px]:h-6 min-[900px]:w-6" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const linesStepChild = (
    <div className="space-y-1 min-[900px]:space-y-2">
      <WarehousePosQuickSearchInput
        value={productSearch}
        onChange={setProductSearch}
        hintText="Chercher un article…"
        suffix={
          productSearchBusy ? (
            <span className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
          ) : null
        }
      />
      {lines.map((row, i) => {
        const opts = optionsForLine(row);
        const pSel = whProducts.find((p) => p.id === row.productId);
        const sub = lineTotal(row);
        return (
          <div
            key={i}
            className="rounded-[10px] border border-[#E5E7EB] bg-white p-2 min-[900px]:rounded-[14px] min-[900px]:p-3"
          >
            <div className="flex items-start gap-1 min-[900px]:gap-2">
              <StepNumberChip label={String(i + 1)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-[#1F2937] min-[900px]:text-sm">Article</span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="min-h-[36px] min-w-[36px] rounded-lg p-1 text-neutral-600 hover:bg-black/5 min-[900px]:min-h-0 min-[900px]:min-w-0 min-[900px]:p-1.5"
                      aria-label="Retirer cette ligne"
                    >
                      <MdDeleteOutline className="h-4 w-4 min-[900px]:h-5 min-[900px]:w-5" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex items-start gap-2">
                  <ProductListThumbnail
                    imageUrl={pSel ? firstProductImageUrl(pSel) : null}
                    className="h-10 w-10 shrink-0 rounded-lg min-[900px]:h-12 min-[900px]:w-12"
                  />
                  <select
                    className={cn(whPosFormFieldClass, "min-w-0 flex-1")}
                    value={row.productId}
                    onChange={(e) => onPickProduct(i, e.target.value)}
                  >
                    <option value="">Sélectionner un article</option>
                    {opts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.sku ? ` (${p.sku})` : ""} · {p.unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 min-[900px]:mt-3 min-[900px]:gap-2.5">
                  <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-[#1F2937] min-[900px]:mb-1 min-[900px]:text-xs">
                      {pSel ? `Quantité (${pSel.unit})` : "Quantité"}
                    </label>
                    <input
                      className={whPosFormFieldClass}
                      inputMode="numeric"
                      value={row.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                    />
                    {pSel ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        En stock : {warehouseQtyByProductId[pSel.id] ?? 0} {pSel.unit}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-[#1F2937] min-[900px]:mb-1 min-[900px]:text-xs">
                      {pSel ? `Prix pour 1 ${pSel.unit}` : "Prix pour 1 unité"}
                    </label>
                    <input
                      className={whPosFormFieldClass}
                      inputMode="decimal"
                      value={row.unitPrice}
                      onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                    />
                    <p className="mt-1 text-right text-xs text-neutral-500">FCFA</p>
                  </div>
                </div>
                {pSel && row.unitPrice.trim() !== "" ? (
                  <p className="mt-1 text-[12px] font-bold text-[#F97316] min-[900px]:mt-2 min-[900px]:text-sm">
                    Sous-total ligne ({pSel.unit}) : {formatCurrency(sub)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addLine}
        disabled={saving}
        className="flex min-h-[40px] w-full items-center justify-center gap-1 rounded-[10px] border border-[#E5E7EB] py-2 text-[12px] font-semibold text-[#F97316] disabled:opacity-50 min-[900px]:min-h-[44px] min-[900px]:gap-2 min-[900px]:py-3.5 min-[900px]:text-sm"
      >
        <MdAdd className="h-4 w-4 shrink-0 min-[900px]:h-5 min-[900px]:w-5" aria-hidden />
        Ajouter un autre article
      </button>
    </div>
  );

  const notesStepChild = (
    <div>
      <label className={cn(whPosLabelClass, "mb-0.5 min-[900px]:mb-1")}>Note (facultatif)</label>
      <textarea
        className={cn(whPosFormFieldClass, "min-h-[64px] resize-y min-[900px]:min-h-[88px]")}
        placeholder="Écrivez ici si besoin"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </div>
  );

  const stepsColumn = (
    <div className="space-y-2 min-[900px]:space-y-4">
      <DispatchStepCard
        step={1}
        title="Qui reçoit la marchandise ?"
        subtitle="Obligatoire — touchez le nom de la personne ou du client."
        icon={<MdPerson className="h-[18px] w-[18px] min-[900px]:h-[22px] min-[900px]:w-[22px]" aria-hidden />}
      >
        {customerStepChild}
      </DispatchStepCard>
      <DispatchStepCard
        step={2}
        title="Quels articles sortent ?"
        subtitle="Choisissez l’article, la quantité et le prix d’une unité."
        icon={<MdInventory2 className="h-[18px] w-[18px] min-[900px]:h-[22px] min-[900px]:w-[22px]" aria-hidden />}
      >
        {linesStepChild}
      </DispatchStepCard>
      <DispatchStepCard
        step={3}
        title="Note (facultatif)"
        subtitle="Exemple : motif de la sortie, nom sur place…"
        icon={<MdEditNote className="h-[18px] w-[18px] min-[900px]:h-[22px] min-[900px]:w-[22px]" aria-hidden />}
      >
        {notesStepChild}
      </DispatchStepCard>
    </div>
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-1.5 min-[900px]:p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wh-dispatch-title"
    >
      <div className="flex h-[min(96dvh,94svh)] w-full max-w-[560px] flex-col overflow-hidden rounded-none bg-white shadow-2xl min-[900px]:h-[min(94vh,92dvh)] min-[900px]:max-w-[1100px]">
        <WarehousePosQuickHeader
          titleId="wh-dispatch-title"
          title="Facture / sortie dépôt"
          subtitle="La marchandise quitte votre magasin (style caisse rapide)"
          onClose={onClose}
          closeDisabled={saving}
        />
        {isWide ? (
          <div className="flex min-h-0 flex-1 flex-row">
            <div className="min-h-0 min-w-0 flex-[62] overflow-y-auto bg-white px-2.5 py-2 min-[900px]:px-4 min-[900px]:py-3">
              {stepsColumn}
            </div>
            <div
              className="flex min-h-0 min-w-0 flex-[38] flex-col border-l border-[#E5E7EB]"
              style={{ backgroundColor: POS_Q.bg2 }}
            >
              <p className="px-2.5 pb-1 pt-2 text-[14px] font-bold text-[#1F2937] min-[900px]:px-4 min-[900px]:pb-2 min-[900px]:pt-4 min-[900px]:text-base">
                Récapitulatif
              </p>
              <div className="min-h-0 flex-1" />
              {dispatchFooter}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-2.5 py-2 min-[900px]:px-4 min-[900px]:py-3">
              {stepsColumn}
            </div>
            {dispatchFooter}
          </div>
        )}
      </div>
    </div>
  );
}

export function WarehouseCreateTransferFromDepotDialog({
  open,
  onClose,
  companyId,
  stores,
  warehouseQtyByProductId,
  initialToStoreId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  stores: { id: string; name: string }[];
  /** Stock dépôt par produit — même validation que `CreateTransferDialog` Flutter (`fromWarehouseSource`). */
  warehouseQtyByProductId: Record<string, number>;
  /** Aligné `initialToStoreId: company.currentStoreId` Flutter. */
  initialToStoreId?: string | null;
  onSuccess: () => void;
}) {
  const [toStoreId, setToStoreId] = useState("");
  const [lines, setLines] = useState<CreateTransferLineInput[]>([{ productId: "", quantityRequested: 1 }]);
  const [stockProblems, setStockProblems] = useState<string[] | null>(null);

  const productsQ = useQuery({
    queryKey: ["warehouse-transfer-products", companyId],
    queryFn: () => listProducts(companyId),
    enabled: open && Boolean(companyId),
  });

  useEffect(() => {
    if (!open || stores.length === 0) return;
    const ids = new Set(stores.map((s) => s.id));
    const preferred =
      initialToStoreId && ids.has(initialToStoreId) ? initialToStoreId : (stores[0]?.id ?? "");
    setToStoreId(preferred);
    setLines([{ productId: "", quantityRequested: 1 }]);
    setStockProblems(null);
  }, [open, stores, initialToStoreId]);

  const transferProducts = useMemo(() => {
    const list = productsQ.data ?? [];
    return list.filter((p) => p.is_active && canTransferFromDepotToStore(p));
  }, [productsQ.data]);

  const productNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of transferProducts) m[p.id] = p.name;
    return m;
  }, [transferProducts]);

  function addLine() {
    setLines((prev) => [...prev, { productId: "", quantityRequested: 1 }]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }
  function setLine(i: number, patch: Partial<CreateTransferLineInput>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function submit() {
    if (!toStoreId) {
      toast.error("Choisissez la boutique de destination.");
      return;
    }
    const itemRows = lines.filter((l) => l.productId && l.quantityRequested > 0);
    if (itemRows.length === 0) {
      toast.error("Ajoutez au moins une ligne avec produit et quantité > 0.");
      return;
    }
    const problems: string[] = [];
    for (const l of itemRows) {
      const available = warehouseQtyByProductId[l.productId] ?? 0;
      if (l.quantityRequested > available) {
        const name = productNameById[l.productId] ?? l.productId.slice(0, 8);
        problems.push(`${name} : demandé ${l.quantityRequested}, disponible ${available}`);
      }
    }
    if (problems.length > 0) {
      setStockProblems(problems);
      return;
    }
    try {
      await createStockTransfer({
        companyId,
        fromWarehouse: true,
        fromStoreId: null,
        toStoreId,
        items: itemRows,
      });
      toast.success("Transfert créé (brouillon)");
      onSuccess();
      onClose();
    } catch (e) {
      toastMutationError("warehouse-transfer-create", e);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[min(92dvh,720px)] w-full flex-col rounded-t-3xl bg-fs-surface shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-neutral-300 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
          <h2 className="text-base font-bold text-fs-text">Transfert dépôt → boutique</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2" aria-label="Fermer">
            <MdClose className="h-6 w-6" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <label className="text-[11px] font-semibold uppercase text-neutral-500">Boutique destination</label>
          <select className={fsInputClass + " mt-1"} value={toStoreId} onChange={(e) => setToStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs text-neutral-600">
            Produits « les deux » (catalogue + dépôt) — aligné Flutter.
          </p>
          <div className="mt-3 space-y-2">
            {lines.map((row, i) => {
              const depotLineProduct = row.productId
                ? transferProducts.find((p) => p.id === row.productId)
                : undefined;
              const depotLineImageUrl = depotLineProduct ? firstProductImageUrl(depotLineProduct) : null;
              return (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-black/6 bg-fs-card p-2">
                <div className="flex min-w-0 flex-1 items-end gap-2">
                  <ProductListThumbnail
                    imageUrl={depotLineImageUrl}
                    className="h-10 w-10 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-semibold uppercase text-neutral-500">Produit</span>
                    <select
                      className={fsInputClass + " mt-0.5 w-full text-sm"}
                      value={row.productId}
                      onChange={(e) => setLine(i, { productId: e.target.value })}
                    >
                      <option value="">—</option>
                      {transferProducts.map((p) => {
                        const st = warehouseQtyByProductId[p.id] ?? 0;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} (stock dépôt {st})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div className="w-24">
                  <span className="text-[10px] font-semibold uppercase text-neutral-500">Qté</span>
                  <input
                    className={fsInputClass + " mt-0.5 w-full"}
                    inputMode="numeric"
                    value={row.quantityRequested === 0 ? "" : String(row.quantityRequested)}
                    onChange={(e) =>
                      setLine(i, { quantityRequested: parseInt(e.target.value, 10) || 0 })
                    }
                  />
                </div>
                {lines.length > 1 ? (
                  <button type="button" onClick={() => removeLine(i)} className="p-2 text-red-600">
                    <MdDeleteOutline className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            );
            })}
          </div>
          <button type="button" onClick={addLine} className="mt-2 text-sm font-semibold text-fs-accent">
            + Ligne
          </button>
          <button
            type="button"
            onClick={submit}
            className="fs-touch-target mt-4 w-full rounded-[10px] bg-[#F97316] py-3.5 text-sm font-semibold text-white shadow-sm"
          >
            Créer le transfert
          </button>
        </div>
      </div>

      {stockProblems != null && stockProblems.length > 0 ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="alertdialog">
          <div className="max-h-[min(80dvh,400px)] w-full max-w-sm overflow-y-auto rounded-2xl bg-fs-surface p-4 shadow-xl">
            <p className="text-sm font-bold text-fs-text">Stock insuffisant</p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-700">
              Au dépôt, le stock ne permet pas ce transfert :
            </p>
            <ul className="mt-2 list-inside list-disc text-xs text-neutral-800">
              {stockProblems.map((p, i) => (
                <li key={i} className="py-0.5">
                  {p}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStockProblems(null)}
              className="mt-4 w-full rounded-xl bg-[#F97316] py-3 text-sm font-semibold text-white"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
