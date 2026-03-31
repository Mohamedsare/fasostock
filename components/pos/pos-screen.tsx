"use client";

import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createCustomer } from "@/lib/features/customers/api";
import { P } from "@/lib/constants/permissions";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { createPosSale, fetchPosData } from "@/lib/features/pos/api";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { ROUTES } from "@/lib/config/routes";
import { queryKeys } from "@/lib/query/query-keys";
import { readPosCartQtyUiForMode } from "@/lib/utils/pos-cart-settings";
import { ensureStringNumberMap } from "@/lib/utils/string-number-map";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { InvoicePostSaleDialog } from "@/components/invoices/invoice-post-sale-dialog";
import { PosBarcodeScannerDialog } from "@/components/pos/pos-barcode-scanner-dialog";
import { ReceiptTicketDialog } from "@/components/pos/receipt-ticket-dialog";
import type { InvoiceA4Data } from "@/lib/features/invoices/invoice-a4-types";
import { printInvoicePdf } from "@/lib/features/invoices/generate-invoice-pdf";
import {
  buildReceiptTicketData,
  type PosReceiptSnap,
} from "@/lib/features/receipt/build-receipt-ticket-data";
import { generateReceiptThermalPdfBlob } from "@/lib/features/receipt/generate-receipt-thermal-pdf";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  MdAdd,
  MdArrowBack,
  MdClose,
  MdDeleteOutline,
  MdDescription,
  MdHistory,
  MdInventory2,
  MdLogout,
  MdLock,
  MdPayments,
  MdPersonAdd,
  MdPrint,
  MdQrCodeScanner,
  MdReceiptLong,
  MdRefresh,
  MdSearch,
  MdSettings,
  MdStore,
} from "react-icons/md";

type PosMode = "quick" | "a4";
type CartRow = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  imageUrl?: string | null;
};

function isBoutiqueScope(scope: string | null | undefined): boolean {
  const s = scope ?? "both";
  return s === "both" || s === "boutique_only";
}
type PaymentMethod = "cash" | "mobile_money" | "card" | "other";
type QuickPayment = "cash" | "mobile_money" | "card";

export function PosScreen({ storeId, mode }: { storeId: string; mode: PosMode }) {
  const qc = useQueryClient();
  const { data: ctx, hasPermission, isLoading: permLoading } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [quickPayment, setQuickPayment] = useState<QuickPayment>("cash");
  const [discount, setDiscount] = useState("0");
  const [amountReceived, setAmountReceived] = useState("");
  const [amountReceivedTouched, setAmountReceivedTouched] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [cartOpen, setCartOpen] = useState(false);
  const [invoiceDialog, setInvoiceDialog] = useState<InvoiceA4Data | null>(null);
  const [receiptDialog, setReceiptDialog] = useState<ReceiptTicketData | null>(null);
  const [quickAutoPrint, setQuickAutoPrint] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const router = useRouter();
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  );

  const isWide = useMediaQuery("(min-width: 900px)");
  const lastStockToastAt = useRef(0);

  const profileNameQ = useQuery({
    queryKey: ["pos-profile-name"] as const,
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const n = (data as { full_name?: string | null } | null)?.full_name?.trim();
      return n || null;
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      setQuickAutoPrint(localStorage.getItem("pos_quick_auto_print") === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const canQuick = hasPermission(P.salesCreate);
  const canA4 = hasPermission(P.salesInvoiceA4) || hasPermission(P.salesCreate);
  const canAccess = mode === "quick" ? canQuick : canA4;

  const posQ = useQuery({
    queryKey: ["pos", mode, companyId, storeId] as const,
    queryFn: () =>
      fetchPosData({
        companyId,
        storeId,
        withCustomers: mode === "a4",
      }),
    enabled: Boolean(companyId && storeId && canAccess),
    staleTime: 20_000,
    refetchInterval: mode === "quick" ? 15_000 : false,
  });

  const store = posQ.data?.store ?? null;
  const products = posQ.data?.products ?? [];
  const stockByProductId = useMemo(
    () => ensureStringNumberMap(posQ.data?.stockByProductId),
    [posQ.data?.stockByProductId],
  );
  const categories = posQ.data?.categories ?? [];
  const customers = posQ.data?.customers ?? [];
  const showDiscountField = store?.pos_discount_enabled === true;
  const currencyLabel = store?.currency?.trim() || "XOF";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.is_active) return false;
      if (!isBoutiqueScope(p.product_scope)) return false;
      const stock = stockByProductId.get(p.id) ?? 0;
      if (stock <= 0) return false;
      if (categoryId && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").includes(q)
      );
    });
  }, [products, stockByProductId, categoryId, search]);

  const subtotal = useMemo(
    () => cart.reduce((sum, r) => sum + r.quantity * r.unitPrice, 0),
    [cart],
  );
  const discountValue = Math.max(0, toNumber(discount));
  const total = Math.max(0, subtotal - discountValue);
  const amountReceivedValue = Math.max(0, toNumber(amountReceived));
  const change =
    mode === "quick" && quickPayment === "cash" && amountReceivedValue >= total
      ? amountReceivedValue - total
      : Math.max(0, amountReceivedValue - total);

  /** Aligné `PosQuickPage._handlePayment` / `PosPage._handlePayment` (Flutter) — validations + toasts. */
  function getPosPayValidationError(): string | null {
    if (cart.some((c) => c.quantity <= 0)) {
      return "Indiquez une quantité supérieure à 0 pour chaque ligne du panier.";
    }
    const stockWarnings = cart.filter(
      (c) => (stockByProductId.get(c.productId) ?? 0) < c.quantity,
    );
    if (stockWarnings.length > 0) {
      return "Stock insuffisant pour certains articles.";
    }
    if (mode === "a4" && paymentMethod === "other" && !customerId) {
      return "Associez un client pour une vente à crédit.";
    }
    if (
      mode === "quick" &&
      quickPayment === "cash" &&
      amountReceivedTouched &&
      amountReceivedValue < total
    ) {
      return "Montant reçu insuffisant.";
    }
    return null;
  }

  const createMut = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Panier vide.");
      const pre = getPosPayValidationError();
      if (pre) throw new Error(pre);
      const payments =
        mode === "quick"
          ? [{ method: quickPayment, amount: total }]
          : paymentMethod === "other"
            ? [{ method: "other" as const, amount: total, reference: "À crédit" }]
            : (() => {
                const acompte = amountReceivedValue;
                const normalized =
                  acompte <= 0 ? total : Math.min(Math.max(acompte, 0.01), total);
                return [{ method: paymentMethod, amount: normalized }];
              })();
      const invoiceSnap =
        mode === "a4" && store
          ? {
              cart: cart.map((c) => ({ ...c })),
              subtotal,
              discount: discountValue,
              total,
              depositAmount: payments.reduce((s, p) => s + p.amount, 0),
            }
          : undefined;
      const receiptSnap: PosReceiptSnap | undefined =
        mode === "quick"
          ? {
              cart: cart.map((c) => ({
                name: c.name,
                quantity: c.quantity,
                unitPrice: c.unitPrice,
              })),
              subtotal,
              discount: discountValue,
              total,
              quickPayment,
              amountReceivedValue,
              change,
            }
          : undefined;
      const res = await createPosSale({
        companyId,
        storeId,
        customerId: mode === "a4" ? customerId || null : null,
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        })),
        discount: discountValue,
        payments,
        saleMode: mode === "quick" ? "quick_pos" : "invoice_pos",
        documentType: mode === "quick" ? "thermal_receipt" : "a4_invoice",
      });
      return { ...res, invoiceSnap, receiptSnap };
    },
    onSuccess: async (res) => {
      const recordedTotal = total;
      const saleNumber = res.saleNumber;
      setCart([]);
      setDiscount("0");
      setAmountReceived("");
      setAmountReceivedTouched(false);
      setCustomerId("");
      if (res.saleId.startsWith("offline:")) {
        toast.success(
          "Vente enregistrée localement. Synchronisation à la reconnexion.",
        );
      } else {
        toast.success(
          `Vente #${saleNumber} enregistrée. Total: ${formatCurrency(recordedTotal)}`,
        );
      }
      setCartOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pos", mode, companyId, storeId] }),
        qc.invalidateQueries({
          queryKey: queryKeys.sales({ companyId, storeId, status: null, from: "", to: "" }),
        }),
        qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) }),
      ]);

      if (mode === "a4" && store && res.invoiceSnap) {
        if (res.saleId.startsWith("offline:")) {
          toast.info("Facture PDF : disponible après synchronisation (vente en file d’attente).");
        } else
        try {
          const [{ getSaleDetail }, { buildInvoiceA4Data }, { fetchLogoBytes }, { paymentLinesFromSalePayments }] =
            await Promise.all([
              import("@/lib/features/sales/api"),
              import("@/lib/features/invoices/build-invoice-a4-data"),
              import("@/lib/features/invoices/generate-invoice-pdf"),
              import("@/lib/features/invoices/invoice-a4-payment-lines"),
            ]);
          const detail = await getSaleDetail(res.saleId);
          const logoBytes = await fetchLogoBytes(store.logo_url);
          const salePayments = (detail as { sale_payments?: Array<{ method: string; amount: number; reference?: string | null }> } | null)?.sale_payments ?? [];
          const payLines = paymentLinesFromSalePayments(salePayments);
          const inv = buildInvoiceA4Data({
            store,
            saleNumber: res.saleNumber,
            date: new Date(detail?.created_at ?? Date.now()),
            lines: res.invoiceSnap.cart.map((c) => ({
              name: c.name,
              quantity: c.quantity,
              unit: c.unit,
              unitPrice: c.unitPrice,
            })),
            subtotal: res.invoiceSnap.subtotal,
            discount: res.invoiceSnap.discount,
            tax: detail?.tax ?? 0,
            total: res.invoiceSnap.total,
            customerName: detail?.customer?.name ?? null,
            customerPhone: detail?.customer?.phone ?? null,
            customerAddress: null,
            depositAmount: payLines.length > 0 ? null : res.invoiceSnap.depositAmount,
            paymentLines: payLines.length > 0 ? payLines : null,
            logoBytes,
          });
          setInvoiceDialog(inv);
        } catch (e) {
          toast.error(messageFromUnknownError(e, "Facture PDF indisponible."));
        }
      }

      if (mode === "quick" && store && res.receiptSnap) {
        let saleDate = new Date();
        try {
          const { getSaleDetail } = await import("@/lib/features/sales/api");
          const detail = await getSaleDetail(res.saleId);
          if (detail?.created_at) saleDate = new Date(detail.created_at);
        } catch {
          /* date serveur optionnelle */
        }
        const ticketData = buildReceiptTicketData(
          store,
          res.saleNumber,
          res.receiptSnap,
          saleDate,
          res.saleId,
        );
        let auto = false;
        try {
          auto = localStorage.getItem("pos_quick_auto_print") === "true";
        } catch {
          auto = quickAutoPrint;
        }
        if (auto) {
          try {
            const blob = await generateReceiptThermalPdfBlob(ticketData);
            printInvoicePdf(blob);
          } catch (e) {
            toast.error(messageFromUnknownError(e, "Impression ticket impossible."));
            setReceiptDialog(ticketData);
          }
        } else {
          setReceiptDialog(ticketData);
        }
      }
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function addToCart(
    productId: string,
    name: string,
    unitPrice: number,
    unit: string,
    imageUrl?: string | null,
  ) {
    const stock = stockByProductId.get(productId) ?? 0;
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.productId === productId);
      if (idx < 0) {
        if (stock <= 0) return prev;
        return [
          ...prev,
          {
            productId,
            name,
            quantity: 1,
            unitPrice,
            unit: unit || "u",
            imageUrl: imageUrl ?? null,
          },
        ];
      }
      const row = prev[idx];
      if (row.quantity + 1 > stock) {
        const now = Date.now();
        if (now - lastStockToastAt.current > 2000) {
          lastStockToastAt.current = now;
          queueMicrotask(() => toast.info("Quantité ajustée au stock disponible."));
        }
        return prev;
      }
      const next = [...prev];
      next[idx] = { ...row, quantity: row.quantity + 1 };
      return next;
    });
  }

  /** Aligné `PosQuickPage._addByBarcode` : correspondance exacte sur `barcode` trim, puis `isProductShownOnStoreTill`. */
  function addByBarcode(code: string) {
    const trimmed = code.replace(/\r|\n/g, "").trim();
    if (!trimmed) return;
    const p = products.find(
      (x) => x.is_active && x.barcode && x.barcode.trim() === trimmed,
    );
    if (!p) {
      toast.error("Aucun produit avec ce code-barres.");
      return;
    }
    const stock = stockByProductId.get(p.id) ?? 0;
    if (stock <= 0) {
      toast.error("Produit indisponible (stock épuisé).");
      return;
    }
    addToCart(
      p.id,
      p.name,
      Number(p.sale_price ?? 0),
      p.unit,
      p.product_images?.[0]?.url ?? null,
    );
    setSearch("");
  }

  function updateQty(productId: string, delta: number) {
    const stock = stockByProductId.get(productId) ?? 0;
    setCart((prev) => {
      const row = prev.find((r) => r.productId === productId);
      if (!row) return prev;
      if (delta > 0 && row.quantity + delta > stock) {
        const now = Date.now();
        if (now - lastStockToastAt.current > 2000) {
          lastStockToastAt.current = now;
          queueMicrotask(() => toast.info("Quantité ajustée au stock disponible."));
        }
        return prev;
      }
      return prev
        .map((r) => {
          if (r.productId !== productId) return r;
          const q = Math.max(0, Math.min(stock, r.quantity + delta));
          return { ...r, quantity: q };
        })
        .filter((r) => r.quantity > 0);
    });
  }

  function setQty(productId: string, quantity: number) {
    const stock = stockByProductId.get(productId) ?? 0;
    setCart((prev) => {
      const row = prev.find((r) => r.productId === productId);
      if (!row) return prev;
      const q = Math.max(0, Math.min(stock, Math.floor(quantity)));
      return prev
        .map((r) => (r.productId === productId ? { ...r, quantity: q } : r))
        .filter((r) => r.quantity > 0);
    });
  }

  const posCartQ = useQuery({
    queryKey: queryKeys.posCartSettingsMode(mode),
    queryFn: () => readPosCartQtyUiForMode(mode),
    staleTime: 0,
  });
  const posCartUi = posCartQ.data ?? {
    showQuantityInput: true,
    showQuantityButtons: false,
  };

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((r) => r.productId !== productId));
  }

  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);

  /** Comme Flutter `PosQuickPage._leavePosToSalesScreen` : Ventes + boutique courante. */
  function exitPos() {
    router.push(`${ROUTES.sales}?store=${encodeURIComponent(storeId)}`);
  }

  async function handleRefreshPos() {
    const r = await posQ.refetch();
    if (r.isError) {
      toast.error(messageFromUnknownError(r.error as Error, "Actualisation impossible."));
      return;
    }
    toast.success("Données actualisées");
  }

  if (permLoading) {
    return (
      <div className="box-border flex min-h-0 min-w-0 flex-1 items-center justify-center bg-[#F8F9FA] px-[20px]">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="box-border flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-[#F8F9FA] px-[20px] py-10">
        <MdLock className="h-16 w-16 text-red-600" aria-hidden />
        <p className="mt-4 max-w-sm text-center text-sm font-semibold text-[#1F2937]">
          Vous n&apos;avez pas l&apos;autorisation pour{" "}
          {mode === "quick" ? "la caisse rapide" : "la facture A4"}.
        </p>
        <Link
          href="/stores"
          className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-[#F97316] px-4 py-3 text-sm font-semibold text-white"
        >
          <MdArrowBack className="h-4 w-4" aria-hidden />
          Retour aux boutiques
        </Link>
      </div>
    );
  }

  const cartPanel = (
    <PosCartPanel
      mode={mode}
      cart={cart}
      cartCount={cartCount}
      stockByProductId={stockByProductId}
      showQuantityInput={posCartUi.showQuantityInput}
      showQuantityButtons={posCartUi.showQuantityButtons}
      subtotal={subtotal}
      discountValue={discountValue}
      total={total}
      showDiscountField={showDiscountField}
      discount={discount}
      setDiscount={setDiscount}
      amountReceived={amountReceived}
      setAmountReceived={setAmountReceived}
      amountReceivedTouched={amountReceivedTouched}
      setAmountReceivedTouched={setAmountReceivedTouched}
      amountReceivedValue={amountReceivedValue}
      change={change}
      quickPayment={quickPayment}
      setQuickPayment={setQuickPayment}
      paymentMethod={paymentMethod}
      setPaymentMethod={setPaymentMethod}
      customerId={customerId}
      setCustomerId={setCustomerId}
      customers={customers}
      createMut={createMut}
      onUpdateQty={updateQty}
      onSetQty={setQty}
      onRemove={removeLine}
      onClear={() => {
        setCart([]);
        setDiscount("0");
        setAmountReceived("");
        setAmountReceivedTouched(false);
      }}
      onPay={() => {
        const pre = getPosPayValidationError();
        if (pre) {
          toast.error(pre);
          return;
        }
        void createMut.mutateAsync();
      }}
      hideCartTitle={!isWide}
      currencyLabel={currencyLabel}
    />
  );

  return (
    <div className="box-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-[#F8F9FA] px-[20px] overscroll-none">
      {/* Header 60px — marge horizontale 20px (fond shell visible sur les côtés, comme Flutter) */}
      <header className="z-30 flex h-[60px] shrink-0 items-center gap-2 bg-[#f97316] px-3 text-white sm:px-4">
        {mode === "quick" ? (
          <MdStore className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden />
        ) : (
          <MdDescription className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight sm:text-lg">
            {mode === "quick" ? "POS Caisse Rapide" : "POS Facture A4"}
          </p>
          <p className="truncate text-[11px] text-white/90">
            {store?.name ?? "Boutique"}
            {mode === "quick" && isWide && profileNameQ.data
              ? ` • ${profileNameQ.data}`
              : ""}
            {" • "}
            {clock}
          </p>
        </div>
        {mode === "quick" ? (
          <>
            <Link
              href={`${ROUTES.sales}?store=${encodeURIComponent(storeId)}`}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Historique ventes"
            >
              <MdHistory className="h-6 w-6" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => setQuickSettingsOpen(true)}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Paramètres"
            >
              <MdSettings className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={exitPos}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Quitter POS"
            >
              <MdLogout className="h-6 w-6" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <Link
              href={`${ROUTES.sales}?store=${encodeURIComponent(storeId)}`}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Historique des ventes de cette boutique"
            >
              <MdHistory className="h-6 w-6" aria-hidden />
            </Link>
            <Link
              href={ROUTES.settings}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Paramètres application"
            >
              <MdSettings className="h-6 w-6" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => void handleRefreshPos()}
              disabled={posQ.isFetching}
              className="rounded-full p-2 hover:bg-white/15 disabled:opacity-60"
              aria-label="Actualiser catalogue et stock"
            >
              <MdRefresh className={cn("h-5 w-5 sm:h-6 sm:w-6", posQ.isFetching && "animate-spin")} aria-hidden />
            </button>
            <button
              type="button"
              onClick={exitPos}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Quitter le POS"
            >
              <MdLogout className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
            </button>
          </>
        )}
      </header>

      {posQ.isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
            <p className="text-sm text-neutral-600">
              {mode === "a4" ? "Chargement Facture A4..." : "Chargement..."}
            </p>
          </div>
        </div>
      ) : posQ.isError ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-12 text-center">
          <MdStore className="h-16 w-16 text-red-500" aria-hidden />
          <p className="text-sm text-[#1F2937]">
            {(posQ.error as Error)?.message ?? "Impossible de charger la caisse."}
          </p>
          <Link href="/stores" className="rounded-[10px] bg-[#F97316] px-4 py-2 text-sm font-semibold text-white">
            Choisir une boutique
          </Link>
        </div>
      ) : !store ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-12 text-center">
          <MdStore className="h-16 w-16 text-red-500" aria-hidden />
          <p className="text-sm text-[#1F2937]">Boutique introuvable.</p>
          <Link href="/stores" className="rounded-[10px] bg-[#F97316] px-4 py-2 text-sm font-semibold text-white">
            Retour aux boutiques
          </Link>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col min-[900px]:flex-row min-[900px]:overflow-hidden">
          {/* Zone gauche — fond blanc */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white min-[900px]:flex-[65]">
            <div className="px-4 pb-1.5 pt-1.5">
              {mode === "quick" ? (
                <div className="relative h-10">
                  <button
                    type="button"
                    className="absolute left-0.5 top-1/2 z-[1] -translate-y-1/2 rounded-full p-0.5 text-[#F97316] hover:bg-black/5"
                    title="Ouvrir le scan caméra"
                    aria-label="Ouvrir le scan caméra"
                    onClick={() => {
                      setBarcodeScannerOpen(true);
                    }}
                  >
                    <MdQrCodeScanner className="h-[22px] w-[22px]" aria-hidden />
                  </button>
                  <MdSearch
                    className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F97316]"
                    aria-hidden
                  />
                  <input
                    className={fsInputClass(
                      "h-10 w-full rounded-lg border-[#E5E7EB] bg-white py-1 pl-10 pr-8 text-[13px] leading-snug text-[#1F2937] placeholder:text-[#1F2937]/50",
                    )}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = (e.currentTarget as HTMLInputElement).value;
                        addByBarcode(v);
                      }
                    }}
                    placeholder="Scanner ou rechercher un produit..."
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    autoFocus
                  />
                </div>
              ) : (
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
                      onChange={(e) => {
                        setSearch(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const v = (e.currentTarget as HTMLInputElement).value;
                          addByBarcode(v);
                        }
                      }}
                      placeholder="Rechercher produit (nom, SKU, code-barres)..."
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="search"
                    />
                  </div>
                  <div className="flex shrink-0 gap-2 sm:gap-2.5">
                    <select
                      className={fsInputClass(
                        "h-12 min-w-0 flex-1 rounded-xl border-[#E5E7EB] bg-white px-2 py-1.5 text-sm text-[#1F2937] sm:min-w-[140px] md:min-w-[180px]",
                      )}
                      value={
                        customerId && customers.some((c) => c.id === customerId)
                          ? customerId
                          : ""
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
                      aria-label="Créer un client"
                      onClick={() => setCustomerCreateOpen(true)}
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F97316] text-white shadow-sm transition hover:opacity-95"
                    >
                      <MdPersonAdd className="h-[22px] w-[22px]" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 overflow-x-auto overflow-y-hidden px-4 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-1.5">
                <CategoryChip
                  label="Tous"
                  selected={categoryId === null}
                  onClick={() => setCategoryId(null)}
                />
                {categories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    label={c.name}
                    selected={categoryId === c.id}
                    onClick={() => setCategoryId(c.id)}
                  />
                ))}
              </div>
            </div>

            <div className="@container min-h-0 flex-1 overflow-y-auto px-4 pb-28 min-[900px]:pb-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <MdInventory2
                    className="h-16 w-16 text-[#1F2937]/50"
                    aria-hidden
                  />
                  <p className="mt-4 text-[15px] text-[#1F2937]/80">
                    {search.trim() !== ""
                      ? "Aucun résultat"
                      : mode === "quick"
                        ? "Aucun produit"
                        : "Aucun produit actif"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 pb-4 @[600px]:grid-cols-4">
                  {filtered.map((p) => {
                    const stock = stockByProductId.get(p.id) ?? 0;
                    const thumb = p.product_images?.[0]?.url ?? null;
                    const price = Number(p.sale_price ?? 0);
                    const priceLine =
                      stock >= 0
                        ? `${formatCurrency(price)} · ${stock}`
                        : formatCurrency(price);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          addToCart(
                            p.id,
                            p.name,
                            price,
                            p.unit,
                            thumb,
                          )
                        }
                        className={cn(
                          "flex min-h-0 w-full min-w-0 flex-col items-center overflow-hidden rounded-[14px] bg-white px-2.5 py-2 text-center transition active:scale-[0.98]",
                          "aspect-[0.76] @[400px]:aspect-[0.84] @[600px]:aspect-[0.90]",
                          "border-[1.5px] border-[#F97316]/35 shadow-[0_2px_8px_rgba(249,115,22,0.1)]",
                        )}
                      >
                        <div className="mx-auto flex h-[98px] w-[98px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#F8F9FA]">
                          {thumb ? (
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <MdInventory2
                              className="h-[49px] w-[49px] text-[#F97316]/70"
                              aria-hidden
                            />
                          )}
                        </div>
                        <div className="mt-1 flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center">
                          <p
                            className="line-clamp-2 w-full text-center text-[13px] font-semibold leading-snug text-[#1F2937]"
                            title={p.name}
                          >
                            {p.name}
                          </p>
                          <p
                            className="mt-0.5 w-full truncate text-center text-[11px] font-bold text-[#F97316]"
                            title={priceLine}
                          >
                            {priceLine}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          {/* Zone droite desktop — 380px, fond secondaire Flutter */}
          <aside className="hidden h-full min-h-0 w-[380px] shrink-0 flex-col border-l border-[#E5E7EB] bg-[#F8F9FA] min-[900px]:flex">
            {cartPanel}
          </aside>
        </div>
      )}

      {/* Barre mobile — Flutter _buildMobileBottomBar */}
      {!isWide && store && !posQ.isLoading && !posQ.isError ? (
        <div
          className="fixed bottom-0 left-[20px] right-[20px] z-20 border-t border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] min-[900px]:hidden"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="min-h-12 min-w-0 flex-1 rounded-xl py-2 text-left"
            >
              <div className="flex items-center gap-3">
                <MdReceiptLong className="h-[26px] w-[26px] shrink-0 text-[#F97316]" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1F2937]">Panier</p>
                  <p className="truncate text-xs text-[#1F2937]/70">
                    {cartCount} article{cartCount !== 1 ? "s" : ""} · {formatCurrency(total)}
                  </p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="h-12 shrink-0 rounded-lg bg-[#F97316] px-4 text-sm font-semibold text-white"
            >
              Voir / Payer
            </button>
          </div>
        </div>
      ) : null}

      {/* Bottom sheet mobile panier */}
      {!isWide && cartOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/35 min-[900px]:hidden"
          role="presentation"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="absolute bottom-0 left-[20px] right-[20px] flex max-h-[85vh] flex-col bg-[#F8F9FA] shadow-[0_-4px_20px_rgba(0,0,0,0.2)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Panier"
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-4">
              <div className="flex items-baseline gap-2">
                <span className="text-base text-[#6B7280]">Articles ({cartCount})</span>
                <span className="text-lg font-bold text-[#1F2937]">Panier</span>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-full p-2 hover:bg-black/5"
                aria-label="Fermer"
              >
                <MdClose className="h-6 w-6 text-[#1F2937]" aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{cartPanel}</div>
          </div>
        </div>
      ) : null}

      {invoiceDialog ? (
        <InvoicePostSaleDialog
          data={invoiceDialog}
          onClose={() => setInvoiceDialog(null)}
        />
      ) : null}
      {receiptDialog ? (
        <ReceiptTicketDialog data={receiptDialog} onClose={() => setReceiptDialog(null)} />
      ) : null}

      {mode === "quick" ? (
        <PosBarcodeScannerDialog
          open={barcodeScannerOpen}
          onClose={() => setBarcodeScannerOpen(false)}
          onDecoded={(text) => {
            addByBarcode(text);
          }}
          onError={(msg) => toast.error(msg)}
        />
      ) : null}

      {mode === "a4" && companyId ? (
        <CustomerFormDialog
          open={customerCreateOpen}
          onClose={() => setCustomerCreateOpen(false)}
          variant="create"
          onSubmit={async (v) => {
            const id = await createCustomer(companyId, {
              name: v.name,
              type: v.type,
              phone: v.phone,
              email: v.email,
              address: v.address,
              notes: v.notes,
            });
            setCustomerCreateOpen(false);
            await qc.invalidateQueries({
              queryKey: ["pos", mode, companyId, storeId],
            });
            if (id) setCustomerId(id);
            toast.success(
              id
                ? "Client créé"
                : "Client en file d’attente (hors ligne).",
            );
          }}
        />
      ) : null}

      {mode === "quick" && quickSettingsOpen && store ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-quick-settings-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fermer"
            onClick={() => setQuickSettingsOpen(false)}
          />
          <div
            className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-6 pb-6 pt-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="pos-quick-settings-title" className="text-xl font-bold text-[#1F2937]">
              Paramètres caisse
            </h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex gap-3">
                <span className="w-[140px] shrink-0 font-semibold text-[#1F2937]">Boutique :</span>
                <span className="min-w-0 text-[#1F2937]">{store.name}</span>
              </div>
              <div className="flex gap-3">
                <span className="w-[140px] shrink-0 font-semibold text-[#1F2937]">Remise autorisée :</span>
                <span className="min-w-0 text-[#1F2937]">
                  {store.pos_discount_enabled ? "Oui" : "Non"}
                </span>
              </div>
              <div className="flex gap-3">
                <span className="w-[140px] shrink-0 font-semibold text-[#1F2937]">Devise :</span>
                <span className="min-w-0 text-[#1F2937]">{currencyLabel}</span>
              </div>
            </div>
            <div className="mt-4 flex items-start justify-between gap-3 border-t border-[#E5E7EB] pt-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1F2937]">Impression automatique</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Après chaque vente, ne pas afficher le dialogue ticket (gain de temps).
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={quickAutoPrint}
                onClick={() => {
                  const v = !quickAutoPrint;
                  setQuickAutoPrint(v);
                  try {
                    localStorage.setItem("pos_quick_auto_print", v ? "true" : "false");
                  } catch {
                    /* ignore */
                  }
                }}
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  quickAutoPrint ? "bg-[#F97316]" : "bg-neutral-300",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                    quickAutoPrint ? "left-5" : "left-0.5",
                  )}
                />
              </button>
            </div>
            <p className="mt-4 text-xs text-neutral-600">
              Les autres paramètres de la boutique sont gérés par l&apos;administrateur.
            </p>
            <button
              type="button"
              onClick={() => setQuickSettingsOpen(false)}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#F97316] text-sm font-semibold text-white hover:opacity-95"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Aligné sur Flutter `FilterChip` dans `pos_quick_left_zone.dart` / `pos_main_area.dart` :
 * `ChipTheme.shape` = `RoundedRectangleBorder` (pas Stadium) — `AppTheme.radiusSmM` (8) mobile,
 * `radiusSm` (10) ≥ 600px comme `AppTheme.light()` vs `lightMobile()`.
 * Padding compact web (moins que Flutter par défaut).
 */
function CategoryChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 px-2.5 py-1 text-xs font-semibold transition-colors min-[600px]:px-3 min-[600px]:text-sm",
        /* Même rayon que ChipTheme (mobile 8px, desktop 10px) */
        "rounded-[8px] min-[600px]:rounded-[10px]",
        selected
          ? "border-2 border-[#F97316] bg-[#F97316] text-white"
          : "border border-[#E5E7EB] bg-[#F8F9FA] text-[#1F2937]",
      )}
    >
      {label}
    </button>
  );
}

/** Comme `PosCartQtyField` + `_setQty` Flutter : brouillon local, debounce, stock → toast + reset sans commit. */
const POS_CART_QTY_DEBOUNCE_MS = 730;

function PosCartQtyInput({
  productId,
  quantity,
  stock,
  onCommit,
}: {
  productId: string;
  quantity: number;
  stock: number;
  onCommit: (productId: string, value: number) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(quantity === 0 ? "" : String(quantity));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const quantityRef = useRef(quantity);
  quantityRef.current = quantity;
  const lastStockToastAt = useRef(0);

  const [display, setDisplay] = useState(() =>
    quantity === 0 ? "" : String(quantity),
  );

  /** Ne pas réinjecter `quantity` tant que l’input a le focus (sinon effacer visuellement est impossible). */
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const el = inputRef.current;
    if (el && document.activeElement === el) return;
    const want = quantity === 0 ? "" : String(quantity);
    setDisplay(want);
    draftRef.current = want;
  }, [quantity]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const resetToCommitted = () => {
    const q = quantityRef.current;
    const want = q === 0 ? "" : String(q);
    setDisplay(want);
    draftRef.current = want;
  };

  const tryCommitParsed = (nRaw: number) => {
    const n = Math.floor(nRaw);
    if (Number.isNaN(n) || n < 0) {
      resetToCommitted();
      return;
    }
    if (stock >= 0 && n > stock) {
      const now = Date.now();
      if (now - lastStockToastAt.current > 2000) {
        lastStockToastAt.current = now;
        queueMicrotask(() =>
          toast.info("Quantité ajustée au stock disponible."),
        );
      }
      resetToCommitted();
      return;
    }
    if (n !== quantityRef.current) {
      onCommit(productId, n);
    }
  };

  const scheduleCommit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const t = draftRef.current.trim();
      if (t === "") return;
      const n = parseInt(t, 10);
      if (Number.isNaN(n)) return;
      tryCommitParsed(n);
    }, POS_CART_QTY_DEBOUNCE_MS);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label="Quantité"
      className="h-8 w-[68px] rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-center text-[15px] font-bold text-[#1F2937] outline-none focus:border-[#F97316]"
      value={display}
      onChange={(e) => {
        const v = e.target.value;
        draftRef.current = v;
        setDisplay(v);
        scheduleCommit();
      }}
      onFocus={(e) => {
        e.target.select();
      }}
      onBlur={() => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        const t = draftRef.current.trim();
        if (t === "") {
          resetToCommitted();
          return;
        }
        const n = parseInt(t, 10);
        if (Number.isNaN(n)) {
          resetToCommitted();
          return;
        }
        tryCommitParsed(n);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        const t = draftRef.current.trim();
        const n = parseInt(t, 10);
        if (Number.isNaN(n)) {
          resetToCommitted();
          return;
        }
        tryCommitParsed(n);
      }}
    />
  );
}

function PosCartPanel({
  mode,
  cart,
  cartCount,
  stockByProductId,
  showQuantityInput,
  showQuantityButtons,
  subtotal,
  discountValue,
  total,
  showDiscountField,
  discount,
  setDiscount,
  amountReceived,
  setAmountReceived,
  amountReceivedTouched,
  setAmountReceivedTouched,
  amountReceivedValue,
  change,
  quickPayment,
  setQuickPayment,
  paymentMethod,
  setPaymentMethod,
  customerId,
  setCustomerId,
  customers,
  createMut,
  onUpdateQty,
  onSetQty,
  onRemove,
  onClear,
  onPay,
  hideCartTitle,
  currencyLabel,
}: {
  mode: PosMode;
  cart: CartRow[];
  cartCount: number;
  stockByProductId: Map<string, number>;
  showQuantityInput: boolean;
  showQuantityButtons: boolean;
  subtotal: number;
  discountValue: number;
  total: number;
  showDiscountField: boolean;
  discount: string;
  setDiscount: (v: string) => void;
  amountReceived: string;
  setAmountReceived: (v: string) => void;
  amountReceivedTouched: boolean;
  setAmountReceivedTouched: (v: boolean) => void;
  amountReceivedValue: number;
  change: number;
  quickPayment: QuickPayment;
  setQuickPayment: (m: QuickPayment) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  customerId: string;
  setCustomerId: (v: string) => void;
  customers: Array<{ id: string; name: string }>;
  createMut: { isPending: boolean };
  onUpdateQty: (id: string, d: number) => void;
  onSetQty: (id: string, q: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPay: () => void | Promise<void>;
  hideCartTitle?: boolean;
  currencyLabel: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {hideCartTitle ? null : (
        <div className="shrink-0 px-4 pb-2 pt-3 min-[900px]:block">
          <p className="text-base font-bold text-[#1F2937]">
            Panier · {cartCount} article{cartCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 min-[900px]:px-3">
        {cart.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12 text-[#1F2937]">Panier vide</div>
        ) : (
          <ul className="space-y-2 pb-2">
            {cart.map((c) => {
              const stock = stockByProductId.get(c.productId) ?? 0;
              const low = stock >= 0 && c.quantity > stock;
              return (
                <li
                  key={c.productId}
                  className="flex gap-2.5 rounded-[10px] border border-[#E5E7EB] bg-white px-2.5 py-2"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F8F9FA]">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <MdInventory2 className="h-6 w-6 text-[#F97316]/70" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#1F2937]">{c.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {showQuantityButtons ? (
                        <button
                          type="button"
                          onClick={() => onUpdateQty(c.productId, -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F8F9FA] text-[#1F2937]"
                          aria-label="Moins"
                        >
                          <span className="text-lg leading-none">−</span>
                        </button>
                      ) : null}
                      {showQuantityInput ? (
                        <PosCartQtyInput
                          productId={c.productId}
                          quantity={c.quantity}
                          stock={stock}
                          onCommit={onSetQty}
                        />
                      ) : (
                        <span className="min-w-[28px] text-center text-[15px] font-bold text-[#1F2937]">
                          {c.quantity}
                        </span>
                      )}
                      {showQuantityButtons ? (
                        <button
                          type="button"
                          onClick={() => onUpdateQty(c.productId, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F97316] text-white"
                          aria-label="Plus"
                        >
                          <MdAdd className="h-5 w-5" aria-hidden />
                        </button>
                      ) : null}
                      {low ? (
                        <span className="ml-1 text-xs text-red-600">Stock: {stock}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0">
                    <p className="text-sm font-bold text-[#F97316]">
                      {formatCurrency(c.quantity * c.unitPrice)}
                    </p>
                    <button
                      type="button"
                      onClick={() => onRemove(c.productId)}
                      className="p-1 text-red-600"
                      aria-label="Supprimer"
                    >
                      <MdDeleteOutline className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-[#E5E7EB] bg-[#F8F9FA] p-3 pb-[max(12px,env(safe-area-inset-bottom))] min-[900px]:border-t-0">
        {/* Récap encadré — Flutter right zone footer */}
        <div className="mx-0 rounded-xl border border-[#E5E7EB] bg-white p-4 min-[900px]:mx-3">
          <div className="flex justify-between text-sm text-[#1F2937]">
            <span>Sous-total</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {(showDiscountField || discountValue > 0) ? (
            <div className="mt-1 flex justify-between text-sm text-[#1F2937]">
              <span>Remise</span>
              <span>{formatCurrency(discountValue)}</span>
            </div>
          ) : null}
          <div className="mt-2 flex items-end justify-between border-t border-[#E5E7EB] pt-2">
            <span className="text-base font-bold text-[#1F2937]">TOTAL</span>
            <span className="text-[22px] font-extrabold leading-none text-[#F97316]">{formatCurrency(total)}</span>
          </div>
        </div>

        {mode === "quick" ? (
          <div className="mt-3 grid grid-cols-3 gap-2 px-0 min-[900px]:px-3">
            {(
              [
                ["cash", "CASH"],
                ["card", "CARTE"],
                ["mobile_money", "MOBILE"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setQuickPayment(key)}
                className={cn(
                  "rounded-lg py-2 text-xs font-semibold transition-colors",
                  quickPayment === key
                    ? "bg-[#F97316] text-white"
                    : "bg-[#F8F9FA] text-[#1F2937]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5 px-0 min-[900px]:px-3">
            {(
              [
                ["cash", "Espèces"],
                ["mobile_money", "Mobile money"],
                ["card", "Carte"],
                ["other", "À crédit"],
              ] as const
            ).map(([key, label]) => {
              const sel = paymentMethod === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPaymentMethod(key)}
                  className={cn(
                    "rounded-full border px-2 py-1.5 text-[10px] font-semibold",
                    sel
                      ? "border-[#F97316] bg-[color-mix(in_srgb,#F97316_18%,transparent)] text-[#1F2937]"
                      : "border-[#E5E7EB] bg-[#F8F9FA] text-[#1F2937]",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {mode === "a4" ? (
          <div className="mt-3 px-0 min-[900px]:px-3">
            <label className="mb-1 block text-[11px] font-medium text-[#6B7280]">Client</label>
            <select
              className={fsInputClass(
                "bg-white px-2.5 py-1.5 sm:px-2.5 sm:py-1.5",
              )}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Aucun client</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {showDiscountField ? (
          <div className="mt-3 px-0 min-[900px]:px-3">
            <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
              Remise {mode === "quick" ? `(${currencyLabel})` : ""}
            </label>
            <input
              className={fsInputClass(
                "bg-white px-2.5 py-1.5 sm:px-2.5 sm:py-1.5",
              )}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
        ) : null}

        {mode === "quick" && quickPayment === "cash" ? (
          <div className="mt-3 px-0 min-[900px]:px-3">
            <label className="mb-1 block text-xs font-semibold text-[#1F2937]">Montant reçu</label>
            <input
              className={fsInputClass(
                "bg-white px-2.5 py-1.5 sm:px-2.5 sm:py-1.5",
              )}
              value={amountReceived}
              onChange={(e) => {
                setAmountReceivedTouched(true);
                setAmountReceived(e.target.value);
              }}
              inputMode="decimal"
              placeholder={total > 0 ? formatCurrency(total) : "0"}
            />
            {amountReceivedTouched && amountReceivedValue > 0 ? (
              <div className="mt-1.5 flex justify-between text-sm">
                <span className="text-[#1F2937]">Monnaie à rendre</span>
                <span
                  className={cn(
                    "font-bold",
                    amountReceivedValue >= total ? "text-[#F97316]" : "text-red-600",
                  )}
                >
                  {amountReceivedValue >= total ? formatCurrency(change) : "—"}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "a4" ? (
          <div className="mt-3 px-0 min-[900px]:px-3">
            <label className="mb-1 block text-xs text-[#6B7280]">Acompte (montant payé maintenant)</label>
            <input
              className={fsInputClass(
                "bg-white px-2.5 py-1.5 sm:px-2.5 sm:py-1.5",
              )}
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              inputMode="decimal"
              placeholder={total > 0 ? formatCurrency(total) : "0"}
            />
          </div>
        ) : null}

        <div className="mt-4 flex gap-3 px-0 min-[900px]:px-3">
          <button
            type="button"
            onClick={onClear}
            className="flex-1 rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] py-2.5 text-sm font-semibold text-[#1F2937]"
          >
            {mode === "quick" ? "Annuler vente" : "Vider panier"}
          </button>
          <button
            type="button"
            disabled={createMut.isPending || cart.length === 0 || total <= 0}
            onClick={() => void onPay()}
            className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-[#F97316] py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {mode === "quick" ? (
              <>
                {createMut.isPending ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <MdPrint className="h-5 w-5" aria-hidden />
                )}
                {createMut.isPending ? "Enregistrement..." : "VALIDER ET IMPRIMER"}
              </>
            ) : (
              <>
                {createMut.isPending ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <MdPayments className="h-5 w-5" aria-hidden />
                )}
                {createMut.isPending ? "Enregistrement..." : "Payer"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
