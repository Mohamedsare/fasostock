"use client";

import { LogOutButton } from "@/components/auth/log-out-button";
import { PushNotificationsSettingsCard } from "@/components/settings/push-notifications-settings";
import {
  FsCard,
  FsPage,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { useAppContext } from "@/lib/features/common/app-context";
import { applyActiveStoreChange } from "@/lib/features/stores/active-store";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  updateCompanyLogoUrl,
  uploadCompanyLogo,
} from "@/lib/features/companies/company-logo";
import {
  fetchAiCartVisionEnabled,
  peekAiCartVisionEnabled,
  setAiCartVisionEnabled,
} from "@/lib/features/settings/ai-cart-vision";
import {
  fetchInvoiceTablePosEnabled,
  peekInvoiceTablePosEnabled,
  setInvoiceTablePosEnabled,
} from "@/lib/features/settings/invoice-table-pos";
import {
  fetchQuickPosCreditEnabled,
  peekQuickPosCreditEnabled,
  setQuickPosCreditEnabled,
} from "@/lib/features/settings/quick-pos-credit";
import {
  fetchDashboardPaymentMixEnabled,
  peekDashboardPaymentMixEnabled,
  setDashboardPaymentMixEnabled,
} from "@/lib/features/settings/dashboard-payment-mix";
import {
  fetchQuickPosPriceEditEnabled,
  peekQuickPosPriceEditEnabled,
  setQuickPosPriceEditEnabled,
} from "@/lib/features/settings/quick-pos-price-edit";
import {
  fetchSalesSellerBoardStaffEnabled,
  peekSalesSellerBoardStaffEnabled,
  setSalesSellerBoardStaffEnabled,
} from "@/lib/features/settings/sales-seller-board";
import {
  fetchSalePickupTrackingEnabled,
  peekSalePickupTrackingEnabled,
  setSalePickupTrackingEnabled,
} from "@/lib/features/settings/sale-pickup-tracking";
import {
  fetchPrintFormatChoiceEnabled,
  peekPrintFormatChoiceEnabled,
  setPrintFormatChoiceEnabled,
} from "@/lib/features/settings/print-format-choice";
import {
  fetchBulkStockEntryEnabled,
  peekBulkStockEntryEnabled,
  setBulkStockEntryEnabled,
} from "@/lib/features/settings/bulk-stock-entry";
import {
  fetchPackagingPricePerPiece,
  peekPackagingPricePerPiece,
  setPackagingPricePerPiece,
} from "@/lib/features/settings/packaging-price-mode";
import {
  fetchSaleCustomerPolicy,
  peekSaleCustomerPolicy,
  setSaleCustomerPolicy,
  SALE_CUSTOMER_POLICY_DEFAULT,
  type SaleCustomerPolicy,
} from "@/lib/features/settings/sale-customer-policy";
import {
  fetchQuickPosPayments,
  peekQuickPosPayments,
  setQuickPosPayments,
  QUICK_POS_PAYMENTS_DEFAULT,
  type QuickPosPaymentsSettings,
} from "@/lib/features/settings/quick-pos-payments";
import {
  MOBILE_MONEY_PROVIDERS,
  type MobileMoneyProvider,
} from "@/lib/features/payments/payment-display";
import { setDualCashierEnabled } from "@/lib/features/dual-cashier/api";
import { setQuickSupplyEnabled } from "@/lib/features/quick-supply/api";
import {
  setEmployeeDraftProductsEnabled,
  setEmployeePhotosEnabled,
} from "@/lib/features/products/employee-catalog";
import { setPartnerOfftakesEnabled } from "@/lib/features/partner-offtakes/api";
import { setShipmentsEnabled } from "@/lib/features/shipments/api";
import {
  DEFAULT_CREDIT_REMINDERS_CONFIG,
  fetchCreditRemindersConfig,
  frequencyLabel,
  peekCreditRemindersConfig,
  setCreditRemindersConfig,
  setCreditRemindersEnabled,
  type CreditRemindersConfig,
} from "@/lib/features/settings/credit-reminders-config";
import {
  fetchDualCashierSelfCheckout,
  peekDualCashierSelfCheckout,
  setDualCashierSelfCheckout,
} from "@/lib/features/settings/dual-cashier-self-checkout";
import { setProductLocationsEnabled } from "@/lib/features/product-locations/api";
import { setLandedCostEnabled } from "@/lib/features/landed-cost/api";
import { setSaleDocumentsEnabled } from "@/lib/features/sale-documents/api";
import { setPackagingsPageEnabled } from "@/lib/features/products/packagings-page-flag";
import { setProductAliasesEnabled } from "@/lib/features/products/api";
import { setCustomExpensesEnabled } from "@/lib/features/expenses/api";
import {
  fetchProductLocationsPosEnabled,
  peekProductLocationsPosEnabled,
  setProductLocationsPosEnabled,
} from "@/lib/features/settings/product-locations-pos";
import { queryKeys } from "@/lib/query/query-keys";
import { currencyOf, SUPPORTED_CURRENCIES } from "@/lib/config/currencies";
import { SUPPORTED_TIME_ZONES, timeZoneLabelOf } from "@/lib/config/timezones";
import {
  fetchCompanyTimeZone,
  peekCompanyTimeZone,
  setCompanyTimeZone,
} from "@/lib/features/settings/company-timezone";
import { formatOperationTimeWithSeconds } from "@/lib/utils/operation-datetime";
import {
  fetchCompanyCurrency,
  fetchCompanyCurrencyLocked,
  peekCompanyCurrency,
  setCompanyCurrency,
} from "@/lib/features/settings/company-currency";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";
import {
  applySetShowQuantityButtons,
  applySetShowQuantityInput,
  readPosCartQtyUiForMode,
} from "@/lib/utils/pos-cart-settings";
import {
  getStoredFsThemePref,
  persistAndApplyFsTheme,
  type FsThemePref,
} from "@/lib/theme/fs-theme";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  MdAccountBalanceWallet,
  MdAddPhotoAlternate,
  MdBrightness4,
  MdBrightness7,
  MdBrightnessAuto,
  MdBusiness,
  MdCardMembership,
  MdDeleteSweep,
  MdExpandMore,
  MdErrorOutline,
  MdGroups,
  MdHistory,
  MdKey,
  MdLeaderboard,
  MdLock,
  MdMail,
  MdPalette,
  MdPerson,
  MdPlace,
  MdPhotoCamera,
  MdNotificationsActive,
  MdOutbox,
  MdSend,
  MdLocalShipping,
  MdMoveToInbox,
  MdSave,
  MdSell,
  MdSecurity,
  MdContactPhone,
  MdCreditCard,
  MdInventory2,
  MdAllInbox,
  MdAutoAwesome,
  MdLibraryAddCheck,
  MdPayments,
  MdSchedule,
  MdPieChart,
  MdPriceChange,
  MdPrint,
  MdRequestQuote,
  MdReceiptLong,
  MdShoppingCart,
  MdStore,
  MdTableChart,
  MdWarningAmber,
} from "react-icons/md";

function toNullable(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

function SettingsCardTitle({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-[22px] w-[22px] shrink-0 text-fs-accent" aria-hidden />
      <p className="text-base font-semibold text-fs-text">{title}</p>
    </div>
  );
}

/** Liste déroulante type `DropdownButtonFormField` + fond gris (écran Paramètres Flutter — carte Entreprise). */
function settingsCompanySelectClassName(extra?: string) {
  return cn(
    "w-full cursor-pointer appearance-none rounded-xl border-0 bg-neutral-100 py-3 pl-4 pr-11 text-sm font-medium text-fs-text shadow-none outline-none transition",
    "focus-visible:ring-2 focus-visible:ring-fs-accent/25 dark:bg-neutral-800/90",
    extra,
  );
}

function SettingsGreySelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select className={settingsCompanySelectClassName()} value={value} onChange={onChange}>
        {children}
      </select>
      <MdExpandMore
        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
        aria-hidden
      />
    </div>
  );
}

function formatSubscriptionStatus(status: string): string {
  if (status === "active") return "Actif";
  if (status === "past_due") return "Paiement en attente";
  if (status === "canceled") return "Résilié";
  return status;
}

function formatSubscriptionDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function SettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const ctxQ = useAppContext();
  const { hasPermission, helpers, isLoading: permLoading } = usePermissions();

  const companyId = ctxQ.data?.companyId ?? "";
  const companyName = ctxQ.data?.companyName ?? "";
  const companyLogoUrl = ctxQ.data?.companyLogoUrl ?? null;
  const stores = ctxQ.data?.stores ?? [];
  const ctxStoreId = ctxQ.data?.storeId ?? null;
  const isOwner = ctxQ.data?.roleSlug === "owner";
  const canSettings = hasPermission(P.settingsManage);

  const [themePref, setThemePref] = useState<FsThemePref>(() =>
    typeof window !== "undefined" ? getStoredFsThemePref() : "system",
  );
  const [posQuickUi, setPosQuickUi] = useState(() =>
    typeof window !== "undefined"
      ? readPosCartQtyUiForMode("quick")
      : { showQuantityInput: true, showQuantityButtons: false },
  );
  const [posInvoiceUi, setPosInvoiceUi] = useState(() =>
    typeof window !== "undefined"
      ? readPosCartQtyUiForMode("a4")
      : { showQuantityInput: true, showQuantityButtons: false },
  );

  const [profileName, setProfileName] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [dangerScopeStoreId, setDangerScopeStoreId] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [dangerErr, setDangerErr] = useState<string | null>(null);
  const [twoFaOpen, setTwoFaOpen] = useState(false);

  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCompanyLogo, setUploadingCompanyLogo] = useState(false);
  const [companyLogoImgError, setCompanyLogoImgError] = useState(false);

  const [clearingSales, setClearingSales] = useState(false);
  const [clearingPurchases, setClearingPurchases] = useState(false);
  const [clearingTransfers, setClearingTransfers] = useState(false);
  const [clearingProducts, setClearingProducts] = useState(false);
  const [clearingStock, setClearingStock] = useState(false);
  const [clearingMovements, setClearingMovements] = useState(false);
  const [clearingWarehouseStock, setClearingWarehouseStock] = useState(false);
  const [clearingWarehouseMovements, setClearingWarehouseMovements] = useState(false);

  const [confirmDanger, setConfirmDanger] = useState<{
    title: string;
    body: string;
    actionLabel: string;
    run: () => Promise<void>;
  } | null>(null);

  const themePersistSkip = useRef(true);

  useEffect(() => {
    if (permLoading) return;
    if (helpers?.isCashier) {
      router.replace(ROUTES.sales);
    }
  }, [permLoading, helpers?.isCashier, router]);

  useEffect(() => {
    if (themePersistSkip.current) {
      themePersistSkip.current = false;
      return;
    }
    persistAndApplyFsTheme(themePref);
  }, [themePref]);

  useEffect(() => {
    setPosQuickUi(readPosCartQtyUiForMode("quick"));
    setPosInvoiceUi(readPosCartQtyUiForMode("a4"));
  }, []);

  useEffect(() => {
    setCompanyLogoImgError(false);
  }, [companyLogoUrl]);

  async function handleCompanyLogoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !companyId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image (PNG, JPG…).");
      return;
    }
    setUploadingCompanyLogo(true);
    try {
      const url = await uploadCompanyLogo(companyId, file);
      await updateCompanyLogoUrl(companyId, url);
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
      toast.success("Logo mis à jour");
    } catch (err) {
      toast.error(messageFromUnknownError(err));
    } finally {
      setUploadingCompanyLogo(false);
    }
  }

  async function handleRemoveCompanyLogo() {
    if (!companyId) return;
    setUploadingCompanyLogo(true);
    try {
      await updateCompanyLogoUrl(companyId, null);
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
      toast.success("Logo retiré");
    } catch (err) {
      toast.error(messageFromUnknownError(err));
    } finally {
      setUploadingCompanyLogo(false);
    }
  }

  const meQ = useQuery({
    queryKey: ["me-profile"] as const,
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!user) return { id: "", email: "", fullName: "" };
      const { data: pRow } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      return {
        id: user.id,
        email: user.email ?? "",
        fullName: ((pRow as { full_name?: string | null } | null)?.full_name ?? "") as string,
      };
    },
    staleTime: 30_000,
  });

  const userId = meQ.data?.id ?? "";

  const companiesQ = useQuery({
    queryKey: ["settings-companies", userId] as const,
    queryFn: async () => {
      const supabase = createClient();
      const { data: roles, error } = await supabase
        .from("user_company_roles")
        .select("company_id")
        .eq("user_id", userId)
        .eq("is_active", true);
      if (error) throw error;
      const ids = [...new Set((roles ?? []).map((r) => (r as { company_id: string }).company_id))];
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", ids);
      if (cErr) throw cErr;
      return (companies ?? []) as { id: string; name: string }[];
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const companies = companiesQ.data ?? [];
  const multiCompany = companies.length > 1;

  useEffect(() => {
    setProfileName(meQ.data?.fullName ?? "");
  }, [meQ.data?.fullName]);

  const subscriptionQ = useQuery({
    queryKey: ["subscription", companyId] as const,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("company_subscriptions")
        .select("status, current_period_end, plan:subscription_plans(slug, name)")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!data) return null;
      const planRaw = (data as { plan?: { slug?: string; name?: string } | { slug?: string; name?: string }[] }).plan;
      const plan = Array.isArray(planRaw) ? planRaw[0] : planRaw;
      return {
        status: String((data as { status?: string }).status ?? "active"),
        currentPeriodEnd: ((data as { current_period_end?: string | null }).current_period_end ?? null) as string | null,
        planName: String(plan?.name ?? "Gratuit"),
      };
    },
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const peekInvoiceTable =
    companyId.length > 0 && isOwner ? peekInvoiceTablePosEnabled(companyId) : undefined;
  const invoiceTablePosQ = useQuery({
    queryKey: queryKeys.invoiceTablePosEnabled(companyId),
    queryFn: () => fetchInvoiceTablePosEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekInvoiceTable !== undefined ? { initialData: peekInvoiceTable } : {}),
  });

  const invoiceTablePosMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setInvoiceTablePosEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Mode facture (tableau) activé pour l'entreprise. Accordez le droit aux employés dans Employés."
          : "Mode facture (tableau) désactivé.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.invoiceTablePosEnabled(companyId) });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const peekAiCart =
    companyId.length > 0 && isOwner ? peekAiCartVisionEnabled(companyId) : undefined;
  const aiCartVisionQ = useQuery({
    queryKey: queryKeys.aiCartVisionEnabled(companyId),
    queryFn: () => fetchAiCartVisionEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekAiCart !== undefined ? { initialData: peekAiCart } : {}),
  });

  const aiCartVisionMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setAiCartVisionEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Panier IA activé. Le bouton apparaît dans la caisse Facture (tableau)."
          : "Panier IA désactivé.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.aiCartVisionEnabled(companyId) });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const peekQuickCredit =
    companyId.length > 0 && isOwner ? peekQuickPosCreditEnabled(companyId) : undefined;
  const quickPosCreditQ = useQuery({
    queryKey: queryKeys.quickPosCreditEnabled(companyId),
    queryFn: () => fetchQuickPosCreditEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekQuickCredit !== undefined ? { initialData: peekQuickCredit } : {}),
  });

  const quickPosCreditMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setQuickPosCreditEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Vente à crédit activée en caisse rapide. Le caissier devra choisir un client."
          : "Vente à crédit désactivée en caisse rapide.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.quickPosCreditEnabled(companyId) });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * « Détail des encaissements » du tableau de bord. Fermé par défaut : le tableau de
   * bord garde ses totaux globaux tant que le propriétaire ne demande rien de plus.
   */
  const peekPaymentMix =
    companyId.length > 0 && isOwner ? peekDashboardPaymentMixEnabled(companyId) : undefined;
  const paymentMixQ = useQuery({
    queryKey: queryKeys.dashboardPaymentMixEnabled(companyId),
    queryFn: () => fetchDashboardPaymentMixEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekPaymentMix !== undefined ? { initialData: peekPaymentMix } : {}),
  });

  const paymentMixMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setDashboardPaymentMixEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Détail des encaissements activé. Il apparaît sur le tableau de bord."
          : "Détail des encaissements masqué sur le tableau de bord.",
      );
      await qc.invalidateQueries({
        queryKey: queryKeys.dashboardPaymentMixEnabled(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Suivi « marchandise payée non emportée ». Fermé par défaut : la plupart des commerces
   * remettent tout de suite, et l'icône supplémentaire dans la liste des ventes serait
   * pour eux une question sans objet.
   */
  const peekPickupTracking =
    companyId.length > 0 && isOwner ? peekSalePickupTrackingEnabled(companyId) : undefined;
  const pickupTrackingQ = useQuery({
    queryKey: queryKeys.salePickupTrackingEnabled(companyId),
    queryFn: () => fetchSalePickupTrackingEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekPickupTracking !== undefined ? { initialData: peekPickupTracking } : {}),
  });

  const pickupTrackingMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setSalePickupTrackingEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Suivi des retraits activé. L'icône apparaît sur chaque vente de la page Ventes."
          : "Suivi des retraits désactivé. Les ventes déjà marquées sont conservées.",
      );
      await qc.invalidateQueries({
        queryKey: queryKeys.salePickupTrackingEnabled(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Choisir le format d'impression — désactivé par défaut.
   *
   * Par défaut le papier suit la caisse (ticket en caisse rapide, facture A4 en POS
   * Facture) : c'est ce que fait déjà tout le monde, et personne ne l'a demandé
   * autrement. Le réglage n'existe que pour le commerçant dont les clients réclament
   * parfois l'autre document.
   */
  const peekPrintFormatChoice =
    companyId.length > 0 && isOwner ? peekPrintFormatChoiceEnabled(companyId) : undefined;
  const printFormatChoiceQ = useQuery({
    queryKey: queryKeys.printFormatChoiceEnabled(companyId),
    queryFn: () => fetchPrintFormatChoiceEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekPrintFormatChoice !== undefined ? { initialData: peekPrintFormatChoice } : {}),
  });

  const printFormatChoiceMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setPrintFormatChoiceEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Choix du format activé. Chaque vente peut sortir en ticket ou en facture A4."
          : "Choix du format désactivé. L'impression suit de nouveau la caisse utilisée.",
      );
      await qc.invalidateQueries({
        queryKey: queryKeys.printFormatChoiceEnabled(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Remplir le stock en un clic — fermé par défaut.
   *
   * Le raccourci est puissant dans les deux sens : il remplit un magasin entier en une
   * minute, et une quantité tapée de travers fausse le stock de tout le magasin aussi
   * vite. Le propriétaire décide donc s'il veut ce bouton dans sa boutique ; le droit
   * « Ajuster le stock » reste exigé par-dessus pour l'employé.
   */
  const peekBulkStock =
    companyId.length > 0 && isOwner ? peekBulkStockEntryEnabled(companyId) : undefined;
  const bulkStockQ = useQuery({
    queryKey: queryKeys.bulkStockEntryEnabled(companyId),
    queryFn: () => fetchBulkStockEntryEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekBulkStock !== undefined ? { initialData: peekBulkStock } : {}),
  });

  const bulkStockMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setBulkStockEntryEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Saisie groupée activée. Les cases à cocher apparaissent sur la page Stock."
          : "Saisie groupée désactivée. Le stock s'ajuste de nouveau produit par produit.",
      );
      await qc.invalidateQueries({
        queryKey: queryKeys.bulkStockEntryEnabled(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Prix du conditionnement à la pièce — fermé par défaut.
   *
   * Le commerçant annonce son gros « à la pièce » (« le carton, c'est 3 500 la pièce »),
   * alors que la base stocke le prix du lot entier. Ouvert, le champ parle sa langue et
   * l'application fait la multiplication ; fermé, on demande le prix du lot, comme avant.
   * Dans les deux cas, ce qui part en base est identique — seule la saisie change.
   */
  const peekPkgPriceMode =
    companyId.length > 0 && isOwner ? peekPackagingPricePerPiece(companyId) : undefined;
  const packagingPriceModeQ = useQuery({
    queryKey: queryKeys.packagingPricePerPiece(companyId),
    queryFn: () => fetchPackagingPricePerPiece(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekPkgPriceMode !== undefined ? { initialData: peekPkgPriceMode } : {}),
  });

  const packagingPriceModeMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setPackagingPricePerPiece(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Saisie à la pièce activée. Le champ demande le prix d'une pièce du lot."
          : "Saisie à la pièce désactivée. Le champ demande de nouveau le prix du lot entier.",
      );
      await qc.invalidateQueries({
        queryKey: queryKeys.packagingPricePerPiece(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Vente au nom d'un client — les deux règles sont coupées par défaut.
   *
   * Elles changent ce que la caisse ACCEPTE, pas seulement ce qu'elle affiche : on les
   * réunit donc sous une seule carte, pour que le propriétaire voie d'un coup d'œil
   * tout ce qui peut faire refuser une vente à son comptoir.
   */
  const peekCustomerPolicy =
    companyId.length > 0 && isOwner ? peekSaleCustomerPolicy(companyId) : undefined;
  const customerPolicyQ = useQuery({
    queryKey: queryKeys.saleCustomerPolicy(companyId),
    queryFn: () => fetchSaleCustomerPolicy(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekCustomerPolicy !== undefined ? { initialData: peekCustomerPolicy } : {}),
  });
  const customerPolicy = customerPolicyQ.data ?? SALE_CUSTOMER_POLICY_DEFAULT;

  const customerPolicyMut = useMutation({
    mutationFn: async (vars: { next: SaleCustomerPolicy; message: string }) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setSaleCustomerPolicy(companyId, vars.next);
      return vars.message;
    },
    onSuccess: async (message) => {
      toast.success(message);
      await qc.invalidateQueries({ queryKey: queryKeys.saleCustomerPolicy(companyId) });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const peekQuickPriceEdit =
    companyId.length > 0 && isOwner ? peekQuickPosPriceEditEnabled(companyId) : undefined;
  const quickPosPriceEditQ = useQuery({
    queryKey: queryKeys.quickPosPriceEditEnabled(companyId),
    queryFn: () => fetchQuickPosPriceEditEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekQuickPriceEdit !== undefined ? { initialData: peekQuickPriceEdit } : {}),
  });

  const quickPosPriceEditMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setQuickPosPriceEditEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Saisie du prix activée en caisse rapide."
          : "Saisie du prix désactivée : le prix du catalogue s'applique.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.quickPosPriceEditEnabled(companyId) });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Classement des vendeurs sur la page Ventes : visible du propriétaire, masqué de
   * ses employés tant qu'il ne l'ouvre pas ici.
   */
  const peekSellerBoardStaff =
    companyId.length > 0 && isOwner
      ? peekSalesSellerBoardStaffEnabled(companyId)
      : undefined;
  const sellerBoardStaffQ = useQuery({
    queryKey: queryKeys.salesSellerBoardStaffEnabled(companyId),
    queryFn: () => fetchSalesSellerBoardStaffEnabled(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekSellerBoardStaff !== undefined ? { initialData: peekSellerBoardStaff } : {}),
  });

  const sellerBoardStaffMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setSalesSellerBoardStaffEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Vos employés voient les chiffres de vente du jour."
          : "Total facturé, panier moyen et classement masqués pour vos employés.",
      );
      await qc.invalidateQueries({
        queryKey: queryKeys.salesSellerBoardStaffEnabled(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Encaissement en caisse rapide (opérateurs proposés, paiement mixte, client masqué).
   * Un seul réglage JSON : les trois options servent le même comptoir et se règlent
   * ensemble. Interrupteur maître coupé par défaut ⇒ caisse inchangée.
   */
  const peekQuickPayments =
    companyId.length > 0 && isOwner ? peekQuickPosPayments(companyId) : undefined;
  const quickPaymentsQ = useQuery({
    queryKey: queryKeys.quickPosPayments(companyId),
    queryFn: () => fetchQuickPosPayments(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekQuickPayments !== undefined ? { initialData: peekQuickPayments } : {}),
  });
  const quickPayments = quickPaymentsQ.data ?? QUICK_POS_PAYMENTS_DEFAULT;

  const quickPaymentsMut = useMutation({
    mutationFn: async (next: QuickPosPaymentsSettings) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setQuickPosPayments(companyId, next);
      return next;
    },
    onSuccess: async (next) => {
      toast.success(
        next.enabled
          ? "Encaissement caisse rapide enregistré."
          : "Encaissement caisse rapide remis au fonctionnement standard.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.quickPosPayments(companyId) });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /** Un opérateur au moins doit rester coché : sans lui, plus aucun encaissement mobile. */
  function toggleQuickProvider(id: MobileMoneyProvider, checked: boolean) {
    const current = quickPayments.providers;
    const next = checked
      ? MOBILE_MONEY_PROVIDERS.map((p) => p.id).filter(
          (p) => p === id || current.includes(p),
        )
      : current.filter((p) => p !== id);
    if (next.length === 0) {
      toast.info("Gardez au moins un opérateur mobile money.");
      return;
    }
    void quickPaymentsMut.mutateAsync({ ...quickPayments, providers: next });
  }

  /* Devise de l'entreprise — owner uniquement, verrouillée dès la première vente. */
  const peekCurrency =
    companyId.length > 0 && isOwner ? peekCompanyCurrency(companyId) : undefined;
  const currencyQ = useQuery({
    queryKey: ["company-currency", companyId],
    queryFn: () => fetchCompanyCurrency(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekCurrency !== undefined ? { initialData: peekCurrency } : {}),
  });

  const currencyLockedQ = useQuery({
    queryKey: ["company-currency-locked", companyId],
    queryFn: () => fetchCompanyCurrencyLocked(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 60_000,
  });

  const currencyMut = useMutation({
    mutationFn: async (code: string) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setCompanyCurrency(companyId, code);
    },
    onSuccess: async (_, code) => {
      toast.success(`Devise enregistrée : ${currencyOf(code).label}.`);
      await qc.invalidateQueries({ queryKey: ["company-currency", companyId] });
      // Tous les écrans affichent des montants : les rafraîchir d'un bloc.
      await qc.invalidateQueries();
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /* Fuseau horaire de l'entreprise — owner uniquement, librement modifiable. */
  const peekTimeZone =
    companyId.length > 0 && isOwner ? peekCompanyTimeZone(companyId) : undefined;
  const timeZoneQ = useQuery({
    queryKey: ["company-timezone", companyId],
    queryFn: () => fetchCompanyTimeZone(companyId),
    enabled: Boolean(companyId && isOwner),
    staleTime: 30_000,
    ...(peekTimeZone !== undefined ? { initialData: peekTimeZone } : {}),
  });

  const timeZoneMut = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setCompanyTimeZone(companyId, id);
    },
    onSuccess: async (_, id) => {
      toast.success(`Fuseau horaire enregistré : ${timeZoneLabelOf(id)}.`);
      await qc.invalidateQueries({ queryKey: ["company-timezone", companyId] });
      // Toute l'app affiche des heures et borne des journées : on rafraîchit d'un bloc,
      // comme pour la devise.
      await qc.invalidateQueries();
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /* Aperçu vivant : le propriétaire vérifie d'un coup d'œil que l'heure est la bonne. */
  const [tzPreview, setTzPreview] = useState(() => formatOperationTimeWithSeconds(new Date()));
  useEffect(() => {
    const t = setInterval(
      () => setTzPreview(formatOperationTimeWithSeconds(new Date())),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  const productLocationsEnabled = ctxQ.data?.productLocationsEnabled === true;
  const productLocationsMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setProductLocationsEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Module Emplacements activé. Ouvrez « Emplacements » pour construire le plan de votre boutique."
          : "Module Emplacements désactivé. Vos plans et rangements sont conservés.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const landedCostEnabled = ctxQ.data?.landedCostEnabled === true;
  const landedCostMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setLandedCostEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Module Prix de revient activé. Ouvrez « Prix de revient » pour saisir votre premier arrivage."
          : "Module Prix de revient désactivé. Vos arrivages et l'historique des prix sont conservés.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const saleDocumentsEnabled = ctxQ.data?.saleDocumentsEnabled === true;
  const saleDocumentsMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setSaleDocumentsEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Devis & Factures activé. Ouvrez « Devis & Factures » pour établir votre premier devis."
          : "Devis & Factures désactivé. Vos devis et factures déjà établis sont conservés.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Page Conditionnements — fermée par défaut.
   *
   * Beaucoup de commerces ne vendent qu'à la pièce : une entrée de menu sur le carton
   * serait, pour eux, une question sans objet. La fermer ne supprime rien — les lots
   * déjà saisis restent en base et la caisse continue de les proposer.
   */
  const packagingsPageEnabled = ctxQ.data?.packagingsPageEnabled === true;
  const packagingsPageMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setPackagingsPageEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Page Conditionnements activée. Elle apparaît dans le menu."
          : "Page Conditionnements désactivée. Vos cartons et paquets déjà enregistrés sont conservés.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const peekLocationsPos =
    companyId.length > 0 && isOwner && productLocationsEnabled
      ? peekProductLocationsPosEnabled(companyId)
      : undefined;
  const productLocationsPosQ = useQuery({
    queryKey: queryKeys.productLocationsPosEnabled(companyId),
    queryFn: () => fetchProductLocationsPosEnabled(companyId),
    enabled: Boolean(companyId && isOwner && productLocationsEnabled),
    staleTime: 30_000,
    ...(peekLocationsPos !== undefined ? { initialData: peekLocationsPos } : {}),
  });

  const productLocationsPosMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setProductLocationsPosEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "L'emplacement s'affiche désormais à la caisse, sur les produits et dans le panier."
          : "L'emplacement n'est plus affiché à la caisse.",
      );
      await qc.invalidateQueries({
        queryKey: queryKeys.productLocationsPosEnabled(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /**
   * « Autres noms » d'un produit (alias de recherche). Réglage entreprise, écrit
   * par le propriétaire ; le contexte applicatif porte le drapeau.
   */
  const productAliasesEnabled = ctxQ.data?.productAliasesEnabled === true;
  const productAliasesMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setProductAliasesEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Autres noms activés. Ajoutez-les dans la fiche produit."
          : "Autres noms désactivés. Ceux déjà saisis sont conservés.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /**
   * « Personnaliser mes dépenses » : les postes du commerçant remplacent nos onze
   * catégories d'usine, et la saisie tombe à cinq champs. Réglage entreprise,
   * écrit par le propriétaire.
   */
  const customExpensesEnabled = ctxQ.data?.customExpensesEnabled === true;
  const customExpensesMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setCustomExpensesEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Dépenses personnalisées activées. Créez vos catégories depuis Dépenses › Mes catégories."
          : "Dépenses personnalisées désactivées. Vos postes et vos dépenses sont conservés.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /**
   * « Caisse à deux » : un vendeur constitue le panier, un second employé encaisse.
   * Réglage entreprise, écrit par le propriétaire — fermé par défaut, parce qu'une
   * boutique tenue par une seule personne n'a rien à y gagner.
   */
  const dualCashierEnabled = ctxQ.data?.dualCashierEnabled === true;
  const dualCashierMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setDualCashierEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Caisse à deux activée. La caisse rapide propose « Envoyer à la caisse », et la page Encaissement reçoit les paniers."
          : "Caisse à deux désactivée. Les paniers déjà envoyés restent encaissables.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /*
   * Sous-réglage de la caisse à deux : le vendeur garde-t-il le droit d'encaisser
   * lui-même ? Fermé, l'argent ne peut plus passer que par la personne qui tient la
   * caisse — c'est ce que demande le propriétaire qui veut une seule main sur le tiroir.
   */
  const peekSelfCheckout =
    companyId.length > 0 && isOwner ? peekDualCashierSelfCheckout(companyId) : undefined;
  const selfCheckoutQ = useQuery({
    queryKey: queryKeys.dualCashierSelfCheckout(companyId),
    queryFn: () => fetchDualCashierSelfCheckout(companyId),
    enabled: Boolean(companyId && isOwner && dualCashierEnabled),
    staleTime: 30_000,
    ...(peekSelfCheckout !== undefined ? { initialData: peekSelfCheckout } : {}),
  });
  const selfCheckoutMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setDualCashierSelfCheckout(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Le vendeur peut de nouveau encaisser lui-même."
          : "Encaissement réservé à la caisse : les paniers ne peuvent plus qu'y être envoyés.",
      );
      await qc.invalidateQueries({
        queryKey: queryKeys.dualCashierSelfCheckout(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /**
   * « Approvisionnement » : l'arrivage express, saisi debout, qui entre en stock et se
   * vend dans la minute. Réglage entreprise, écrit par le propriétaire — fermé par
   * défaut, parce qu'un commerce qui n'achète qu'à de vrais fournisseurs a déjà le
   * module Achats et n'a rien à gagner à une entrée de menu de plus.
   */
  const quickSupplyEnabled = ctxQ.data?.quickSupplyEnabled === true;
  const quickSupplyMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setQuickSupplyEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Approvisionnement activé. Donnez le droit à vos employés depuis la page Employés."
          : "Approvisionnement désactivé. Les arrivages déjà enregistrés sont conservés.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /**
   * « Photos produits » : l'employé illustre le catalogue, et RIEN d'autre. Réglage
   * entreprise, écrit par le propriétaire — fermé par défaut, parce que la page n'a de
   * sens que là où quelqu'un d'autre que le patron tient les articles dans la main.
   */
  const employeePhotosEnabled = ctxQ.data?.employeePhotosEnabled === true;
  const employeePhotosMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setEmployeePhotosEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Photos produits activée. Vos vendeurs peuvent illustrer le catalogue."
          : "Photos produits désactivée. Les photos déjà prises sont conservées.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /**
   * « L'équipe peut ajouter un article » : la fiche arrive SANS prix et invendable, et
   * devient opérationnelle d'elle-même dès que le propriétaire pose un prix de vente.
   */
  const employeeDraftProductsEnabled =
    ctxQ.data?.employeeDraftProductsEnabled === true;
  const employeeDraftProductsMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setEmployeeDraftProductsEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Vos employés peuvent ajouter des articles. Ils n'y verront aucun prix."
          : "Ajout d'articles par l'équipe désactivé. Les fiches déjà créées restent en place.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /**
   * « Enlèvements partenaires » : le contraire de l'approvisionnement — la marchandise
   * qu'un confrère vient prendre, ce qu'il paie et ce qu'il reste dû.
   */
  const partnerOfftakesEnabled = ctxQ.data?.partnerOfftakesEnabled === true;
  const partnerOfftakesMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setPartnerOfftakesEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Enlèvements activés. Donnez le droit à vos employés depuis la page Employés."
          : "Enlèvements désactivés. Les bons déjà enregistrés sont conservés.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /** « Expéditions » : le colis qui part en province et les frais de transport avancés. */
  const shipmentsEnabled = ctxQ.data?.shipmentsEnabled === true;
  const shipmentsMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setShipmentsEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Expéditions activées. Vous pouvez suivre les colis et les frais avancés."
          : "Expéditions désactivées. Les expéditions déjà saisies sont conservées.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  /**
   * « Rappels de crédit » : le drapeau, puis la fréquence.
   *
   * Deux réglages de nature différente, d'où deux chemins d'écriture : le drapeau est
   * une colonne de `companies` (il décide de l'existence de la page, donc du menu et de
   * la garde de route) ; la configuration vit dans `company_settings`, où une valeur
   * absente vaut « pas encore réglé » et retombe sur les défauts.
   */
  const creditRemindersEnabled = ctxQ.data?.creditRemindersEnabled === true;
  const creditRemindersMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setCreditRemindersEnabled(companyId, enabled);
    },
    onSuccess: async (_, enabled) => {
      toast.success(
        enabled
          ? "Rappels de crédit activés. L'application vous dira qui relancer."
          : "Rappels de crédit désactivés. Vos créances restent visibles dans la page Crédit.",
      );
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const peekReminders =
    companyId.length > 0 && isOwner ? peekCreditRemindersConfig(companyId) : undefined;
  const remindersConfigQ = useQuery({
    queryKey: queryKeys.creditRemindersConfig(companyId),
    queryFn: () => fetchCreditRemindersConfig(companyId),
    enabled: Boolean(companyId && isOwner && creditRemindersEnabled),
    staleTime: 30_000,
    ...(peekReminders !== undefined ? { initialData: peekReminders } : {}),
  });
  const remindersConfig = remindersConfigQ.data ?? DEFAULT_CREDIT_REMINDERS_CONFIG;
  const remindersConfigMut = useMutation({
    mutationFn: async (patch: Partial<CreditRemindersConfig>) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setCreditRemindersConfig(companyId, { ...remindersConfig, ...patch });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: queryKeys.creditRemindersConfig(companyId),
      });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const profileMut = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const id = meQ.data?.id;
      if (!id) throw new Error("Utilisateur introuvable.");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: toNullable(profileName) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Profil mis à jour");
      await qc.invalidateQueries({ queryKey: ["me-profile"] });
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const pwdMut = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mot de passe mis à jour");
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const scopeLabel =
    dangerScopeStoreId == null
      ? "Toute l'entreprise"
      : "Boutique sélectionnée";

  async function invalidateAfterDanger() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.appContext }),
      qc.invalidateQueries({ queryKey: queryKeys.stores(companyId) }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
      qc.invalidateQueries({
        queryKey: queryKeys.sales({
          companyId,
          storeId: ctxStoreId,
          status: null,
          from: "",
          to: "",
        }),
      }),
      qc.invalidateQueries({
        queryKey: queryKeys.purchases({
          companyId,
          storeId: ctxStoreId,
          supplierId: null,
          status: null,
        }),
      }),
      qc.invalidateQueries({ queryKey: queryKeys.productInventory(ctxStoreId) }),
    ]);
  }

  async function rpcDanger(
    rpc: string,
    params: { p_company_id: string; p_store_id?: string | null },
  ): Promise<number> {
    const supabase = createClient();
    const payload =
      rpc === "owner_clear_products_catalog"
        ? { p_company_id: params.p_company_id }
        : { p_company_id: params.p_company_id, p_store_id: params.p_store_id ?? null };
    const { data, error } = await supabase.rpc(rpc, payload);
    if (error) throw error;
    return typeof data === "number" ? data : Number(data ?? 0);
  }

  function openDanger(opts: { title: string; body: string; actionLabel: string; run: () => Promise<void> }) {
    setConfirmDanger(opts);
  }

  async function runConfirmed() {
    if (!confirmDanger) return;
    const fn = confirmDanger.run;
    setConfirmDanger(null);
    try {
      await fn();
      await invalidateAfterDanger();
    } catch (e) {
      setDangerErr(messageFromUnknownError(e));
    }
  }

  const loadingAnyDanger =
    clearingSales ||
    clearingPurchases ||
    clearingTransfers ||
    clearingProducts ||
    clearingStock ||
    clearingMovements ||
    clearingWarehouseStock ||
    clearingWarehouseMovements;

  if (permLoading || ctxQ.isLoading) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (helpers?.isCashier) {
    return null;
  }

  if (companyId && !canSettings) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <FsScreenHeader title="Paramètres" subtitle="Profil, compte et entreprise" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">Vous n&apos;avez pas accès à cette section.</p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
      <FsScreenHeader
        title="Paramètres"
        subtitle="Profil, compte et entreprise"
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        subtitleClassName="min-[900px]:text-base"
      />

      {/* Apparence — SegmentedButton 3 modes (Flutter) */}
      <FsCard padding="p-5">
        <SettingsCardTitle icon={MdPalette} title="Apparence" />
        <p className="mt-4 text-xs text-neutral-600 sm:text-sm">Choisir le thème de l&apos;application</p>
        <div className="mt-3 inline-flex w-full max-w-xl overflow-hidden rounded-[10px] border border-black/[0.08] sm:w-auto">
          {(
            [
              { v: "system" as const, Icon: MdBrightnessAuto, label: "Système" },
              { v: "light" as const, Icon: MdBrightness7, label: "Clair" },
              { v: "dark" as const, Icon: MdBrightness4, label: "Sombre" },
            ] as const
          ).map(({ v, Icon, label }, i) => (
            <button
              key={v}
              type="button"
              onClick={() => setThemePref(v)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold sm:gap-2 sm:px-4 sm:text-sm",
                i > 0 && "border-l border-black/[0.08]",
                themePref === v ? "bg-fs-accent text-white" : "bg-fs-card text-neutral-700",
              )}
            >
              <Icon className="h-5 w-5 shrink-0 sm:h-5 sm:w-5" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </FsCard>

      {/* Caisse POS rapide — aligné `SettingsPage._buildPosCartCard(quick)` Flutter */}
      <FsCard className="mt-5" padding="p-5">
        <SettingsCardTitle icon={MdShoppingCart} title="Caisse POS rapide" />
        <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
          Un seul mode à la fois pour la caisse rapide. Le panier se met à jour automatiquement à la saisie.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600 sm:text-sm">
          Toujours un mode actif : si vous désactivez le mode courant, l&apos;autre est activé automatiquement.
        </p>
        <div className="mt-4 space-y-0 divide-y divide-black/[0.06] rounded-[10px] border border-black/[0.08]">
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Champ de saisie pour la quantité</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Saisir le nombre : le total se met à jour automatiquement</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={posQuickUi.showQuantityInput}
              onChange={(e) => {
                const n = applySetShowQuantityInput("quick", e.target.checked);
                setPosQuickUi(n);
                void qc.invalidateQueries({ queryKey: queryKeys.posCartSettings });
              }}
            />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Boutons (-) et (+)</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Incrémenter ou décrémenter la quantité</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={posQuickUi.showQuantityButtons}
              onChange={(e) => {
                const n = applySetShowQuantityButtons("quick", e.target.checked);
                setPosQuickUi(n);
                void qc.invalidateQueries({ queryKey: queryKeys.posCartSettings });
              }}
            />
          </label>
        </div>
      </FsCard>

      {/* Vente à crédit en caisse rapide — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdCreditCard} title="Caisse POS rapide — vente à crédit" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Autorise le mode de paiement « À crédit » à la caisse rapide : le caissier choisit un
            client, saisit l&apos;acompte reçu (facultatif) et le reste part en créance. La vente
            apparaît alors dans la page Crédit pour le recouvrement. Désactivé, la caisse rapide
            n&apos;encaisse que du comptant.
          </p>
          {quickPosCreditQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  quickPosCreditMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Autoriser les ventes à crédit en caisse rapide
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {quickPosCreditQ.data
                      ? "Le bouton « CRÉDIT » est disponible au moment du paiement."
                      : "Désactivé : seuls espèces, carte et mobile money sont proposés."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(quickPosCreditQ.data)}
                  disabled={quickPosCreditMut.isPending}
                  onChange={(e) => {
                    void quickPosCreditMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Détail des encaissements du tableau de bord — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle
            icon={MdPieChart}
            title="Tableau de bord — détail des encaissements"
          />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Ajoute un volet repliable au tableau de bord, sous les chiffres du jour et sous
            ceux de la période. Il répond à une seule question : sur tout ce qui a été
            encaissé, combien est entré en espèces et combien par Orange Money, Moov Money,
            Wave, carte ou virement — avec le nombre de règlements de chacun. Les totaux
            déjà affichés ne changent pas ; le volet reste replié tant qu&apos;on ne
            l&apos;ouvre pas.
          </p>
          {paymentMixQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  paymentMixMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Afficher le détail des encaissements
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {paymentMixQ.data
                      ? "Le volet « Détail des encaissements » est visible sur le tableau de bord."
                      : "Désactivé : le tableau de bord n'affiche que les totaux globaux."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(paymentMixQ.data)}
                  disabled={paymentMixMut.isPending}
                  onChange={(e) => {
                    void paymentMixMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Marchandise payée non emportée — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle
            icon={MdInventory2}
            title="Marchandise payée non emportée"
          />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Ajoute une icône sur chaque vente de la page Ventes pour marquer que le client a
            payé mais n&apos;a rien emporté (« il repasse ce soir »). Une bannière indique alors
            ce qui attend derrière le comptoir, depuis combien de temps et pour quel montant ;
            à la remise, votre nom et l&apos;heure sont enregistrés.
          </p>
          {/*
            Le seul avertissement qui compte vraiment : le stock a déjà été décompté à
            l'encaissement. Si le commerçant ne met pas la marchandise à part, il la
            revendra — ou il la recomptera comme un surplus au prochain inventaire.
          */}
          <p className="mt-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            À savoir : ces articles sont déjà sortis du stock (ils sont vendus) tout en étant
            encore chez vous. Rangez-les dans un coin « retraits » et ne les comptez pas à
            l&apos;inventaire — l&apos;application vous le rappellera au moment du comptage.
          </p>
          {pickupTrackingQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  pickupTrackingMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Suivre les marchandises à retirer
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {pickupTrackingQ.data
                      ? "L'icône « à retirer » est disponible sur chaque vente complétée."
                      : "Désactivé : la page Ventes reste telle quelle."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(pickupTrackingQ.data)}
                  disabled={pickupTrackingMut.isPending}
                  onChange={(e) => {
                    void pickupTrackingMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Vente au nom d'un client — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdContactPhone} title="Vente au nom d'un client" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Deux règles pour savoir <b>qui</b> achète, et pour ne plus laisser une ardoise
            grossir. Les deux sont <b>désactivées par défaut</b> : tant qu&apos;elles le
            restent, la caisse est exactement celle d&apos;aujourd&apos;hui.
          </p>
          {customerPolicyQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 divide-y divide-black/[0.06] rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  customerPolicyMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Toute vente au nom d&apos;un client
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {customerPolicy.requireCustomer
                      ? "Caisse rapide, Facture A4 et vue tableau : aucune vente ne part sans client. Le numéro suffit pour en créer un."
                      : "Désactivé : le client reste facultatif (sauf à crédit, où il l'a toujours été)."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={customerPolicy.requireCustomer}
                  disabled={customerPolicyMut.isPending}
                  onChange={(e) => {
                    void customerPolicyMut.mutateAsync({
                      next: { ...customerPolicy, requireCustomer: e.target.checked },
                      message: e.target.checked
                        ? "Client obligatoire : chaque vente sera enregistrée à un nom."
                        : "Client de nouveau facultatif sur les ventes comptant.",
                    });
                  }}
                />
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  customerPolicyMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Refuser la vente si le client a une dette
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {customerPolicy.blockOnDebt
                      ? "Au moment d'encaisser, la caisse annonce la somme due et refuse la vente tant qu'elle n'est pas réglée."
                      : "Désactivé : un client qui doit de l'argent peut acheter de nouveau."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={customerPolicy.blockOnDebt}
                  disabled={customerPolicyMut.isPending}
                  onChange={(e) => {
                    void customerPolicyMut.mutateAsync({
                      next: { ...customerPolicy, blockOnDebt: e.target.checked },
                      message: e.target.checked
                        ? "Dette bloquante : la caisse refusera une nouvelle vente à un client endetté."
                        : "Blocage retiré : les clients endettés peuvent acheter de nouveau.",
                    });
                  }}
                />
              </label>
            </div>
          )}
          {/*
            Les deux mises en garde que le propriétaire doit lire AVANT d'activer, pas
            découvrir un samedi midi avec la file qui s'allonge.
          */}
          {customerPolicy.blockOnDebt ? (
            <p className="mt-3 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              À savoir : le refus vaut aussi pour un achat payé comptant — c&apos;est le but,
              mais votre caissier doit le savoir. La dette compte toutes les fiches portant le
              même numéro, pour qu&apos;un client ne puisse pas repartir à zéro en se faisant
              réinscrire. Et si la connexion tombe, la vente passe : mieux vaut un crédit de
              trop qu&apos;une boutique à l&apos;arrêt.
            </p>
          ) : null}
          {customerPolicy.blockOnDebt ? (
            <p className="mt-2 rounded-[10px] bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
              Exception pour un client précis : page <b>Clients</b>, bouton{" "}
              <b>« Autoriser »</b>. Vous levez la règle pour lui seul — avec un motif et,
              si vous le voulez, une date de fin. Le caissier voit alors à l&apos;écran que
              c&apos;est vous qui l&apos;avez autorisé.
            </p>
          ) : null}
        </FsCard>
      ) : null}

      {/* Remplir le stock en un clic — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdLibraryAddCheck} title="Remplir le stock en un clic" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Au démarrage, votre catalogue est là mais l&apos;application affiche zéro
            partout : il faut ouvrir chaque produit, un par un, pour entrer la quantité
            réelle — deux cents produits, deux cents fois le même geste. Activé, la page{" "}
            <b>Stock</b> affiche une case devant chaque produit, un bouton{" "}
            <b>« Tout cocher »</b>, et une seule quantité appliquée à toute la sélection.
            Chaque ligne reste modifiable avant de valider.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Deux façons de faire : <b>Ajouter</b> (une livraison qui s&apos;ajoute au
            rayon) ou <b>Mettre le stock à</b> (la quantité comptée remplace ce qui est
            affiché). Le même écran sert donc au démarrage comme à la grosse livraison du
            fournisseur habituel.
          </p>
          {/*
            Le vrai risque n'est pas technique, il est humain : le geste est aussi rapide
            dans le mauvais sens. Le dire ici, pas après coup au support.
          */}
          <p className="mt-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            À savoir : chaque produit reçoit un mouvement de stock signé de son auteur,
            comme un ajustement normal — rien n&apos;est invisible. Mais une quantité tapée
            de travers part sur toute la sélection d&apos;un coup. Seuls les employés
            ayant le droit « Ajuster le stock » voient ces cases ; pour recompter tout le
            magasin avec la trace des écarts, passez plutôt par une session
            d&apos;inventaire.
          </p>
          {bulkStockQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  bulkStockMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Cocher plusieurs produits et entrer leur stock d&apos;un coup
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {bulkStockQ.data
                      ? "Les cases à cocher et le bouton « Remplir le stock » sont visibles sur la page Stock."
                      : "Désactivé : le stock s'ajuste produit par produit, comme aujourd'hui."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(bulkStockQ.data)}
                  disabled={bulkStockMut.isPending}
                  onChange={(e) => {
                    void bulkStockMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Choisir le format d'impression — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdPrint} title="Choisir le format d'impression" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Aujourd&apos;hui le papier suit la caisse : ticket thermique en caisse rapide,
            facture A4 en POS Facture. Activé, chaque vente peut sortir dans{" "}
            <b>les deux formats</b>, sans rien changer à votre façon de vendre : après une
            vente en caisse rapide, un bouton « Imprimer en A4 » s&apos;ajoute au ticket ; après
            une facture A4, un bouton « Imprimer en ticket ». La page <b>Ventes</b> propose
            alors les deux sur chaque vente déjà enregistrée.
          </p>
          {/*
            Le point qui compte pour le commerçant : c'est un document de plus, pas une
            vente de plus. Sans cette phrase, la première question au support sera
            « est-ce que ça compte deux fois dans mon chiffre d'affaires ? ».
          */}
          <p className="mt-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            À savoir : les deux impressions portent le même numéro et les mêmes montants —
            c&apos;est la même vente, imprimée deux fois. Rien n&apos;est enregistré en
            double, ni dans le stock, ni dans vos rapports.
          </p>
          {printFormatChoiceQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  printFormatChoiceMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Imprimer en A4 ou en thermique au choix
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {printFormatChoiceQ.data
                      ? "Le second format est proposé après la vente et sur la page Ventes."
                      : "Désactivé : le document suit la caisse utilisée, comme aujourd'hui."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(printFormatChoiceQ.data)}
                  disabled={printFormatChoiceMut.isPending}
                  onChange={(e) => {
                    void printFormatChoiceMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Caisse à deux — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdGroups} title="Caisse à deux" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Aux heures de pointe, une seule personne fait tout : elle cherche les articles,
            elle compte, elle encaisse, elle rend la monnaie — et la file s&apos;allonge.
            Avec ce mode, l&apos;un de vos employés reste dans le magasin et constitue le
            panier avec le client, puis l&apos;envoie à la caisse d&apos;un bouton ; le
            second confirme et encaisse depuis la page « Encaissement », où il choisit le
            moyen de paiement et rend la monnaie.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            C&apos;est vous qui décidez qui encaisse : dans <b>Employés</b>, accordez ou
            retirez le droit « Encaisser les paniers envoyés » à chacun. Celui qui ne
            l&apos;a pas continue de vendre et d&apos;envoyer ses paniers — il ne touche
            simplement pas à l&apos;argent. Ceux qui l&apos;ont peuvent échanger leurs
            postes dans la journée sans aucun réglage à changer.
          </p>
          {/*
            Le seul point qui surprend si on ne le dit pas : rien n'est réservé. C'est
            volontaire (un panier abandonné bloquerait du stock invisible), mais le
            propriétaire doit le savoir avant, pas le découvrir un samedi.
          */}
          <p className="mt-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            À savoir : tant que le caissier n&apos;a pas encaissé, le stock n&apos;est pas
            décompté et rien n&apos;est réservé. Si le dernier article part entre-temps,
            l&apos;encaissement est refusé avec le motif — au comptoir, pendant que la
            marchandise est encore devant vous.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                dualCashierMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Vendre à deux (préparer / encaisser)
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {dualCashierEnabled
                    ? "La caisse rapide propose « Envoyer à la caisse », et la page Encaissement sonne à chaque panier reçu."
                    : "Désactivé : chaque vendeur encaisse lui-même, comme aujourd'hui."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={dualCashierEnabled}
                disabled={dualCashierMut.isPending}
                onChange={(e) => {
                  void dualCashierMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          {/*
            Second interrupteur, visible seulement quand le premier est ouvert : c'est un
            réglage DU module, pas un réglage à côté. L'afficher module fermé poserait une
            question sans objet.
          */}
          {dualCashierEnabled ? (
            <div className="mt-2 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  selfCheckoutMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Le vendeur peut encaisser lui-même
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {selfCheckoutQ.data === false
                      ? "Désactivé : le bouton « Encaisser ici » disparaît. Le panier ne peut plus qu'être envoyé à la caisse."
                      : "Le bouton « Encaisser ici » reste dans le panier, pour les moments où le vendeur est seul au comptoir."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={selfCheckoutQ.data !== false}
                  disabled={selfCheckoutMut.isPending}
                  onChange={(e) => {
                    void selfCheckoutMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          ) : null}
          {/*
            La règle du module, dite une fois et clairement : c'est elle qui rend le
            tiroir-caisse imputable à quelqu'un le soir.
          */}
          <p className="mt-2.5 rounded-[10px] bg-fs-surface-container px-3 py-2 text-xs leading-relaxed text-neutral-600">
            Un seul caissier à la fois : dès qu&apos;une personne encaisse, elle tient la
            caisse de la boutique et les autres restent en vente. Elle la rend quand elle a
            fini — et la caisse se libère seule au bout de trois minutes sans activité, pour
            qu&apos;un téléphone éteint ne bloque jamais votre comptoir.
          </p>
          {dualCashierEnabled ? (
            <Link
              href={ROUTES.checkoutQueue}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir la page Encaissement
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Approvisionnement (arrivage express) — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdMoveToInbox} title="Approvisionnement" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Le rayon se vide un samedi midi : vous traversez le marché, vous achetez dix
            cartons chez un grossiste ou chez le voisin, vous revenez — et un client
            attend déjà. Cette page fait entrer la marchandise en trente secondes : vous
            tapez le nom, la quantité, le prix payé, et c&apos;est vendable en caisse.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            L&apos;article qui n&apos;existe pas encore au catalogue se crée dans le même
            geste, avec son prix. Tant qu&apos;il reste de cette marchandise, la caisse la
            vend au prix de l&apos;arrivage et calcule votre bénéfice sur ce que vous avez
            réellement payé. Une fois le lot écoulé, tout revient au prix habituel.
          </p>
          {/*
            Le point qui rassure vraiment un commerçant : ce qu'il a mis des mois à
            régler ne bouge pas parce qu'il a dépanné un samedi.
          */}
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Les prix saisis à l&apos;arrivage ne remplacent jamais ceux de vos fiches
            produits : ils valent pour cette caisse de marchandise, pas pour la
            référence. Un achat de dépannage chez le voisin ne redéfinit donc pas la
            valeur d&apos;un article pour toute la boutique.
          </p>
          {/*
            Distinction à poser une fois pour toutes, sinon le propriétaire croit qu'on
            lui propose deux fois la même chose.
          */}
          <p className="mt-2 rounded-[10px] bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-900 dark:text-sky-200">
            Ce n&apos;est pas le module Achats : pas de fournisseur à enregistrer, pas de
            bon de commande, pas de dette. Pour l&apos;achat organisé avec un vrai
            fournisseur, gardez la page Achats — les deux coexistent.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                quickSupplyMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Approvisionnement rapide
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {quickSupplyEnabled
                    ? "La page Approvisionnement est ouverte. Vous seul y avez accès tant que vous n'accordez pas le droit à un employé."
                    : "Désactivé : la marchandise entre par les Achats ou par l'ajustement de stock."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={quickSupplyEnabled}
                disabled={quickSupplyMut.isPending}
                onChange={(e) => {
                  void quickSupplyMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          {/*
            Le point qui décide un patron : confier la réception sans confier le magasin.
          */}
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-600">
            Pour qu&apos;un caissier puisse réceptionner à votre place, cochez-lui « Faire
            un approvisionnement » dans Employés › Gestion des droits. Ce droit ne lui
            ouvre que cette page : ni la fiche produit, ni l&apos;ajustement de stock
            libre, et il ne peut pas changer le prix de vente d&apos;un article existant.
            Son nom reste attaché à chaque entrée.
          </p>
          {quickSupplyEnabled ? (
            <Link
              href={ROUTES.quickSupply}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir la page Approvisionnement
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Ce que l'équipe peut apporter au catalogue — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdPhotoCamera} title="Vos employés et le catalogue" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Deux choses que vos vendeurs peuvent faire à votre place, sans jamais voir un
            seul prix : <strong>photographier</strong> les articles, et{" "}
            <strong>saisir ceux qui manquent</strong>. Ce sont les deux tâches que vous
            n&apos;avez jamais le temps de finir, et les seules pour lesquelles ils sont
            mieux placés que vous — ils tiennent la marchandise dans la main toute la
            journée.
          </p>

          <div className="mt-4 space-y-0 divide-y divide-black/[0.06] rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                employeePhotosMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Page « Photos produits »
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
                  {employeePhotosEnabled
                    ? "Ouverte. L'employé voit la liste des articles, et ne peut QUE prendre la photo : ni renommer, ni reclasser, ni changer un prix."
                    : "Désactivée : les photos ne se posent que depuis la fiche produit."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={employeePhotosEnabled}
                disabled={employeePhotosMut.isPending}
                onChange={(e) => {
                  void employeePhotosMut.mutateAsync(e.target.checked);
                }}
              />
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                employeeDraftProductsMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Ajouter un article, sans le prix
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
                  {employeeDraftProductsEnabled
                    ? "Activé. L'article créé n'est PAS vendable : il attend que vous posiez son prix de vente. Il le devient tout seul à ce moment-là."
                    : "Désactivé : seule une personne autorisée à voir les prix peut créer un article."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={employeeDraftProductsEnabled}
                disabled={employeeDraftProductsMut.isPending}
                onChange={(e) => {
                  void employeeDraftProductsMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>

          {/*
            Le point qui décide un patron : ce qu'il confie, et ce qu'il ne confie pas.
          */}
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-600">
            Dans les deux cas, <strong>aucun prix ne quitte votre boutique</strong> : ni
            d&apos;achat, ni de vente, ni de marge. Les articles en attente de prix
            apparaissent en haut de votre page Produits, avec un bandeau « à chiffrer ».
          </p>

          {employeePhotosEnabled ? (
            <Link
              href={ROUTES.productPhotos}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir la page Photos produits
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Enlèvements partenaires — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdOutbox} title="Enlèvements partenaires" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            C&apos;est l&apos;inverse exact de l&apos;Approvisionnement. Là, vous allez
            prendre de la marchandise chez un confrère. Ici, un confrère vient en prendre
            chez vous : « Ali est passé ce matin, il a pris quinze cartons de savon, il a
            laissé 50 000, il paiera le reste vendredi. »
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            La page sort la marchandise du stock, écrit ce qui a été pris et à quel prix,
            suit ce qui reste dû, et vous donne le papier à remettre : un{" "}
            <strong>bon d&apos;enlèvement A4</strong> à imprimer, ou le détail complet
            envoyé <strong>sur WhatsApp</strong>. Quand le solde traîne, un message de
            relance courtois est déjà écrit.
          </p>
          {/* Le garde-fou qui justifie l'écran à lui seul. */}
          <p className="mt-2 rounded-[10px] bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-900 dark:text-sky-200">
            La page vous prévient si un prix consenti passe sous votre prix d&apos;achat.
            C&apos;est l&apos;erreur que le cahier ne rattrape jamais : elle ne se
            découvre qu&apos;à l&apos;inventaire, des mois plus tard.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                partnerOfftakesMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Enlèvements partenaires
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {partnerOfftakesEnabled
                    ? "La page Enlèvements est ouverte. Vous seul y avez accès tant que vous n'accordez pas le droit à un employé."
                    : "Désactivé : la marchandise sort par la caisse ou par l'ajustement de stock."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={partnerOfftakesEnabled}
                disabled={partnerOfftakesMut.isPending}
                onChange={(e) => {
                  void partnerOfftakesMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-600">
            Un enlèvement <strong>n&apos;est pas une vente</strong> : son montant
            n&apos;entre pas dans le chiffre d&apos;affaires du comptoir. Le gros et le
            détail se lisent côte à côte, jamais empilés — c&apos;est précisément ce
            qu&apos;on cherche à séparer.
          </p>
          {partnerOfftakesEnabled ? (
            <Link
              href={ROUTES.partnerOfftakes}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir la page Enlèvements
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Rappels de crédit — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdNotificationsActive} title="Rappels de crédit" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Votre page Crédit sait déjà parfaitement qui vous doit combien. Le problème
            n&apos;a jamais été là : il faut <strong>y aller</strong>. Et quand on vend
            toute la journée, on n&apos;y va pas — l&apos;argent dort dehors pendant des
            mois, non pas parce que le client refuse de payer, mais parce que personne
            n&apos;a redemandé.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Une fois activés, les rappels viennent à vous. À chaque connexion, une carte
            discrète apparaît en bas de l&apos;écran et <strong>passe vos débiteurs en
            revue toute seule</strong>, du plus gros montant au plus petit, quelques
            secondes chacun : « Untel vous doit tant ». Elle affiche le total dehors et le
            nombre de fiches restantes, puis se referme d&apos;elle-même à la fin du tour.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Sur chaque fiche, un message poli déjà écrit part sur WhatsApp d&apos;un seul
            tap, ou le client se met de côté pour trois jours. Le défilement{" "}
            <strong>s&apos;arrête dès que vous approchez la souris</strong> de la carte —
            une fiche qui s&apos;échappe au moment où vous tendez le doigt serait pire que
            pas de rappel du tout.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                creditRemindersMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Rappels de crédit
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {creditRemindersEnabled
                    ? "Activés. La page Rappels crédit apparaît dans le menu, et la carte de rappel s'affiche une fois par cycle."
                    : "Désactivés : rien ne vous rappellera vos créances."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={creditRemindersEnabled}
                disabled={creditRemindersMut.isPending}
                onChange={(e) => {
                  void creditRemindersMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>

          {creditRemindersEnabled ? (
            <div className="mt-3 space-y-3 rounded-[10px] border border-black/[0.08] px-3 py-3 sm:px-4">
              <div>
                <label
                  className="block text-xs font-medium text-neutral-600"
                  htmlFor="credit-reminders-frequency"
                >
                  À quelle fréquence vous rappeler un même client
                </label>
                <select
                  id="credit-reminders-frequency"
                  className={fsInputClass("mt-1.5")}
                  value={String(remindersConfig.frequencyDays)}
                  disabled={remindersConfigMut.isPending}
                  onChange={(e) => {
                    void remindersConfigMut.mutateAsync({
                      frequencyDays: Number(e.target.value),
                    });
                  }}
                >
                  {[1, 2, 3, 7, 14, 30].map((d) => (
                    <option key={d} value={d}>
                      {frequencyLabel(d)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Un client relancé ne réapparaît qu&apos;au bout de ce délai. C&apos;est
                  ce qui évite que trois personnes de la boutique le relancent le même
                  jour.
                </p>
              </div>

              <div>
                <label
                  className="block text-xs font-medium text-neutral-600"
                  htmlFor="credit-reminders-max"
                >
                  Combien de clients par tour
                </label>
                <select
                  id="credit-reminders-max"
                  className={fsInputClass("mt-1.5")}
                  value={String(remindersConfig.maxPerSession)}
                  disabled={remindersConfigMut.isPending}
                  onChange={(e) => {
                    void remindersConfigMut.mutateAsync({
                      maxPerSession: Number(e.target.value),
                    });
                  }}
                >
                  <option value="0">Tous — le tour complet</option>
                  {[3, 5, 10, 20].map((n) => (
                    <option key={n} value={n}>
                      Les {n} plus gros montants
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  « Tous » est le réglage d&apos;origine : à la connexion, vous voyez
                  l&apos;intégralité de ce qui est dehors. Si vous avez deux cents
                  ardoises, limitez-vous aux plus grosses — le tour doit tenir dans le
                  temps qu&apos;on veut bien lui donner.
                </p>
              </div>

              <div>
                <label
                  className="block text-xs font-medium text-neutral-600"
                  htmlFor="credit-reminders-min"
                >
                  Ne rien rappeler en dessous de
                </label>
                <input
                  id="credit-reminders-min"
                  inputMode="numeric"
                  defaultValue={String(Math.round(remindersConfig.minAmount))}
                  disabled={remindersConfigMut.isPending}
                  className={fsInputClass("mt-1.5 text-right tabular-nums")}
                  onBlur={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "");
                    const v = Math.max(0, Number(digits) || 0);
                    if (v !== remindersConfig.minAmount) {
                      void remindersConfigMut.mutateAsync({ minAmount: v });
                    }
                  }}
                />
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Une dette de 500 F relancée chaque jour coûte plus cher en agacement
                  qu&apos;elle ne rapporte. 0 = tout est rappelé.
                </p>
              </div>

              <div>
                <label
                  className="block text-xs font-medium text-neutral-600"
                  htmlFor="credit-reminders-hour"
                >
                  Pas avant
                </label>
                <select
                  id="credit-reminders-hour"
                  className={fsInputClass("mt-1.5")}
                  value={String(remindersConfig.fromHour)}
                  disabled={remindersConfigMut.isPending}
                  onChange={(e) => {
                    void remindersConfigMut.mutateAsync({
                      fromHour: Number(e.target.value),
                    });
                  }}
                >
                  {[5, 6, 7, 8, 9, 10, 12, 14, 16].map((hh) => (
                    <option key={hh} value={hh}>
                      {String(hh).padStart(2, "0")} h
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Personne ne veut penser à ses créances en ouvrant la caisse au petit
                  matin.
                </p>
              </div>

              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3",
                  remindersConfigMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Seulement les créances en retard
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {remindersConfig.overdueOnly
                      ? "Un client dont l'échéance n'est pas encore passée ne sera pas rappelé."
                      : "Tous vos débiteurs sont rappelés, échéance passée ou non."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={remindersConfig.overdueOnly}
                  disabled={remindersConfigMut.isPending}
                  onChange={(e) => {
                    void remindersConfigMut.mutateAsync({ overdueOnly: e.target.checked });
                  }}
                />
              </label>
            </div>
          ) : null}

          {creditRemindersEnabled ? (
            <Link
              href={ROUTES.creditReminders}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir la page Rappels crédit
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Expéditions — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdSend} title="Expéditions" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Pour ceux qui vendent en gros à des commerçants éloignés : le client de Fada
            appelle, vous facturez, vous sortez la marchandise, vous portez le colis à la
            gare routière et vous payez le car. Cette page suit le colis — transporteur,
            bordereau, arrivée, retrait — et surtout ce que le transport vous doit.
          </p>
          {/* Le vrai sujet, dit sans détour. */}
          <p className="mt-2 rounded-[10px] bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-900 dark:text-sky-200">
            Les <strong>frais d&apos;expédition que vous avancez</strong> ne sont dans
            aucune facture, ne sont pas une dépense de la maison, et sont trop petits pour
            qu&apos;on y pense. Vingt colis par semaine, et c&apos;est le bénéfice
            d&apos;une journée qui est resté à la gare routière. Ils sont ici suivis à
            part, avec un message de réclamation courtois prêt à partir sur WhatsApp.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                shipmentsMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">Expéditions</span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {shipmentsEnabled
                    ? "La page Expéditions est ouverte. Vous seul y avez accès tant que vous n'accordez pas le droit à un employé."
                    : "Désactivé : aucun suivi de colis ni de frais de transport."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={shipmentsEnabled}
                disabled={shipmentsMut.isPending}
                onChange={(e) => {
                  void shipmentsMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-600">
            Une expédition <strong>ne touche jamais au stock</strong> : la marchandise est
            déjà sortie par la facture à laquelle le colis se rattache. Rien n&apos;est
            déduit deux fois.
          </p>
          {shipmentsEnabled ? (
            <Link
              href={ROUTES.shipments}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir la page Expéditions
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Fuseau horaire de l'entreprise — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdSchedule} title="Fuseau horaire" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            L&apos;heure de votre pays, utilisée partout : heure imprimée sur les tickets et
            les factures, historique des ventes, et surtout le découpage des journées dans
            vos rapports. Elle ne dépend pas du réglage de chaque ordinateur.
          </p>

          {timeZoneQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 rounded-[10px] border border-black/[0.08] px-3 py-3 sm:px-4">
              <label className="block text-sm font-medium text-fs-text" htmlFor="company-timezone">
                Pays / fuseau de votre commerce
              </label>
              <select
                id="company-timezone"
                className="mt-2 w-full rounded-[10px] border border-black/[0.12] bg-white px-3 py-2 text-sm text-fs-text disabled:opacity-60"
                value={timeZoneQ.data ?? "Africa/Ouagadougou"}
                disabled={timeZoneMut.isPending}
                onChange={(e) => {
                  void timeZoneMut.mutateAsync(e.target.value);
                }}
              >
                {SUPPORTED_TIME_ZONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.offsetLabel}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm font-medium text-fs-text">
                Il est actuellement <span className="tabular-nums">{tzPreview}</span> chez vous.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                Si cette heure ne correspond pas à celle de votre montre, choisissez le bon
                pays ci-dessus. Vos ventes déjà enregistrées ne sont pas modifiées : elles
                s&apos;afficheront simplement à la bonne heure.
              </p>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Devise de l'entreprise — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdPayments} title="Devise" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            La monnaie utilisée dans toute l&apos;application : caisse, factures, reçus,
            rapports. Choisissez celle de votre pays.
          </p>

          {currencyQ.isPending || currencyLockedQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : currencyLockedQ.data ? (
            <div className="mt-4 rounded-[10px] border border-black/[0.08] px-3 py-3 sm:px-4">
              <p className="text-sm font-medium text-fs-text">
                Devise actuelle : {currencyOf(currencyQ.data).label} (
                {currencyOf(currencyQ.data).symbol})
              </p>
              {/*
                Le verrou n'est pas une contrainte technique mais une protection comptable :
                changer la devise ne convertit aucun montant. Une boutique avec 500 000 FCFA
                d'historique qui basculerait afficherait « 500 000 » dans la nouvelle monnaie,
                sans le moindre avertissement dans ses livres.
              */}
              <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                Vous avez déjà enregistré des ventes : la devise ne peut plus être modifiée.
                Les montants déjà saisis ne seraient pas convertis, et votre historique
                deviendrait faux. Contactez le support si un changement est réellement
                nécessaire.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-[10px] border border-black/[0.08] px-3 py-3 sm:px-4">
              <label
                className="block text-sm font-medium text-fs-text"
                htmlFor="company-currency"
              >
                Monnaie de votre pays
              </label>
              <select
                id="company-currency"
                className="mt-2 w-full rounded-[10px] border border-black/[0.12] bg-white px-3 py-2 text-sm text-fs-text disabled:opacity-60"
                value={currencyQ.data ?? "XOF"}
                disabled={currencyMut.isPending}
                onChange={(e) => {
                  void currencyMut.mutateAsync(e.target.value);
                }}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} — {c.symbol} ({c.code})
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                {currencyOf(currencyQ.data).countries}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-amber-700">
                Choisissez avec soin : dès votre première vente, la devise sera figée pour
                préserver la cohérence de votre comptabilité.
              </p>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Saisie du prix en caisse rapide — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdPriceChange} title="Caisse POS rapide — saisie du prix" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Permet au caissier de modifier le prix unitaire d&apos;un article directement dans le
            panier de la caisse rapide (négociation au comptoir, prix de gros, article au poids).
            Le prix du catalogue reste proposé par défaut. Désactivé, le prix est figé et seules
            vos promotions s&apos;appliquent.
          </p>
          {quickPosPriceEditQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  quickPosPriceEditMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Autoriser la saisie du prix en caisse rapide
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {quickPosPriceEditQ.data
                      ? "Le champ « Prix unitaire » est modifiable dans le panier."
                      : "Désactivé : le prix du catalogue s'applique, sans modification possible."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(quickPosPriceEditQ.data)}
                  disabled={quickPosPriceEditMut.isPending}
                  onChange={(e) => {
                    void quickPosPriceEditMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Chiffres de la page Ventes visibles par les employés — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle
            icon={MdLeaderboard}
            title="Ventes — classement des vendeurs"
          />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Le tableau « Qui a vendu combien » de la page Ventes affiche le total facturé
            de chaque vendeur. Vous le voyez toujours, sur la période de votre choix. Vos
            employés, eux, ne le voient pas tant que vous ne l&apos;ouvrez pas ici — et
            même ouvert, ils n&apos;y lisent que la journée en cours, jamais tout
            l&apos;historique.
          </p>
          {sellerBoardStaffQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  sellerBoardStaffMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Montrer mes chiffres de vente à mes employés
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {sellerBoardStaffQ.data
                      ? "Classement, total facturé et panier moyen visibles, limités à aujourd'hui."
                      : "Masqués : seul le propriétaire voit le total facturé, le panier moyen et qui a vendu combien."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(sellerBoardStaffQ.data)}
                  disabled={sellerBoardStaffMut.isPending}
                  onChange={(e) => {
                    void sellerBoardStaffMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Encaissement en caisse rapide — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle
            icon={MdAccountBalanceWallet}
            title="Caisse POS rapide — encaissement"
          />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Adapte la caisse rapide à votre comptoir : n&apos;afficher que le ou les
            opérateurs mobile money que vous encaissez réellement, accepter un règlement
            partagé (espèces + mobile money sur la même vente), et masquer le client quand
            vous ne l&apos;enregistrez pas. Désactivé, la caisse reste telle quelle.
          </p>
          {quickPaymentsQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 divide-y divide-black/[0.06] rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  quickPaymentsMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Personnaliser l&apos;encaissement de la caisse rapide
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {quickPayments.enabled
                      ? "Vos réglages ci-dessous s'appliquent à toutes vos caisses rapides."
                      : "Désactivé : trois opérateurs proposés, pas de paiement mixte, client affiché."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={quickPayments.enabled}
                  disabled={quickPaymentsMut.isPending}
                  onChange={(e) => {
                    void quickPaymentsMut.mutateAsync({
                      ...quickPayments,
                      enabled: e.target.checked,
                    });
                  }}
                />
              </label>

              {quickPayments.enabled ? (
                <>
                  <div
                    className={cn(
                      "px-3 py-3 sm:px-4",
                      quickPaymentsMut.isPending && "pointer-events-none opacity-60",
                    )}
                  >
                    <span className="block text-sm font-medium text-fs-text">
                      Opérateurs mobile money proposés
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-600">
                      Décochez ceux que vous n&apos;encaissez pas. Un seul opérateur coché,
                      et il est choisi automatiquement à la vente : plus rien à cliquer.
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {MOBILE_MONEY_PROVIDERS.map((p) => {
                        const on = quickPayments.providers.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            role="switch"
                            aria-checked={on}
                            disabled={quickPaymentsMut.isPending}
                            onClick={() => toggleQuickProvider(p.id, !on)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold",
                              on
                                ? "border-fs-accent bg-fs-accent/10 text-fs-text"
                                : "border-black/[0.12] bg-white text-neutral-500",
                            )}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                      quickPaymentsMut.isPending && "pointer-events-none opacity-60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fs-text">
                        Autoriser le paiement mixte (espèces + mobile money)
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-600">
                        {quickPayments.splitEnabled
                          ? "Le bouton « MIXTE » permet de répartir le total entre les deux."
                          : "Désactivé : une vente est réglée par un seul moyen de paiement."}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                      checked={quickPayments.splitEnabled}
                      disabled={quickPaymentsMut.isPending}
                      onChange={(e) => {
                        void quickPaymentsMut.mutateAsync({
                          ...quickPayments,
                          splitEnabled: e.target.checked,
                        });
                      }}
                    />
                  </label>

                  <label
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                      quickPaymentsMut.isPending && "pointer-events-none opacity-60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fs-text">
                        Retirer le bouton « CARTE »
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-600">
                        {quickPayments.hideCard
                          ? "La carte bancaire n'est plus proposée à la caisse rapide."
                          : "Désactivé : le bouton CARTE reste proposé. Retirez-le si vous n'avez pas de TPE."}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                      checked={quickPayments.hideCard}
                      disabled={quickPaymentsMut.isPending}
                      onChange={(e) => {
                        void quickPaymentsMut.mutateAsync({
                          ...quickPayments,
                          hideCard: e.target.checked,
                        });
                      }}
                    />
                  </label>

                  <label
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                      quickPaymentsMut.isPending && "pointer-events-none opacity-60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fs-text">
                        Masquer le client en caisse rapide
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-600">
                        {quickPayments.hideCustomer
                          ? "Le sélecteur de client disparaît des ventes comptant. La vente à crédit continue de l'exiger."
                          : "Désactivé : le client reste proposé (facultatif) sur chaque vente."}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                      checked={quickPayments.hideCustomer}
                      disabled={quickPaymentsMut.isPending}
                      onChange={(e) => {
                        void quickPaymentsMut.mutateAsync({
                          ...quickPayments,
                          hideCustomer: e.target.checked,
                        });
                      }}
                    />
                  </label>
                </>
              ) : null}
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Caisse Facture A4 */}
      <FsCard className="mt-5" padding="p-5">
        <SettingsCardTitle icon={MdShoppingCart} title="Caisse Facture A4" />
        <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
          Un seul mode à la fois pour la facture A4. Le panier se met à jour automatiquement à la saisie.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600 sm:text-sm">
          Toujours un mode actif : si vous désactivez le mode courant, l&apos;autre est activé automatiquement.
        </p>
        <div className="mt-4 space-y-0 divide-y divide-black/[0.06] rounded-[10px] border border-black/[0.08]">
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Champ de saisie pour la quantité</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Saisir le nombre : le total se met à jour automatiquement</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={posInvoiceUi.showQuantityInput}
              onChange={(e) => {
                const n = applySetShowQuantityInput("a4", e.target.checked);
                setPosInvoiceUi(n);
                void qc.invalidateQueries({ queryKey: queryKeys.posCartSettings });
              }}
            />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Boutons (-) et (+)</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Incrémenter ou décrémenter la quantité</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={posInvoiceUi.showQuantityButtons}
              onChange={(e) => {
                const n = applySetShowQuantityButtons("a4", e.target.checked);
                setPosInvoiceUi(n);
                void qc.invalidateQueries({ queryKey: queryKeys.posCartSettings });
              }}
            />
          </label>
        </div>
      </FsCard>

      {/* Facture A4 vue tableau — owner uniquement (`settings_page.dart` Flutter) */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdTableChart} title="Facture A4 — vue tableau" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Deuxième écran de caisse facture : les lignes du panier s&apos;affichent comme sur une facture (tableau).
            Le PDF A4 généré est identique au mode facture classique. Une fois activé ici, accordez le droit « POS
            facture A4 (vue tableau) » aux employés concernés dans Employés.
          </p>
          {invoiceTablePosQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  invoiceTablePosMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Activer l&apos;entrée « Facture tab. » sur les boutiques
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {invoiceTablePosQ.data
                      ? "Les utilisateurs autorisés voient le raccourci sur chaque carte boutique."
                      : "Désactivé : personne n&apos;accède au mode tableau (même avec le droit utilisateur)."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(invoiceTablePosQ.data)}
                  disabled={invoiceTablePosMut.isPending}
                  onChange={(e) => {
                    void invoiceTablePosMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Panier IA — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle
            icon={MdAutoAwesome}
            title="Panier IA — photo, PDF ou dictée de la commande"
          />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Le client arrive avec sa commande — un papier, un message WhatsApp, ou le{" "}
            <b>PDF</b> d&apos;un devis, d&apos;un bon de commande ou d&apos;une proforma.
            Aujourd&apos;hui le caissier la recopie ligne par ligne. Avec cette fonction, il
            dépose le document dans la caisse <b>Facture (tableau)</b> : l&apos;assistant lit les
            articles, les quantités, les unités et les <b>prix écrits</b>, les rapproche de{" "}
            <b>votre catalogue</b>, et le tableau se remplit en un clic. Il peut corriger par
            écrit (« le sucre, c&apos;est le paquet de 1 kg », « enlève la ligne 3 ») sans
            renvoyer le document.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Rien à lire ? Le caissier peut aussi <b>dicter la commande au micro</b> — ou
            déposer la note vocale que le client a envoyée sur WhatsApp. La dictée est
            d&apos;abord transcrite en texte, <b>affiché à l&apos;écran</b> pour qu&apos;un mot
            mal entendu se voie, puis traitée exactement comme une liste écrite.
          </p>
          {/*
            Les trois points qu'un patron doit lire AVANT d'ouvrir : ce qui sort de sa
            boutique, d'où viennent les prix, et ce que la machine n'a pas le droit de
            décider seule.
          */}
          <p className="mt-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            À savoir : le document est <b>envoyé à un service d&apos;analyse externe</b> pour
            être lu — ne l&apos;utilisez pas sur une pièce que vous ne voulez pas voir sortir de
            la boutique. Les <b>prix repris sont ceux écrits sur le document</b> (un devis se
            refacture au prix promis) : ils remplacent le prix du catalogue sur la ligne,
            exactement comme si le vendeur les avait tapés dans la colonne « P.U. » — et le
            caissier les voit et peut les corriger avant de valider. Pour le reste rien ne
            change : le stock est respecté, aucune vente n&apos;est créée, et le caissier{" "}
            <b>confirme chaque ligne</b> à l&apos;écran avant qu&apos;elle n&apos;entre au tableau.
          </p>
          {aiCartVisionQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  aiCartVisionMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Activer le panier IA en caisse Facture (tableau)
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {aiCartVisionQ.data
                      ? "Le bouton « Panier IA » apparaît dans la caisse Facture (tableau), pour les utilisateurs qui y ont droit."
                      : "Désactivé : le bouton n'apparaît nulle part et l'analyse est refusée côté serveur."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(aiCartVisionQ.data)}
                  disabled={aiCartVisionMut.isPending}
                  onChange={(e) => {
                    void aiCartVisionMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Devis & Factures — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdRequestQuote} title="Devis & Factures" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Aujourd&apos;hui l&apos;application écrit ce qui s&apos;est passé : une vente,
            un ticket, une facture après coup. Ce module écrit ce qui n&apos;est{" "}
            <b>pas encore arrivé</b> : le <b>devis</b> que réclament une ONG, une mairie ou
            une société avant d&apos;engager leur dépense, puis la <b>facture</b> en bonne
            et due forme — avec l&apos;objet, leur numéro de commande, la TVA si vous la
            facturez, l&apos;échéance de règlement et le total en toutes lettres.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Le client accepte ? Le devis devient une facture d&apos;un bouton, avec les
            mêmes lignes et les <b>mêmes prix que ceux que vous avez promis</b>. Vous
            pouvez y mettre des articles de votre stock comme des prestations libres
            (« Installation sur site », « Formation ») qui n&apos;ont pas de fiche produit.
          </p>
          {/*
            Les deux points qui décident de la confiance dans le module : le devis ne
            fausse rien, et la facture ne crée pas de comptabilité parallèle. Un patron
            doit les lire AVANT d'activer, pas les découvrir en fin de mois.
          */}
          <p className="mt-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            À savoir : un <b>devis ne compte nulle part</b> — ni chiffre d&apos;affaires,
            ni stock réservé, ni créance ; s&apos;il n&apos;aboutit pas, il n&apos;y a rien
            à défaire. Une facture, elle, ne compte qu&apos;au moment où vous{" "}
            <b>l&apos;émettez</b> : là seulement elle devient une vente normale, la
            marchandise sort du stock et le solde impayé part en crédit client. Tant
            qu&apos;elle est en brouillon, elle s&apos;imprime en « proforma ».
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                saleDocumentsMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Activer les devis et les factures
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {saleDocumentsEnabled
                    ? "Le menu « Devis & Factures » est disponible. Accordez le droit aux employés dans Employés."
                    : "Désactivé : rien ne change dans l'application, vos ventes et vos tickets restent identiques."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={saleDocumentsEnabled}
                disabled={saleDocumentsMut.isPending}
                onChange={(e) => {
                  void saleDocumentsMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          {saleDocumentsEnabled ? (
            <Link
              href={ROUTES.saleDocuments}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir les devis et factures
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Prix de revient (frais d'approche répartis) — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdLocalShipping} title="Prix de revient" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Quand vous commandez chez un fournisseur, le transport, la douane et la manutention
            s&apos;ajoutent à la facture. Ce module répartit ces frais sur chaque article pour
            vous donner le prix de revient réel, puis calcule le prix de vente qui vous laisse
            la marge voulue. Les frais changeant d&apos;un arrivage à l&apos;autre, il tient
            compte de l&apos;ancien stock pour ne pas fausser vos marges.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                landedCostMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Activer le prix de revient
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {landedCostEnabled
                    ? "Le menu « Prix de revient » est disponible. Accordez le droit aux employés dans Employés."
                    : "Désactivé : rien ne change dans l'application, aucun prix n'est touché."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={landedCostEnabled}
                disabled={landedCostMut.isPending}
                onChange={(e) => {
                  void landedCostMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          {landedCostEnabled ? (
            <Link
              href={ROUTES.landedCost}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir le prix de revient
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Emplacements physiques des produits — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdPlace} title="Emplacements des produits" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Savoir où se trouve physiquement chaque article dans la boutique (rayon, allée,
            étagère, bac…). Chaque boutique construit d&apos;abord SON modèle de rangement —
            à partir d&apos;un gabarit ou de zéro — puis range ses produits. Un nouveau vendeur
            trouve alors un article sans déranger personne.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                productLocationsMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Activer les emplacements
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {productLocationsEnabled
                    ? "Le menu « Emplacements » est disponible. Accordez le droit aux employés dans Employés."
                    : "Désactivé : rien ne change dans l'application."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={productLocationsEnabled}
                disabled={productLocationsMut.isPending}
                onChange={(e) => {
                  void productLocationsMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          {/* Option liée : rappel de l'emplacement à la caisse (comme les conditionnements) */}
          {productLocationsEnabled ? (
            <div className="mt-2.5 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  productLocationsPosMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Afficher l&apos;emplacement à la caisse
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {productLocationsPosQ.data
                      ? "Le caissier voit l'emplacement sur chaque produit et sur chaque ligne du panier : le panier devient une liste de préparation."
                      : "Désactivé : la caisse reste inchangée. Activez pour guider le vendeur vers le rayon."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(productLocationsPosQ.data)}
                  disabled={productLocationsPosMut.isPending}
                  onChange={(e) => {
                    void productLocationsPosMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          ) : null}
          {productLocationsEnabled ? (
            <Link
              href={ROUTES.productLocations}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir les emplacements
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Page Conditionnements — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdAllInbox} title="Page Conditionnements" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Aujourd&apos;hui, pour dire qu&apos;un carton contient 12 pièces et coûte
            35 000, il faut ouvrir la fiche du produit — une par une. Activée, une page{" "}
            <b>Conditionnements</b> apparaît dans le menu : tout le catalogue y est
            listé comme sur la page Stock, avec un filtre <b>« À remplir »</b> pour ne
            voir que les articles sans carton ni paquet, et le lot se saisit directement
            dans la ligne du produit.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Utile si vous achetez en gros et revendez au détail. Si vous ne vendez
            qu&apos;à la pièce, laissez-la fermée : rien ne change pour vous.
          </p>
          <p className="mt-2 rounded-[10px] bg-fs-accent/10 px-3 py-2 text-xs leading-relaxed text-fs-text">
            La page ne crée aucune donnée nouvelle : elle remplit les mêmes
            conditionnements que la fiche produit. La refermer ne supprime donc rien —
            vos cartons restent enregistrés et la caisse continue de les proposer.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                packagingsPageMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Afficher la page Conditionnements
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {packagingsPageEnabled
                    ? "Le menu « Conditionnements » est disponible pour ceux qui voient le catalogue."
                    : "Désactivée : les conditionnements se saisissent uniquement dans la fiche produit."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={packagingsPageEnabled}
                disabled={packagingsPageMut.isPending}
                onChange={(e) => {
                  void packagingsPageMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          {packagingsPageEnabled ? (
            <Link
              href={ROUTES.packagings}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir les conditionnements
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Prix du conditionnement : lot entier ou à la pièce — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdAllInbox} title="Prix du conditionnement à la pièce" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Quand vous ajoutez un <b>conditionnement</b> à un produit (carton, paquet,
            sachet…), l&apos;application demande aujourd&apos;hui le prix du{" "}
            <b>lot entier</b> : un carton de 10 pièces à 3 500 la pièce se saisit 35 000.
            Or au marché, le prix s&apos;annonce à la pièce — « le carton, c&apos;est 3 500 la
            pièce » — et c&apos;est ce chiffre-là qui finit dans le champ, ce qui fait vendre
            le carton entier à 3 500.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Activé, le champ demande le <b>prix d&apos;une pièce du lot</b> et
            l&apos;application multiplie elle-même par le nombre de pièces. Vous tapez 3 500,
            elle enregistre 35 000 et l&apos;affiche sous le champ avant que vous validiez.
          </p>
          <p className="mt-2 rounded-[10px] bg-fs-accent/10 px-3 py-2 text-xs leading-relaxed text-fs-text">
            Ce réglage ne change que la <b>saisie</b>. Le prix encaissé à la caisse, les
            tickets, les factures et vos conditionnements déjà enregistrés restent
            identiques — vous pouvez donc l&apos;activer et le désactiver sans rien casser.
          </p>
          {packagingPriceModeQ.isPending ? (
            <div className="mt-4 flex justify-center py-4" role="status" aria-label="Chargement">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
              <label
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                  packagingPriceModeMut.isPending && "pointer-events-none opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fs-text">
                    Saisir le prix d&apos;une pièce du lot, pas celui du lot entier
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {packagingPriceModeQ.data
                      ? "Le champ demande le prix d'une pièce ; le prix du lot est calculé automatiquement."
                      : "Désactivé : le champ demande le prix du lot entier (nb de pièces × prix pièce)."}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                  checked={Boolean(packagingPriceModeQ.data)}
                  disabled={packagingPriceModeMut.isPending}
                  onChange={(e) => {
                    void packagingPriceModeMut.mutateAsync(e.target.checked);
                  }}
                />
              </label>
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Autres noms d'un produit (alias de recherche) — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdSell} title="Autres noms des produits" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Un même article n&apos;a pas le même nom pour tout le monde : « Omo » ou
            « savon en poudre », « cube » ou « Maggi ». Vous pouvez donner jusqu&apos;à
            20 autres noms à chaque produit : on le retrouve alors en cherchant
            n&apos;importe lequel, au catalogue comme à la caisse. Le nom principal
            reste le seul affiché sur les tickets, les factures et les rapports.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                productAliasesMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Activer les autres noms
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {productAliasesEnabled
                    ? "La fiche produit propose « Autres noms », et la recherche les accepte."
                    : "Désactivé : rien ne change dans l'application."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={productAliasesEnabled}
                disabled={productAliasesMut.isPending}
                onChange={(e) => {
                  void productAliasesMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
        </FsCard>
      ) : null}

      {/* Personnaliser mes dépenses — owner uniquement */}
      {isOwner && companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdReceiptLong} title="Personnaliser mes dépenses" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Nos onze catégories d&apos;usine (Loyer, Marketing, Télécom…) ne sont pas les
            vôtres : vous, vous payez le carburant des livreurs, le gardien de nuit, la
            douane. Activez ce mode et la page Dépenses ne proposera plus QUE les postes
            que vous aurez créés — et la saisie se réduit à cinq champs : montant,
            catégorie, date, règlement (espèces ou mobile money) et une note facultative.
          </p>
          <div className="mt-4 space-y-0 rounded-[10px] border border-black/[0.08]">
            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4",
                customExpensesMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Activer mes propres catégories
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {customExpensesEnabled
                    ? "La page Dépenses affiche vos postes et le formulaire court. Chaque dépense garde le nom de qui l'a saisie."
                    : "Désactivé : la page Dépenses garde les catégories standard et le formulaire complet."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={customExpensesEnabled}
                disabled={customExpensesMut.isPending}
                onChange={(e) => {
                  void customExpensesMut.mutateAsync(e.target.checked);
                }}
              />
            </label>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-600">
            Vos dépenses déjà enregistrées ne bougent pas : elles restent dans la liste
            avec leur ancienne catégorie. Pour qu&apos;un caissier puisse enregistrer une
            dépense, accordez-lui « Gérer les dépenses » dans Employés — il ne pourra
            corriger que ses propres lignes.
          </p>
          {customExpensesEnabled ? (
            <Link
              href={ROUTES.expenses}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Ouvrir les dépenses
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </FsCard>
      ) : null}

      {/* Profil */}
      <FsCard className="mt-5" padding="p-5">
        <SettingsCardTitle icon={MdPerson} title="Profil" />
        {profileErr ? (
          <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm text-red-700">
            <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0">{profileErr}</span>
          </div>
        ) : null}
        <div className={cn(profileErr ? "mt-3" : "mt-5")}>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Nom affiché</label>
          <input
            className={fsInputClass()}
            value={profileName}
            onChange={(e) => {
              setProfileName(e.target.value);
              setProfileErr(null);
            }}
            placeholder="Votre nom"
            autoComplete="name"
          />
        </div>
        <button
          type="button"
          onClick={async () => {
            setProfileErr(null);
            try {
              await profileMut.mutateAsync();
            } catch (e) {
              setProfileErr(messageFromUnknownError(e));
            }
          }}
          className="mt-4 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
          disabled={profileMut.isPending}
        >
          {profileMut.isPending ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
          ) : (
            <MdSave className="h-4 w-4" aria-hidden />
          )}
          Enregistrer
        </button>
      </FsCard>

      {/* Compte */}
      <FsCard className="mt-5" padding="p-5">
        <SettingsCardTitle icon={MdMail} title="Compte" />
        <p className="mt-5 text-xs font-medium text-neutral-600">Email</p>
        <div className="mt-1 rounded-[10px] border border-black/[0.08] bg-neutral-100/50 px-3.5 py-3 text-sm text-fs-text dark:bg-neutral-800/40">
          {meQ.data?.email || "—"}
        </div>
        <p className="mt-6 text-sm font-semibold text-neutral-700">Changer le mot de passe</p>
        {pwdErr ? (
          <div className="mt-3 flex gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm text-red-700">
            <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>{pwdErr}</span>
          </div>
        ) : null}
        <div className={cn("mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2", pwdErr && "mt-3")}>
          <div>
            <label className="mb-1 block text-xs text-neutral-600">Nouveau mot de passe</label>
            <input
              type="password"
              className={fsInputClass()}
              value={pwd}
              onChange={(e) => {
                setPwd(e.target.value);
                setPwdErr(null);
              }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-600">Confirmer le mot de passe</label>
            <input
              type="password"
              className={fsInputClass()}
              value={pwd2}
              onChange={(e) => {
                setPwd2(e.target.value);
                setPwdErr(null);
              }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            setPwdErr(null);
            if (pwd.length < 6) {
              setPwdErr("Le mot de passe doit contenir au moins 6 caractères");
              return;
            }
            if (pwd !== pwd2) {
              setPwdErr("Les mots de passe ne correspondent pas");
              return;
            }
            try {
              await pwdMut.mutateAsync();
              setPwd("");
              setPwd2("");
            } catch (e) {
              setPwdErr(messageFromUnknownError(e));
            }
          }}
          className="mt-4 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[10px] border border-black/[0.1] bg-fs-card px-4 text-sm font-semibold text-neutral-800 shadow-sm disabled:opacity-60"
          disabled={pwdMut.isPending}
        >
          {pwdMut.isPending ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" aria-hidden />
          ) : (
            <MdSecurity className="h-4 w-4" aria-hidden />
          )}
          Mettre à jour le mot de passe
        </button>
      </FsCard>

      {isOwner ? <PushNotificationsSettingsCard /> : null}

      {/* Entreprise — même carte que Flutter (`_buildCompanyCard`) : fond gris listes, labels gris, lien orange */}
      {companyId ? (
        <FsCard
          className="mt-5 rounded-[12px] border border-neutral-200/90 bg-fs-card shadow-none dark:border-white/10"
          padding="p-5"
        >
          <SettingsCardTitle icon={MdBusiness} title="Entreprise" />
          {isOwner ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-hidden
                onChange={handleCompanyLogoFileChange}
              />
              <button
                type="button"
                disabled={uploadingCompanyLogo}
                onClick={() => logoFileInputRef.current?.click()}
                className={cn(
                  "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-300/60 bg-neutral-100 transition hover:bg-neutral-200/80 disabled:opacity-60 dark:border-white/20 dark:bg-neutral-800",
                )}
                aria-label="Choisir le logo entreprise"
              >
                {uploadingCompanyLogo ? (
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                ) : companyLogoUrl && !companyLogoImgError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={companyLogoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setCompanyLogoImgError(true)}
                  />
                ) : (
                  <MdAddPhotoAlternate className="h-9 w-9 text-neutral-400" aria-hidden />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fs-text">Logo entreprise</p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Affiché en haut du menu. Cliquez pour choisir une image (PNG, JPG…).
                </p>
                {companyLogoUrl ? (
                  <button
                    type="button"
                    disabled={uploadingCompanyLogo}
                    onClick={() => void handleRemoveCompanyLogo()}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
                  >
                    Retirer le logo
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {multiCompany ? (
            <div className={cn(isOwner ? "mt-4" : "mt-5")}>
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Entreprise
              </label>
              <SettingsGreySelect
                value={companyId}
                onChange={(e) => {
                  try {
                    localStorage.setItem("fs_active_company_id", e.target.value);
                    localStorage.removeItem("fs_active_store_id");
                  } catch {
                    /* */
                  }
                  void qc.invalidateQueries({ queryKey: queryKeys.appContext });
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SettingsGreySelect>
            </div>
          ) : (
            <div className={cn(isOwner ? "mt-4" : "mt-5")}>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Entreprise</p>
              <p className="mt-1 text-base font-semibold leading-snug text-fs-text">
                {companyName || "—"}
              </p>
            </div>
          )}
          {stores.length > 0 ? (
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Boutique
              </label>
              <SettingsGreySelect
                value={ctxStoreId === null ? "__all__" : ctxStoreId}
                onChange={(e) => {
                  const v = e.target.value;
                  applyActiveStoreChange(qc, v === "__all__" ? null : v);
                }}
              >
                <option value="__all__">— Toutes —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SettingsGreySelect>
            </div>
          ) : (
            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
              Aucune boutique configurée
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Pour modifier le détail d&apos;une boutique (adresse, facturation…), ouvrez{" "}
            <Link
              href={ROUTES.stores}
              className="font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Boutiques
            </Link>
            .
          </p>
        </FsCard>
      ) : null}

      {/* Abonnement */}
      {companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdCardMembership} title="Abonnement" />
          {subscriptionQ.isLoading ? (
            <div className="mt-4 flex justify-center py-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
            </div>
          ) : (
            <div className="mt-4 space-y-1 text-sm">
              <p>
                <span className="text-neutral-600">Plan :</span>{" "}
                <span className="font-medium text-fs-text">{subscriptionQ.data?.planName ?? "Gratuit"}</span>
              </p>
              <p className="text-xs text-neutral-600">
                Statut : {formatSubscriptionStatus(subscriptionQ.data?.status ?? "active")}
              </p>
              {subscriptionQ.data?.currentPeriodEnd ? (
                <p className="text-xs text-neutral-600">
                  Renouvellement : {formatSubscriptionDate(subscriptionQ.data.currentPeriodEnd)}
                </p>
              ) : null}
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Intégrations — ListTile Flutter */}
      {isOwner && companyId ? (
        <FsCard className="mt-5 p-0">
          <Link
            href={ROUTES.integrations}
            className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-black/[0.02]"
          >
            <MdKey className="h-[22px] w-[22px] shrink-0 text-fs-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-fs-text">Intégrations API & Webhooks</p>
              <p className="mt-0.5 text-xs text-neutral-600">Clés API et URLs de webhook pour vos intégrations</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
          </Link>
        </FsCard>
      ) : null}

      {/* 2FA */}
      {isOwner ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdSecurity} title="Authentification à deux facteurs (2FA)" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Renforcez la sécurité de votre compte avec un code à usage unique (application type Google Authenticator).
          </p>
          <button
            type="button"
            onClick={() => setTwoFaOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white"
          >
            <MdSecurity className="h-5 w-5" aria-hidden />
            Activer la 2FA
          </button>
        </FsCard>
      ) : null}

      {/* Zone danger — owner + entreprise */}
      {isOwner && companyId ? (
        <FsCard className="mt-5 border border-red-400/55" padding="p-5">
          <div className="flex items-center gap-2.5 text-red-700">
            <MdWarningAmber className="h-6 w-6 shrink-0" aria-hidden />
            <span className="text-base font-bold">Vider historiques entreprise</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Zone danger : action irréversible. Vous pouvez supprimer les historiques pour toute l&apos;entreprise ou seulement une
            boutique.
          </p>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Périmètre de suppression</label>
            <select
              className={fsInputClass()}
              value={dangerScopeStoreId ?? ""}
              onChange={(e) => setDangerScopeStoreId(e.target.value || null)}
            >
              <option value="">Toute l&apos;entreprise</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  Boutique: {s.name}
                </option>
              ))}
            </select>
          </div>
          {dangerErr ? (
            <p className="mt-3 text-sm font-medium text-red-600" role="alert">
              {dangerErr}
            </p>
          ) : null}

          {/* Magasin (dépôt) */}
          <div className="mt-4 rounded-[10px] border border-red-300/40 bg-red-50/30 p-3 dark:bg-red-950/20">
            <div className="flex items-center gap-2 text-red-800">
              <MdStore className="h-4 w-4" aria-hidden />
              <span className="text-sm font-bold">Magasin (dépôt)</span>
            </div>
            <p className="mt-1.5 text-xs text-neutral-600">
              Suppression dédiée au dépôt central de l&apos;entreprise (stock + mouvements du magasin).
            </p>
            {dangerScopeStoreId != null ? (
              <p className="mt-2 text-xs italic text-neutral-600">
                Astuce : repassez le périmètre sur « Toute l&apos;entreprise » pour activer ces actions dépôt.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loadingAnyDanger || dangerScopeStoreId != null}
                onClick={() =>
                  openDanger({
                    title: "Vider le stock du magasin ?",
                    body: "Le stock du dépôt central sera remis à zéro. Les stocks boutiques ne sont pas concernés.",
                    actionLabel: "Vider stock magasin",
                    run: async () => {
                      setClearingWarehouseStock(true);
                      setDangerErr(null);
                      try {
                        const deleted = await rpcDanger("owner_clear_stock", {
                          p_company_id: companyId,
                          p_store_id: null,
                        });
                        toast.success(`Stock magasin vidé (${deleted} ligne(s) supprimée(s)).`);
                      } finally {
                        setClearingWarehouseStock(false);
                      }
                    },
                  })
                }
                className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-neutral-900"
              >
                {clearingWarehouseStock ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                ) : (
                  <MdStore className="h-4 w-4" aria-hidden />
                )}
                Vider stock magasin
              </button>
              <button
                type="button"
                disabled={loadingAnyDanger || dangerScopeStoreId != null}
                onClick={() =>
                  openDanger({
                    title: "Vider l'historique magasin ?",
                    body: "Tous les mouvements du dépôt central seront supprimés définitivement. Les mouvements boutiques ne sont pas concernés.",
                    actionLabel: "Vider mouvements magasin",
                    run: async () => {
                      setClearingWarehouseMovements(true);
                      setDangerErr(null);
                      try {
                        const deleted = await rpcDanger("owner_clear_stock_movements_history", {
                          p_company_id: companyId,
                          p_store_id: null,
                        });
                        toast.success(`Historique magasin vidé (${deleted} mouvement(s) supprimé(s)).`);
                      } finally {
                        setClearingWarehouseMovements(false);
                      }
                    },
                  })
                }
                className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-neutral-900"
              >
                {clearingWarehouseMovements ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                ) : (
                  <MdHistory className="h-4 w-4" aria-hidden />
                )}
                Vider mouvements magasin
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider le catalogue produits ?",
                  body: "Tous les produits de l'entreprise seront supprimés définitivement. Action globale entreprise.",
                  actionLabel: "Vider produits",
                  run: async () => {
                    if (dangerScopeStoreId != null) {
                      throw new Error(
                        'Les produits sont partagés au niveau entreprise. Sélectionnez "Toute l\'entreprise".',
                      );
                    }
                    setClearingProducts(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_products_catalog", { p_company_id: companyId });
                      toast.success(`Catalogue vidé (${deleted} produit(s) supprimé(s)).`);
                    } finally {
                      setClearingProducts(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingProducts ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider produits
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider l'historique des ventes ?",
                  body: "Toutes les ventes (et leurs lignes/paiements/retours) de cette entreprise seront supprimées définitivement.",
                  actionLabel: "Vider ventes",
                  run: async () => {
                    setClearingSales(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_sales_history", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Historique ventes vidé (${deleted} vente(s) supprimée(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingSales(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingSales ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider ventes
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider l'historique des achats ?",
                  body: "Tous les achats (et leurs lignes) de cette entreprise seront supprimés définitivement.",
                  actionLabel: "Vider achats",
                  run: async () => {
                    setClearingPurchases(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_purchases_history", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Historique achats vidé (${deleted} achat(s) supprimé(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingPurchases(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingPurchases ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider achats
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider l'historique des transferts ?",
                  body: "Tous les transferts (et leurs lignes) de cette entreprise seront supprimés définitivement.",
                  actionLabel: "Vider transferts",
                  run: async () => {
                    setClearingTransfers(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_transfers_history", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Historique transferts vidé (${deleted} transfert(s) supprimé(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingTransfers(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingTransfers ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider transferts
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider le stock ?",
                  body: "Le stock sera remis à zéro pour le périmètre sélectionné.",
                  actionLabel: "Vider stock",
                  run: async () => {
                    setClearingStock(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_stock", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Stock vidé (${deleted} ligne(s) supprimée(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingStock(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingStock ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider stock
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider l'historique des mouvements ?",
                  body: "Tous les mouvements de stock du périmètre sélectionné seront supprimés définitivement.",
                  actionLabel: "Vider mouvements",
                  run: async () => {
                    setClearingMovements(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_stock_movements_history", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Historique mouvements vidé (${deleted} mouvement(s) supprimé(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingMovements(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingMovements ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdHistory className="h-4 w-4" aria-hidden />
              )}
              Vider mouvements
            </button>
          </div>
        </FsCard>
      ) : null}

      {/* Déconnexion — carte bordure erreur (Flutter) */}
      <FsCard className="mt-5 border border-red-400/50 bg-fs-card" padding="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-fs-text">Déconnexion</p>
            <p className="mt-1 text-xs text-neutral-600">Se déconnecter de FasoStock</p>
          </div>
          <div className="shrink-0">
            <LogOutButton className="border-red-500/60 bg-red-600 text-white shadow-none hover:bg-red-700" />
          </div>
        </div>
      </FsCard>

      {/* Dialog confirmation danger */}
      {confirmDanger ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="danger-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-fs-card p-5 shadow-xl">
            <div className="flex justify-center text-red-600">
              <MdWarningAmber className="h-10 w-10" aria-hidden />
            </div>
            <h2 id="danger-title" className="mt-2 text-center text-lg font-bold text-fs-text">
              {confirmDanger.title}
            </h2>
            <p className="mt-3 text-center text-sm text-neutral-600">
              {confirmDanger.body}
              <br />
              <br />
              Confirmez pour continuer.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-black/[0.04]"
                onClick={() => setConfirmDanger(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                onClick={() => void runConfirmed()}
              >
                Oui, supprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Dialog 2FA */}
      {twoFaOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="twofa-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-fs-card p-5 shadow-xl">
            <h2 id="twofa-title" className="text-lg font-bold text-fs-text">
              2FA
            </h2>
            <p className="mt-3 text-sm text-neutral-600">
              L&apos;activation de la double authentification sera disponible prochainement. En attendant, utilisez un mot de passe
              fort.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-fs-accent hover:bg-fs-accent/10"
                onClick={() => setTwoFaOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FsPage>
  );
}
