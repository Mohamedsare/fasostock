"use client";

import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { productThumbUrl } from "@/lib/utils/product-thumb-url";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createCustomer, listCustomers } from "@/lib/features/customers/api";
import { P } from "@/lib/constants/permissions";
import { partsModuleOverride } from "@/lib/features/permissions/access";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { usePartCompatibilityMap } from "@/lib/features/parts/use-part-compatibilities";
import { useProductLocationMap } from "@/lib/features/product-locations/use-product-locations";
import type { ProductLocation } from "@/lib/features/product-locations/types";
import {
  fetchPartsPosModelsEnabled,
  peekPartsPosModelsEnabled,
} from "@/lib/features/settings/parts-pos-models";
import {
  fetchProductLocationsPosEnabled,
  peekProductLocationsPosEnabled,
} from "@/lib/features/settings/product-locations-pos";
import type { SaleItem } from "@/lib/features/sales/types";
import {
  createPosSale,
  fetchPosData,
  fetchStoreBestSellerQty,
  updateCompletedPosSale,
} from "@/lib/features/pos/api";
import { packagingPiecePrice } from "@/lib/features/products/packaging-price";
import { productNameMatches } from "@/lib/features/products/search-aliases";
import {
  cancelPosHandoff,
  createPosHandoff,
  listMyRecentHandoffs,
} from "@/lib/features/dual-cashier/api";
import { waitingLabel } from "@/lib/features/dual-cashier/types";
import { useRemotePrintListener } from "@/lib/features/dual-cashier/use-remote-print-listener";
import {
  buildMobileMoneyReference,
  mobileMoneyProviderFromReference,
  mobileMoneyProviderLabel,
  MOBILE_MONEY_PROVIDERS,
  type MobileMoneyProvider,
} from "@/lib/features/payments/payment-display";
import { posEffectiveUnitPrice } from "@/lib/features/pos/wholesale-unit-price";
import { listActiveStorePromotions } from "@/lib/features/promotions/api";
import { fetchStoreLotPrices } from "@/lib/features/quick-supply/api";
import { applyPromoPercent } from "@/lib/features/promotions/promo-math";
import { defaultInvoiceUnitForProduct, INVOICE_UNITS } from "@/lib/features/pos/invoice-units";
import {
  FACTURE_TAB_SPLIT_PX,
  factureTabStripHeightPx,
} from "@/lib/utils/facture-tab-layout";
import { fetchInvoiceTablePosEnabled } from "@/lib/features/settings/invoice-table-pos";
import {
  fetchPrintFormatChoiceEnabled,
  peekPrintFormatChoiceEnabled,
} from "@/lib/features/settings/print-format-choice";
import {
  fetchSaleCustomerPolicy,
  peekSaleCustomerPolicy,
  SALE_CUSTOMER_POLICY_DEFAULT,
} from "@/lib/features/settings/sale-customer-policy";
import {
  allowSaleForCustomer,
  SaleBlockedError,
} from "@/lib/features/credit/customer-debt-guard";
import { fetchQuickPosCreditEnabled } from "@/lib/features/settings/quick-pos-credit";
import {
  fetchDualCashierSelfCheckout,
  peekDualCashierSelfCheckout,
} from "@/lib/features/settings/dual-cashier-self-checkout";
import { fetchQuickPosPriceEditEnabled } from "@/lib/features/settings/quick-pos-price-edit";
import {
  effectiveQuickPosProviders,
  fetchQuickPosPayments,
  peekQuickPosPayments,
  QUICK_POS_PAYMENTS_DEFAULT,
} from "@/lib/features/settings/quick-pos-payments";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { ROUTES, storeFactureTabPath } from "@/lib/config/routes";
import { queryKeys } from "@/lib/query/query-keys";
import { useStoreCatalog } from "@/lib/features/stores/use-store-catalog";
import {
  filterByStoreCatalog,
  filterTaxonomyByStoreCatalog,
} from "@/lib/features/stores/store-catalog";
import { readPosCartQtyUiForMode } from "@/lib/utils/pos-cart-settings";
import { playPosAddBeep } from "@/lib/utils/pos-sound";
import { ensureStringNumberMap } from "@/lib/utils/string-number-map";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { printProvisionalTicket } from "@/lib/features/receipt/print-provisional-ticket";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import { OFFLINE_SALE_ID_PREFIX } from "@/lib/offline/constants";
import {
  MdAdd,
  MdArrowBack,
  MdClose,
  MdDeleteOutline,
  MdDescription,
  MdEditNote,
  MdHistory,
  MdInventory2,
  MdPlace,
  MdLogout,
  MdLock,
  MdPayments,
  MdPersonAdd,
  MdPrint,
  MdQrCodeScanner,
  MdReceiptLong,
  MdRefresh,
  MdSearch,
  MdSend,
  MdStorefront,
  MdSettings,
  MdStore,
  MdTableChart,
  MdTwoWheeler,
} from "react-icons/md";

export type PosMode = "quick" | "a4" | "a4-table";
/**
 * Emplacement en caisse : on affiche le segment le PLUS PRÉCIS (« Étagère B »),
 * pas le chemin entier — c'est celui qui fait marcher le vendeur au bon endroit.
 * Le chemin complet reste en infobulle.
 */
function shortLocationLabel(loc: ProductLocation): string {
  const parts = loc.pathLabel.split("›").map((x) => x.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? loc.pathLabel;
  return loc.code ? `${last} · ${loc.code}` : last;
}

/** Pastille d'emplacement de la caisse (vignette produit et ligne de panier). */
function PosLocationTag({
  loc,
  size = "sm",
}: {
  loc: ProductLocation;
  size?: "xs" | "sm";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 rounded bg-sky-500/12 px-1 font-semibold text-sky-700",
        size === "xs" ? "py-0 text-[9px]" : "py-0.5 text-[10px]",
      )}
      title={loc.detail ? `${loc.pathLabel} — ${loc.detail}` : loc.pathLabel}
    >
      <MdPlace className={cn("shrink-0", size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3")} aria-hidden />
      <span className="truncate">{shortLocationLabel(loc)}</span>
    </span>
  );
}

type CartRow = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  imageUrl?: string | null;
  /** Ligne depuis `sale_items.total` — remises ligne pour RPC update (Flutter). */
  lineTotal?: number;
  /** Si true, ne pas recalculer détail/gros quand la qté change (ex. PU saisi ou édition vente). */
  linePriceUserSet?: boolean;
};

/** Aligné `sale_pos_edit.dart` / liste ventes. */
function isA4InvoiceFromSaleItem(s: SaleItem): boolean {
  if (s.document_type === "a4_invoice") return true;
  if (s.document_type === "thermal_receipt") return false;
  if (s.sale_mode === "invoice_pos") return true;
  if (s.sale_mode === "quick_pos") return false;
  return false;
}

/** `yyyy-mm-dd` (input date) → ISO fin de journée locale, ou null si vide/invalide. */
function creditDueIso(yyyyMmDd: string): string | null {
  const raw = yyyyMmDd.trim();
  if (!raw) return null;
  const d = new Date(`${raw}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Échéance affichée sur le ticket de crédit (« 31/08/2026 »). */
function formatCreditDueLabel(yyyyMmDd: string): string | null {
  const raw = yyyyMmDd.trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR");
}

function isBoutiqueScope(scope: string | null | undefined): boolean {
  const s = scope ?? "both";
  return s === "both" || s === "boutique_only";
}
type PaymentMethod = "cash" | "mobile_money" | "card" | "other";
/**
 * `credit` : vente à crédit en caisse rapide — soumise au réglage entreprise du propriétaire.
 * `mixed` : une partie en espèces, le reste en mobile money (même réserve : réglage owner).
 */
type QuickPayment = "cash" | "mobile_money" | "card" | "credit" | "mixed";

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
  const { data: ctx, helpers: accessH, hasPermission, isLoading: permLoading } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [quickPayment, setQuickPayment] = useState<QuickPayment>("cash");
  /**
   * Mobile money : opérateur encaisseur. Sans valeur par défaut — le caissier choisit,
   * sinon l'historique afficherait « Orange Money » pour un paiement Wave.
   */
  const [mobileProvider, setMobileProvider] = useState<MobileMoneyProvider | null>(null);
  /** Paiement mixte : part réglée en espèces, le reste passe en mobile money. */
  const [splitCashAmount, setSplitCashAmount] = useState("");
  const isPharmacy = ctx?.businessTypeSlug === "pharmacie";
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [discount, setDiscount] = useState("0");
  const [amountReceived, setAmountReceived] = useState("");
  const [amountReceivedTouched, setAmountReceivedTouched] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  /** Caisse rapide à crédit : échéance facultative (`yyyy-mm-dd`) → `sales.credit_due_at`. */
  const [creditDueDate, setCreditDueDate] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [invoiceDialog, setInvoiceDialog] = useState<{
    data: InvoiceA4Data;
    saleId: string;
  } | null>(null);
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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

  /*
   * Caisse à deux (module activé par le propriétaire).
   *
   * Réservé à la caisse rapide : c'est le comptoir à deux personnes que le module décrit.
   * Une facture A4 est un document qu'on rédige avec le client, pas un panier qu'on
   * pousse vers une autre personne — et la modification d'une vente déjà encaissée n'a,
   * elle, rien à envoyer à qui que ce soit.
   */
  const dualCashierOn =
    mode === "quick" && !isSaleEditEntry && canQuick && (accessH?.canSendHandoff ?? false);

  /*
   * Le propriétaire peut RETIRER la porte de sortie « Encaisser ici ».
   *
   * C'est le réglage de celui qui veut que l'argent ne passe que par une seule personne :
   * coupé, le panier du vendeur ne peut plus QUE partir à la caisse. Ouvert par défaut,
   * sinon on retirerait sans préavis un bouton déjà en service chez les clients qui ont
   * activé la caisse à deux.
   */
  const peekSelfCheckout =
    companyId.length > 0 ? peekDualCashierSelfCheckout(companyId) : undefined;
  const selfCheckoutQ = useQuery({
    queryKey: queryKeys.dualCashierSelfCheckout(companyId),
    queryFn: () => fetchDualCashierSelfCheckout(companyId),
    enabled: Boolean(companyId && dualCashierOn),
    staleTime: 60_000,
    ...(peekSelfCheckout !== undefined ? { initialData: peekSelfCheckout } : {}),
  });
  /**
   * Deux conditions, et non une : le propriétaire doit l'avoir laissé ouvert, ET cette
   * personne doit avoir le droit d'encaisser. Un vendeur à qui le propriétaire a retiré
   * `pos.checkout` ne voit plus « Encaisser ici » — son panier ne peut que partir à la
   * caisse, quel que soit le réglage d'entreprise.
   *
   * Le réglage inconnu (requête en vol) vaut autorisé : on ne bloque jamais une vente sur
   * une donnée qui n'est pas encore arrivée.
   */
  const mayCashHere = Boolean(accessH?.isOwner) || hasPermission(P.posCheckout);
  const selfCheckoutAllowed = selfCheckoutQ.data !== false && mayCashHere;

  /**
   * Destination du panier. Le module activé, envoyer à la caisse est le geste NORMAL
   * (c'est pour lui que le propriétaire l'a ouvert) — mais le vendeur peut encaisser
   * lui-même en un clic tant que le propriétaire le permet : le collègue est parti
   * déjeuner, il est seul, le client est pressé.
   */
  const [sendToCashier, setSendToCashier] = useState(true);
  // Réglage coupé pendant que le vendeur était sur « Encaisser ici » : on le ramène au
  // seul mode autorisé, plutôt que de le laisser buter sur un refus au moment de payer.
  useEffect(() => {
    if (dualCashierOn && !selfCheckoutAllowed && !sendToCashier) setSendToCashier(true);
  }, [dualCashierOn, selfCheckoutAllowed, sendToCashier]);
  const handoffMode = dualCashierOn && (sendToCashier || !selfCheckoutAllowed);
  /** Mot du vendeur au caissier (« il paie en Wave », « le monsieur en boubou bleu »). */
  const [handoffNote, setHandoffNote] = useState("");

  const invoiceTableCompanyQ = useQuery({
    queryKey: queryKeys.invoiceTablePosEnabled(companyId),
    queryFn: () => fetchInvoiceTablePosEnabled(companyId),
    enabled: Boolean(companyId && mode === "a4-table" && canAccessA4Table),
    staleTime: 60_000,
  });

  /*
   * Réglage propriétaire « Choisir le format d'impression ». Coupé (le défaut), le
   * document suit la caisse : ticket en caisse rapide, facture A4 en POS Facture.
   * Ouvert, le dialogue d'après-vente propose aussi l'autre format.
   */
  const printFormatChoiceQ = useQuery({
    queryKey: queryKeys.printFormatChoiceEnabled(companyId),
    queryFn: () => fetchPrintFormatChoiceEnabled(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    ...(peekPrintFormatChoiceEnabled(companyId) !== undefined
      ? { initialData: peekPrintFormatChoiceEnabled(companyId) }
      : {}),
  });
  const printFormatChoiceOn = printFormatChoiceQ.data === true;

  /*
   * Réglage propriétaire « Vente au nom d'un client » — les deux règles sont coupées
   * par défaut, et la caisse est alors exactement celle d'avant.
   */
  const saleCustomerPolicyQ = useQuery({
    queryKey: queryKeys.saleCustomerPolicy(companyId),
    queryFn: () => fetchSaleCustomerPolicy(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    ...(peekSaleCustomerPolicy(companyId) !== undefined
      ? { initialData: peekSaleCustomerPolicy(companyId) }
      : {}),
  });
  const saleCustomerPolicy = saleCustomerPolicyQ.data ?? SALE_CUSTOMER_POLICY_DEFAULT;
  /*
   * Une vente déjà enregistrée reste modifiable même si le propriétaire a activé la
   * règle depuis : on n'exige un client que sur les ventes NOUVELLES. Même convention
   * que la vente à crédit et le paiement mixte.
   */
  const requireCustomer = saleCustomerPolicy.requireCustomer && !activeEditSaleId;
  const blockOnDebt = saleCustomerPolicy.blockOnDebt;

  // Vente à crédit en caisse rapide : réglage entreprise activé par le propriétaire
  // (Paramètres › « Caisse POS rapide — vente à crédit »).
  const quickCreditCompanyQ = useQuery({
    queryKey: queryKeys.quickPosCreditEnabled(companyId),
    queryFn: () => fetchQuickPosCreditEnabled(companyId),
    enabled: Boolean(companyId && mode === "quick" && canAccess),
    staleTime: 60_000,
  });
  const quickCreditEnabled = mode === "quick" && quickCreditCompanyQ.data === true;

  // Saisie du prix en caisse rapide : réglage entreprise activé par le propriétaire
  // (Paramètres › « Caisse POS rapide — saisie du prix »). La facture A4 en mode
  // tableau a déjà son champ prix, indépendamment de ce réglage.
  const quickPriceEditCompanyQ = useQuery({
    queryKey: queryKeys.quickPosPriceEditEnabled(companyId),
    queryFn: () => fetchQuickPosPriceEditEnabled(companyId),
    enabled: Boolean(companyId && mode === "quick" && canAccess),
    staleTime: 60_000,
  });
  const quickPriceEditEnabled = mode === "quick" && quickPriceEditCompanyQ.data === true;

  // Encaissement en caisse rapide : opérateurs mobile money proposés, paiement mixte,
  // client masqué (Paramètres › « Caisse POS rapide — encaissement »). Désactivé par
  // défaut : `QUICK_POS_PAYMENTS_DEFAULT` reproduit la caisse d'origine.
  const peekQuickPay = companyId.length > 0 ? peekQuickPosPayments(companyId) : undefined;
  const quickPaymentsQ = useQuery({
    queryKey: queryKeys.quickPosPayments(companyId),
    queryFn: () => fetchQuickPosPayments(companyId),
    enabled: Boolean(companyId && mode === "quick" && canAccess),
    staleTime: 60_000,
    ...(peekQuickPay !== undefined ? { initialData: peekQuickPay } : {}),
  });
  const quickPaymentsSettings =
    mode === "quick" ? (quickPaymentsQ.data ?? QUICK_POS_PAYMENTS_DEFAULT) : QUICK_POS_PAYMENTS_DEFAULT;
  /** Opérateurs réellement proposés au caissier (les trois tant que le réglage est coupé). */
  const allowedProviders = useMemo(
    () => effectiveQuickPosProviders(quickPaymentsSettings),
    [quickPaymentsSettings],
  );
  const quickSplitEnabled =
    mode === "quick" && quickPaymentsSettings.enabled && quickPaymentsSettings.splitEnabled;
  const hideQuickCard =
    mode === "quick" && quickPaymentsSettings.enabled && quickPaymentsSettings.hideCard;
  /*
   * « Client obligatoire » l'emporte sur « masquer le client » : les deux réglages
   * appartiennent au même propriétaire, mais les cumuler donnerait une caisse qui
   * exige un client sans offrir le moyen d'en choisir un — plus personne ne vend.
   */
  const hideQuickCustomer =
    mode === "quick" &&
    quickPaymentsSettings.enabled &&
    quickPaymentsSettings.hideCustomer &&
    !requireCustomer;

  const posQ = useQuery({
    queryKey: ["pos", mode, companyId, storeId] as const,
    queryFn: () =>
      fetchPosData({
        companyId,
        storeId,
        // Caisse rapide : les clients ont leur propre requête (`quickCustomersQ`) —
        // `posQ` se rafraîchit toutes les 15 s pour le stock, inutile de recharger
        // tout le fichier client à ce rythme.
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

  // « En vedette » : classement des meilleures ventes de la boutique (30 derniers jours)
  // pour remonter les produits les plus vendus en tête de grille POS.
  const bestSellerQtyQ = useQuery({
    queryKey: ["pos-best-sellers", companyId, storeId] as const,
    queryFn: () =>
      fetchStoreBestSellerQty({ companyId, storeId, sinceDays: 30 }),
    enabled: Boolean(companyId && storeId && canAccess),
    staleTime: 5 * 60_000,
  });
  const bestSellerQty = bestSellerQtyQ.data;

  // Promotions actives (remise %) pour cette boutique — appliquées automatiquement au prix.
  const promosQ = useQuery({
    queryKey: ["pos-promos", companyId, storeId] as const,
    queryFn: () => listActiveStorePromotions(storeId),
    enabled: Boolean(companyId && storeId && canAccess),
    staleTime: 60_000,
    refetchInterval: mode === "quick" && !isSaleEditEntry ? 60_000 : false,
  });
  /*
   * Prix imposés par un arrivage encore en rayon. Même principe que les promotions
   * ci-dessus : une lecture par boutique, superposée au catalogue.
   *
   * `fetchStoreLotPrices` ne lève jamais — un lecteur de prix en panne doit laisser la
   * caisse vendre au prix du catalogue, jamais l'empêcher de vendre.
   */
  const lotPricesQ = useQuery({
    queryKey: ["pos-supply-lots", companyId, storeId] as const,
    queryFn: () => fetchStoreLotPrices(storeId),
    enabled: Boolean(storeId && canAccess && ctx?.quickSupplyEnabled === true),
    // Le stock d'un lot se vide pendant qu'on vend : on rafraîchit au même rythme que
    // le stock lui-même, sinon la caisse continuerait d'annoncer un prix épuisé.
    staleTime: 20_000,
    refetchInterval: mode === "quick" && !isSaleEditEntry ? 15_000 : false,
  });

  /** Prix de vente d'un lot ouvert, par produit. Un lot sans prix n'y figure pas. */
  const lotSalePriceByProductId = useMemo(() => {
    const m = new Map<string, number>();
    for (const [productId, lot] of lotPricesQ.data ?? new Map()) {
      if (lot.unitSalePrice != null && lot.unitSalePrice > 0) m.set(productId, lot.unitSalePrice);
    }
    return m;
  }, [lotPricesQ.data]);

  /**
   * Prix de base d'un produit : celui de l'arrivage en cours s'il en reste, sinon celui
   * du catalogue. Le prix de gros, lui, garde sa propre logique — c'est une décision
   * commerciale sur le produit, sans rapport avec la caisse de marchandise du jour.
   */
  function baseSalePrice(productId: string, cataloguePrice: number): number {
    return lotSalePriceByProductId.get(productId) ?? cataloguePrice;
  }

  const promoPctByProductId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of promosQ.data ?? []) m.set(r.productId, r.discountPercent);
    return m;
  }, [promosQ.data]);

  const store = posQ.data?.store ?? null;
  // Format ticket réglé sur la boutique (dialogue « Caisse rapide » de la page
  // Boutiques), sinon 80 mm par défaut.
  const thermalPaperWidthMm: 58 | 80 =
    store?.receipt_paper_width_mm === 58 || store?.receipt_paper_width_mm === 80
      ? store.receipt_paper_width_mm
      : 80;

  const stripCol1900 = useMediaQuery("(min-width: 1900px)");
  const stripCol1400 = useMediaQuery("(min-width: 1400px)");
  const stripMainExtent = stripCol1900 ? 172 : stripCol1400 ? 152 : 132;
  /** Hauteur grille 2 rangées — `PosProductTwoRowHorizontalStrip` Flutter. */
  const factureStripGridH = stripCol1900 ? 332 : stripCol1400 ? 304 : 282;

  /**
   * Facture (tableau) sur grand écran : catalogue à gauche (grille verticale
   * plein écran), tableau du panier à droite. Le bandeau horizontal de 250 px
   * ne montrait qu'une demi-rangée de vignettes — impossible de chercher un
   * produit sans scroller dans un cadre minuscule.
   */
  const factureSplitW = useMediaQuery(`(min-width: ${FACTURE_TAB_SPLIT_PX}px)`);
  const factureSplit = mode === "a4-table" && factureSplitW;

  const factureTabBodyRef = useRef<HTMLDivElement>(null);
  const factureTabCardRef = useRef<HTMLDivElement>(null);
  const [factureTabStripH, setFactureTabStripH] = useState(250);

  useLayoutEffect(() => {
    if (mode !== "a4-table" || factureSplit || !store || posQ.isLoading || posQ.isError)
      return;
    const el = factureTabBodyRef.current;
    if (!el) return;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      const w = typeof window !== "undefined" ? window.innerWidth : 1200;
      // Hauteur réelle de la carte (recherche + catégories + 2 rangées) : le
      // bandeau se dimensionne dessus au lieu d'un ratio arbitraire, sinon les
      // vignettes sont coupées. `+10` = marges verticales autour de la carte.
      const card = factureTabCardRef.current;
      const content = card ? card.scrollHeight + 10 : 0;
      setFactureTabStripH(factureTabStripHeightPx(h, w, content));
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    if (factureTabCardRef.current) ro.observe(factureTabCardRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [mode, factureSplit, store, posQ.isLoading, posQ.isError]);

  /**
   * Module Emplacements — rappel « où aller chercher l'article » sur les vignettes
   * produit et sur les lignes du panier (le panier devient une liste de préparation).
   * Deux verrous : le module doit être activé pour l'entreprise ET le propriétaire
   * doit avoir demandé l'affichage en caisse. Sans les deux, aucune requête n'est
   * lancée et la caisse est exactement celle d'avant.
   */
  const locationsModuleOn = ctx?.productLocationsEnabled === true;
  /**
   * « Autres noms » : le client dit « Omo », le catalogue dit « savon en poudre ».
   * Activé par le propriétaire ⇒ la recherche caisse accepte les deux.
   */
  const productAliasesOn = ctx?.productAliasesEnabled === true;
  const peekLocationsPos =
    companyId.length > 0 && locationsModuleOn
      ? peekProductLocationsPosEnabled(companyId)
      : undefined;
  const locationsPosQ = useQuery({
    queryKey: queryKeys.productLocationsPosEnabled(companyId),
    queryFn: () => fetchProductLocationsPosEnabled(companyId),
    enabled: Boolean(companyId) && locationsModuleOn,
    staleTime: 5 * 60_000,
    ...(peekLocationsPos !== undefined ? { initialData: peekLocationsPos } : {}),
  });
  const showLocations = locationsModuleOn && locationsPosQ.data === true;
  const locationsQ = useProductLocationMap(storeId, showLocations);
  const locationByProduct: Map<string, ProductLocation> | null =
    showLocations ? (locationsQ.data ?? null) : null;

  /**
   * Module Pièces — « à quel engin cette pièce correspond-elle ? ». Affiché au
   * moment de choisir le conditionnement. Deux verrous, comme les emplacements :
   * le module Pièces doit être ouvert ET le propriétaire doit avoir demandé
   * l'affichage en caisse (page Pièces). Sans les deux, aucune requête.
   */
  const partsModuleOn = partsModuleOverride(ctx);
  const peekPartsPos =
    companyId.length > 0 && partsModuleOn ? peekPartsPosModelsEnabled(companyId) : undefined;
  const partsPosQ = useQuery({
    queryKey: queryKeys.partsPosModelsEnabled(companyId),
    queryFn: () => fetchPartsPosModelsEnabled(companyId),
    enabled: Boolean(companyId) && partsModuleOn,
    staleTime: 5 * 60_000,
    ...(peekPartsPos !== undefined ? { initialData: peekPartsPos } : {}),
  });
  const showPartModels = partsModuleOn && partsPosQ.data === true;
  const partModelsQ = usePartCompatibilityMap(companyId, showPartModels);
  const partModelsByProduct: Map<string, string[]> | null = showPartModels
    ? (partModelsQ.data ?? null)
    : null;

  const { catalog: storeCatalog } = useStoreCatalog(storeId);
  const products = useMemo(
    () => filterByStoreCatalog(posQ.data?.products ?? [], storeCatalog),
    [posQ.data?.products, storeCatalog],
  );
  type PosProduct = (typeof products)[number];
  // Sélecteur de conditionnement à l'ajout au panier (Pièce par défaut).
  const [pkgChooser, setPkgChooser] = useState<{ productId: string; thumb: string | null } | null>(
    null,
  );
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
  // Index code-barres conditionnement → produit + facteur + prix (caisse rapide).
  // Permet de scanner un paquet/carton : ajoute `factor` pièces au prix du
  // conditionnement, le stock restant compté en pièces.
  const packagingByBarcode = useMemo(() => {
    const m = new Map<
      string,
      { product: (typeof products)[number]; factor: number; price: number | null; label: string }
    >();
    for (const p of products) {
      for (const pkg of p.product_packagings ?? []) {
        const bc = (pkg.barcode ?? "").trim().toLowerCase();
        if (!bc || m.has(bc)) continue;
        m.set(bc, {
          product: p,
          factor: Math.max(1, Math.floor(pkg.factor)),
          price: pkg.price != null ? pkg.price : null,
          label: pkg.label,
        });
      }
    }
    return m;
  }, [products]);
  // Catalogue perso : les chips catégorie ne montrent que celles utilisées par les
  // produits du catalogue de la boutique (sinon toutes celles de l'entreprise).
  const categories = useMemo(
    () =>
      filterTaxonomyByStoreCatalog(
        posQ.data?.categories ?? [],
        products,
        (p) => p.category_id,
        storeCatalog,
      ),
    [posQ.data?.categories, products, storeCatalog],
  );
  // Caisse rapide : fichier client à part (cache long) — un client peut être associé
  // à n'importe quelle vente, même comptant.
  const quickCustomersQ = useQuery({
    queryKey: queryKeys.customers(companyId),
    queryFn: () => listCustomers(companyId),
    enabled: Boolean(companyId && mode === "quick" && canAccess),
    staleTime: 5 * 60_000,
  });
  const customers = isA4Like ? (posQ.data?.customers ?? []) : (quickCustomersQ.data ?? []);
  const showDiscountField = store?.pos_discount_enabled === true;
  const currencyLabel = store?.currency?.trim() || "XOF";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      if (!p.is_active) return false;
      if (!isBoutiqueScope(p.product_scope)) return false;
      const stock = stockByProductId.get(p.id) ?? 0;
      if (stock <= 0) return false;
      if (categoryId && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        productNameMatches(p, q, productAliasesOn) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.product_packagings ?? []).some((pk) =>
          (pk.barcode ?? "").toLowerCase().includes(q),
        )
      );
    });
    // « En vedette » : les meilleures ventes (30 j) remontent en tête, triées par
    // quantité vendue décroissante ; le reste (quantité 0) garde l'ordre du catalogue
    // grâce au tri stable de `Array.prototype.sort`.
    if (bestSellerQty && bestSellerQty.size > 0) {
      const qtyOf = (id: string) => bestSellerQty.get(id) ?? 0;
      list.sort((a, b) => qtyOf(b.id) - qtyOf(a.id));
    }
    return list;
  }, [products, stockByProductId, categoryId, search, bestSellerQty, productAliasesOn]);

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

  /** Caisse rapide à crédit : vente réglée en partie (acompte) ou pas du tout. */
  const isQuickCreditSale = mode === "quick" && quickPayment === "credit";
  /** Facture A4 « À crédit » : même logique — l'acompte saisi est réellement encaissé. */
  const isA4CreditSale = isA4Like && paymentMethod === "other";
  const isCreditSale = isQuickCreditSale || isA4CreditSale;
  /** Vente réglée en deux fois au comptoir : une part espèces, le reste en mobile money. */
  const isMixedSale = mode === "quick" && quickPayment === "mixed";
  /** Part espèces du paiement mixte, bornée au total (le reste part en mobile money). */
  const splitCashValue = isMixedSale
    ? Math.min(Math.max(0, toNumber(splitCashAmount)), total)
    : 0;
  const splitMobileValue = isMixedSale ? Math.max(0, total - splitCashValue) : 0;
  /** Vente encaissée en mobile money : l'opérateur doit être précisé. */
  const isMobileMoneySale =
    mode === "quick"
      ? quickPayment === "mobile_money" || isMixedSale
      : paymentMethod === "mobile_money";
  /** Acompte encaissé au comptoir sur une vente à crédit (0 = rien encaissé). */
  const creditDownPayment = isCreditSale
    ? Math.min(Math.max(0, amountReceivedValue), total)
    : 0;
  const creditRemaining = isCreditSale ? Math.max(0, total - creditDownPayment) : 0;

  // Le propriétaire a coupé la vente à crédit pendant la session : on repasse en espèces.
  useEffect(() => {
    if (!quickCreditEnabled && quickPayment === "credit" && !activeEditSaleId) {
      setQuickPayment("cash");
    }
  }, [quickCreditEnabled, quickPayment, activeEditSaleId]);

  /*
   * Client masqué : on efface aussi la sélection, sinon un client choisi juste avant
   * que le propriétaire ne coupe l'option resterait attaché aux ventes suivantes sans
   * que le caissier puisse le voir. La vente à crédit garde son client (obligatoire),
   * et une vente rouverte conserve le sien (on ne dépouille pas l'historique).
   */
  useEffect(() => {
    if (!hideQuickCustomer || activeEditSaleId) return;
    if (quickPayment !== "credit" && customerId) setCustomerId("");
  }, [hideQuickCustomer, activeEditSaleId, quickPayment, customerId]);

  // Idem pour le paiement mixte coupé en cours de session.
  useEffect(() => {
    if (!quickSplitEnabled && quickPayment === "mixed" && !activeEditSaleId) {
      setQuickPayment("cash");
    }
  }, [quickSplitEnabled, quickPayment, activeEditSaleId]);

  // Carte retirée par le propriétaire : on repasse en espèces plutôt que d'encaisser
  // sur un mode qui n'est plus affiché.
  useEffect(() => {
    if (hideQuickCard && quickPayment === "card" && !activeEditSaleId) {
      setQuickPayment("cash");
    }
  }, [hideQuickCard, quickPayment, activeEditSaleId]);

  /*
   * Un seul opérateur autorisé : le caissier n'a rien à choisir, on le pose d'office.
   * Et si l'opérateur mémorisé n'est plus proposé (le propriétaire vient de le
   * décocher), on l'efface plutôt que d'écrire un opérateur interdit dans l'historique.
   */
  useEffect(() => {
    if (mode !== "quick") return;
    // Modification d'une vente déjà enregistrée : on ne réécrit pas son opérateur d'origine.
    if (activeEditSaleId) return;
    if (allowedProviders.length === 1) {
      const only = allowedProviders[0];
      if (mobileProvider !== only) setMobileProvider(only);
      return;
    }
    if (mobileProvider && !allowedProviders.includes(mobileProvider)) {
      setMobileProvider(null);
    }
  }, [mode, allowedProviders, mobileProvider, activeEditSaleId]);

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
    // Réglage propriétaire : toute vente est au nom d'un client, dans les trois POS.
    if (requireCustomer && !customerId) {
      return "Cette vente doit être au nom d'un client : choisissez-le, ou créez-le avec son numéro.";
    }
    if (isA4CreditSale && !customerId) {
      return "Associez un client pour une vente à crédit.";
    }
    if (isA4CreditSale && total > 0 && amountReceivedValue >= total) {
      return "L'acompte couvre tout le total : choisissez un paiement comptant.";
    }
    if (isQuickCreditSale) {
      // Une vente à crédit déjà enregistrée reste modifiable même si le
      // propriétaire a coupé le réglage depuis : on ne bloque que les nouvelles.
      if (!quickCreditEnabled && !activeEditSaleId) {
        return "La vente à crédit n'est pas activée pour cette entreprise.";
      }
      if (!customerId) {
        return "Choisissez le client à qui vous faites crédit.";
      }
      if (amountReceivedValue >= total) {
        return "L'acompte couvre tout le total : choisissez un paiement comptant.";
      }
    }
    if (
      mode === "quick" &&
      quickPayment === "cash" &&
      amountReceivedTouched &&
      amountReceivedValue < total
    ) {
      return "Montant reçu insuffisant.";
    }
    if (isMixedSale) {
      // Une vente mixte déjà enregistrée reste modifiable même si le propriétaire a
      // coupé le réglage depuis : on ne bloque que les nouvelles.
      if (!quickSplitEnabled && !activeEditSaleId) {
        return "Le paiement mixte n'est pas activé pour cette entreprise.";
      }
      if (splitCashValue <= 0) {
        return "Indiquez la part payée en espèces (sinon choisissez MOBILE).";
      }
      if (splitMobileValue <= 0) {
        return "Les espèces couvrent tout le total : choisissez CASH.";
      }
    }
    // Sans opérateur, l'historique ne dirait que « Mobile Money » : on l'exige à la vente.
    if (isMobileMoneySale && !mobileProvider) {
      return allowedProviders.length === 1
        ? "Choisissez l'opérateur mobile money."
        : `Choisissez l'opérateur mobile money (${allowedProviders
            .map((id) => mobileMoneyProviderLabel(id))
            .join(", ")}).`;
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
            linePriceUserSet: true,
          });
        }
        setEditStockRelease(release);
        setCart(rows);
        setDiscount(sale.discount > 0 ? String(sale.discount) : "0");
        const pays = sale.sale_payments ?? [];
        // Ligne `other` = solde mis à crédit : la vente garde sa nature à la modification.
        const hadCredit = pays.some((p) => p.method === "other");
        // Espèces + mobile money sur la même vente = paiement mixte : sans ce test, la
        // réouverture la prendrait pour du comptant et écraserait la part mobile money.
        const cashLine = pays.find((p) => p.method === "cash");
        const mobileLine = pays.find((p) => p.method === "mobile_money");
        const wasMixed = !hadCredit && Boolean(cashLine) && Boolean(mobileLine);
        if (wasMixed && mode === "quick") {
          setQuickPayment("mixed");
          setSplitCashAmount(String(cashLine?.amount ?? 0));
          setMobileProvider(mobileMoneyProviderFromReference(mobileLine?.reference));
          setAmountReceivedTouched(false);
          setAmountReceived("");
        } else if (pays.length > 0) {
          const pm = pays[0].method;
          if (hadCredit) {
            // Vente à crédit : la ligne `cash` d'acompte ne doit pas la faire
            // passer pour comptant à la réouverture (facture A4 comprise).
            if (mode === "quick") setQuickPayment("credit");
            else setPaymentMethod("other");
          } else if (pm === "cash" || pm === "mobile_money" || pm === "card") {
            if (mode === "quick") setQuickPayment(pm as QuickPayment);
            else setPaymentMethod(pm as PaymentMethod);
            // Mobile money : l'opérateur d'origine est relu dans la référence.
            if (pm === "mobile_money") {
              setMobileProvider(mobileMoneyProviderFromReference(pays[0].reference));
            }
          } else if (pm === "other" && mode !== "quick") {
            setPaymentMethod("other");
          }
          // À crédit : seul l'encaissement réel (hors `other`) est un acompte.
          const sum = pays.reduce(
            (s, x) => (hadCredit && x.method === "other" ? s : s + x.amount),
            0,
          );
          setAmountReceivedTouched(true);
          setAmountReceived(sum > 0 ? String(sum) : "");
        }
        setCustomerId(sale.customer_id ?? "");
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
  type PosPaymentLine = {
    method: PaymentMethod;
    amount: number;
    reference?: string | null;
  };

  /**
   * Lignes de paiement de la caisse rapide. À crédit : l'acompte RÉELLEMENT encaissé
   * (espèces au comptoir) puis une ligne `other` « À crédit » pour le reste — c'est la
   * convention lue par la page Crédit (`realizedPaidTotal` ignore `other`) et par les
   * rapports (« crédit accordé » = Σ des lignes `other`).
   */
  function buildQuickPayments(): PosPaymentLine[] {
    if (isQuickCreditSale) return buildCreditPayments();
    // Mixte : deux lignes réelles (espèces + mobile money) — l'historique, les rapports
    // et la caisse voient exactement ce que le client a donné, sans arrondi ni fiction.
    if (isMixedSale) {
      return [
        { method: "cash", amount: splitCashValue },
        {
          method: "mobile_money",
          amount: splitMobileValue,
          reference: mobileMoneyReference("mobile_money"),
        },
      ];
    }
    const method = quickPayment as PaymentMethod;
    return [{ method, amount: total, reference: mobileMoneyReference(method) }];
  }

  /**
   * Opérateur mobile money écrit dans `sale_payments.reference` : c'est lui que relit
   * l'historique des ventes pour afficher « Orange Money » plutôt que « Mobile Money ».
   */
  function mobileMoneyReference(method: PaymentMethod): string | null {
    if (method !== "mobile_money") return null;
    return buildMobileMoneyReference(mobileProvider);
  }

  /**
   * Vente à crédit (caisse rapide OU facture A4) : ligne d'acompte réellement
   * encaissé + ligne `other` pour le solde dû. Sans la ligne d'acompte, la facture
   * A4 s'imprimait « Total encaissé 0 » alors que le client avait payé.
   */
  function buildCreditPayments(): PosPaymentLine[] {
    const lines: PosPaymentLine[] = [];
    if (creditDownPayment > 0) {
      lines.push({ method: "cash", amount: creditDownPayment });
    }
    if (creditRemaining > 0 || lines.length === 0) {
      lines.push({ method: "other", amount: creditRemaining, reference: "À crédit" });
    }
    return lines;
  }

  /** Facture A4 : à crédit (acompte + solde) ou comptant (montant réellement reçu). */
  function buildInvoicePayments(): PosPaymentLine[] {
    if (isA4CreditSale) return buildCreditPayments();
    const acompte = amountReceivedValue;
    const normalized = acompte <= 0 ? total : Math.min(Math.max(acompte, 0.01), total);
    return [
      {
        method: paymentMethod,
        amount: normalized,
        reference: mobileMoneyReference(paymentMethod),
      },
    ];
  }

  const createMut = useMutation({
    mutationFn: async (): Promise<CreatePayResult | UpdatePayResult> => {
      if (cart.length === 0) throw new Error("Panier vide.");
      const pre = getPosPayValidationError();
      if (pre) throw new Error(pre);
      const editingId = activeEditSaleIdRef.current;
      /*
       * Dette en cours : dernier contrôle avant que l'argent ne change de mains.
       * Dans la mutation et non dans le bouton, pour que le bouton reste occupé
       * pendant la lecture — sinon un double appui ferait passer la vente.
       * Une vente déjà enregistrée qu'on corrige n'est pas un nouvel achat : on ne
       * la bloque pas, sinon une erreur de saisie deviendrait impossible à réparer.
       */
      if (!editingId) {
        const allowed = await allowSaleForCustomer({
          enabled: blockOnDebt,
          companyId,
          customerId,
          customers,
        });
        if (!allowed) throw new SaleBlockedError();
      }
      if (editingId) {
        const payments = mode === "quick" ? buildQuickPayments() : buildInvoicePayments();
        await updateCompletedPosSale({
          saleId: editingId,
          // Client facultatif sur toute vente (comptant ou crédit), quel que soit le mode.
          customerId: customerId || null,
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
      const payments = mode === "quick" ? buildQuickPayments() : buildInvoicePayments();
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
                lineTotal: c.lineTotal,
              })),
              subtotal,
              discount: discountValue,
              total,
              quickPayment,
              mobileProvider:
                quickPayment === "mobile_money" || isMixedSale ? mobileProvider : null,
              // Ticket d'une vente mixte : le client doit lire les deux parts payées.
              splitCash: isMixedSale ? splitCashValue : null,
              splitMobile: isMixedSale ? splitMobileValue : null,
              amountReceivedValue,
              change,
              // Imprimé dès qu'un client est associé, même sur une vente comptant.
              customerName: customerId
                ? (customers.find((c) => c.id === customerId)?.name ?? null)
                : null,
              creditPaid: creditDownPayment,
              creditRemaining,
              creditDueLabel: isQuickCreditSale
                ? formatCreditDueLabel(creditDueDate)
                : null,
            }
          : undefined;
      const res = await createPosSale({
        companyId,
        storeId,
        // Client facultatif sur toute vente (comptant ou crédit), quel que soit le mode.
        customerId: customerId || null,
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          // Remise de ligne = écart entre qté×PU et le total exact (lineTotal).
          // Sert l'exactitude du prix d'un conditionnement (carton/paquet).
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
        prescriptionNumber: isPharmacy ? prescriptionNumber.trim() || null : null,
        creditDueAt: isCreditSale ? creditDueIso(creditDueDate) : null,
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
        setSplitCashAmount("");
        setCustomerId("");
        setCreditDueDate("");
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
      setSplitCashAmount("");
      setCustomerId("");
      setCreditDueDate("");
      setPrescriptionNumber("");
      // Vente à crédit ou mixte soldée : la caisse revient au comptant pour le client suivant.
      if (quickPayment === "credit" || quickPayment === "mixed") setQuickPayment("cash");
      if (res.saleId.startsWith(OFFLINE_SALE_ID_PREFIX)) {
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
        if (res.saleId.startsWith(OFFLINE_SALE_ID_PREFIX)) {
          toast.info("Facture PDF : disponible après synchronisation (vente en file d’attente).");
        } else
        try {
          const [
            { getSaleDetail },
            { buildInvoiceA4Data },
            { fetchLogoBytes },
            { paymentLinesFromSalePayments },
            { creditDueLabelFromIso },
          ] = await Promise.all([
            import("@/lib/features/sales/api"),
            import("@/lib/features/invoices/build-invoice-a4-data"),
            import("@/lib/features/invoices/generate-invoice-pdf"),
            import("@/lib/features/invoices/invoice-a4-payment-lines"),
            import("@/lib/features/invoices/build-invoice-a4-from-sale-detail"),
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
            creditDueLabel: creditDueLabelFromIso(detail?.credit_due_at),
            logoBytes,
          });
          setInvoiceDialog({ data: inv, saleId: res.saleId });
        } catch (e) {
          toast.error(messageFromUnknownError(e, "Facture PDF indisponible."));
        }
      }

      if (mode === "quick" && store && res.receiptSnap) {
        const queuedOffline = res.saleId.startsWith(OFFLINE_SALE_ID_PREFIX);
        let saleDate = new Date();
        if (!queuedOffline) {
          try {
            const { getSaleDetail } = await import("@/lib/features/sales/api");
            const detail = await getSaleDetail(res.saleId);
            if (detail?.created_at) saleDate = new Date(detail.created_at);
          } catch {
            /* date serveur optionnelle */
          }
        }
        const ticketData = buildReceiptTicketData(
          store,
          res.saleNumber,
          res.receiptSnap,
          saleDate,
          res.saleId,
        );

        /*
         * Hors ligne, le ticket habituel est impossible : il est fabriqué par une route
         * serveur. Le client repartait donc sans justificatif, au moment précis où il
         * vient de payer. On imprime un ticket provisoire, fabriqué dans le navigateur.
         */
        if (queuedOffline) {
          const printed = printProvisionalTicket(ticketData, {
            localReference: res.saleId.slice(OFFLINE_SALE_ID_PREFIX.length),
            paperWidthMm: thermalPaperWidthMm,
          });
          if (!printed) {
            toast.info(
              "Ticket provisoire bloqué par le navigateur : autorisez les fenêtres surgissantes pour l’imprimer.",
            );
          }
          return;
        }

        let auto = false;
        try {
          auto = localStorage.getItem("pos_quick_auto_print") === "true";
        } catch {
          auto = quickAutoPrint;
        }
        if (auto) {
          try {
            const blob = await generateReceiptThermalPdfBlob(ticketData, {
              paperWidthMm: thermalPaperWidthMm,
            });
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
    onError: (e) => {
      // Vente refusée pour dette : le toast d'explication est déjà à l'écran.
      if (e instanceof SaleBlockedError) return;
      toast.error(messageFromUnknownError(e));
    },
  });

  /*
   * ── Caisse à deux : envoyer le panier, puis savoir ce qu'il est devenu ──────────
   *
   * Envoyer ne suffit pas. Le vendeur garde le client en face de lui : il doit voir,
   * sans quitter sa caisse, que le bon a été encaissé (« c'est bon, allez-y ») ou refusé
   * (« revenez, il manque quelque chose »). D'où le suivi ci-dessous, rafraîchi au même
   * rythme que la file du caissier.
   */
  const posUserIdQ = useQuery({
    queryKey: ["pos-user-id"] as const,
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
    staleTime: 10 * 60_000,
  });
  const myUserId = posUserIdQ.data ?? null;

  /** Fenêtre du suivi : les bons de la journée. Au-delà, la page Encaissement. */
  const handoffSinceIso = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const myHandoffsQ = useQuery({
    queryKey: queryKeys.posHandoffsMine(companyId, storeId),
    queryFn: () =>
      listMyRecentHandoffs({
        companyId,
        storeId,
        userId: myUserId ?? "",
        sinceIso: handoffSinceIso,
      }),
    enabled: Boolean(dualCashierOn && companyId && storeId && myUserId),
    refetchInterval: dualCashierOn ? 5000 : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  /*
   * Notification du dénouement. On compare l'état précédent au nouveau plutôt que
   * d'afficher une liste que le vendeur devrait surveiller : au comptoir, on ne
   * surveille rien — on est prévenu.
   */
  const handoffStatusRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const rows = myHandoffsQ.data;
    if (!rows) return;
    const previous = handoffStatusRef.current;
    const next = new Map<string, string>();
    for (const r of rows) next.set(r.id, r.status);
    if (previous.size > 0) {
      for (const r of rows) {
        const before = previous.get(r.id);
        if (!before || before === r.status || before !== "pending") continue;
        if (r.status === "paid") {
          toast.success(`Bon ${r.number} encaissé par ${r.paidByName ?? "la caisse"}.`);
        } else if (r.status === "cancelled") {
          toast.error(
            r.cancelReason
              ? `Bon ${r.number} annulé : ${r.cancelReason}`
              : `Bon ${r.number} annulé par la caisse.`,
          );
        }
      }
    }
    handoffStatusRef.current = next;
  }, [myHandoffsQ.data]);

  const myPendingHandoffs = useMemo(
    () => (myHandoffsQ.data ?? []).filter((x) => x.status === "pending"),
    [myHandoffsQ.data],
  );

  /*
   * Identifiant d'envoi du panier courant.
   *
   * Il survit à un échec (le vendeur rappuie : même identifiant, donc le même bon si
   * la base l'avait bien reçu) mais pas à une modification du panier — sinon un
   * renvoi après correction rendrait l'ancienne version au caissier. D'où sa remise à
   * zéro dès que le contenu du panier bouge.
   */
  const handoffRequestIdRef = useRef<string | null>(null);
  useEffect(() => {
    handoffRequestIdRef.current = null;
  }, [cart]);

  const handoffMut = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Panier vide.");
      if (total <= 0) throw new Error("Le total est à zéro.");
      /*
       * Le bon part sans moyen de paiement, mais pas sans client quand le propriétaire
       * l'exige : le vendeur a le client devant lui, le caissier ne l'aura pas. C'est
       * ici, et nulle part ailleurs, qu'on peut lui demander son numéro.
       */
      if (requireCustomer && !customerId) {
        throw new Error(
          "Cette vente doit être au nom d'un client : choisissez-le, ou créez-le avec son numéro.",
        );
      }
      if (!handoffRequestIdRef.current) {
        handoffRequestIdRef.current = crypto.randomUUID();
      }
      return createPosHandoff({
        clientRequestId: handoffRequestIdRef.current,
        companyId,
        storeId,
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          // Même remise de ligne qu'en caisse : elle absorbe l'arrondi d'un
          // conditionnement pour que le caissier lise le prix exact annoncé au client.
          discount: Math.max(
            0,
            c.quantity * c.unitPrice - (c.lineTotal ?? c.quantity * c.unitPrice),
          ),
        })),
        customerId: customerId || null,
        discount: discountValue,
        note: handoffNote.trim() || null,
        prescriptionNumber: isPharmacy ? prescriptionNumber.trim() || null : null,
        saleMode: "quick_pos",
        documentType: "thermal_receipt",
      });
    },
    onSuccess: async (res) => {
      // Le panier repart à zéro tout de suite : le vendeur enchaîne avec le client
      // suivant pendant que le premier traverse le magasin vers la caisse.
      setCart([]);
      setDiscount("0");
      setAmountReceived("");
      setAmountReceivedTouched(false);
      setSplitCashAmount("");
      setCustomerId("");
      setPrescriptionNumber("");
      setHandoffNote("");
      setCartOpen(false);
      toast.success(
        res.number
          ? `Panier envoyé à la caisse — bon ${res.number}. Annoncez ce numéro au client.`
          : "Panier envoyé à la caisse.",
      );
      await qc.invalidateQueries({ queryKey: ["pos-handoffs", companyId] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Envoi à la caisse impossible.")),
  });

  /*
   * L'imprimante thermique est branchée ICI, pas à la caisse. Ce poste écoute donc les
   * tickets que le caissier lui envoie et les sort sur place — le client les reçoit là
   * où il est, au lieu qu'on lui traverse le magasin.
   */
  useRemotePrintListener({
    enabled: Boolean(dualCashierOn && myUserId && store),
    userId: myUserId,
    store,
  });

  /** Rappeler un bon envoyé par erreur — tant que le caissier ne l'a pas encaissé. */
  const handoffCancelMut = useMutation({
    mutationFn: (id: string) => cancelPosHandoff(id, "Rappelé par le vendeur"),
    onSuccess: async () => {
      toast.success("Bon rappelé. Il a disparu de la file du caissier.");
      await qc.invalidateQueries({ queryKey: ["pos-handoffs", companyId] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Rappel impossible.")),
  });

  function catalogUnitPrice(productId: string, quantity: number): number {
    const p = products.find((x) => x.id === productId);
    if (!p) return 0;
    const base = posEffectiveUnitPrice(
      // Prix de l'arrivage s'il en reste : cette marchandise-là se vend à SON prix.
      baseSalePrice(productId, Number(p.sale_price ?? 0)),
      p.wholesale_price ?? 0,
      p.wholesale_qty ?? 0,
      quantity,
    );
    // Promotion active sur ce produit dans cette boutique : remise appliquée au prix.
    const pct = promoPctByProductId.get(productId) ?? 0;
    return pct > 0 ? applyPromoPercent(base, pct) : base;
  }

  function addToCart(
    productId: string,
    name: string,
    unit: string,
    imageUrl?: string | null,
  ) {
    const stock = stockByProductId.get(productId) ?? 0;
    // Bip hors de l'updater `setCart` (effet de bord) : décision prise de façon
    // SYNCHRONE sur l'état `cart` courant, même caveat que `addUnitsToCart`.
    // On ne sonne que si l'ajout va être accepté (sinon un toast stock suffit).
    if ((cart.find((p) => p.productId === productId)?.quantity ?? 0) + 1 <= stock) {
      playPosAddBeep();
    }
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.productId === productId);
      if (idx < 0) {
        if (stock <= 0) return prev;
        const qty = 1;
        return [
          ...prev,
          {
            productId,
            name,
            quantity: qty,
            unitPrice: catalogUnitPrice(productId, qty),
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
      const newQty = row.quantity + 1;
      const unitPrice = row.linePriceUserSet
        ? row.unitPrice
        : catalogUnitPrice(productId, newQty);
      const next = [...prev];
      next[idx] = { ...row, quantity: newQty, unitPrice, lineTotal: undefined };
      return next;
    });
  }

  /**
   * Ajoute `addQty` unités (pièces) d'un produit au panier, à un prix unitaire
   * imposé (conditionnement). Respecte le stock disponible. Sert au scan d'un
   * paquet/carton : on ajoute le nombre de pièces contenu, au prix du conditionnement.
   */
  function addUnitsToCart(
    productId: string,
    name: string,
    unit: string,
    imageUrl: string | null,
    addQty: number,
    fixedUnitPrice: number,
    lineAddTotal: number,
  ): boolean {
    if (addQty <= 0) return false;
    // Décision de stock prise de façon SYNCHRONE (état `cart` courant) : le
    // résultat est renvoyé à l'appelant avant que l'updater setCart ne s'exécute.
    const stock = stockByProductId.get(productId) ?? 0;
    const current = cart.find((p) => p.productId === productId)?.quantity ?? 0;
    if (current + addQty > stock) {
      const now = Date.now();
      if (now - lastStockToastAt.current > 2000) {
        lastStockToastAt.current = now;
        toast.info("Stock insuffisant pour ce conditionnement.");
      }
      return false;
    }
    playPosAddBeep();
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.productId === productId);
      if (idx < 0) {
        return [
          ...prev,
          {
            productId,
            name,
            quantity: addQty,
            unitPrice: fixedUnitPrice,
            unit: unit || "u",
            imageUrl: imageUrl ?? null,
            // `lineTotal` = prix exact du conditionnement : c'est lui qui fait foi
            // (sous-total, ticket, remise de ligne au checkout).
            lineTotal: lineAddTotal,
            linePriceUserSet: true,
          },
        ];
      }
      const row = prev[idx];
      // Total exact cumulé : on ajoute le total du conditionnement scanné au total
      // déjà présent sur la ligne (qu'il vienne d'un scan précédent ou de qté×PU).
      const prevLineTotal = row.lineTotal ?? row.quantity * row.unitPrice;
      const next = [...prev];
      next[idx] = {
        ...row,
        quantity: row.quantity + addQty,
        unitPrice: fixedUnitPrice,
        linePriceUserSet: true,
        lineTotal: prevLineTotal + lineAddTotal,
      };
      return next;
    });
    return true;
  }

  /** Aligné `PosQuickPage._addByBarcode` : barcode exact en priorité, puis SKU exact en fallback. */
  function addByBarcode(code: string) {
    const trimmed = code.replace(/\r|\n/g, "").trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const p =
      products.find((x) => x.is_active && x.barcode && x.barcode.trim().toLowerCase() === lower) ??
      products.find((x) => x.is_active && x.sku && x.sku.trim().toLowerCase() === lower);
    if (!p) {
      // Pas de produit direct : tenter un conditionnement (paquet/carton).
      const pkg = packagingByBarcode.get(lower);
      if (pkg && pkg.product.is_active) {
        const prod = pkg.product;
        const stock = stockByProductId.get(prod.id) ?? 0;
        if (stock <= 0) {
          toast.error("Produit indisponible (stock épuisé).");
          searchInputRef.current?.focus();
          return;
        }
        // Total exact du conditionnement (fait foi). Sans prix dédié : nb × prix pièce.
        const packTotal =
          pkg.price != null ? pkg.price : prod.sale_price * pkg.factor;
        // Prix unitaire affiché = arrondi AU-DESSUS pour que qté×PU ≥ total exact
        // (la remise de ligne absorbe l'excédent → montant encaissé exact).
        const pieceUnitPrice = Math.ceil(packTotal / pkg.factor);
        const added = addUnitsToCart(
          prod.id,
          prod.name,
          prod.unit,
          prod.product_images?.[0]?.url ?? null,
          pkg.factor,
          pieceUnitPrice,
          packTotal,
        );
        if (added) {
          toast.success(`${pkg.label} · ${prod.name} (${pkg.factor})`);
          setSearch("");
        }
        searchInputRef.current?.focus();
        return;
      }
      toast.error("Aucun produit avec ce code-barres ou référence.");
      searchInputRef.current?.focus();
      return;
    }
    const stock = stockByProductId.get(p.id) ?? 0;
    if (stock <= 0) {
      toast.error("Produit indisponible (stock épuisé).");
      searchInputRef.current?.focus();
      return;
    }
    addToCart(
      p.id,
      p.name,
      p.unit,
      p.product_images?.[0]?.url ?? null,
    );
    setSearch("");
    // Re-focus pour permettre le scan immédiat du produit suivant.
    searchInputRef.current?.focus();
  }

  /** Conditionnements valides d'un produit (libellé + facteur ≥ 1). */
  function validPackagings(p: PosProduct) {
    return (p.product_packagings ?? [])
      .filter((pk) => Math.floor(Number(pk.factor)) >= 1 && (pk.label ?? "").trim().length > 0)
      .map((pk) => ({
        label: String(pk.label),
        factor: Math.max(1, Math.floor(Number(pk.factor))),
        price: pk.price != null ? Number(pk.price) : null,
      }));
  }

  /**
   * Ajout au panier depuis une carte produit : si le produit a des conditionnements,
   * on propose de choisir (Pièce par défaut) ; sinon ajout direct d'une pièce.
   *
   * Exception — module Pièces : une pièce SANS conditionnement mais associée à un
   * modèle ouvre quand même le dialogue, pour que le vendeur voie sur quel engin
   * elle se monte avant de valider. C'est le seul cas où un clic de plus est
   * demandé, et c'est justement celui où l'erreur coûte cher (mauvaise pièce).
   */
  function onPickProduct(p: PosProduct, thumb: string | null) {
    const hasCompatModels = (partModelsByProduct?.get(p.id)?.length ?? 0) > 0;
    if (validPackagings(p).length === 0 && !hasCompatModels) {
      addToCart(p.id, p.name, p.unit, thumb);
      setSearch("");
      searchInputRef.current?.focus();
      return;
    }
    setPkgChooser({ productId: p.id, thumb });
  }

  /** Applique un conditionnement choisi (même calcul que le scan d'un pack). */
  function addChosenPackaging(
    p: PosProduct,
    thumb: string | null,
    pkg: { label: string; factor: number; price: number | null },
  ) {
    const packTotal = pkg.price != null ? pkg.price : Number(p.sale_price ?? 0) * pkg.factor;
    const pieceUnitPrice = Math.ceil(packTotal / pkg.factor);
    const ok = addUnitsToCart(p.id, p.name, p.unit, thumb, pkg.factor, pieceUnitPrice, packTotal);
    if (ok) toast.success(`${pkg.label} · ${p.name} (${pkg.factor})`);
  }

  // Capture clavier globale pour douchette code-barres / QR (caisse rapide).
  // Si le focus n'est PAS dans un champ de saisie (cas "focus perdu" après un clic
  // sur une carte, une catégorie, un bouton…), on reconstitue la rafale de frappes
  // de la douchette (caractères très rapprochés terminés par Entrée) et on l'envoie
  // à addByBarcode. Le scan marche donc partout, sans casser la saisie manuelle :
  // tant que le focus est dans un input/textarea, ce listener reste totalement inerte.
  const addByBarcodeRef = useRef(addByBarcode);
  addByBarcodeRef.current = addByBarcode;
  const scannerCameraOpenRef = useRef(barcodeScannerOpen);
  scannerCameraOpenRef.current = barcodeScannerOpen;
  useEffect(() => {
    if (mode !== "quick") return;
    let buffer = "";
    let lastAt = 0;
    const BURST_GAP_MS = 60; // au-delà de ce délai entre 2 touches → frappe humaine
    const MIN_LEN = 3; // longueur minimale d'un code pour être considéré comme un scan
    const isEditable = (el: EventTarget | null): boolean => {
      const node = el as HTMLElement | null;
      if (!node || typeof node.tagName !== "string") return false;
      if (node.isContentEditable) return true;
      const tag = node.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Champ de recherche (et tout autre champ) : laisse l'élément gérer ses touches.
      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      if (scannerCameraOpenRef.current) return; // scan caméra déjà ouvert
      if (e.ctrlKey || e.metaKey || e.altKey) return; // raccourcis clavier
      const now = Date.now();
      if (now - lastAt > BURST_GAP_MS) buffer = "";
      lastAt = now;
      if (e.key === "Enter") {
        const code = buffer;
        buffer = "";
        if (code.length >= MIN_LEN) {
          e.preventDefault();
          e.stopPropagation();
          addByBarcodeRef.current(code);
          searchInputRef.current?.focus();
        }
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

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
          const unitPrice = r.linePriceUserSet
            ? r.unitPrice
            : catalogUnitPrice(productId, q);
          return { ...r, quantity: q, unitPrice, lineTotal: undefined };
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
          r.productId === productId
            ? {
                ...r,
                quantity: q,
                unitPrice: r.linePriceUserSet
                  ? r.unitPrice
                  : catalogUnitPrice(productId, q),
                lineTotal: undefined,
              }
            : r,
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
        r.productId === productId
          ? { ...r, unitPrice: p, lineTotal: undefined, linePriceUserSet: true }
          : r,
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
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-3 text-sm font-semibold text-white"
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
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-3 text-sm font-semibold text-white"
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
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-3 text-sm font-semibold text-white"
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
      locationByProduct={locationByProduct}
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
      mobileProvider={mobileProvider}
      setMobileProvider={setMobileProvider}
      // Opérateurs proposés : ceux du réglage, plus celui d'une vente rouverte pour
      // qu'une ancienne vente Wave reste lisible même si Wave n'est plus encaissé.
      mobileProviders={
        mobileProvider && !allowedProviders.includes(mobileProvider)
          ? [...allowedProviders, mobileProvider]
          : allowedProviders
      }
      customerId={customerId}
      setCustomerId={setCustomerId}
      customers={customers}
      hideQuickCustomer={hideQuickCustomer}
      requireCustomer={requireCustomer}
      allowQuickCredit={quickCreditEnabled || quickPayment === "credit"}
      // Vente rouverte réglée par carte : le bouton reste, sinon la modification
      // basculerait silencieusement son paiement en espèces.
      allowQuickCard={!hideQuickCard || quickPayment === "card"}
      allowQuickSplit={quickSplitEnabled || quickPayment === "mixed"}
      splitCashAmount={splitCashAmount}
      setSplitCashAmount={setSplitCashAmount}
      splitCashValue={splitCashValue}
      splitMobileValue={splitMobileValue}
      allowQuickPriceEdit={quickPriceEditEnabled}
      creditDueDate={creditDueDate}
      setCreditDueDate={setCreditDueDate}
      creditRemaining={creditRemaining}
      onCreateCustomer={() => setCustomerCreateOpen(true)}
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
        setSplitCashAmount("");
        setPrescriptionNumber("");
        setCreditDueDate("");
      }}
      onPay={() => {
        // En mode « envoyer à la caisse », le moyen de paiement n'est pas encore
        // choisi : les contrôles de paiement n'ont donc rien à valider ici. Ils
        // s'appliqueront chez le caissier, au moment où l'argent change de mains.
        if (handoffMode) {
          void handoffMut.mutateAsync();
          return;
        }
        const pre = getPosPayValidationError();
        if (pre) {
          toast.error(pre);
          return;
        }
        void createMut.mutateAsync();
      }}
      // Le sélecteur n'a de sens que s'il y a un choix : le propriétaire ayant retiré
      // « Encaisser ici », le panier ne peut plus que partir à la caisse.
      dualCashierOn={dualCashierOn && selfCheckoutAllowed}
      handoffMode={handoffMode}
      onSetSendToCashier={setSendToCashier}
      handoffNote={handoffNote}
      setHandoffNote={setHandoffNote}
      handoffPending={handoffMut.isPending}
      hideCartTitle={!isWide}
      currencyLabel={currencyLabel}
      showPrescription={isPharmacy}
      prescriptionNumber={prescriptionNumber}
      setPrescriptionNumber={setPrescriptionNumber}
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
            className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-[var(--fs-accent)] underline underline-offset-2"
          >
            Quitter
          </button>
        </div>
      ) : null}

      {/*
       * Suivi des paniers envoyés — le seul retour que le vendeur obtient sans quitter sa
       * caisse. Un bandeau fin, en haut, qui n'apparaît que s'il y a quelque chose à
       * suivre : un vendeur qui n'a rien envoyé ne perd pas un pixel de sa grille produits.
       */}
      {dualCashierOn && myPendingHandoffs.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-black/10 bg-[#ECFDF5] px-3 py-1.5">
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-[#047857]">
            À la caisse
          </span>
          {myPendingHandoffs.map((h) => (
            <span
              key={h.id}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#10B981]/40 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#065F46]"
            >
              <span className="font-extrabold">{h.number}</span>
              <span className="tabular-nums">{formatCurrency(h.total)}</span>
              <span className="text-[#6B7280]">· {waitingLabel(h.createdAt)}</span>
              <button
                type="button"
                onClick={() => handoffCancelMut.mutate(h.id)}
                disabled={handoffCancelMut.isPending}
                className="-mr-1 rounded-full p-0.5 text-[#6B7280] hover:bg-black/5 disabled:opacity-50"
                aria-label={`Rappeler le bon ${h.number}`}
                title="Rappeler ce bon"
              >
                <MdClose className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ))}
          <Link
            href={ROUTES.checkoutQueue}
            className="ml-auto shrink-0 text-[11px] font-bold text-[#047857] underline underline-offset-2"
          >
            Voir la caisse
          </Link>
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
          <Link href="/stores" className="rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white">
            Choisir une boutique
          </Link>
        </div>
      ) : !store ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-12 text-center">
          <MdStore className="h-16 w-16 text-red-500" aria-hidden />
          <p className="text-sm text-[#1F2937]">Boutique introuvable.</p>
          <Link href="/stores" className="rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white">
            Retour aux boutiques
          </Link>
        </div>
      ) : (
        <div
          ref={mode === "a4-table" ? factureTabBodyRef : undefined}
          className={cn(
            "flex min-h-0 flex-1",
            mode === "a4-table"
              ? factureSplit
                ? "flex-row overflow-hidden"
                : "flex-col overflow-hidden"
              : "flex-col min-[900px]:flex-row min-[900px]:overflow-hidden",
          )}
        >
          {/*
           * Facture (tableau) : même structure que Flutter `pos_page.dart` — `SizedBox(height: stripH)` +
           * scroll vertical du bandeau, Card `PosMainArea` strip (2 rangées), puis `PosCartPanel` scroll fusionné.
           */}
          <main
            className={cn(
              "flex min-w-0 flex-col bg-white",
              mode === "a4-table"
                ? factureSplit
                  ? "min-h-0 flex-1 overflow-hidden"
                  : "min-h-0 shrink-0 overflow-hidden"
                : "min-h-0 min-[900px]:flex-[65] flex-1",
            )}
            style={
              mode === "a4-table" && !factureSplit
                ? { height: factureTabStripH }
                : undefined
            }
          >
            <div
              className={cn(
                mode === "a4-table" ? "flex h-full min-h-0 flex-col" : "contents",
              )}
            >
              <div
                className={cn(
                  mode === "a4-table"
                    ? factureSplit
                      ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                      : "min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]"
                    : "contents",
                )}
              >
                <div
                  className={cn(
                    mode === "a4-table"
                      ? factureSplit
                        ? "flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2"
                        : "px-3 pb-0 pt-2"
                      : "contents",
                  )}
                >
                  <div
                    ref={mode === "a4-table" ? factureTabCardRef : undefined}
                    className={cn(
                      mode === "a4-table"
                        ? cn(
                            "overflow-hidden rounded-lg border border-[#E5E7EB]/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
                            factureSplit && "flex min-h-0 flex-1 flex-col",
                          )
                        : "contents",
                    )}
                  >
            <div
              className={cn(
                mode === "a4-table"
                  ? "shrink-0 px-3 pb-2 pt-2.5"
                  : "px-3 pb-1.5 pt-1.5 sm:px-4",
              )}
            >
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
                    ref={searchInputRef}
                    className={fsInputClass(
                      // fsInputClass inclut `sm:px-3` : sans `sm:pl-*` explicite, le padding gauche
                      // repasse à ~12px au breakpoint sm et le placeholder chevauche l’icône scanner.
                      "h-9 w-full rounded-md border-[#E5E7EB] bg-white py-1 pl-11 pr-9 text-xs leading-snug text-[#1F2937] placeholder:text-[#1F2937]/50 sm:pl-12 sm:pr-10 sm:text-[13px]",
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
              ) : mode === "a4-table" ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <Link
                    href={`${ROUTES.sales}?store=${encodeURIComponent(storeId)}`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F97316] text-white shadow-sm transition hover:opacity-95"
                    aria-label="Retour aux ventes"
                  >
                    <MdArrowBack className="h-[18px] w-[18px]" aria-hidden />
                  </Link>
                  <div className="relative min-h-10 min-w-0 flex-1">
                    <MdSearch
                      className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-5 w-5 -translate-y-1/2 text-[#F97316]"
                      aria-hidden
                    />
                    <input
                      className={fsInputClass(
                        // Même cause que caisse rapide : `fsInputClass` → `sm:px-3` écrase `pl-*` au breakpoint sm.
                        "h-10 w-full rounded-md border-[#E5E7EB] bg-white py-1.5 pl-9 pr-3 text-[13px] leading-snug text-[#1F2937] placeholder:text-[#1F2937]/50 sm:pl-9 sm:pr-3",
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
                      placeholder="Rechercher…"
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="search"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      className={fsInputClass(
                        "h-10 w-[120px] min-w-0 shrink-0 rounded-md border-[#E5E7EB] bg-white px-2 py-1.5 text-[13px] text-[#1F2937] min-[600px]:w-[150px]",
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
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F97316] text-white shadow-sm transition hover:opacity-95"
                    >
                      <MdPersonAdd className="h-[19px] w-[19px]" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRefreshPos()}
                      disabled={posQ.isFetching}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#1F2937]/70 transition hover:bg-black/5 disabled:opacity-50"
                      aria-label="Actualiser catalogue et stock"
                    >
                      <MdRefresh
                        className={cn("h-5 w-5", posQ.isFetching && "animate-spin")}
                        aria-hidden
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
                  <div className="relative min-h-9 min-w-0 flex-1">
                    <MdSearch
                      className="pointer-events-none absolute left-2 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[#F97316]"
                      aria-hidden
                    />
                    <input
                      className={fsInputClass(
                        // `sm:px-3` du fsInputClass sans `sm:pl-*` → placeholder sous l’icône loupe.
                        "h-9 w-full rounded-md border-[#E5E7EB] bg-white py-1 pl-10 pr-3 text-xs leading-snug text-[#1F2937] placeholder:text-[#1F2937]/50 sm:pl-11 sm:pr-3 sm:text-[13px]",
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
                        "h-10 min-w-0 flex-1 rounded-md border-[#E5E7EB] bg-white px-2 py-1.5 text-xs text-[#1F2937] sm:min-w-[140px] sm:text-sm md:min-w-[180px]",
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
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F97316] text-white shadow-sm transition hover:opacity-95"
                    >
                      <MdPersonAdd className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <FsHorizontalScroll
              className={cn(
                "shrink-0 overflow-y-hidden",
                mode === "a4-table"
                  ? "h-10 px-3 py-0"
                  : "px-3 py-1 sm:px-4",
              )}
            >
              <div className="flex w-max items-center gap-1.5">
                <CategoryChip
                  label="Tous"
                  selected={categoryId === null}
                  onClick={() => setCategoryId(null)}
                  variant={mode === "a4-table" ? "factureTab" : "default"}
                />
                {categories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    label={c.name}
                    selected={categoryId === c.id}
                    onClick={() => setCategoryId(c.id)}
                    variant={mode === "a4-table" ? "factureTab" : "default"}
                  />
                ))}
              </div>
            </FsHorizontalScroll>

            {mode === "a4-table" ? <div className="h-1.5 shrink-0" aria-hidden /> : null}

            <div
              className={cn(
                mode === "a4-table"
                  ? factureSplit
                    ? "@container min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1"
                    : "flex min-h-0 shrink-0 flex-col overflow-hidden px-3 pb-3 pt-1"
                  : "min-h-0 flex-1 px-3 sm:px-4 pb-28 min-[900px]:pb-4 @container overflow-y-auto",
              )}
              style={
                mode === "a4-table" && !factureSplit
                  ? { height: factureStripGridH }
                  : undefined
              }
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
              ) : mode === "a4-table" && !factureSplit ? (
                <FsHorizontalScroll className="min-h-0 flex-1 overflow-y-hidden">
                  <div
                    className="grid h-full min-h-0 grid-flow-col grid-rows-2 content-start gap-2.5 px-3 py-1"
                    style={{ gridAutoColumns: stripMainExtent }}
                  >
                    {filtered.map((p) => {
                      const stock = stockByProductId.get(p.id) ?? 0;
                      const thumb = p.product_images?.[0]?.url ?? null;
                      const price = baseSalePrice(p.id, Number(p.sale_price ?? 0));
                      const promoPct = promoPctByProductId.get(p.id) ?? 0;
                      const promoPrice = promoPct > 0 ? applyPromoPercent(price, promoPct) : price;
                      const priceLine =
                        stock >= 0
                          ? `${formatCurrency(promoPrice)} · ${stock}`
                          : formatCurrency(promoPrice);
                      const noStock = stock <= 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={noStock}
                          onClick={() => {
                            if (!noStock) onPickProduct(p, thumb);
                          }}
                          className={cn(
                            "relative flex min-h-0 w-full min-w-0 flex-col items-center justify-center rounded-lg border bg-white px-2 py-1.5 text-center transition active:scale-[0.98]",
                            noStock
                              ? "border-[#E5E7EB] opacity-45"
                              : "border-[1.5px] border-[#F97316]/35 shadow-[0_2px_8px_rgba(249,115,22,0.1)]",
                          )}
                        >
                          {p.prescription_required ? (
                            <span
                              className="absolute right-1 top-1 z-10 rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold leading-none text-white"
                              title="Délivrance sur ordonnance"
                            >
                              Ord.
                            </span>
                          ) : null}
                          {promoPct > 0 ? (
                            <span
                              className="absolute left-1 top-1 z-10 rounded bg-[#DB2777] px-1 py-0.5 text-[8px] font-bold leading-none text-white"
                              title={`Promotion -${promoPct}%`}
                            >
                              -{promoPct}%
                            </span>
                          ) : null}
                          <div className="mx-auto flex size-[clamp(3rem,52%,4.5rem)] max-h-[72px] max-w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#F8F9FA]">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                              src={thumb}
                              alt=""
                              /* La grille peut afficher un millier de produits : sans
                                 chargement paresseux, le navigateur télécharge et décode
                                 TOUTES les vignettes d'un coup, y compris hors écran —
                                 en concurrence directe avec la requête d'encaissement. */
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                            ) : (
                              <MdInventory2
                                className="h-8 w-8 text-[#F97316]/70"
                                aria-hidden
                              />
                            )}
                          </div>
                          <p
                            className="mt-1 line-clamp-2 w-full min-w-0 flex-1 px-0.5 text-center text-[10px] font-semibold leading-[1.15] text-[#1F2937] min-[1400px]:text-[11px]"
                            title={p.name}
                          >
                            {p.name}
                          </p>
                          <p
                            className="mt-0.5 w-full min-w-0 truncate px-0.5 text-center text-[10px] font-extrabold text-[#F97316]"
                            title={priceLine}
                          >
                            {priceLine}
                          </p>
                          {locationByProduct?.get(p.id) ? (
                            <span className="mt-0.5 w-full min-w-0 px-0.5 text-center">
                              <PosLocationTag loc={locationByProduct.get(p.id)!} size="xs" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </FsHorizontalScroll>
              ) : (
                <div className="grid grid-cols-2 gap-2 pb-3 @[420px]:grid-cols-3 @[560px]:grid-cols-4 @[820px]:grid-cols-5 min-[1200px]:grid-cols-6">
                  {filtered.map((p) => {
                    const stock = stockByProductId.get(p.id) ?? 0;
                    const thumb = p.product_images?.[0]?.url ?? null;
                    const price = baseSalePrice(p.id, Number(p.sale_price ?? 0));
                    const promoPct = promoPctByProductId.get(p.id) ?? 0;
                    const promoPrice = promoPct > 0 ? applyPromoPercent(price, promoPct) : price;
                    const priceLine =
                      stock >= 0
                        ? `${formatCurrency(promoPrice)} · ${stock}`
                        : formatCurrency(promoPrice);
                    // Facture (tableau) : rupture = vignette inerte, comme dans le
                    // bandeau horizontal — on ne facture pas ce qu'on n'a pas.
                    const blocked = mode === "a4-table" && stock <= 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={blocked}
                        onClick={() => {
                          if (!blocked) onPickProduct(p, thumb);
                        }}
                        className={cn(
                          "relative flex min-h-0 w-full min-w-0 flex-col items-center overflow-hidden rounded-md bg-white px-2 py-1.5 text-center transition active:scale-[0.98]",
                          "aspect-[0.82] @[400px]:aspect-[0.88] @[600px]:aspect-[0.93]",
                          blocked
                            ? "border border-[#E5E7EB] opacity-45"
                            : "border border-[#F97316]/35 shadow-[0_1px_6px_rgba(249,115,22,0.08)]",
                        )}
                      >
                        {p.prescription_required ? (
                          <span
                            className="absolute right-1 top-1 z-10 rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold leading-none text-white"
                            title="Délivrance sur ordonnance"
                          >
                            Ord.
                          </span>
                        ) : null}
                        {promoPct > 0 ? (
                          <span
                            className="absolute left-1 top-1 z-10 rounded bg-[#DB2777] px-1 py-0.5 text-[8px] font-bold leading-none text-white"
                            title={`Promotion -${promoPct}%`}
                          >
                            -{promoPct}%
                          </span>
                        ) : null}
                        <div className="mx-auto flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#F8F9FA] sm:h-[76px] sm:w-[76px]">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              /* La grille peut afficher un millier de produits : sans
                                 chargement paresseux, le navigateur télécharge et décode
                                 TOUTES les vignettes d'un coup, y compris hors écran —
                                 en concurrence directe avec la requête d'encaissement. */
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
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
                          {promoPct > 0 ? (
                            <p
                              className="mt-0.5 w-full truncate text-center text-[10px] font-bold @[400px]:text-[11px]"
                              title={priceLine}
                            >
                              <span className="text-neutral-400 line-through">{formatCurrency(price)}</span>{" "}
                              <span className="text-[#F97316]">{priceLine}</span>
                            </p>
                          ) : (
                            <p
                              className="mt-0.5 w-full truncate text-center text-[10px] font-bold text-[#F97316] @[400px]:text-[11px]"
                              title={priceLine}
                            >
                              {priceLine}
                            </p>
                          )}
                          {locationByProduct?.get(p.id) ? (
                            <span className="mt-0.5 w-full min-w-0 text-center">
                              <PosLocationTag loc={locationByProduct.get(p.id)!} size="xs" />
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
                  </div>
                </div>
              </div>
            </div>
          </main>

          {mode === "a4-table" ? (
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#F3F4F6]",
                factureSplit
                  ? "w-[520px] shrink-0 border-l border-[#E5E7EB] px-4 pb-4 pt-3 min-[1400px]:w-[600px] min-[1900px]:w-[680px]"
                  : "flex-1 border-t border-[#E5E7EB] px-3 pt-2.5 pb-3 min-[900px]:px-4 min-[900px]:pt-3 min-[900px]:pb-4",
              )}
            >
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
              className="min-h-12 min-w-0 flex-1 rounded-md py-2 text-left"
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
              className="h-12 shrink-0 rounded-md bg-[#F97316] px-4 text-sm font-semibold text-white"
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
          data={invoiceDialog.data}
          pdfMeta={{ saleId: invoiceDialog.saleId }}
          thermalPrint={
            printFormatChoiceOn ? { saleId: invoiceDialog.saleId } : null
          }
          onClose={() => setInvoiceDialog(null)}
        />
      ) : null}
      {receiptDialog ? (
        <ReceiptTicketDialog
          data={receiptDialog}
          paperWidthMm={thermalPaperWidthMm}
          a4Print={
            printFormatChoiceOn && store && receiptDialog.saleId
              ? { saleId: receiptDialog.saleId, store }
              : null
          }
          onClose={() => setReceiptDialog(null)}
        />
      ) : null}

      {pkgChooser && typeof document !== "undefined"
        ? (() => {
            const cp = products.find((x) => x.id === pkgChooser.productId);
            if (!cp) return null;
            const pkgs = validPackagings(cp);
            // Module Pièces : sur quels engins cette pièce se monte-t-elle ?
            const compatModels = partModelsByProduct?.get(cp.id) ?? [];
            const closeAndFocus = () => {
              setPkgChooser(null);
              setSearch("");
              searchInputRef.current?.focus();
            };
            return createPortal(
              <div
                className="fixed inset-0 z-[2147483647] flex items-end justify-center bg-black/45 p-3 sm:items-center"
                role="dialog"
                aria-modal="true"
                aria-label={
                  pkgs.length > 0 ? "Choisir le conditionnement" : "Confirmer la pièce"
                }
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setPkgChooser(null);
                }}
              >
                <div className="w-full max-w-md rounded-lg bg-fs-card p-4 shadow-xl sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-fs-text">
                        {/* Sans conditionnement, le dialogue ne sert qu'à montrer
                            la compatibilité : le titre doit le dire. */}
                        {pkgs.length > 0 ? "Conditionnement" : "Ajouter au panier"}
                      </h2>
                      <p className="mt-0.5 truncate text-sm text-neutral-600">{cp.name}</p>
                      {compatModels.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                            Va sur
                          </span>
                          {compatModels.map((label) => (
                            <span
                              key={label}
                              className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-fs-accent/10 px-2 py-0.5 text-[11px] font-bold text-fs-accent"
                            >
                              <MdTwoWheeler className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPkgChooser(null)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/[0.08] text-neutral-600"
                      aria-label="Fermer"
                    >
                      <MdClose className="h-5 w-5" aria-hidden />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        addToCart(cp.id, cp.name, cp.unit, pkgChooser.thumb);
                        closeAndFocus();
                      }}
                      className="flex items-center justify-between gap-2 rounded-md border-2 border-fs-accent bg-fs-accent/[0.06] px-4 py-3 text-left"
                    >
                      <span className="text-sm font-bold text-fs-text">Pièce ({cp.unit || "pce"})</span>
                      <span className="text-sm font-extrabold text-fs-accent">
                        {formatCurrency(Number(cp.sale_price ?? 0))}
                      </span>
                    </button>

                    {pkgs.map((pk) => {
                      const packTotal =
                        pk.price != null ? pk.price : Number(cp.sale_price ?? 0) * pk.factor;
                      return (
                        <button
                          key={`${pk.label}-${pk.factor}`}
                          type="button"
                          onClick={() => {
                            addChosenPackaging(cp, pkgChooser.thumb, pk);
                            closeAndFocus();
                          }}
                          className="flex items-center justify-between gap-2 rounded-md border border-black/[0.1] bg-white px-4 py-3 text-left"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-fs-text">{pk.label}</span>
                            <span className="block text-[11px] text-neutral-500">
                              {/* Équivalent à la pièce : le vendeur voit immédiatement
                                  si le lot est mal tarifé (moins cher qu'une pièce). */}
                              {pk.factor} {cp.unit || "pce"}
                              {pk.factor > 1
                                ? ` · ${formatCurrency(packagingPiecePrice(packTotal, pk.factor))} /${cp.unit || "pce"}`
                                : ""}
                            </span>
                          </span>
                          <span className="text-sm font-extrabold text-fs-accent">
                            {formatCurrency(packTotal)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>,
              document.body,
            );
          })()
        : null}

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

      {companyId ? (
        <CustomerFormDialog
          open={customerCreateOpen}
          onClose={() => setCustomerCreateOpen(false)}
          variant="create"
          /*
           * Vente obligatoirement nominative : au comptoir, avec la file qui attend,
           * le numéro seul doit suffire. Le nom se complète plus tard depuis Clients.
           */
          nameOptional={requireCustomer}
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
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["pos", mode, companyId, storeId] }),
              qc.invalidateQueries({ queryKey: queryKeys.customers(companyId) }),
            ]);
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
            className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-lg bg-white px-6 pb-6 pt-5 shadow-xl sm:rounded-lg"
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
              className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-[#F97316] text-sm font-semibold text-white hover:opacity-95"
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
  variant = "default",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** `pos_main_area.dart` strip, resserré : padding horizontal 10, vertical 6, texte 13px. */
  variant?: "default" | "factureTab";
}) {
  const tab = variant === "factureTab";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 font-semibold transition-colors",
        tab
          ? "rounded-md px-2.5 py-1.5 text-[13px]"
          : "rounded-sm px-2 py-0.5 text-[11px] min-[600px]:rounded-md min-[600px]:px-2.5 min-[600px]:text-xs",
        selected
          ? "border-2 border-[#F97316] bg-[#F97316] text-white"
          : "border border-[#E5E7EB] bg-[#F3F4F6] text-[#1F2937]",
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
  useEffect(() => {
    quantityRef.current = quantity;
  });
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
      className="h-7 w-[56px] rounded-md border border-[#E5E7EB] bg-white px-1 text-center text-sm font-bold text-[#1F2937] outline-none focus:border-[#F97316]"
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
  useEffect(() => {
    unitPriceRef.current = unitPrice;
  });
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
      className="h-8 w-full min-w-[72px] max-w-[104px] rounded-md border border-[#E5E7EB] bg-white px-1.5 text-right text-sm font-bold leading-tight text-[#1F2937] outline-none focus:border-[#F97316]"
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
  locationByProduct,
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
  mobileProvider,
  setMobileProvider,
  mobileProviders,
  customerId,
  setCustomerId,
  customers,
  hideQuickCustomer,
  requireCustomer,
  allowQuickCredit,
  allowQuickCard,
  allowQuickSplit,
  splitCashAmount,
  setSplitCashAmount,
  splitCashValue,
  splitMobileValue,
  allowQuickPriceEdit,
  creditDueDate,
  setCreditDueDate,
  creditRemaining,
  onCreateCustomer,
  createMut,
  isSaleEdit,
  onUpdateQty,
  onSetQty,
  onLineUnitChange,
  onLineUnitPriceCommit,
  onRemove,
  onClear,
  onPay,
  dualCashierOn = false,
  handoffMode = false,
  onSetSendToCashier,
  handoffNote = "",
  setHandoffNote,
  handoffPending = false,
  hideCartTitle,
  currencyLabel,
  showPrescription,
  prescriptionNumber,
  setPrescriptionNumber,
}: {
  mode: PosMode;
  cartLayout?: "cards" | "table";
  cart: CartRow[];
  cartCount: number;
  stockByProductId: Map<string, number>;
  /** Emplacements de la boutique — `null` si le module ou l'option caisse est coupé. */
  locationByProduct: Map<string, ProductLocation> | null;
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
  /** Opérateur mobile money sélectionné (`null` tant que le caissier n'a pas choisi). */
  mobileProvider?: MobileMoneyProvider | null;
  setMobileProvider?: (p: MobileMoneyProvider) => void;
  /** Opérateurs proposés en caisse rapide (réglage entreprise) — les trois par défaut. */
  mobileProviders?: MobileMoneyProvider[];
  customerId: string;
  setCustomerId: (v: string) => void;
  customers: Array<{ id: string; name: string }>;
  /** Caisse rapide : le propriétaire a masqué le client sur les ventes comptant. */
  hideQuickCustomer?: boolean;
  /** Réglage propriétaire : aucune vente ne part sans être au nom d'un client. */
  requireCustomer?: boolean;
  /** Caisse rapide : le propriétaire autorise la vente à crédit (réglage entreprise). */
  allowQuickCredit?: boolean;
  /** Caisse rapide : bouton « CARTE » proposé (le propriétaire peut le retirer). */
  allowQuickCard?: boolean;
  /** Caisse rapide : le propriétaire autorise le paiement mixte espèces + mobile money. */
  allowQuickSplit?: boolean;
  /** Paiement mixte : part réglée en espèces (saisie libre), le reste en mobile money. */
  splitCashAmount?: string;
  setSplitCashAmount?: (v: string) => void;
  splitCashValue?: number;
  splitMobileValue?: number;
  /** Caisse rapide : le propriétaire autorise la saisie du prix unitaire au panier. */
  allowQuickPriceEdit?: boolean;
  /** Échéance de la créance (`yyyy-mm-dd`), facultative. */
  creditDueDate?: string;
  setCreditDueDate?: (v: string) => void;
  /** Reste dû après acompte, affiché au caissier avant validation. */
  creditRemaining?: number;
  onCreateCustomer?: () => void;
  createMut: { isPending: boolean };
  isSaleEdit: boolean;
  onUpdateQty: (id: string, d: number) => void;
  onSetQty: (id: string, q: number) => void;
  onLineUnitChange: (id: string, unit: string) => void;
  onLineUnitPriceCommit: (id: string, unitPrice: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPay: () => void | Promise<void>;
  /** Caisse à deux ouverte par le propriétaire (caisse rapide uniquement). */
  dualCashierOn?: boolean;
  /** Le panier part chez le caissier : aucun moyen de paiement à choisir ici. */
  handoffMode?: boolean;
  onSetSendToCashier?: (v: boolean) => void;
  /** Mot du vendeur au caissier, imprimé sur le bon dans la file d'attente. */
  handoffNote?: string;
  setHandoffNote?: (v: string) => void;
  handoffPending?: boolean;
  hideCartTitle?: boolean;
  currencyLabel: string;
  /** Pharmacie : afficher le champ n° d'ordonnance. */
  showPrescription?: boolean;
  prescriptionNumber?: string;
  setPrescriptionNumber?: (v: string) => void;
}) {
  const isA4Cart = mode !== "quick";
  const isMixedCart = !isA4Cart && !handoffMode && quickPayment === "mixed";
  const isMobileMoneyCart = isA4Cart
    ? paymentMethod === "mobile_money"
    : quickPayment === "mobile_money" || isMixedCart;
  const providerChoices =
    !isA4Cart && mobileProviders && mobileProviders.length > 0
      ? mobileProviders
      : MOBILE_MONEY_PROVIDERS.map((p) => p.id);
  /**
   * Modes proposés au caissier. « MIXTE » et « CRÉDIT » n'apparaissent que si le
   * propriétaire les a ouverts — sinon la rangée reste à trois boutons comme avant.
   */
  const quickPaymentButtons: Array<[QuickPayment, string]> = [
    ["cash", "CASH"],
    // Boutique sans TPE : le propriétaire retire la carte pour rendre la place aux
    // modes réellement encaissés.
    ...(allowQuickCard === false
      ? []
      : ([["card", "CARTE"]] as Array<[QuickPayment, string]>)),
    [
      "mobile_money",
      // Un seul opérateur encaissé : le bouton porte son nom (« ORANGE »), le
      // caissier reconnaît ce qu'il touche au lieu d'un « MOBILE » abstrait.
      providerChoices.length === 1
        ? (MOBILE_MONEY_PROVIDERS.find((p) => p.id === providerChoices[0])?.short ??
            "MOBILE"
          ).toUpperCase()
        : "MOBILE",
    ],
    ...(allowQuickSplit ? ([["mixed", "MIXTE"]] as Array<[QuickPayment, string]>) : []),
    ...(allowQuickCredit ? ([["credit", "CRÉDIT"]] as Array<[QuickPayment, string]>) : []),
  ];
  /** Échéance du crédit : repliée par défaut (rarement saisie), dépliée à la demande. */
  const [dueDateOpen, setDueDateOpen] = useState(false);
  /** Aligné `PosCartPanel` Flutter : `scrollBodyWithFooter` + `cartListBody` (vue tableau). */
  const mergeScroll = cartLayout === "table";

  const footerBlock = (
    <div
      className={cn(
        mergeScroll
          ? "border-0 bg-transparent p-0 pb-[max(12px,env(safe-area-inset-bottom))]"
          : "shrink-0 border-t border-[#E5E7EB] bg-[#F8F9FA] p-3 pb-[max(12px,env(safe-area-inset-bottom))] min-[900px]:border-t-0",
      )}
    >
      {/* Récap encadré — Flutter right zone footer */}
      <div
        className={cn(
          "mx-0 border border-[#E5E7EB] bg-white p-3 min-[900px]:mx-3 min-[900px]:p-4",
          // Facture A4 : rayons plus sobres que la caisse rapide (document, pas tactile).
          isA4Cart ? "rounded-sm" : "rounded-md",
        )}
      >
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

      {showPrescription ? (
        <div className="mx-0 mt-2 min-[900px]:mx-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[#6B7280]">
              N° d&apos;ordonnance (optionnel)
            </span>
            <input
              value={prescriptionNumber ?? ""}
              onChange={(e) => setPrescriptionNumber?.(e.target.value)}
              placeholder="Ex. ORD-2026-00123"
              autoComplete="off"
              className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none focus:border-[#F97316]"
            />
          </label>
        </div>
      ) : null}

      {/* Caisse à deux : le choix de la destination du panier, avant tout le reste.
       * C'est LUI qui décide si les modes de paiement ci-dessous ont un sens — d'où sa
       * place, juste au-dessus d'eux, et pas ailleurs dans l'écran. */}
      {dualCashierOn && onSetSendToCashier ? (
        <div className="mt-3 px-0 min-[900px]:px-3">
          <div className="grid grid-cols-2 gap-1.5 rounded-md bg-[#E5E7EB]/60 p-1">
            <button
              type="button"
              onClick={() => onSetSendToCashier(true)}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-[6px] py-2 text-[11px] font-extrabold tracking-tight transition-colors sm:text-xs",
                handoffMode ? "bg-[#F97316] text-white shadow-sm" : "text-[#6B7280]",
              )}
            >
              <MdSend className="h-4 w-4" aria-hidden />
              ENVOYER À LA CAISSE
            </button>
            <button
              type="button"
              onClick={() => onSetSendToCashier(false)}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-[6px] py-2 text-[11px] font-extrabold tracking-tight transition-colors sm:text-xs",
                handoffMode ? "text-[#6B7280]" : "bg-[#F97316] text-white shadow-sm",
              )}
            >
              <MdStorefront className="h-4 w-4" aria-hidden />
              ENCAISSER ICI
            </button>
          </div>
        </div>
      ) : null}

      {/* Mot du vendeur : deux ou trois mots qui évitent un aller-retour dans le magasin
       * (« il paie en Wave », « le monsieur au boubou bleu », « il attend dehors »). */}
      {handoffMode && setHandoffNote ? (
        <div className="mt-2 px-0 min-[900px]:px-3">
          <input
            value={handoffNote}
            onChange={(e) => setHandoffNote(e.target.value)}
            placeholder="Mot pour le caissier (facultatif)"
            maxLength={120}
            autoComplete="off"
            className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none focus:border-[#F97316]"
            aria-label="Mot pour le caissier"
          />
        </div>
      ) : null}

      {mode === "quick" && !handoffMode ? (
        <div
          className={cn(
            "mt-3 grid gap-1.5 px-0 min-[900px]:px-3",
            // Une seule rangée quel que soit le nombre de modes : libellés resserrés
            // plutôt qu'une 2ᵉ rangée à scroller au moment d'encaisser.
            quickPaymentButtons.length >= 5
              ? "grid-cols-5"
              : quickPaymentButtons.length === 4
                ? "grid-cols-4"
                : quickPaymentButtons.length === 3
                  ? "grid-cols-3"
                  : "grid-cols-2",
          )}
        >
          {quickPaymentButtons.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setQuickPayment(key)}
              className={cn(
                "truncate rounded-md px-1 py-2 font-semibold transition-colors",
                quickPaymentButtons.length >= 5
                  ? "text-[10px]"
                  : quickPaymentButtons.length === 4
                    ? "text-[11px]"
                    : "text-xs",
                quickPaymentButtons.length <= 2 && "py-2.5",
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
                  "rounded-sm border px-2 py-1.5 text-[10px] font-semibold",
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

      {/* Mobile money : quel opérateur encaisse. Obligatoire — sans lui, l'historique
       * des ventes ne pourrait afficher que « Mobile Money ». */}
      {isMobileMoneyCart && !handoffMode ? (
        /* Un seul opérateur encaissé : rien à choisir — le bouton porte déjà son nom,
         * et le récapitulatif du paiement mixte le nomme aussi. */
        providerChoices.length === 1 ? null : (
          <div className="mt-2 px-0 min-[900px]:px-3">
            <span className="mb-1 block text-[11px] font-semibold text-[#6B7280]">
              Opérateur mobile money
            </span>
            <div
              className={cn(
                "grid gap-1.5",
                providerChoices.length >= 3 ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              {MOBILE_MONEY_PROVIDERS.filter((p) => providerChoices.includes(p.id)).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setMobileProvider?.(p.id)}
                  aria-pressed={mobileProvider === p.id}
                  className={cn(
                    "truncate rounded-md px-1 py-2 text-xs font-semibold transition-colors",
                    mobileProvider === p.id
                      ? "bg-[#F97316] text-white"
                      : "bg-[#F8F9FA] text-[#1F2937]",
                  )}
                >
                  {p.short}
                </button>
              ))}
            </div>
            {!mobileProvider ? (
              <p className="mt-1 text-[11px] font-medium text-[#DC2626]">
                Choisissez l&apos;opérateur avant d&apos;encaisser.
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {/* Paiement mixte : le client donne une partie en espèces, le reste passe en
       * mobile money. Une seule saisie (la part espèces) — le reste se déduit tout
       * seul, c'est la question qu'on pose au comptoir. */}
      {isMixedCart ? (
        <div className="mt-3 rounded-md border border-[#F97316]/40 bg-[#FFF7ED] p-2.5 min-[900px]:mx-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[#9A3412]">
              Part payée en espèces
            </span>
            <input
              className={fsInputClass(
                "rounded-sm bg-white px-2 py-2 text-[13px] sm:px-2 sm:py-2 sm:text-[13px]",
              )}
              value={splitCashAmount ?? ""}
              onChange={(e) => setSplitCashAmount?.(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Part payée en espèces"
            />
          </label>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#9A3412]">
            <span>
              Espèces <b>{formatCurrency(splitCashValue ?? 0)}</b>
            </span>
            <span className="whitespace-nowrap">
              {mobileProvider ? mobileMoneyProviderLabel(mobileProvider) : "Mobile money"}{" "}
              <b className="text-sm font-extrabold">{formatCurrency(splitMobileValue ?? 0)}</b>
            </span>
          </div>
        </div>
      ) : null}

      {/* Vente à crédit (caisse rapide) : client obligatoire, acompte et échéance.
       * Bloc compact — l'échéance (rarement saisie) reste repliée par défaut. */}
      {mode === "quick" && !handoffMode && quickPayment === "credit" ? (
        <div className="mt-3 rounded-md border border-[#F97316]/40 bg-[#FFF7ED] p-2.5 min-[900px]:mx-3">
          <div className="flex gap-2">
            <select
              className={fsInputClass(
                "min-w-0 flex-1 rounded-sm bg-white px-2 py-2 text-[13px] sm:px-2 sm:py-2 sm:text-[13px]",
              )}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              aria-label="Client débiteur"
            >
              <option value="">Client à crédit…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {onCreateCustomer ? (
              <button
                type="button"
                title="Créer un client"
                aria-label="Créer un client"
                onClick={onCreateCustomer}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#F97316] text-white"
              >
                <MdPersonAdd className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            <input
              className={fsInputClass(
                "w-24 shrink-0 rounded-sm bg-white px-2 py-2 text-[13px] sm:px-2 sm:py-2 sm:text-[13px]",
              )}
              value={amountReceived}
              onChange={(e) => {
                setAmountReceivedTouched(true);
                setAmountReceived(e.target.value);
              }}
              inputMode="decimal"
              placeholder="Acompte"
              aria-label="Acompte reçu (espèces)"
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            {isSaleEdit ? (
              <span />
            ) : dueDateOpen || (creditDueDate ?? "").length > 0 ? (
              <input
                type="date"
                className={fsInputClass(
                  "w-38 rounded-sm bg-white px-2 py-1.5 text-xs sm:px-2 sm:py-1.5 sm:text-xs",
                )}
                value={creditDueDate ?? ""}
                onChange={(e) => setCreditDueDate?.(e.target.value)}
                aria-label="Échéance du crédit"
              />
            ) : (
              <button
                type="button"
                onClick={() => setDueDateOpen(true)}
                className="text-[11px] font-semibold text-[#9A3412] underline-offset-2 hover:underline"
              >
                + Échéance (30 j)
              </button>
            )}
            <span className="whitespace-nowrap text-xs text-[#9A3412]">
              Reste{" "}
              <b className="text-sm font-extrabold">
                {formatCurrency(creditRemaining ?? total)}
              </b>
            </span>
          </div>
        </div>
      ) : null}

      {/* Client FACULTATIF sur toute vente comptant (caisse rapide et facture A4).
       * À crédit, le client est déjà saisi — et obligatoire — dans le bloc ci-dessus.
       * Le propriétaire peut masquer ce bloc en caisse rapide : au comptoir à fort
       * débit, personne n'enregistre le client et le champ ne fait que ralentir. */}
      {isA4Cart || ((handoffMode || quickPayment !== "credit") && !hideQuickCustomer) ? (
        <div className="mt-3 px-0 min-[900px]:px-3">
          <label
            className={cn(
              "mb-1 block text-[11px] font-medium",
              requireCustomer ? "text-[#9A3412]" : "text-[#6B7280]",
            )}
          >
            {requireCustomer ? "Client (obligatoire)" : "Client (facultatif)"}
          </label>
          <div className="flex gap-2">
            <select
              className={fsInputClass(
                cn(
                  "min-w-0 flex-1 rounded-sm bg-white px-2.5 py-1.5 sm:px-2.5 sm:py-1.5",
                  // Champ vide alors qu'il est exigé : signalé avant le refus, pas après.
                  requireCustomer && !customerId && "ring-1 ring-[#F97316]",
                ),
              )}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">
                {requireCustomer ? "Choisir un client…" : "Aucun client"}
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {onCreateCustomer ? (
              <button
                type="button"
                title="Créer un client"
                aria-label="Créer un client"
                onClick={onCreateCustomer}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#F97316] text-white"
              >
                <MdPersonAdd className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showDiscountField ? (
        <div className="mt-3 px-0 min-[900px]:px-3">
          <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
            Remise {mode === "quick" ? `(${currencyLabel})` : ""}
          </label>
          <input
            className={fsInputClass(
              cn("rounded-md bg-white px-2.5 py-1.5 sm:px-2.5 sm:py-1.5", isA4Cart && "rounded-sm"),
            )}
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </div>
      ) : null}

      {mode === "quick" && !handoffMode && quickPayment === "cash" ? (
        <div className="mt-3 px-0 min-[900px]:px-3">
          <label className="mb-1 block text-xs font-semibold text-[#1F2937]">Montant reçu</label>
          <input
            className={fsInputClass(
              "rounded-md bg-white px-2.5 py-1.5 sm:px-2.5 sm:py-1.5",
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
              "rounded-sm bg-white px-2.5 py-1.5 sm:px-2.5 sm:py-1.5",
            )}
            value={amountReceived}
            onChange={(e) => {
              setAmountReceivedTouched(true);
              setAmountReceived(e.target.value);
            }}
            inputMode="decimal"
            placeholder={total > 0 ? formatCurrency(total) : "0"}
          />
          {/* À crédit : l'acompte saisi est encaissé, le solde part en créance.
           * Le caissier voit le reste dû avant de valider, et peut fixer l'échéance. */}
          {paymentMethod === "other" ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-[#F97316]/40 bg-[#FFF7ED] px-2.5 py-2">
              {isSaleEdit ? (
                <span />
              ) : dueDateOpen || (creditDueDate ?? "").length > 0 ? (
                <input
                  type="date"
                  className={fsInputClass(
                    "w-38 rounded-sm bg-white px-2 py-1.5 text-xs sm:px-2 sm:py-1.5 sm:text-xs",
                  )}
                  value={creditDueDate ?? ""}
                  onChange={(e) => setCreditDueDate?.(e.target.value)}
                  aria-label="Échéance du crédit"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setDueDateOpen(true)}
                  className="text-[11px] font-semibold text-[#9A3412] underline-offset-2 hover:underline"
                >
                  + Échéance (30 j)
                </button>
              )}
              <span className="whitespace-nowrap text-xs text-[#9A3412]">
                Reste à payer{" "}
                <b className="text-sm font-extrabold">
                  {formatCurrency(creditRemaining ?? total)}
                </b>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex gap-3 px-0 min-[900px]:px-3">
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "flex-1 border border-[#E5E7EB] bg-[#F8F9FA] py-2.5 text-sm font-semibold text-[#1F2937]",
            isA4Cart ? "rounded-sm" : "rounded-md",
          )}
        >
          {mode === "quick" ? "Annuler" : "Vider panier"}
        </button>
        <button
          type="button"
          disabled={
            createMut.isPending || handoffPending || cart.length === 0 || total <= 0
          }
          onClick={() => void onPay()}
          className={cn(
            "flex-[2] inline-flex items-center justify-center gap-2 bg-[#F97316] py-2.5 text-sm font-bold text-white disabled:opacity-50",
            isA4Cart ? "rounded-sm" : "rounded-md",
          )}
        >
          {handoffMode ? (
            <>
              {handoffPending ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <MdSend className="h-5 w-5" aria-hidden />
              )}
              {handoffPending ? "Envoi..." : "ENVOYER À LA CAISSE"}
            </>
          ) : isSaleEdit ? (
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
              {createMut.isPending ? "Enregistrement..." : "VALIDER"}
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
  );

  return (
    /* `flex-1 min-h-0` : obligatoire sous un parent flex-col — `h-full` ne se résout pas
     * toujours et le bloc « tableau » peut se retrouver à hauteur 0 (footer seul visible). */
    <div className="flex min-h-0 flex-1 flex-col">
      {hideCartTitle ? null : (
        <div
          className={cn(
            "shrink-0 min-[900px]:block",
            mergeScroll
              ? "px-4 pb-2.5 pt-3.5"
              : "px-3 pb-1.5 pt-2 min-[900px]:px-4 min-[900px]:pb-2 min-[900px]:pt-3",
          )}
        >
          <p
            className={cn(
              "font-bold text-[#1F2937]",
              mergeScroll ? "text-xl" : "text-sm",
            )}
          >
            Panier · {cartCount} article{cartCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-3 min-[900px]:px-3",
          cartLayout === "table"
            ? mergeScroll
              ? "overflow-x-hidden pb-3"
              : "min-h-[120px] fs-scroll-x"
            : "overflow-x-hidden",
        )}
      >
        {cart.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12 text-[#1F2937]">Panier vide</div>
        ) : cartLayout === "table" ? (
          <FsHorizontalScroll className="min-w-0 pb-2">
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
                        {locationByProduct?.get(c.productId) ? (
                          <p className="mt-1">
                            <PosLocationTag loc={locationByProduct.get(c.productId)!} />
                          </p>
                        ) : null}
                        {low ? (
                          <p className="mt-1 text-xs text-red-600">Stock: {stock}</p>
                        ) : null}
                      </td>
                      <td className="truncate border border-[#E5E7EB] px-1.5 py-1.5 align-middle">
                        <select
                          className={fsInputClass(
                            "w-full max-w-full rounded-sm bg-white py-1 pl-1 pr-1 text-[13px] leading-tight text-[#1F2937]",
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
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F8F9FA] text-[#1F2937]"
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
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F97316] text-white"
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
          </FsHorizontalScroll>
        ) : (
          <ul className="space-y-2 pb-2">
            {cart.map((c) => {
              const stock = stockByProductId.get(c.productId) ?? 0;
              const low = stock >= 0 && c.quantity > stock;
              return (
                <li
                  key={c.productId}
                  className="flex gap-2 rounded-md border border-[#E5E7EB] bg-white px-2 py-1.5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#F8F9FA]">
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={productThumbUrl(c.imageUrl)!} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <MdInventory2 className="h-5 w-5 text-[#F97316]/70" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#1F2937]">{c.name}</p>
                    {locationByProduct?.get(c.productId) ? (
                      <p className="mt-0.5">
                        <PosLocationTag loc={locationByProduct.get(c.productId)!} />
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {showQuantityButtons ? (
                        <button
                          type="button"
                          onClick={() => onUpdateQty(c.productId, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F8F9FA] text-[#1F2937]"
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
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F97316] text-white"
                          aria-label="Plus"
                        >
                          <MdAdd className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                      {low ? (
                        <span className="ml-1 text-xs text-red-600">Stock: {stock}</span>
                      ) : null}
                    </div>
                    {allowQuickPriceEdit ? (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="shrink-0 text-[11px] font-semibold text-[#6B7280]">
                          P.U.
                        </span>
                        <PosCartUnitPriceInput
                          productId={c.productId}
                          unitPrice={c.unitPrice}
                          onCommit={onLineUnitPriceCommit}
                        />
                        {c.linePriceUserSet ? (
                          <span className="shrink-0 text-[11px] font-medium text-[#F97316]">
                            modifié
                          </span>
                        ) : null}
                      </div>
                    ) : null}
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
        {mergeScroll ? footerBlock : null}
      </div>

      {!mergeScroll ? footerBlock : null}
    </div>
  );
}
