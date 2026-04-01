"use client";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createCustomer, listCustomers } from "@/lib/features/customers/api";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import { listCategories, listProducts } from "@/lib/features/products/api";
import type { ProductItem } from "@/lib/features/products/types";
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
  MdDeleteOutline,
  MdInventory2,
  MdPersonAdd,
  MdSearch,
  MdWarningAmber,
} from "react-icons/md";
import { POS_Q, WarehousePosQuickHeader, WhCategoryChipsRow, whPosFormFieldClass } from "./warehouse-pos-quick";

function isAvailableInWarehouse(p: ProductItem): boolean {
  const s = p.product_scope ?? "both";
  return s === "both" || s === "warehouse_only";
}

type DispatchCartRow = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  imageUrl: string | null;
};

/** Sortie dépôt — aligné app mobile : bandeau produits + tableau moitié / moitié (comme POS facture tab). */
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
  const [creatingName, setCreatingName] = useState("");
  const [creatingPhone, setCreatingPhone] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId("");
    setNotes("");
    setCart([]);
    setSearch("");
    setCategoryId(null);
    setShowCreate(false);
    setCreatingName("");
    setCreatingPhone("");
  }, [open]);

  const products = productsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const whProducts = useMemo(
    () =>
      products
        .filter((p) => p.is_active && isAvailableInWarehouse(p))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [products],
  );

  const customers = customersQ.data ?? [];
  const hasCustomers = customers.length > 0;

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
            unit: p.unit || "pce",
            imageUrl: firstProductImageUrl(p),
          },
        ];
      }
      const row = prev[idx];
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

  const cartCount = cart.reduce((n, r) => n + r.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-1.5 min-[900px]:p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wh-dispatch-title"
    >
      <div className="flex h-[min(96dvh,94svh)] w-full max-w-[1200px] flex-col overflow-hidden rounded-none bg-white shadow-2xl min-[900px]:h-[min(94vh,92dvh)]">
        <WarehousePosQuickHeader
          titleId="wh-dispatch-title"
          title="Facture / sortie dépôt"
          subtitle="Même disposition que la caisse « Facture (tableau) »"
          onClose={onClose}
          closeDisabled={saving}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Moitié supérieure : recherche, client, catégories, bandeau produits */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-[#E5E7EB] bg-white">
            {!hasCustomers ? (
              <div className="shrink-0 space-y-2 px-2.5 pt-2 min-[900px]:px-4">
                <div className="rounded-[10px] border border-neutral-200 bg-red-50/40 p-2.5">
                  <div className="flex flex-col items-center text-center">
                    <MdWarningAmber className="h-7 w-7 text-red-600" aria-hidden />
                    <p className="mt-1 text-[12px] font-bold text-[#1F2937]">
                      Aucun client enregistré pour l’instant.
                    </p>
                  </div>
                </div>
                {!showCreate ? (
                  <button
                    type="button"
                    disabled={creatingCustomer}
                    onClick={() => setShowCreate(true)}
                    className="flex min-h-[40px] w-full items-center justify-center gap-1 rounded-[10px] bg-[#F97316] py-2 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    {creatingCustomer ? (
                      <span className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <MdPersonAdd className="h-[18px] w-[18px] shrink-0" aria-hidden />
                        Créer un client maintenant
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-1.5 rounded-[10px] border border-[#E5E7EB] bg-white p-2">
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
                      className="min-h-[40px] w-full rounded-[10px] bg-[#F97316] py-2 text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      Enregistrer
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="shrink-0 space-y-2 px-2.5 pt-2 min-[900px]:px-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2.5">
                  <div className="relative min-h-10 min-w-0 flex-1">
                    <MdSearch
                      className="pointer-events-none absolute left-2 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[#F97316]"
                      aria-hidden
                    />
                    <input
                      className={fsInputClass(
                        "h-10 w-full rounded-lg border-[#E5E7EB] bg-white py-1 pl-8 pr-2.5 text-[13px] leading-snug text-[#1F2937] placeholder:text-[#1F2937]/50",
                      )}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <select
                      className={fsInputClass(
                        "h-12 min-w-0 flex-1 rounded-xl border-[#E5E7EB] bg-white px-2 py-1.5 text-sm text-[#1F2937] sm:min-w-[140px] md:min-w-[180px]",
                      )}
                      value={
                        customerId && customers.some((c) => c.id === customerId) ? customerId : ""
                      }
                      onChange={(e) => setCustomerId(e.target.value)}
                      aria-label="Client"
                    >
                      <option value="">—</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title="Créer un client"
                      onClick={() => setShowCreate((s) => !s)}
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F97316] text-white shadow-sm transition hover:opacity-95"
                    >
                      <MdPersonAdd className="h-[22px] w-[22px]" aria-hidden />
                    </button>
                  </div>
                </div>
                {showCreate ? (
                  <div className="space-y-1.5 rounded-[10px] border border-[#E5E7EB] bg-white p-2">
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
                      className="min-h-[40px] w-full rounded-[10px] bg-[#F97316] py-2 text-[12px] font-bold text-white disabled:opacity-50"
                    >
                      {creatingCustomer ? "…" : "Enregistrer le client"}
                    </button>
                  </div>
                ) : null}
                <WhCategoryChipsRow categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
              </div>
            )}

            {hasCustomers ? (
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-2 pb-2 min-[900px]:px-4 [-ms-overflow-style:auto] [scrollbar-width:thin]">
                {filteredStrip.length === 0 ? (
                  <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-sm text-neutral-600">
                    {search.trim() ? "Aucun résultat" : "Aucun produit en stock au dépôt"}
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
            ) : null}
          </div>

          {/* Moitié inférieure : tableau + note + total */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ backgroundColor: POS_Q.bg2 }}>
            <p className="shrink-0 px-3 pb-1 pt-2 text-base font-bold text-[#1F2937] min-[900px]:px-4 min-[900px]:pt-3">
              Facture / sortie dépôt · {cartCount} article{cartCount !== 1 ? "s" : ""}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 min-[900px]:px-3">
              {cart.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-600">
                  Ajoutez des produits depuis le bandeau ci-dessus. Les lignes s&apos;affichent en tableau, comme sur la
                  caisse « Facture tab. ».
                </p>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] bg-[#F8F9FA] text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                        <th className="py-2 pl-1 pr-2">Article</th>
                        <th className="w-[72px] py-2 px-1">Unité</th>
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
                            <td className="py-2 align-middle text-[12px] text-[#1F2937]">{c.unit}</td>
                            <td className="py-2 align-middle">
                              <div className="flex flex-wrap items-center gap-1">
                                {posCartUi.showQuantityButtons ? (
                                  <button
                                    type="button"
                                    onClick={() => updateQty(c.productId, -1)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F8F9FA] text-[#1F2937]"
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
                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F97316] text-white"
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
              className="shrink-0 border-t border-[#E5E7EB] shadow-[0_-4px_4px_rgba(0,0,0,0.06)]"
              style={{ backgroundColor: POS_Q.bg2, paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
            >
              <div className="px-2.5 pt-2 min-[900px]:px-4">
                <label className={cn("mb-1 block text-[11px] font-medium text-[#1F2937]")}>Note (facultatif)</label>
                <textarea
                  className={cn(whPosFormFieldClass, "min-h-[52px] resize-y")}
                  placeholder="Motif de sortie, précisions…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={saving}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[16px] font-bold text-[#1F2937]">Total</span>
                  <span className="text-[18px] font-extrabold tabular-nums text-[#F97316] min-[900px]:text-[22px]">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!canSubmit || saving}
                  onClick={submit}
                  className="mt-2 min-h-[44px] w-full rounded-[10px] bg-[#F97316] py-3 text-[15px] font-bold text-white disabled:opacity-50"
                >
                  {saving ? (
                    <span className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : !hasCustomers ? (
                    "Ajoutez d’abord un client"
                  ) : cart.length === 0 ? (
                    "Ajoutez des articles"
                  ) : !customerId.trim() ? (
                    "Choisissez le client"
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
  );
}
