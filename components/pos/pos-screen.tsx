"use client";

import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createCustomer } from "@/lib/features/customers/api";
import { P } from "@/lib/constants/permissions";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import type { SaleItem } from "@/lib/features/sales/types";
import {
  createPosSale,
  fetchPosData,
  updateCompletedPosSale,
} from "@/lib/features/pos/api";
import { defaultInvoiceUnitForProduct, INVOICE_UNITS } from "@/lib/features/pos/invoice-units";
import { fetchInvoiceTablePosEnabled } from "@/lib/features/settings/invoice-table-pos";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { ROUTES, storeFactureTabPath } from "@/lib/config/routes";
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
  MdEditNote,
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
  MdTableChart,
} from "react-icons/md";

export type PosMode = "quick" | "a4" | "a4-table";
type CartRow = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  imageUrl?: string | null;
  /** Ligne depuis `sale_items.total` — remises ligne pour RPC update (Flutter). */
  lineTotal?: number;
};

/** Aligné `sale_pos_edit.dart` / liste ventes. */
function isA4InvoiceFromSaleItem(s: SaleItem): boolean {
  if (s.document_type === "a4_invoice") return true;
  if (s.document_type === "thermal_receipt") return false;
  if (s.sale_mode === "invoice_pos") return true;
  if (s.sale_mode === "quick_pos") return false;
  return false;
}

function isBoutiqueScope(scope: string | null | undefined): boolean {
  const s = scope ?? "both";
  return s === "both" || s === "boutique_only";
}
type PaymentMethod = "cash" | "mobile_money" | "card" | "other";
type QuickPayment = "cash" | "mobile_money" | "card";

export function PosScreen({
  storeId,
  mode,
  editSaleId: editSaleIdProp,
}: {
  storeId: string;
  mode: PosMode;
  /** `?editSale=` — modification vente complétée (Flutter). */
  editSaleId?: string;
}) {
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
  const [saleEditBootstrapping, setSaleEditBootstrapping] = useState(() =>
    Boolean(editSaleIdProp?.trim()),
  );
  const [saleEditBarrierError, setSaleEditBarrierError] = useState<string | null>(null);
  const [activeEditSaleId, setActiveEditSaleId] = useState<string | null>(null);
  const [editStockRelease, setEditStockRelease] = useState<Map<string, number>>(
    () => new Map(),
  );
  const saleEditBootstrapKey = useRef<string | null>(null);
  const activeEditSaleIdRef = useRef<string | null>(null);
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

  useLayoutEffect(() => {
    activeEditSaleIdRef.current = activeEditSaleId;
  }, [activeEditSaleId]);

  const canQuick = hasPermission(P.salesCreate);
  const canA4 = hasPermission(P.salesInvoiceA4) || hasPermission(P.salesCreate);
  const canAccessA4Table =
    hasPermission(P.salesInvoiceA4Table) && canA4;
  const isSaleEditEntry = Boolean(editSaleIdProp?.trim());
  const canAccess = isSaleEditEntry
    ? hasPermission(P.salesUpdate)
    : mode === "quick"
      ? canQuick
      : mode === "a4"
        ? canA4
        : canAccessA4Table;
  const isA4Like = mode === "a4" || mode === "a4-table";

  const invoiceTableCompanyQ = useQuery({
    queryKey: queryKeys.invoiceTablePosEnabled(companyId),
    queryFn: () => fetchInvoiceTablePosEnabled(companyId),
    enabled: Boolean(companyId && mode === "a4-table" && canAccessA4Table),
    staleTime: 60_000,
  });

  const posQ = useQuery({
    queryKey: ["pos", mode, companyId, storeId] as const,
    queryFn: () =>
      fetchPosData({
        companyId,
        storeId,
        withCustomers: isA4Like,
      }),
    enabled: Boolean(
      companyId &&
        storeId &&
        canAccess &&
        (mode !== "a4-table" || isSaleEditEntry || invoiceTableCompanyQ.data === true),
    ),
    staleTime: 20_000,
    refetchInterval: mode === "quick" && !isSaleEditEntry ? 15_000 : false,
  });

  const stripCol1900 = useMediaQuery("(min-width: 1900px)");
  const stripCol1400 = useMediaQuery("(min-width: 1400px)");
  const stripMainExtent = stripCol1900 ? 172 : stripCol1400 ? 152 : 132;
  /** Bande « facture tableau » : colonnes un peu plus étroites pour limiter le zoom visuel. */
  const stripA4TableExtent = stripCol1900 ? 148 : stripCol1400 ? 130 : 118;

  const store = posQ.data?.store ?? null;
  const products = posQ.data?.products ?? [];
  const rawStockByProductId = useMemo(
    () => ensureStringNumberMap(posQ.data?.stockByProductId),
    [posQ.data?.stockByProductId],
  );
  const stockByProductId = useMemo(() => {
    if (editStockRelease.size === 0) return rawStockByProductId;
    const m = new Map(rawStockByProductId);
    editStockRelease.forEach((add, id) => {
      m.set(id, (m.get(id) ?? 0) + add);
    });
    return m;
  }, [rawStockByProductId, editStockRelease]);
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
    () =>
      cart.reduce(
        (sum, r) => sum + (r.lineTotal ?? r.quantity * r.unitPrice),
        0,
      ),
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
    if (isA4Like && paymentMethod === "other" && !customerId) {
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

  const canUpdateSales = hasPermission(P.salesUpdate);

  useEffect(() => {
    const raw = editSaleIdProp?.trim() ?? "";
    if (!raw) {
      saleEditBootstrapKey.current = null;
      setActiveEditSaleId(null);
      setEditStockRelease(new Map());
      setSaleEditBarrierError(null);
      setSaleEditBootstrapping(false);
      return;
    }
    if (!canUpdateSales) {
      setSaleEditBarrierError(
        "Vous n'avez pas la permission de modifier des ventes.",
      );
      setSaleEditBootstrapping(false);
      return;
    }
    let cancelled = false;
    async function bootstrap() {
      setSaleEditBootstrapping(true);
      setSaleEditBarrierError(null);
      try {
        const { getSaleDetail } = await import("@/lib/features/sales/api");
        const sale = await getSaleDetail(raw);
        if (cancelled) return;
        if (!sale) {
          setSaleEditBarrierError("Vente introuvable.");
          setSaleEditBootstrapping(false);
          return;
        }
        if (sale.store_id !== storeId) {
          setSaleEditBarrierError(
            "Cette vente appartient à une autre boutique.",
          );
          setSaleEditBootstrapping(false);
          return;
        }
        if (sale.status !== "completed") {
          setSaleEditBarrierError(
            "Seules les ventes complétées peuvent être modifiées.",
          );
          setSaleEditBootstrapping(false);
          return;
        }
        const a4 = isA4InvoiceFromSaleItem(sale);
        if (a4 && mode === "quick") {
          router.replace(
            `${ROUTES.stores}/${storeId}/pos?editSale=${encodeURIComponent(raw)}`,
          );
          return;
        }
        if (!a4 && (mode === "a4" || mode === "a4-table")) {
          router.replace(
            `${ROUTES.stores}/${storeId}/pos-quick?editSale=${encodeURIComponent(raw)}`,
          );
          return;
        }
        if (!posQ.data) return;
        if (saleEditBootstrapKey.current === raw) {
          setSaleEditBootstrapping(false);
          return;
        }
        const release = new Map<string, number>();
        const rows: CartRow[] = [];
        const items = sale.sale_items ?? [];
        const productById = new Map(posQ.data.products.map((p) => [p.id, p]));
        for (const it of items) {
          const pid = it.product_id;
          release.set(pid, (release.get(pid) ?? 0) + it.quantity);
          const p = productById.get(pid);
          const img = p?.product_images?.[0]?.url ?? null;
          rows.push({
            productId: pid,
            name: it.product?.name ?? p?.name ?? "Produit",
            quantity: it.quantity,
            unitPrice: it.unit_price,
            unit: it.product?.unit ?? p?.unit ?? "pce",
            imageUrl: img,
            lineTotal: it.total,
          });
        }
        setEditStockRelease(release);
        setCart(rows);
        setDiscount(sale.discount > 0 ? String(sale.discount) : "0");
        const pays = sale.sale_payments ?? [];
        if (pays.length > 0) {
          const pm = pays[0].method;
          if (pm === "cash" || pm === "mobile_money" || pm === "card") {
            if (mode === "quick") setQuickPayment(pm as QuickPayment);
            else setPaymentMethod(pm as PaymentMethod);
          } else if (pm === "other" && mode !== "quick") {
            setPaymentMethod("other");
          } else if (pm === "other" && mode === "quick") {
            setQuickPayment("cash");
          }
          const sum = pays.reduce((s, x) => s + x.amount, 0);
          setAmountReceivedTouched(true);
          setAmountReceived(sum > 0 ? String(sum) : "");
        }
        if (isA4Like) {
          setCustomerId(sale.customer_id ?? "");
        }
        setActiveEditSaleId(sale.id);
        saleEditBootstrapKey.current = raw;
        setSaleEditBootstrapping(false);
      } catch (e) {
        if (cancelled) return;
        setSaleEditBarrierError(messageFromUnknownError(e));
        setSaleEditBootstrapping(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [editSaleIdProp, storeId, mode, canUpdateSales, posQ.data, router, isA4Like]);

  type CreatePayResult = {
    kind: "create";
    saleId: string;
    saleNumber: string;
    invoiceSnap?: {
      cart: CartRow[];
      subtotal: number;
      discount: number;
      total: number;
      depositAmount: number;
    };
    receiptSnap?: PosReceiptSnap;
  };
  type UpdatePayResult = { kind: "update"; saleNumber: string };

  const createMut = useMutation({
    mutationFn: async (): Promise<CreatePayResult | UpdatePayResult> => {
      if (cart.length === 0) throw new Error("Panier vide.");
      const pre = getPosPayValidationError();
      if (pre) throw new Error(pre);
      const editingId = activeEditSaleIdRef.current;
      if (editingId) {
        const payments =
          mode === "quick"
            ? [{ method: quickPayment, amount: total }]
            : paymentMethod === "other"
              ? [
                  {
                    method: "other" as const,
                    amount: total,
                    reference: "À crédit",
                  },
                ]
              : (() => {
                  const acompte = amountReceivedValue;
                  const normalized =
                    acompte <= 0 ? total : Math.min(Math.max(acompte, 0.01), total);
                  return [{ method: paymentMethod, amount: normalized }];
                })();
        await updateCompletedPosSale({
          saleId: editingId,
          customerId: isA4Like ? customerId || null : null,
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            discount: Math.max(
              0,
              c.quantity * c.unitPrice -
                (c.lineTotal ?? c.quantity * c.unitPrice),
            ),
          })),
          discount: discountValue,
          payments,
          saleMode: mode === "quick" ? "quick_pos" : "invoice_pos",
          documentType: mode === "quick" ? "thermal_receipt" : "a4_invoice",
        });
        const { getSaleDetail } = await import("@/lib/features/sales/api");
        const updated = await getSaleDetail(editingId);
        return {
          kind: "update" as const,
          saleNumber: String(updated?.sale_number ?? ""),
        };
      }
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
        isA4Like && store
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
        customerId: isA4Like ? customerId || null : null,
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
      return {
        kind: "create" as const,
        saleId: res.saleId,
        saleNumber: res.saleNumber,
        invoiceSnap,
        receiptSnap,
      };
    },
    onSuccess: async (res) => {
      if (res.kind === "update") {
        toast.success(`Vente #${res.saleNumber} mise à jour.`);
        setCart([]);
        setDiscount("0");
        setAmountReceived("");
        setAmountReceivedTouched(false);
        setCustomerId("");
        setActiveEditSaleId(null);
        saleEditBootstrapKey.current = null;
        setEditStockRelease(new Map());
        setCartOpen(false);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["pos", mode, companyId, storeId] }),
          qc.invalidateQueries({ queryKey: ["sales"] }),
          qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) }),
        ]);
        router.push(`${ROUTES.sales}?store=${encodeURIComponent(storeId)}`);
        return;
      }

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

      if (isA4Like && store && res.invoiceSnap) {
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
            lineTotal: undefined,
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
      next[idx] = { ...row, quantity: row.quantity + 1, lineTotal: undefined };
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
          return { ...r, quantity: q, lineTotal: undefined };
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
        .map((r) =>
          r.productId === productId ? { ...r, quantity: q, lineTotal: undefined } : r,
        )
        .filter((r) => r.quantity > 0);
    });
  }

  /** Comme Flutter `PosInvoiceTableCart` `onUnitChange`. */
  function setLineUnit(productId: string, unit: string) {
    const u = (INVOICE_UNITS as readonly string[]).includes(unit)
      ? unit
      : defaultInvoiceUnitForProduct(unit);
    setCart((prev) =>
      prev.map((r) =>
        r.productId === productId ? { ...r, unit: u, lineTotal: undefined } : r,
      ),
    );
  }

  /** Comme Flutter `PosCartUnitPriceField` / `onSetUnitPrice` (FCFA entiers). */
  function setLineUnitPrice(productId: string, unitPrice: number) {
    const p = Math.max(
      0,
      Math.min(999_999_999, Math.round(Number.isFinite(unitPrice) ? unitPrice : 0)),
    );
    setCart((prev) =>
      prev.map((r) =>
        r.productId === productId ? { ...r, unitPrice: p, lineTotal: undefined } : r,
      ),
    );
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
          {isSaleEditEntry
            ? "la modification de ventes complétées."
            : mode === "quick"
              ? "la caisse rapide."
              : mode === "a4-table"
                ? "la facture A4 (tableau)."
                : "la facture A4."}
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

  if (saleEditBarrierError && isSaleEditEntry) {
    return (
      <div className="box-border flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-[#F8F9FA] px-[20px] py-10">
        <MdLock className="h-16 w-16 text-amber-600" aria-hidden />
        <p className="mt-4 max-w-sm text-center text-sm font-semibold text-[#1F2937]">
          {saleEditBarrierError}
        </p>
        <button
          type="button"
          onClick={() => router.push(`${ROUTES.sales}?store=${encodeURIComponent(storeId)}`)}
          className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-[#F97316] px-4 py-3 text-sm font-semibold text-white"
        >
          <MdArrowBack className="h-4 w-4" aria-hidden />
          Retour aux ventes
        </button>
      </div>
    );
  }

  if (mode === "a4-table" && canAccessA4Table && !isSaleEditEntry) {
    if (invoiceTableCompanyQ.isPending) {
      return (
        <div className="box-border flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center bg-[#F8F9FA] px-[20px] py-10">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
          <p className="mt-4 text-sm text-neutral-600">Chargement…</p>
        </div>
      );
    }
    if (invoiceTableCompanyQ.data === false) {
      return (
        <div className="box-border flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-[#F8F9FA] px-[20px] py-10">
          <MdTableChart className="h-16 w-16 text-[#6B7280]" aria-hidden />
          <p className="mt-4 max-w-md text-center text-sm font-semibold text-[#1F2937]">
            L&apos;interface facture en tableau est désactivée pour votre entreprise. Le
            propriétaire peut l&apos;activer dans Paramètres (&quot;Facture A4 — vue
            tableau&quot;).
          </p>
          <Link
            href={ROUTES.settings}
            className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-[#F97316] px-4 py-3 text-sm font-semibold text-white"
          >
            Ouvrir les paramètres
          </Link>
          <Link
            href={ROUTES.stores}
            className="mt-3 text-sm font-semibold text-[#F97316] underline-offset-2 hover:underline"
          >
            Retour aux boutiques
          </Link>
        </div>
      );
    }
  }

  if (
    isSaleEditEntry &&
    saleEditBootstrapping &&
    !saleEditBarrierError &&
    !activeEditSaleId
  ) {
    return (
      <div className="box-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F8F9FA] px-[20px]">
        <header className="flex h-14 shrink-0 items-center bg-[#f97316] px-3 text-white sm:h-[52px] sm:px-4">
          {mode === "quick" ? (
            <MdStore className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" aria-hidden />
          ) : mode === "a4-table" ? (
            <MdTableChart className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" aria-hidden />
          ) : (
            <MdDescription className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" aria-hidden />
          )}
          <span className="ml-2 truncate text-sm font-bold sm:text-base">Ouverture de la vente…</span>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
          <p className="text-sm text-neutral-600">Chargement de la vente à modifier</p>
        </div>
      </div>
    );
  }

  const quitSaleEditHref =
    mode === "quick"
      ? `${ROUTES.stores}/${storeId}/pos-quick`
      : mode === "a4-table"
        ? storeFactureTabPath(storeId)
        : `${ROUTES.stores}/${storeId}/pos`;

  const cartPanel = (
    <PosCartPanel
      mode={mode}
      cartLayout={mode === "a4-table" ? "table" : "cards"}
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
      isSaleEdit={Boolean(activeEditSaleId)}
      onUpdateQty={updateQty}
      onSetQty={setQty}
      onLineUnitChange={setLineUnit}
      onLineUnitPriceCommit={setLineUnitPrice}
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
    <div className="box-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-[#F8F9FA] px-3 overscroll-none sm:px-[18px]">
      {/* Header — hauteur réduite pour densité bureau (zoom visuel à 100 % navigateur) */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 bg-[#f97316] px-3 text-white sm:h-[52px] sm:px-4">
        {mode === "quick" ? (
          <MdStore className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" aria-hidden />
        ) : mode === "a4-table" ? (
          <MdTableChart className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" aria-hidden />
        ) : (
          <MdDescription className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight sm:text-base">
            {mode === "quick"
              ? "POS Caisse Rapide"
              : mode === "a4-table"
                ? "Facture (tableau)"
                : "POS Facture A4"}
          </p>
          <p className="truncate text-[10px] text-white/90 sm:text-[11px]">
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
              <MdHistory className="h-5 w-5" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => setQuickSettingsOpen(true)}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Paramètres"
            >
              <MdSettings className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={exitPos}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Quitter POS"
            >
              <MdLogout className="h-5 w-5" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <Link
              href={`${ROUTES.sales}?store=${encodeURIComponent(storeId)}`}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Historique des ventes de cette boutique"
            >
              <MdHistory className="h-5 w-5" aria-hidden />
            </Link>
            <Link
              href={ROUTES.settings}
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Paramètres application"
            >
              <MdSettings className="h-5 w-5" aria-hidden />
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

      {activeEditSaleId ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 bg-[color-mix(in_srgb,var(--fs-accent)_16%,white)] px-3 py-1.5 text-xs font-semibold text-[#1F2937] sm:text-[13px]">
          <MdEditNote className="h-5 w-5 shrink-0 text-[var(--fs-accent)]" aria-hidden />
          <span className="min-w-0 flex-1 leading-snug">
            {mode === "quick"
              ? "Modification d'une vente (ticket). Enregistrez pour appliquer — connexion requise."
              : "Modification d'une vente (facture A4). Enregistrez pour appliquer — connexion requise."}
          </span>
          <button
            type="button"
            onClick={() => router.replace(quitSaleEditHref)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[var(--fs-accent)] underline underline-offset-2"
          >
            Quitter
          </button>
        </div>
      ) : null}

      {posQ.isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
            <p className="text-sm text-neutral-600">
              {mode === "a4-table"
                ? "Chargement facture (tableau)..."
                : mode === "a4"
                  ? "Chargement Facture A4..."
                  : "Chargement..."}
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
        <div
          className={cn(
            "flex min-h-0 flex-1",
            mode === "a4-table"
              ? "flex-col overflow-hidden"
              : "flex-col min-[900px]:flex-row min-[900px]:overflow-hidden",
          )}
        >
          {/* Zone produits — aligné Flutter : facture-tab = moitié hauteur + moitié panier tableau */}
          <main
            className={cn(
              "flex min-w-0 flex-col bg-white",
              /* Facture tableau : ne pas prendre 50 % en flex-1 — sinon le bandeau 2× rangées
               * mange l’écran et le tableau panier n’a plus de hauteur (footer seul visible). */
              mode === "a4-table"
                ? "max-h-[min(300px,44svh)] min-h-0 shrink-0 overflow-hidden lg:max-h-[min(340px,38svh)]"
                : "min-h-0 min-[900px]:flex-[65] flex-1",
            )}
          >
            <div className="px-3 pb-1.5 pt-1.5 sm:px-4">
              {mode === "quick" ? (
                <div className="relative h-9">
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
                      "h-9 w-full rounded-lg border-[#E5E7EB] bg-white py-1 pl-10 pr-8 text-xs leading-snug text-[#1F2937] placeholder:text-[#1F2937]/50 sm:text-[13px]",
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
                  <div
                    className={cn(
                      "relative min-h-9 min-w-0 flex-1",
                      mode === "a4-table" && "sm:max-w-xl lg:max-w-2xl",
                    )}
                  >
                    <MdSearch
                      className="pointer-events-none absolute left-2 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[#F97316]"
                      aria-hidden
                    />
                    <input
                      className={fsInputClass(
                        "h-9 w-full rounded-lg border-[#E5E7EB] bg-white py-1 pl-8 pr-2.5 text-xs leading-snug text-[#1F2937] placeholder:text-[#1F2937]/50 sm:text-[13px]",
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
                  <div className="flex shrink-0 gap-2 sm:gap-2">
                    <select
                      className={fsInputClass(
                        "h-10 min-w-0 flex-1 rounded-xl border-[#E5E7EB] bg-white px-2 py-1.5 text-xs text-[#1F2937] sm:min-w-[140px] sm:text-sm md:min-w-[180px]",
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
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F97316] text-white shadow-sm transition hover:opacity-95"
                    >
                      <MdPersonAdd className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 overflow-x-auto overflow-y-hidden px-3 py-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
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

            <div
              className={cn(
                "min-h-0 flex-1 px-3 sm:px-4",
                mode === "a4-table"
                  ? "flex min-h-0 flex-col overflow-hidden pb-2"
                  : "pb-28 min-[900px]:pb-4 @container overflow-y-auto",
              )}
            >
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <MdInventory2
                    className="h-16 w-16 text-[#1F2937]/50"
                    aria-hidden
                  />
                  <p className="mt-4 text-sm text-[#1F2937]/80">
                    {search.trim() !== ""
                      ? "Aucun résultat"
                      : mode === "quick"
                        ? "Aucun produit"
                        : "Aucun produit actif"}
                  </p>
                </div>
              ) : mode === "a4-table" ? (
                <div
                  className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:auto] [scrollbar-width:thin]"
                >
                  <div
                    className="grid h-full min-h-0 grid-flow-col grid-rows-1 gap-1.5 py-0.5 content-start"
                    style={{ gridAutoColumns: stripA4TableExtent }}
                  >
                    {filtered.map((p) => {
                      const stock = stockByProductId.get(p.id) ?? 0;
                      const thumb = p.product_images?.[0]?.url ?? null;
                      const price = Number(p.sale_price ?? 0);
                      const priceLine =
                        stock >= 0
                          ? `${formatCurrency(price)} · ${stock}`
                          : formatCurrency(price);
                      const noStock = stock <= 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={noStock}
                          onClick={() => {
                            if (!noStock)
                              addToCart(p.id, p.name, price, p.unit, thumb);
                          }}
                          className={cn(
                            "flex min-h-0 w-full flex-col items-center rounded-lg border bg-white px-1 py-1 text-center transition active:scale-[0.98]",
                            noStock
                              ? "border-[#E5E7EB] opacity-45"
                              : "border border-[#F97316]/35 shadow-[0_1px_6px_rgba(249,115,22,0.07)]",
                          )}
                        >
                          <div className="mx-auto flex h-9 w-full max-w-[3.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#F8F9FA]">
                            {thumb ? (
                              <img src={thumb} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <MdInventory2
                                className="h-5 w-5 text-[#F97316]/70"
                                aria-hidden
                              />
                            )}
                          </div>
                          <p
                            className="mt-0.5 line-clamp-2 w-full flex-1 px-0.5 text-center text-[9px] font-semibold leading-tight text-[#1F2937] sm:text-[10px]"
                            title={p.name}
                          >
                            {p.name}
                          </p>
                          <p
                            className="mt-0.5 w-full truncate px-0.5 text-center text-[9px] font-bold text-[#F97316] sm:text-[10px]"
                            title={priceLine}
                          >
                            {priceLine}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 pb-3 @[420px]:grid-cols-3 @[560px]:grid-cols-4 @[820px]:grid-cols-5 min-[1200px]:grid-cols-6">
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
                          "flex min-h-0 w-full min-w-0 flex-col items-center overflow-hidden rounded-xl bg-white px-2 py-1.5 text-center transition active:scale-[0.98]",
                          "aspect-[0.82] @[400px]:aspect-[0.88] @[600px]:aspect-[0.93]",
                          "border border-[#F97316]/35 shadow-[0_1px_6px_rgba(249,115,22,0.08)]",
                        )}
                      >
                        <div className="mx-auto flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F8F9FA] sm:h-[76px] sm:w-[76px]">
                          {thumb ? (
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <MdInventory2
                              className="h-9 w-9 text-[#F97316]/70"
                              aria-hidden
                            />
                          )}
                        </div>
                        <div className="mt-0.5 flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center">
                          <p
                            className="line-clamp-2 w-full text-center text-[11px] font-semibold leading-snug text-[#1F2937] @[400px]:text-xs"
                            title={p.name}
                          >
                            {p.name}
                          </p>
                          <p
                            className="mt-0.5 w-full truncate text-center text-[10px] font-bold text-[#F97316] @[400px]:text-[11px]"
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

          {mode === "a4-table" ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-[#E5E7EB] bg-[#F8F9FA]">
              {cartPanel}
            </div>
          ) : (
            <aside className="hidden h-full min-h-0 w-[340px] shrink-0 flex-col border-l border-[#E5E7EB] bg-[#F8F9FA] min-[900px]:flex">
              {cartPanel}
            </aside>
          )}
        </div>
      )}

      {/* Barre mobile — Flutter _buildMobileBottomBar */}
      {!isWide && store && !posQ.isLoading && !posQ.isError && mode !== "a4-table" ? (
        <div
          className="fixed bottom-0 left-3 right-3 z-20 border-t border-[#E5E7EB] bg-white px-3 py-2.5 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] min-[900px]:hidden sm:left-[18px] sm:right-[18px]"
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
      {!isWide && cartOpen && mode !== "a4-table" ? (
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

      {isA4Like && companyId ? (
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
        "shrink-0 px-2 py-0.5 text-[11px] font-semibold transition-colors min-[600px]:px-2.5 min-[600px]:text-xs",
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
      className="h-7 w-[56px] rounded-lg border border-[#E5E7EB] bg-white px-1 text-center text-sm font-bold text-[#1F2937] outline-none focus:border-[#F97316]"
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

/** Comme Flutter `PosCartUnitPriceField` : FCFA entiers, debounce ~700 ms. */
const POS_UNIT_PRICE_DEBOUNCE_MS = 700;
const MAX_POS_UNIT_PRICE = 999_999_999;

function PosCartUnitPriceInput({
  productId,
  unitPrice,
  onCommit,
}: {
  productId: string;
  unitPrice: number;
  onCommit: (productId: string, value: number) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(String(Math.round(unitPrice)));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const unitPriceRef = useRef(unitPrice);
  unitPriceRef.current = unitPrice;
  const [display, setDisplay] = useState(() => String(Math.round(unitPrice)));

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const el = inputRef.current;
    if (el && document.activeElement === el) return;
    const want = String(Math.round(unitPrice));
    setDisplay(want);
    draftRef.current = want;
  }, [unitPrice]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const resetToCommitted = () => {
    const want = String(Math.round(unitPriceRef.current));
    setDisplay(want);
    draftRef.current = want;
  };

  const tryCommitParsed = (raw: string) => {
    const digits = raw.replace(/\s/g, "");
    if (digits === "") {
      resetToCommitted();
      return;
    }
    const n = parseInt(digits, 10);
    if (Number.isNaN(n)) {
      resetToCommitted();
      return;
    }
    const v = Math.max(0, Math.min(MAX_POS_UNIT_PRICE, n));
    if (v !== Math.round(unitPriceRef.current)) {
      onCommit(productId, v);
    }
    const s = String(v);
    setDisplay(s);
    draftRef.current = s;
  };

  const scheduleCommit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const t = draftRef.current.trim();
      if (t === "") return;
      tryCommitParsed(t);
    }, POS_UNIT_PRICE_DEBOUNCE_MS);
  };

  const flush = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const t = draftRef.current.trim();
    if (t === "") {
      resetToCommitted();
      return;
    }
    tryCommitParsed(t);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label="Prix unitaire"
      className="h-8 w-full min-w-[72px] max-w-[104px] rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-right text-sm font-bold leading-tight text-[#1F2937] outline-none focus:border-[#F97316]"
      value={display}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, "");
        draftRef.current = raw;
        setDisplay(raw);
        scheduleCommit();
      }}
      onFocus={(e) => e.target.select()}
      onBlur={() => flush()}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        flush();
      }}
    />
  );
}

function PosCartPanel({
  mode,
  cartLayout = "cards",
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
  isSaleEdit,
  onUpdateQty,
  onSetQty,
  onLineUnitChange,
  onLineUnitPriceCommit,
  onRemove,
  onClear,
  onPay,
  hideCartTitle,
  currencyLabel,
}: {
  mode: PosMode;
  cartLayout?: "cards" | "table";
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
  isSaleEdit: boolean;
  onUpdateQty: (id: string, d: number) => void;
  onSetQty: (id: string, q: number) => void;
  onLineUnitChange: (id: string, unit: string) => void;
  onLineUnitPriceCommit: (id: string, unitPrice: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPay: () => void | Promise<void>;
  hideCartTitle?: boolean;
  currencyLabel: string;
}) {
  const isA4Cart = mode !== "quick";
  return (
    /* `flex-1 min-h-0` : obligatoire sous un parent flex-col — `h-full` ne se résout pas
     * toujours et le bloc « tableau » peut se retrouver à hauteur 0 (footer seul visible). */
    <div className="flex min-h-0 flex-1 flex-col">
      {hideCartTitle ? null : (
        <div className="shrink-0 px-3 pb-1.5 pt-2 min-[900px]:block min-[900px]:px-4 min-[900px]:pb-2 min-[900px]:pt-3">
          <p className="text-sm font-bold text-[#1F2937]">
            Panier · {cartCount} article{cartCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-3 min-[900px]:px-3",
          cartLayout === "table" ? "min-h-[120px] overflow-x-auto" : "overflow-x-hidden",
        )}
      >
        {cart.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12 text-[#1F2937]">Panier vide</div>
        ) : cartLayout === "table" ? (
          <div className="min-w-0 pb-2">
            {/*
             * Aligné `pos_invoice_table_cart.dart` : colonnes Flex 3 / 0.85 / 1.1 / 1.25 / 1.0 + 52px,
             * en-têtes Article · Unité · Qté · P.U. · Total · (suppr), bordures comme TableBorder.all.
             */}
            <table className="w-full min-w-[320px] table-auto border-collapse text-left text-[13px] text-[#1F2937]">
              <thead>
                <tr className="bg-[#E5E7EB]/55">
                  <th className="border border-[#E5E7EB] px-2.5 py-3.5 text-left text-sm font-bold text-[#1F2937]">
                    Article
                  </th>
                  <th className="border border-[#E5E7EB] px-2.5 py-3.5 text-left text-sm font-bold text-[#1F2937]">
                    Unité
                  </th>
                  <th className="border border-[#E5E7EB] px-2.5 py-3.5 text-left text-sm font-bold text-[#1F2937]">
                    Qté
                  </th>
                  <th className="border border-[#E5E7EB] px-2.5 py-3.5 text-left text-sm font-bold text-[#1F2937]">
                    P.U.
                  </th>
                  <th className="border border-[#E5E7EB] px-2.5 py-3.5 text-right text-sm font-bold text-[#1F2937]">
                    Total
                  </th>
                  <th className="w-12 min-w-[52px] border border-[#E5E7EB] px-1 py-3.5" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {cart.map((c) => {
                  const stock = stockByProductId.get(c.productId) ?? 0;
                  const low = stock >= 0 && c.quantity > stock;
                  const lineTotal = c.lineTotal ?? c.quantity * c.unitPrice;
                  return (
                    <tr
                      key={c.productId}
                      className={cn("bg-white", low && "bg-red-50/[0.35]")}
                    >
                      <td className="border border-[#E5E7EB] px-1.5 py-2 align-top">
                        <p className="line-clamp-3 text-[15px] font-semibold leading-snug text-[#1F2937]">
                          {c.name}
                        </p>
                        {low ? (
                          <p className="mt-1 text-xs text-red-600">Stock: {stock}</p>
                        ) : null}
                      </td>
                      <td className="truncate border border-[#E5E7EB] px-1.5 py-1.5 align-middle">
                        <select
                          className={fsInputClass(
                            "w-full max-w-full bg-white py-1 pl-1 pr-1 text-[13px] leading-tight text-[#1F2937]",
                          )}
                          value={defaultInvoiceUnitForProduct(c.unit)}
                          onChange={(e) => onLineUnitChange(c.productId, e.target.value)}
                          aria-label="Unité"
                        >
                          {INVOICE_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border border-[#E5E7EB] px-1.5 py-2 align-middle">
                        <div className="flex flex-wrap items-center gap-0.5">
                          {showQuantityButtons ? (
                            <button
                              type="button"
                              onClick={() => onUpdateQty(c.productId, -1)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F8F9FA] text-[#1F2937]"
                              aria-label="Moins"
                            >
                              <span className="text-lg leading-none">−</span>
                            </button>
                          ) : null}
                          {showQuantityInput ? (
                            <div className="w-[72px] shrink-0">
                              <PosCartQtyInput
                                productId={c.productId}
                                quantity={c.quantity}
                                stock={stock}
                                onCommit={onSetQty}
                              />
                            </div>
                          ) : (
                            <span className="min-w-[28px] px-1.5 text-center text-base font-bold text-[#1F2937]">
                              {c.quantity}
                            </span>
                          )}
                          {showQuantityButtons ? (
                            <button
                              type="button"
                              onClick={() => onUpdateQty(c.productId, 1)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F97316] text-white"
                              aria-label="Plus"
                            >
                              <MdAdd className="h-[22px] w-[22px]" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="border border-[#E5E7EB] px-1 py-1.5 align-middle">
                        <PosCartUnitPriceInput
                          productId={c.productId}
                          unitPrice={c.unitPrice}
                          onCommit={onLineUnitPriceCommit}
                        />
                      </td>
                      <td className="border border-[#E5E7EB] px-2.5 py-3.5 align-middle text-right">
                        <span className="inline-block max-w-full truncate text-base font-bold tabular-nums text-[#F97316]">
                          {formatCurrency(lineTotal)}
                        </span>
                      </td>
                      <td className="border border-[#E5E7EB] px-0.5 py-1 align-middle">
                        <button
                          type="button"
                          onClick={() => onRemove(c.productId)}
                          className="mx-auto flex h-10 w-10 shrink-0 items-center justify-center text-red-600"
                          aria-label="Supprimer"
                        >
                          <MdDeleteOutline className="h-[22px] w-[22px]" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="space-y-2 pb-2">
            {cart.map((c) => {
              const stock = stockByProductId.get(c.productId) ?? 0;
              const low = stock >= 0 && c.quantity > stock;
              return (
                <li
                  key={c.productId}
                  className="flex gap-2 rounded-[10px] border border-[#E5E7EB] bg-white px-2 py-1.5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F8F9FA]">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <MdInventory2 className="h-5 w-5 text-[#F97316]/70" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#1F2937]">{c.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {showQuantityButtons ? (
                        <button
                          type="button"
                          onClick={() => onUpdateQty(c.productId, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F8F9FA] text-[#1F2937]"
                          aria-label="Moins"
                        >
                          <span className="text-base leading-none">−</span>
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
                        <span className="min-w-[26px] text-center text-sm font-bold text-[#1F2937]">
                          {c.quantity}
                        </span>
                      )}
                      {showQuantityButtons ? (
                        <button
                          type="button"
                          onClick={() => onUpdateQty(c.productId, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F97316] text-white"
                          aria-label="Plus"
                        >
                          <MdAdd className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                      {low ? (
                        <span className="ml-1 text-xs text-red-600">Stock: {stock}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0">
                    <p className="text-xs font-bold text-[#F97316]">
                      {formatCurrency(c.lineTotal ?? c.quantity * c.unitPrice)}
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
        <div className="mx-0 rounded-xl border border-[#E5E7EB] bg-white p-3 min-[900px]:mx-3 min-[900px]:p-4">
          <div className="flex justify-between text-xs text-[#1F2937] min-[900px]:text-sm">
            <span>Sous-total</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {(showDiscountField || discountValue > 0) ? (
            <div className="mt-1 flex justify-between text-xs text-[#1F2937] min-[900px]:text-sm">
              <span>Remise</span>
              <span>{formatCurrency(discountValue)}</span>
            </div>
          ) : null}
          <div className="mt-1.5 flex items-end justify-between border-t border-[#E5E7EB] pt-1.5 min-[900px]:mt-2 min-[900px]:pt-2">
            <span className="text-sm font-bold text-[#1F2937]">TOTAL</span>
            <span className="text-lg font-extrabold leading-none text-[#F97316] min-[900px]:text-xl">
              {formatCurrency(total)}
            </span>
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

        {isA4Cart ? (
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

        {isA4Cart ? (
          <div className="mt-3 px-0 min-[900px]:px-3">
            <label className="mb-1 block text-xs text-[#6B7280]">
              Acompte (montant payé maintenant)
            </label>
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
            {isSaleEdit ? (
              <>
                {createMut.isPending ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <MdPayments className="h-5 w-5" aria-hidden />
                )}
                {createMut.isPending ? "Enregistrement..." : "Enregistrer la modification"}
              </>
            ) : mode === "quick" ? (
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
