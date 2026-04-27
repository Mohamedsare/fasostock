"use client";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createCustomer, listCustomers } from "@/lib/features/customers/api";
import type { Customer } from "@/lib/features/customers/types";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import { listCategories, listProducts } from "@/lib/features/products/api";
import type { ProductItem } from "@/lib/features/products/types";
import { INVOICE_UNITS, defaultInvoiceUnitForProduct } from "@/lib/features/pos/invoice-units";
import { queryKeys } from "@/lib/query/query-keys";
import { readPosCartQtyUiForMode } from "@/lib/utils/pos-cart-settings";
import { warehouseCreateDispatchInvoice } from "@/lib/features/warehouse/api";
import type { WarehouseDispatchLineInput } from "@/lib/features/warehouse/types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { toast, toastMutationError } from "@/lib/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MdAdd,
  MdArrowBack,
  MdDeleteOutline,
  MdInventory2,
  MdPersonAdd,
  MdSearch,
} from "react-icons/md";
import { POS_Q, WhCategoryChipsRow, whPosFormFieldClass } from "./warehouse-pos-quick";

function isAvailableInWarehouse(p: ProductItem): boolean {
  const s = p.product_scope ?? "both";
  return s === "both" || s === "warehouse_only";
}

function nowIso() {
  return new Date().toISOString();
}

type DispatchCartRow = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  imageUrl: string | null;
};

/** Sortie dépôt — aligné `WarehouseDispatchInvoiceDialog` (Flutter) : Dialog sans bandeau orange, Card bandeau + PosMainArea, moitié / moitié, pied fusionné au scroll. */
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
  const lastStockToastAt = useRef(0);
  const stripCol1900 = useMediaQuery("(min-width: 1900px)");
  const stripCol1400 = useMediaQuery("(min-width: 1400px)");
  const stripMainExtent = stripCol1900 ? 172 : stripCol1400 ? 152 : 132;

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
  const categoriesQ = useQuery({
    queryKey: queryKeys.categories(companyId),
    queryFn: () => listCategories(companyId),
    enabled: open && Boolean(companyId),
  });
  const posCartUiQ = useQuery({
    queryKey: queryKeys.posCartSettingsMode("a4-table"),
    queryFn: () => readPosCartQtyUiForMode("a4-table"),
    enabled: open,
    staleTime: 0,
  });
  const posCartUi = posCartUiQ.data ?? { showQuantityInput: true, showQuantityButtons: false };

  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<DispatchCartRow[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pendingCustomers, setPendingCustomers] = useState<Customer[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId("");
    setNotes("");
    setCart([]);
    setSearch("");
    setCategoryId(null);
    setPendingCustomers([]);
    setCreateModalOpen(false);
    setCreateName("");
    setCreatePhone("");
  }, [open]);

  const products = productsQ.data ?? [];
  const serverCustomers = customersQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  const customersForUi = useMemo(() => {
    const base = [...serverCustomers].sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
    );
    const ids = new Set(base.map((c) => c.id));
    const extra = pendingCustomers.filter((c) => !ids.has(c.id));
    return [...base, ...extra];
  }, [serverCustomers, pendingCustomers]);

  const hasCustomers = customersForUi.length > 0;

  const whProducts = useMemo(
    () =>
      products
        .filter((p) => p.is_active && isAvailableInWarehouse(p))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [products],
  );

  const filteredStrip = useMemo(() => {
    const q = search.trim().toLowerCase();
    return whProducts.filter((p) => {
      const stock = warehouseQtyByProductId[p.id] ?? 0;
      if (stock <= 0) return false;
      if (categoryId && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").includes(q)
      );
    });
  }, [whProducts, warehouseQtyByProductId, categoryId, search]);

  function addToCartProduct(p: ProductItem) {
    const stock = warehouseQtyByProductId[p.id] ?? 0;
    if (stock <= 0) return;
    const unit = defaultInvoiceUnitForProduct(p.unit ?? undefined);
    setCart((prev) => {
      const idx = prev.findIndex((r) => r.productId === p.id);
      if (idx < 0) {
        return [
          ...prev,
          {
            productId: p.id,
            name: p.name,
            quantity: 1,
            unitPrice: Number(p.sale_price ?? 0),
            unit,
            imageUrl: firstProductImageUrl(p),
          },
        ];
      }
      const row = prev[idx]!;
      if (row.quantity + 1 > stock) {
        const now = Date.now();
        if (now - lastStockToastAt.current > 2000) {
          lastStockToastAt.current = now;
          queueMicrotask(() => toast.info("Quantité ajustée au stock disponible au dépôt."));
        }
        return prev;
      }
      const next = [...prev];
      next[idx] = { ...row, quantity: row.quantity + 1 };
      return next;
    });
  }

  function updateQty(productId: string, delta: number) {
    const stock = warehouseQtyByProductId[productId] ?? 0;
    setCart((prev) =>
      prev
        .map((r) => {
          if (r.productId !== productId) return r;
          const q = Math.max(0, Math.min(stock, r.quantity + delta));
          return { ...r, quantity: q };
        })
        .filter((r) => r.quantity > 0),
    );
  }

  function setQty(productId: string, q: number) {
    const stock = warehouseQtyByProductId[productId] ?? 0;
    const n = Math.max(0, Math.min(stock, Math.floor(q)));
    setCart((prev) =>
      prev
        .map((r) => (r.productId === productId ? { ...r, quantity: n } : r))
        .filter((r) => r.quantity > 0),
    );
  }

  function setUnitPriceRow(productId: string, price: number) {
    const p = Math.max(0, Math.round(price));
    setCart((prev) => prev.map((r) => (r.productId === productId ? { ...r, unitPrice: p } : r)));
  }

  function setUnitRow(productId: string, unit: string) {
    setCart((prev) => prev.map((r) => (r.productId === productId ? { ...r, unit } : r)));
  }

  function removeCartLine(productId: string) {
    setCart((prev) => prev.filter((r) => r.productId !== productId));
  }

  const grandTotal = useMemo(
    () => cart.reduce((s, r) => s + r.quantity * r.unitPrice, 0),
    [cart],
  );

  const canSubmit =
    !saving &&
    !creatingCustomer &&
    hasCustomers &&
    Boolean(customerId.trim()) &&
    cart.length > 0 &&
    whProducts.length > 0;

  async function submitCreateCustomer() {
    const name = createName.trim();
    if (name.length < 2) {
      toast.error("Au moins 2 lettres");
      return;
    }
    setCreatingCustomer(true);
    try {
      const newId = await createCustomer(companyId, {
        name,
        type: "individual",
        phone: createPhone.trim() || null,
        email: null,
        address: null,
        notes: null,
      });
      if (newId) {
        await qc.invalidateQueries({ queryKey: queryKeys.customers(companyId) });
        setCustomerId(newId);
        toast.success("Client ajouté. Vous pouvez continuer le bon.");
      } else {
        const pid = `pending:cust_${Date.now()}`;
        const t = nowIso();
        const pending: Customer = {
          id: pid,
          company_id: companyId,
          name,
          type: "individual",
          phone: createPhone.trim() || null,
          email: null,
          address: null,
          notes: null,
          created_at: t,
          updated_at: t,
        };
        setPendingCustomers((p) => [...p, pending]);
        setCustomerId(pid);
        toast.success("Client enregistré. Il sera envoyé à la reconnexion.");
      }
      setCreateModalOpen(false);
      setCreateName("");
      setCreatePhone("");
    } catch (e) {
      toastMutationError("warehouse-dispatch-customer", e);
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function submit() {
    if (!customerId.trim()) {
      toast.info("Choisissez d’abord la personne ou le client qui reçoit la marchandise.");
      return;
    }
    if (cart.length === 0) {
      toast.info("Ajoutez au moins un article depuis le bandeau.");
      return;
    }
    const out: WarehouseDispatchLineInput[] = [];
    for (const row of cart) {
      if (row.quantity <= 0) {
        toast.info("Indiquez une quantité correcte pour chaque article.");
        return;
      }
      if (row.unitPrice < 0) {
        toast.info("Indiquez un prix correct pour chaque article.");
        return;
      }
      const stock = warehouseQtyByProductId[row.productId] ?? 0;
      if (row.quantity > stock) {
        toast.info(`Pas assez de stock pour « ${row.name} ». Disponible : ${stock}.`);
        return;
      }
      out.push({
        productId: row.productId,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
      });
    }
    if (customerId.startsWith("pending:")) {
      toast.info("Reconnectez-vous pour synchroniser le client créé hors ligne, puis enregistrez le bon.");
      return;
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
      setCart([]);
      setSearch("");
      setCategoryId(null);
    } catch (e) {
      toastMutationError("warehouse-dispatch", e);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const customerSelectKey =
    customerId.trim() && customersForUi.some((c) => c.id === customerId) ? customerId : "";

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-2.5 py-[18px] sm:px-2.5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wh-dispatch-panel-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !saving) onClose();
        }}
      >
        <div
          className="flex h-[min(94vh,96dvh)] w-full max-w-[640px] flex-col overflow-hidden rounded-none bg-white shadow-2xl min-[900px]:max-w-[1200px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Moitié supérieure : bandeau type PosMainArea (Flutter Card + strip) */}
            <div className="flex min-h-0 flex-[1_1_50%] flex-col overflow-y-auto overflow-x-hidden border-b border-[#E5E7EB]">
              <div className="px-3 pb-0 pt-2">
                <div
                  className={cn(
                    "overflow-hidden rounded-[14px] border border-[#E5E7EB]/90 bg-white shadow-sm",
                  )}
                >
                  <div className="flex flex-col gap-1 px-3 pb-0 pt-1 min-[900px]:px-3 min-[900px]:pt-1.5">
                    <div className="flex items-stretch gap-2 min-[900px]:gap-3">
                      <button
                        type="button"
                        title="Fermer"
                        disabled={saving}
                        onClick={onClose}
                        className="inline-flex h-[42px] w-11 shrink-0 items-center justify-center rounded-xl bg-[#F97316] text-white shadow-sm transition hover:opacity-95 disabled:opacity-40 min-[900px]:w-12"
                        aria-label="Fermer"
                      >
                        <MdArrowBack className="h-6 w-6 text-white" aria-hidden />
                      </button>
                      <div className="relative min-h-[42px] min-w-0 flex-1">
                        <MdSearch
                          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-5 w-5 -translate-y-1/2 text-[#F97316] min-[900px]:left-4 min-[900px]:h-6 min-[900px]:w-6"
                          aria-hidden
                        />
                        <input
                          className={fsInputClass(
                            "h-[42px] w-full rounded-xl border-[#E5E7EB] bg-[#F3F4F6] py-0.5 pl-11 pr-3 text-sm leading-snug text-[#1F2937] placeholder:text-[#1F2937]/50 min-[900px]:pl-12 min-[900px]:text-[15px]",
                          )}
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Rechercher…"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <div className="flex shrink-0 items-stretch gap-2">
                        <select
                          key={customerSelectKey || "none"}
                          className={fsInputClass(
                            "h-[42px] min-w-[140px] max-w-[180px] rounded-xl border-[#E5E7EB] bg-[#F3F4F6] px-2.5 text-sm text-[#1F2937] min-[900px]:min-w-[180px] min-[900px]:text-[14px]",
                          )}
                          value={
                            customerId && customersForUi.some((c) => c.id === customerId) ? customerId : ""
                          }
                          onChange={(e) => setCustomerId(e.target.value)}
                          aria-label="Client"
                        >
                          <option value="">Client</option>
                          {customersForUi.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          title="Créer un client"
                          disabled={saving || creatingCustomer}
                          onClick={() => {
                            setCreateName("");
                            setCreatePhone("");
                            setCreateModalOpen(true);
                          }}
                          className="inline-flex h-[42px] w-11 shrink-0 items-center justify-center rounded-xl bg-[#F97316] text-white shadow-sm transition hover:opacity-95 disabled:opacity-50 min-[900px]:w-12"
                        >
                          <MdPersonAdd className="h-[22px] w-[22px]" aria-hidden />
                        </button>
                      </div>
                    </div>
                    <WhCategoryChipsRow categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
                  </div>
                  <div className="min-h-[120px] max-h-[min(360px,42vh)] overflow-x-auto overflow-y-hidden px-3 pb-3 [-ms-overflow-style:auto] [scrollbar-width:thin]">
                    {filteredStrip.length === 0 ? (
                      <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-sm text-neutral-600">
                        {search.trim() ? "Aucun résultat" : "Aucun produit actif"}
                      </div>
                    ) : (
                      <div
                        className="grid h-full min-h-[220px] grid-flow-col grid-rows-2 gap-2.5 py-1 content-start"
                        style={{ gridAutoColumns: stripMainExtent }}
                      >
                        {filteredStrip.map((p) => {
                          const stock = warehouseQtyByProductId[p.id] ?? 0;
                          const thumb = p.product_images?.[0]?.url ?? null;
                          const price = Number(p.sale_price ?? 0);
                          const priceLine =
                            stock >= 0 ? `${formatCurrency(price)} · ${stock}` : formatCurrency(price);
                          const noStock = stock <= 0;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={noStock}
                              onClick={() => {
                                if (!noStock) addToCartProduct(p);
                              }}
                              className={cn(
                                "flex min-h-0 w-full flex-col items-center rounded-[14px] border bg-white px-1.5 py-1.5 text-center transition active:scale-[0.98]",
                                noStock
                                  ? "border-[#E5E7EB] opacity-45"
                                  : "border-[1.5px] border-[#F97316]/35 shadow-[0_2px_8px_rgba(249,115,22,0.08)]",
                              )}
                            >
                              <div className="mx-auto flex h-[52px] w-full max-w-[4.75rem] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F8F9FA]">
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumb}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <MdInventory2 className="h-6 w-6 text-[#F97316]/70" aria-hidden />
                                )}
                              </div>
                              <p
                                className="mt-1 line-clamp-2 w-full flex-1 px-0.5 text-center text-[10px] font-semibold leading-tight text-[#1F2937] sm:text-[11px]"
                                title={p.name}
                              >
                                {p.name}
                              </p>
                              <p
                                className="mt-0.5 w-full truncate px-0.5 text-center text-[10px] font-bold text-[#F97316]"
                                title={priceLine}
                              >
                                {priceLine}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Moitié inférieure : PosCartPanel (Flutter) — titre seul, scroll fusionné corps + pied */}
            <div
              className="flex min-h-0 flex-[1_1_50%] flex-col overflow-hidden"
              style={{ backgroundColor: POS_Q.bg2 }}
            >
              <p
                id="wh-dispatch-panel-title"
                className="shrink-0 px-4 pb-2.5 pt-3.5 text-[20px] font-bold leading-tight text-[#1F2937]"
              >
                Facture / sortie dépôt
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-ms-overflow-style:auto] [scrollbar-width:thin]">
                <div className="px-2 pb-3 min-[900px]:px-3">
                  {cart.length === 0 ? (
                    <p className="py-10 text-center text-base leading-snug text-neutral-600">
                      Ajoutez des produits depuis le bandeau ci‑dessus.
                      <br />
                      Les lignes s’affichent en tableau comme sur la caisse « Facture tab. ».
                    </p>
                  ) : (
                    <div className="overflow-x-auto pb-2">
                      <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-[#F8F9FA] text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                            <th className="py-2 pl-1 pr-2">Article</th>
                            <th className="w-[88px] py-2 px-1">Unité</th>
                            <th className="w-[100px] py-2 px-1">Qté</th>
                            <th className="w-[100px] py-2 px-1">P.U.</th>
                            <th className="w-[100px] py-2 px-1 text-right">Total</th>
                            <th className="w-10 py-2 pr-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {cart.map((c) => {
                            const stock = warehouseQtyByProductId[c.productId] ?? 0;
                            const low = stock >= 0 && c.quantity > stock;
                            const unitVal = INVOICE_UNITS.includes(c.unit as (typeof INVOICE_UNITS)[number])
                              ? c.unit
                              : "pce";
                            return (
                              <tr
                                key={c.productId}
                                className={cn(
                                  "border-b border-[#E5E7EB] bg-white",
                                  low && "bg-red-50/90",
                                )}
                              >
                                <td className="max-w-[180px] py-2 pl-1 pr-2 align-middle">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-[#F8F9FA]">
                                      {c.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <MdInventory2 className="m-auto h-5 w-5 text-[#F97316]/70" aria-hidden />
                                      )}
                                    </div>
                                    <span className="truncate font-semibold text-[#1F2937]">{c.name}</span>
                                  </div>
                                  {low ? (
                                    <p className="mt-1 text-[11px] text-red-600">Stock : {stock}</p>
                                  ) : null}
                                </td>
                                <td className="py-1 align-middle">
                                  <select
                                    className="w-full max-w-[84px] rounded-lg border border-[#E5E7EB] bg-[#F3F4F6] px-1 py-1.5 text-[12px] text-[#1F2937]"
                                    value={unitVal}
                                    onChange={(e) => setUnitRow(c.productId, e.target.value)}
                                  >
                                    {INVOICE_UNITS.map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2 align-middle">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {posCartUi.showQuantityButtons ? (
                                      <button
                                        type="button"
                                        onClick={() => updateQty(c.productId, -1)}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F8F9FA] text-[#1F2937]"
                                        aria-label="Moins"
                                      >
                                        <span className="text-base leading-none">−</span>
                                      </button>
                                    ) : null}
                                    {posCartUi.showQuantityInput ? (
                                      <input
                                        className="w-16 rounded-lg border border-[#E5E7EB] px-1 py-1 text-center text-[13px] tabular-nums"
                                        inputMode="numeric"
                                        value={c.quantity === 0 ? "" : String(c.quantity)}
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value, 10);
                                          if (Number.isNaN(v)) setQty(c.productId, 0);
                                          else setQty(c.productId, v);
                                        }}
                                        onBlur={(e) => {
                                          const v = parseInt(e.target.value, 10);
                                          if (!Number.isFinite(v) || v < 1) setQty(c.productId, 1);
                                        }}
                                      />
                                    ) : (
                                      <span className="min-w-[28px] text-center text-[14px] font-bold">{c.quantity}</span>
                                    )}
                                    {posCartUi.showQuantityButtons ? (
                                      <button
                                        type="button"
                                        onClick={() => updateQty(c.productId, 1)}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F97316] text-white"
                                        aria-label="Plus"
                                      >
                                        <MdAdd className="h-4 w-4" />
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="py-2 align-middle">
                                  <input
                                    className="w-[88px] rounded-lg border border-[#E5E7EB] px-1 py-1 text-right text-[13px] tabular-nums"
                                    inputMode="numeric"
                                    value={String(Math.round(c.unitPrice))}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value.replace(",", "."));
                                      if (Number.isFinite(v)) setUnitPriceRow(c.productId, v);
                                    }}
                                  />
                                </td>
                                <td className="py-2 align-middle text-right font-bold text-[#F97316]">
                                  {formatCurrency(c.quantity * c.unitPrice)}
                                </td>
                                <td className="py-2 align-middle pr-1">
                                  <button
                                    type="button"
                                    onClick={() => removeCartLine(c.productId)}
                                    className="p-1 text-red-600"
                                    aria-label="Supprimer"
                                  >
                                    <MdDeleteOutline className="h-5 w-5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div
                  className="border-t border-[#E5E7EB] px-4 py-3 shadow-[0_-4px_4px_rgba(0,0,0,0.06)]"
                  style={{
                    backgroundColor: POS_Q.bg2,
                    paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
                  }}
                >
                  <label className="mb-1 block text-[11px] font-medium text-[#1F2937]">
                    Note (facultatif)
                  </label>
                  <textarea
                    className={cn(whPosFormFieldClass, "min-h-[52px] resize-y")}
                    placeholder="Motif de sortie, précisions…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={saving}
                  />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[18px] font-bold text-[#1F2937]">Total</span>
                    <span className="text-[22px] font-extrabold tabular-nums text-[#F97316]">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!canSubmit || saving}
                    onClick={() => void submit()}
                    className="mt-2.5 min-h-[52px] w-full rounded-[10px] bg-[#F97316] py-3 text-base font-bold text-white disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : !hasCustomers ? (
                      "Ajoutez d’abord un client"
                    ) : cart.length === 0 ? (
                      "Ajoutez des articles"
                    ) : !customerId.trim() ? (
                      "Choisissez le client (bandeau)"
                    ) : (
                      "Enregistrer le bon de sortie"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {createModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wh-new-cust-title"
          >
            <h2 id="wh-new-cust-title" className="text-lg font-bold text-[#1F2937]">
              Nouveau client
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Renseignez au minimum le nom. Le téléphone aide à le retrouver.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#1F2937]">Nom complet *</label>
                <input
                  className={whPosFormFieldClass}
                  placeholder="Ex. : Amadou Diallo"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#1F2937]">Téléphone</label>
                <input
                  className={whPosFormFieldClass}
                  placeholder="Facultatif"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !creatingCustomer && setCreateModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-[#1F2937] hover:bg-neutral-100"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={creatingCustomer}
                onClick={() => void submitCreateCustomer()}
                className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {creatingCustomer ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
