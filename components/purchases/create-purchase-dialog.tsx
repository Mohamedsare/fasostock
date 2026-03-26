"use client";

import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useEffect, useMemo, useState } from "react";
import {
  MdAdd,
  MdAddShoppingCart,
  MdArrowDropDown,
  MdClose,
  MdDeleteOutline,
  MdErrorOutline,
  MdPayment,
} from "react-icons/md";

type SupplierLite = { id: string; name: string };
type ProductLite = {
  id: string;
  name: string;
  unit: string;
  purchasePrice: number;
  imageUrl?: string | null;
};

export type PurchasePaymentMethod =
  | "cash"
  | "transfer"
  | "mobile_money"
  | "card"
  | "other";

function paymentLabel(m: PurchasePaymentMethod): string {
  switch (m) {
    case "cash":
      return "Espèces";
    case "transfer":
      return "Virement";
    case "mobile_money":
      return "Mobile money";
    case "card":
      return "Carte";
    case "other":
      return "Autre";
    default:
      return m;
  }
}

const PAYMENT_METHODS: PurchasePaymentMethod[] = [
  "cash",
  "transfer",
  "mobile_money",
  "card",
  "other",
];

type LineRow = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type CreatePurchasePayload = {
  storeId: string;
  supplierId: string;
  reference: string | null;
  items: { productId: string; productName: string; quantity: number; unitPrice: number }[];
  payments: { method: string; amount: number }[] | null;
};

export function CreatePurchaseDialog({
  open,
  onClose,
  stores,
  initialStoreId,
  suppliers,
  products,
  productsError,
  productsLoading,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  stores: { id: string; name: string }[];
  initialStoreId: string | null;
  suppliers: SupplierLite[];
  products: ProductLite[];
  productsError?: unknown;
  productsLoading: boolean;
  onCreate: (payload: CreatePurchasePayload) => Promise<void> | void;
}) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<LineRow[]>([
    { productId: "", quantity: 0, unitPrice: 0 },
  ]);
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>("transfer");
  const [paymentAmount, setPaymentAmount] = useState("0");
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 600px)");
    setIsNarrow(m.matches);
    const fn = () => setIsNarrow(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (!open) return;
    const ids = new Set(stores.map((s) => s.id));
    let sid: string | null = stores[0]?.id ?? null;
    if (initialStoreId && ids.has(initialStoreId)) sid = initialStoreId;
    setStoreId(sid);
    setSupplierId(suppliers[0]?.id ?? null);
    setReference("");
    setLines([{ productId: "", quantity: 0, unitPrice: 0 }]);
    setPaymentMethod("transfer");
    setPaymentAmount("0");
    setPaymentSheetOpen(false);
    setBusy(false);
    setError(null);
  }, [open, stores, initialStoreId, suppliers]);

  const productById = useMemo(() => {
    const m = new Map<string, ProductLite>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const total = useMemo(() => {
    return lines.reduce((s, l) => s + Math.max(0, l.quantity) * Math.max(0, l.unitPrice), 0);
  }, [lines]);

  const effectiveStoreId =
    storeId && stores.some((s) => s.id === storeId) ? storeId : stores[0]?.id ?? null;

  const effectiveSupplierId =
    supplierId && suppliers.some((s) => s.id === supplierId) ? supplierId : null;

  const canSubmit =
    Boolean(effectiveStoreId) &&
    Boolean(effectiveSupplierId) &&
    lines.some((l) => l.productId && l.quantity > 0 && l.unitPrice >= 0);

  function updateLine(i: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function setLineProduct(i: number, productId: string | null) {
    if (!productId) {
      updateLine(i, { productId: "", unitPrice: 0 });
      return;
    }
    const p = productById.get(productId);
    if (!p) return;
    updateLine(i, {
      productId: p.id,
      unitPrice: p.purchasePrice,
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: "", quantity: 0, unitPrice: 0 }]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, j) => j !== i));
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-purchase-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <FsCard className="max-h-[min(92dvh,720px)] w-full max-w-[500px] overflow-hidden rounded-t-2xl sm:rounded-2xl" padding="p-3 sm:p-4">
          <div className="flex max-h-[min(85dvh,680px)] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-black/6 pb-3">
              <h2
                id="create-purchase-title"
                className="flex items-center gap-2.5 text-lg font-semibold text-fs-text"
              >
                <MdAddShoppingCart className="h-6 w-6 shrink-0 text-fs-accent" aria-hidden />
                Nouvel achat
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-neutral-700"
                aria-label="Fermer"
              >
                <MdClose className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-3">
              {productsError ? (
                <div className="mb-3 flex gap-2 rounded-lg border border-red-200/80 bg-red-50/90 p-3 text-sm text-red-800">
                  <MdErrorOutline className="mt-0.5 h-5 shrink-0" aria-hidden />
                  <span>Erreur chargement produits</span>
                </div>
              ) : null}

              <div
                className={cn("flex gap-3", isNarrow ? "flex-col" : "flex-row")}
              >
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Boutique *</label>
                  <select
                    className={fsInputClass("rounded-[10px] border border-black/8")}
                    value={effectiveStoreId ?? ""}
                    onChange={(e) => setStoreId(e.target.value || null)}
                  >
                    <option value="">—</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Fournisseur *</label>
                  <select
                    className={fsInputClass("rounded-[10px] border border-black/8")}
                    value={effectiveSupplierId ?? ""}
                    onChange={(e) => setSupplierId(e.target.value || null)}
                  >
                    <option value="">—</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  Référence (optionnel)
                </label>
                <input
                  className={fsInputClass("rounded-[10px] border border-black/8")}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-fs-text">Articles</p>
                {productsLoading ? (
                  <span className="text-xs text-neutral-500">Chargement…</span>
                ) : (
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-fs-accent"
                  >
                    <MdAdd className="h-4 w-4" aria-hidden />
                    Ligne
                  </button>
                )}
              </div>

              <div
                className="mt-2 max-h-[220px] overflow-y-auto rounded-[10px] border border-black/8"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {lines.map((line, i) => {
                  const lineTotal = Math.max(0, line.quantity) * Math.max(0, line.unitPrice);
                  return (
                    <div
                      key={i}
                      className="flex flex-col gap-2 border-b border-black/6 p-2 last:border-b-0 sm:flex-row sm:items-start"
                    >
                      <div className="flex min-w-0 flex-1 gap-2 sm:flex-[2]">
                        <ProductListThumbnail
                          imageUrl={
                            line.productId ? productById.get(line.productId)?.imageUrl ?? null : null
                          }
                          className="h-10 w-10 shrink-0 rounded-lg"
                        />
                        <select
                          className={cn(fsInputClass("min-w-0 flex-1 text-xs sm:text-sm"), "w-full")}
                          value={line.productId || ""}
                          onChange={(e) => setLineProduct(i, e.target.value || null)}
                        >
                          <option value="">Produit</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
                        <input
                          inputMode="numeric"
                          className={cn(fsInputClass("w-[4.5rem] text-xs"), "sm:w-[70px]")}
                          placeholder="Qté"
                          value={line.quantity === 0 ? "" : String(line.quantity)}
                          onChange={(e) =>
                            updateLine(i, { quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })
                          }
                        />
                        <input
                          inputMode="decimal"
                          className={cn(fsInputClass("w-[5.5rem] text-xs"), "sm:w-[90px]")}
                          placeholder="Prix unit."
                          value={line.unitPrice === 0 ? "" : String(line.unitPrice)}
                          onChange={(e) =>
                            updateLine(i, {
                              unitPrice: Number(e.target.value.replace(",", ".")) || 0,
                            })
                          }
                        />
                        <span className="w-[72px] shrink-0 pt-2 text-xs font-semibold text-neutral-700 sm:pl-1">
                          {formatCurrency(lineTotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          disabled={lines.length <= 1}
                          className="p-2 text-red-600 disabled:opacity-30"
                          aria-label="Supprimer la ligne"
                        >
                          <MdDeleteOutline className="h-5 w-5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <button
                  type="button"
                  onClick={() => setPaymentSheetOpen(true)}
                  className={cn(
                    fsInputClass(
                      "flex min-h-[48px] items-center justify-between text-left text-sm",
                    ),
                  )}
                >
                  <span>
                    <span className="block text-[11px] font-medium text-neutral-500">Paiement</span>
                    <span className="font-medium text-fs-text">{paymentLabel(paymentMethod)}</span>
                  </span>
                  <MdArrowDropDown className="h-6 w-6 text-neutral-500" aria-hidden />
                </button>
                <input
                  inputMode="decimal"
                  className={fsInputClass("sm:max-w-[120px]")}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Montant"
                  aria-label="Montant paiement"
                />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-black/6 pt-4">
                <span className="text-base font-bold text-fs-text">Total</span>
                <span className="text-base font-bold text-fs-accent">{formatCurrency(total)}</span>
              </div>

              {error ? (
                <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-black/6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-0">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="min-h-[44px] rounded-[10px] px-4 py-2.5 text-sm font-semibold text-fs-accent"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy || !canSubmit}
                onClick={async () => {
                  setError(null);
                  if (!effectiveStoreId || !effectiveSupplierId) {
                    setError("Sélectionnez une boutique et un fournisseur.");
                    return;
                  }
                  const items = lines
                    .filter((l) => l.productId && l.quantity > 0 && l.unitPrice >= 0)
                    .map((l) => {
                      const p = productById.get(l.productId)!;
                      return {
                        productId: l.productId,
                        productName: p.name,
                        quantity: l.quantity,
                        unitPrice: l.unitPrice,
                      };
                    });
                  if (items.length === 0) {
                    setError("Ajoutez au moins un article avec quantité et prix.");
                    return;
                  }
                  const payAmt = Number(paymentAmount.replace(",", ".")) || 0;
                  const payments =
                    payAmt > 0
                      ? [{ method: paymentMethod, amount: payAmt }]
                      : null;
                  try {
                    setBusy(true);
                    await onCreate({
                      storeId: effectiveStoreId,
                      supplierId: effectiveSupplierId,
                      reference: reference.trim() || null,
                      items,
                      payments,
                    });
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Création impossible.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex min-h-[44px] min-w-[160px] items-center justify-center rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? (
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  "Créer (brouillon)"
                )}
              </button>
            </div>
          </div>
        </FsCard>
      </div>

      {paymentSheetOpen ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40 sm:items-center sm:justify-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPaymentSheetOpen(false);
          }}
        >
          <div
            className="max-h-[70dvh] w-full overflow-y-auto rounded-t-2xl bg-fs-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-4"
            role="listbox"
            aria-label="Mode de paiement"
          >
            <p className="mb-2 text-base font-semibold text-fs-text">Mode de paiement</p>
            <div className="flex flex-col gap-0">
              {PAYMENT_METHODS.map((m) => {
                const sel = m === paymentMethod;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(m);
                      setPaymentSheetOpen(false);
                    }}
                    className={cn(
                      "flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-fs-surface-container",
                      sel ? "text-fs-accent" : "text-fs-text",
                    )}
                  >
                    {sel ? (
                      <MdPayment className="h-6 w-6 shrink-0 text-fs-accent" aria-hidden />
                    ) : (
                      <MdPayment className="h-6 w-6 shrink-0 text-neutral-400" aria-hidden />
                    )}
                    <span className="text-base font-medium">{paymentLabel(m)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
