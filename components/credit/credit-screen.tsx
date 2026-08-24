"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseISO, subMonths } from "date-fns";
import {
  MdAccountBalanceWallet,
  MdCalendarToday,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdDateRange,
  MdDownload,
  MdLock,
  MdPayments,
  MdPeople,
  MdReceiptLong,
  MdRefresh,
  MdSearch,
  MdShoppingCart,
  MdTrendingUp,
  MdWarningAmber,
  MdInsights,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { localDayEndIso, localDayStartIso } from "@/lib/utils/local-day";
import { listCreditSales } from "@/lib/features/credit/api";
import {
  buildCustomerAggregates,
  CREDIT_AMOUNT_EPS,
  creditLineStatus,
  CREDIT_STATUS_LABELS,
  daysOverdue,
  downPaymentTotal,
  dueBadgeVariant,
  effectiveDueDate,
  isDueThisWeek,
  isDueToday,
  maxRealizedPaymentDate,
  paidTotal,
  repaidAfterSaleTotal,
  remainingTotal,
  saleHadCreditBooking,
} from "@/lib/features/credit/credit-math";
import {
  customerAggSearchRelevance,
  dispatchSearchRelevance,
  saleSearchRelevance,
} from "@/lib/features/credit/credit-search-relevance";
import type { CreditLineStatus, CreditSaleRow } from "@/lib/features/credit/types";
import { listLegacyCredits } from "@/lib/features/credit/legacy-api";
import {
  getWarehouseDispatchInvoiceDetails,
  listWarehouseDispatchInvoices,
  warehouseAppendDispatchPayment,
} from "@/lib/features/warehouse/api";
import type { WarehouseDispatchInvoiceSummary } from "@/lib/features/warehouse/types";
import { useAppContext } from "@/lib/features/common/app-context";
import { activityUiTerms } from "@/lib/features/activity/activity-profiles";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { creditSalesToSpreadsheetMatrix } from "@/lib/features/credit/csv";
import { downloadProSpreadsheet } from "@/lib/utils/spreadsheet-export-pro";
import { cn } from "@/lib/utils/cn";
import { formatOperationCalendarDayYmd, formatOperationDateTime, formatOperationNowDateFull, operationYmd, isOperationToday, isOperationYesterday, operationCalendarDaysBetween, operationTodayYmd } from "@/lib/utils/operation-datetime";
import { CreditCashedInDialog } from "./credit-cashed-in-dialog";
import { CreditDetailPanel } from "./credit-detail-panel";
import { CreditRepaymentsPanel } from "./credit-repayments-panel";
import { CustomerCreditPanel } from "./customer-credit-panel";
import { CreditQuickPayDialog } from "./credit-quick-pay-dialog";
import { LegacyCreditSection } from "./legacy-credit-section";

type QuickChip =
  | "all"
  | "non_paye"
  | "partiel"
  | "en_retard"
  | "due_today"
  | "due_week"
  | "soldes";

const DISPATCH_PAYMENT_NOTE_PREFIX = "__PAYMENT_INFO__:";
type DispatchPaymentMode = "cash" | "mobile_money" | "card" | "credit";
type DispatchCreditRow = WarehouseDispatchInvoiceSummary & {
  paidAmount: number;
  remainingAmount: number;
};
type SaleTableRow =
  | { kind: "sale"; row: CreditSaleRow }
  | { kind: "dispatch"; row: DispatchCreditRow };
const CREDIT_PAGE_SIZE = 20;

function parseDispatchPaymentInfo(note: string | null, totalAmount: number): {
  mode: DispatchPaymentMode;
  paidAmount: number;
  mobileProvider: string | null;
} {
  const raw = (note ?? "").trim();
  if (!raw.startsWith(DISPATCH_PAYMENT_NOTE_PREFIX)) {
    return { mode: "credit", paidAmount: 0, mobileProvider: null };
  }
  const payloadRaw = raw.slice(DISPATCH_PAYMENT_NOTE_PREFIX.length).trim();
  try {
    const payload = JSON.parse(payloadRaw) as {
      mode?: DispatchPaymentMode;
      paid_amount?: number;
      mobile_provider?: string | null;
    };
    const mode = payload.mode;
    const paidRaw = Number(payload.paid_amount ?? 0);
    const mobileProvider = (payload.mobile_provider ?? null)?.toString().trim() || null;
    if (mode === "cash" || mode === "mobile_money" || mode === "card" || mode === "credit") {
      const paidAmount =
        mode === "cash"
          ? Math.min(totalAmount, Math.max(0, Math.round(Number.isFinite(paidRaw) ? paidRaw : 0)))
          : mode === "credit"
            ? 0
            : totalAmount;
      return { mode, paidAmount, mobileProvider };
    }
  } catch {
    const mode = payloadRaw as DispatchPaymentMode;
    if (mode === "cash" || mode === "mobile_money" || mode === "card" || mode === "credit") {
      return { mode, paidAmount: mode === "credit" ? 0 : totalAmount, mobileProvider: null };
    }
  }
  return { mode: "credit", paidAmount: 0, mobileProvider: null };
}

function humanDispatchNote(note: string | null, totalAmount: number): string | null {
  const raw = (note ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith(DISPATCH_PAYMENT_NOTE_PREFIX)) return raw;
  const info = parseDispatchPaymentInfo(raw, totalAmount);
  if (info.mode === "credit") return "Paiement: À crédit (non encaissé)";
  if (info.mode === "card") return "Paiement: Carte (encaissé)";
  if (info.mode === "mobile_money") {
    const provider = info.mobileProvider ? ` (${info.mobileProvider.replace("_", " ")})` : "";
    return `Paiement: Mobile money${provider} (encaissé)`;
  }
  if (info.mode === "cash") {
    return `Paiement: Espèces (${formatCurrency(info.paidAmount)} encaissé)`;
  }
  return null;
}

function toIsoDate(d: Date): string {
  return operationYmd(d);
}

function formatDateFr(ymd: string) {
  return formatOperationCalendarDayYmd(ymd);
}

/** Libellé UX de la date du dernier remboursement : « Aujourd'hui » / « Hier » / « 24/07 · il y a 3 j ». */
function lastPaymentLabel(iso: string | null): { text: string; today: boolean } | null {
  if (!iso) return null;
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (isOperationToday(d)) return { text: "Aujourd'hui", today: true };
  if (isOperationYesterday(d)) return { text: "Hier", today: false };
  const days = operationCalendarDaysBetween(operationYmd(d), operationTodayYmd());
  const dm = formatOperationDateTime(d).slice(0, 5);
  return { text: days > 0 ? `${dm} · il y a ${days} j` : dm, today: false };
}

function KpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  colorClass,
  accentBorder,
  onClick,
  actionLabel,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  colorClass: string;
  accentBorder?: boolean;
  /** Rend la carte cliquable (ouvre un détail). */
  onClick?: () => void;
  actionLabel?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-xs text-neutral-600 min-[900px]:text-sm">{label}</p>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            colorClass,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      <div>
        <p className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold text-fs-text min-[900px]:text-lg">
          {value}
        </p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">{subtitle}</p>
        ) : null}
        {onClick ? (
          <p className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-bold text-fs-accent">
            {actionLabel ?? "Voir le détail"}
            <MdChevronRight className="h-3.5 w-3.5" aria-hidden />
          </p>
        ) : null}
      </div>
    </>
  );

  const className = cn(
    "flex min-h-[120px] min-w-0 flex-col justify-between overflow-hidden rounded-md sm:rounded-md",
    accentBorder && "border-2 border-fs-accent/40",
    onClick && "cursor-pointer text-left transition hover:border-fs-accent/40 hover:shadow-md",
  );

  if (!onClick) {
    return (
      <FsCard padding="p-4" className={className}>
        {body}
      </FsCard>
    );
  }
  return (
    <FsCard padding="p-0" className={cn(className, "p-0")}>
      <button type="button" onClick={onClick} className="flex h-full w-full flex-col justify-between p-4 text-left">
        {body}
      </button>
    </FsCard>
  );
}

function statusPillClass(s: CreditLineStatus): string {
  switch (s) {
    case "solde":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "en_retard":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "partiel":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "non_paye":
      return "bg-neutral-500/15 text-neutral-800 dark:text-neutral-200";
    default:
      return "bg-neutral-400/15 text-neutral-600";
  }
}

function dueTone(sale: CreditSaleRow): string {
  const v = dueBadgeVariant(sale);
  if (v === "late") return "text-red-600 font-semibold";
  if (v === "soon") return "text-amber-600 font-semibold";
  return "text-emerald-700 dark:text-emerald-400";
}

export function CreditScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h, hasPermission } = usePermissions();
  const canExport = hasPermission(P.salesView);
  const canRecordPayment = hasPermission(P.salesUpdate);
  const isOwner = h?.isOwner ?? false;
  const isWide = useMediaQuery("(min-width: 900px)");
  const isPaginationNarrow = !useMediaQuery("(min-width: 500px)");

  const companyId = ctx.data?.companyId ?? "";
  const companyName = ctx.data?.companyName ?? "";
  const stores = ctx.data?.stores ?? [];
  const currentStoreId = ctx.data?.storeId ?? null;
  const terms = activityUiTerms(ctx.data?.businessTypeSlug);

  const allStoresChosen = useRef(false);
  const [storeFilter, setStoreFilter] = useState<string>(() => currentStoreId ?? "");
  const [from, setFrom] = useState(() => toIsoDate(subMonths(new Date(), 6)));
  const [to, setTo] = useState(() => toIsoDate(new Date()));
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const isMainSearchStale = search.trim() !== deferredSearch;
  const [sellerId, setSellerId] = useState("");
  const [chip, setChip] = useState<QuickChip>("all");
  const [view, setView] = useState<"sale" | "customer" | "repayments">("sale");
  const [salePage, setSalePage] = useState(0);
  const [customerPage, setCustomerPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [customerDetailId, setCustomerDetailId] = useState<string | null>(null);
  const [dispatchDetailId, setDispatchDetailId] = useState<string | null>(null);
  const [cashedInOpen, setCashedInOpen] = useState(false);
  const [dispatchPayInvoice, setDispatchPayInvoice] = useState<{
    id: string;
    documentNumber: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  } | null>(null);
  const [paySale, setPaySale] = useState<CreditSaleRow | null>(null);
  const [creditFilterResetNonce, setCreditFilterResetNonce] = useState(0);

  const resetCreditFilters = () => {
    const now = new Date();
    setFrom(toIsoDate(subMonths(now, 6)));
    setTo(toIsoDate(now));
    setSearch("");
    setSellerId("");
    setChip("all");
    setView("sale");
    setSalePage(0);
    setCustomerPage(0);
    setCreditFilterResetNonce((n) => n + 1);
  };

  const applyQuickRange = (days: 7 | 30 | 90) => {
    const now = new Date();
    setFrom(toIsoDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000)));
    setTo(toIsoDate(now));
    setSalePage(0);
    setCustomerPage(0);
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (sellerId) n += 1;
    if (chip !== "all") n += 1;
    if (view !== "sale") n += 1;
    return n;
  }, [search, sellerId, chip, view]);

  useEffect(() => {
    setSalePage(0);
    setCustomerPage(0);
  }, [deferredSearch]);

  useEffect(() => {
    if (chip === "soldes") setView("sale");
  }, [chip]);

  useEffect(() => {
    if (allStoresChosen.current) return;
    if (storeFilter === "" && currentStoreId) {
      setStoreFilter(currentStoreId);
    }
  }, [currentStoreId, storeFilter]);

  const effectiveStoreId = storeFilter || null;

  const creditParams = useMemo(
    () => ({
      companyId,
      storeId: effectiveStoreId,
      from: from ? `${from}T00:00:00.000Z` : "",
      to,
    }),
    [companyId, effectiveStoreId, from, to],
  );

  const creditQ = useQuery({
    queryKey: queryKeys.creditSales(creditParams),
    queryFn: () => listCreditSales(creditParams),
    enabled: !!companyId && !!h?.canCredit,
    staleTime: 15_000,
  });

  const rawRows = useMemo(() => creditQ.data ?? [], [creditQ.data]);
  const legacyQ = useQuery({
    queryKey: queryKeys.legacyCredits(creditParams),
    queryFn: () => listLegacyCredits(creditParams),
    enabled: !!companyId && !!h?.canCredit,
    staleTime: 15_000,
  });
  const legacyRows = useMemo(() => legacyQ.data ?? [], [legacyQ.data]);
  /** Versements sur crédits hérités : du recouvrement pur (aucune vente, donc aucun acompte). */
  const legacyPaidTotal = useMemo(
    () =>
      legacyRows.reduce(
        (sum, l) => sum + (l.payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0),
        0,
      ),
    [legacyRows],
  );
  const dispatchQ = useQuery({
    queryKey: ["credit-warehouse-dispatch", companyId, from, to],
    queryFn: () => listWarehouseDispatchInvoices(companyId, 500),
    enabled: !!companyId && !!h?.canCredit,
    staleTime: 15_000,
  });
  const dispatchRowsRaw = useMemo(() => dispatchQ.data ?? [], [dispatchQ.data]);
  const dispatchDetailQ = useQuery({
    queryKey: dispatchDetailId ? ["credit-dispatch-detail", dispatchDetailId] : ["credit-dispatch-detail-none"],
    queryFn: () => getWarehouseDispatchInvoiceDetails(dispatchDetailId as string),
    enabled: !!dispatchDetailId,
    staleTime: 10_000,
  });
  const dispatchCreditRows = useMemo<DispatchCreditRow[]>(() => {
    const fromMs = Date.parse(from ? localDayStartIso(from) : "");
    const toMs = Date.parse(to ? localDayEndIso(to) : "");
    return dispatchRowsRaw
      .filter((r) => {
        const createdMs = Date.parse(r.createdAt);
        if (!Number.isFinite(createdMs)) return false;
        return createdMs >= fromMs && createdMs <= toMs;
      })
      .map((r) => {
        const paid = parseDispatchPaymentInfo(r.notes, r.totalAmount).paidAmount;
        const rem = Math.max(0, r.totalAmount - paid);
        return { ...r, paidAmount: paid, remainingAmount: rem };
      });
  }, [dispatchRowsRaw, from, to]);
  const dispatchPayMut = useMutation({
    mutationFn: (params: {
      invoiceId: string;
      method: "cash" | "mobile_money" | "card";
      amount?: number | null;
      mobileProvider?: "orange_money" | "moov_money" | "wave" | null;
    }) =>
      warehouseAppendDispatchPayment({
        companyId,
        invoiceId: params.invoiceId,
        method: params.method,
        amount: params.amount ?? null,
        mobileProvider: params.mobileProvider ?? null,
      }),
    onSuccess: async () => {
      setDispatchPayInvoice(null);
      await Promise.all([
        dispatchQ.refetch(),
        qc.invalidateQueries({ queryKey: queryKeys.creditSales(creditParams) }),
      ]);
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Encaissement impossible.")),
  });

  const openRows = useMemo(
    () => rawRows.filter((s) => remainingTotal(s) > CREDIT_AMOUNT_EPS),
    [rawRows],
  );
  const cancelledCreditMeta = useMemo(() => {
    const cancelledRows = rawRows.filter((s) => s.status === "cancelled" || s.status === "refunded");
    const cancelledOpenEquivalent = cancelledRows.reduce((sum, s) => {
      const wouldRemain = Math.max(0, Number(s.total) - paidTotal(s));
      return sum + wouldRemain;
    }, 0);
    return { count: cancelledRows.length, amount: cancelledOpenEquivalent };
  }, [rawRows]);

  const sellers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rawRows) {
      if (!saleHadCreditBooking(r) && remainingTotal(r) <= CREDIT_AMOUNT_EPS) continue;
      m.set(r.created_by, r.created_by_label ?? r.created_by);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [rawRows]);

  const kpiBase = useMemo(() => {
    let totalRem = 0;
    let totalPaidOpen = 0;
    let totalPaidAll = 0;
    let totalSaleTotal = 0;
    let overdue = 0;
    let dueToday = 0;
    let dueWeek = 0;
    let totalDownPayments = 0;
    let totalRepaidAfterSale = 0;
    const debtors = new Set<string>();
    for (const s of rawRows) {
      totalPaidAll += paidTotal(s);
      totalDownPayments += downPaymentTotal(s);
      totalRepaidAfterSale += repaidAfterSaleTotal(s);
    }
    for (const s of openRows) {
      const rem = remainingTotal(s);
      totalRem += rem;
      totalPaidOpen += paidTotal(s);
      totalSaleTotal += Number(s.total);
      debtors.add(s.customer_id!);
      if (daysOverdue(s) > 0) overdue += rem;
      if (isDueToday(s)) dueToday += rem;
      else if (isDueThisWeek(s)) dueWeek += rem;
    }

    const legacyEps = 0.005;
    const now = new Date();
    const toStartOfDayMs = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDay = toStartOfDayMs(now);
    const nowWeekday = (now.getDay() + 6) % 7;
    const weekStart = nowDay - nowWeekday * 86400000;
    const weekEnd = weekStart + 6 * 86400000;
    for (const l of legacyRows) {
      const paid = (l.payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
      totalPaidAll += paid;
      // Un crédit hérité n'a pas de vente : tous ses versements sont du recouvrement.
      totalRepaidAfterSale += paid;
      const rem = Math.max(0, Number(l.principal_amount) - paid);
      if (rem <= legacyEps) continue;
      totalRem += rem;
      totalPaidOpen += paid;
      totalSaleTotal += Number(l.principal_amount);
      debtors.add(l.customer_id);
      if (l.due_at) {
        const due = new Date(l.due_at);
        if (!Number.isNaN(due.getTime())) {
          const dueDay = toStartOfDayMs(due);
          if (nowDay > dueDay) overdue += rem;
          if (nowDay === dueDay) dueToday += rem;
          else if (dueDay >= weekStart && dueDay <= weekEnd) dueWeek += rem;
        }
      }
    }
    const portfolioTotal = totalRem + totalPaidAll;
    const recoveryRate = portfolioTotal > CREDIT_AMOUNT_EPS ? (totalPaidAll / portfolioTotal) * 100 : 100;
    const avgOpenTicket = openRows.length > 0 ? totalRem / openRows.length : 0;
    return {
      totalRem,
      totalPaidOpen,
      totalPaidAll,
      totalDownPayments,
      totalRepaidAfterSale,
      totalSaleTotal,
      countOpen: openRows.length,
      debtors: debtors.size,
      overdue,
      dueToday,
      dueWeek,
      portfolioTotal,
      recoveryRate,
      avgOpenTicket,
    };
  }, [rawRows, openRows, legacyRows]);

  const topRelanceRows = useMemo(() => {
    type RelanceAgg = {
      key: string;
      customerId: string | null;
      customerName: string;
      phone: string | null;
      totalDue: number;
      overdueDue: number;
      dueTodayDue: number;
      openCount: number;
      maxDelayDays: number;
    };
    const byCustomer = new Map<string, RelanceAgg>();
    const now = new Date();
    const toStartOfDayMs = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDay = toStartOfDayMs(now);

    for (const s of openRows) {
      const rem = remainingTotal(s);
      if (rem <= CREDIT_AMOUNT_EPS) continue;
      const key = s.customer_id ? `sale-${s.customer_id}` : `sale-unknown-${s.id}`;
      const existing = byCustomer.get(key);
      const name = s.customer?.name ?? "Client non renseigné";
      const phone = s.customer?.phone ?? null;
      const dueAt = effectiveDueDate(s);
      let delay = 0;
      let overdue = 0;
      let dueToday = 0;
      if (dueAt) {
        const dueDay = toStartOfDayMs(dueAt);
        delay = nowDay > dueDay ? Math.floor((nowDay - dueDay) / 86400000) : 0;
        if (delay > 0) overdue = rem;
        if (dueDay === nowDay) dueToday = rem;
      }
      if (!existing) {
        byCustomer.set(key, {
          key,
          customerId: s.customer_id,
          customerName: name,
          phone,
          totalDue: rem,
          overdueDue: overdue,
          dueTodayDue: dueToday,
          openCount: 1,
          maxDelayDays: delay,
        });
      } else {
        existing.totalDue += rem;
        existing.overdueDue += overdue;
        existing.dueTodayDue += dueToday;
        existing.openCount += 1;
        existing.maxDelayDays = Math.max(existing.maxDelayDays, delay);
      }
    }

    for (const l of legacyRows) {
      const paid = (l.payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const rem = Math.max(0, Number(l.principal_amount) - paid);
      if (rem <= CREDIT_AMOUNT_EPS) continue;
      const key = l.customer_id ? `legacy-${l.customer_id}` : `legacy-unknown-${l.id}`;
      const existing = byCustomer.get(key);
      const name = l.customer?.name ?? "Client non renseigné";
      const phone = l.customer?.phone ?? null;
      let delay = 0;
      let overdue = 0;
      let dueToday = 0;
      if (l.due_at) {
        const due = new Date(l.due_at);
        if (!Number.isNaN(due.getTime())) {
          const dueDay = toStartOfDayMs(due);
          delay = nowDay > dueDay ? Math.floor((nowDay - dueDay) / 86400000) : 0;
          if (delay > 0) overdue = rem;
          if (dueDay === nowDay) dueToday = rem;
        }
      }
      if (!existing) {
        byCustomer.set(key, {
          key,
          customerId: l.customer_id ?? null,
          customerName: name,
          phone,
          totalDue: rem,
          overdueDue: overdue,
          dueTodayDue: dueToday,
          openCount: 1,
          maxDelayDays: delay,
        });
      } else {
        existing.totalDue += rem;
        existing.overdueDue += overdue;
        existing.dueTodayDue += dueToday;
        existing.openCount += 1;
        existing.maxDelayDays = Math.max(existing.maxDelayDays, delay);
      }
    }

    return [...byCustomer.values()]
      .sort((a, b) => {
        if (b.overdueDue !== a.overdueDue) return b.overdueDue - a.overdueDue;
        if (b.maxDelayDays !== a.maxDelayDays) return b.maxDelayDays - a.maxDelayDays;
        return b.totalDue - a.totalDue;
      })
      .slice(0, 5);
  }, [openRows, legacyRows]);

  /**
   * Filtres rapides : basés sur encaissements réels vs reste (pas uniquement le statut affiché,
   * car « en retard » + partiel peut aussi matcher « Partiels » / « Non payés »).
   */
  const matchesChip = useCallback((s: CreditSaleRow): boolean => {
    const rem = remainingTotal(s);
    const paid = paidTotal(s);
    const hasBalance = rem > CREDIT_AMOUNT_EPS;
    const hasEncaisse = paid > CREDIT_AMOUNT_EPS;
    switch (chip) {
      case "soldes":
        if (s.status === "cancelled" || s.status === "refunded") return false;
        return saleHadCreditBooking(s) && rem <= CREDIT_AMOUNT_EPS;
      case "all":
        return true;
      case "non_paye":
        return hasBalance && !hasEncaisse;
      case "partiel":
        return hasBalance && hasEncaisse;
      case "en_retard":
        return hasBalance && daysOverdue(s) > 0;
      case "due_today":
        return isDueToday(s) && hasBalance;
      case "due_week":
        return isDueThisWeek(s) && hasBalance;
      default:
        return true;
    }
  }, [chip]);

  const salesTableSource = useMemo(
    () => (chip === "soldes" ? rawRows : openRows),
    [chip, rawRows, openRows],
  );

  const filteredSales = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const rows = salesTableSource.filter((s) => {
      if (sellerId && s.created_by !== sellerId) return false;
      if (!matchesChip(s)) return false;
      if (!q) return true;
      const num = q.replace(/\s/g, "");
      return (
        (s.sale_number ?? "").toLowerCase().includes(q) ||
        (s.customer?.name ?? "").toLowerCase().includes(q) ||
        (s.customer?.phone ?? "").replace(/\s/g, "").includes(num) ||
        String(s.total).includes(q) ||
        (s.created_by_label ?? "").toLowerCase().includes(q) ||
        (s.store?.name ?? "").toLowerCase().includes(q) ||
        (s.id ?? "").toLowerCase().includes(q)
      );
    });
    const numOnly = q.replace(/\s/g, "");
    rows.sort((a, b) => {
      if (q.length > 0 || numOnly.length > 0) {
        const rab = saleSearchRelevance(b, q, numOnly);
        const raa = saleSearchRelevance(a, q, numOnly);
        if (rab !== raa) return rab - raa;
      }
      const db = daysOverdue(b);
      const da = daysOverdue(a);
      if (db !== da) return db - da;
      return remainingTotal(b) - remainingTotal(a);
    });
    return rows;
  }, [salesTableSource, deferredSearch, sellerId, matchesChip]);

  const filteredDispatchCredits = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return dispatchCreditRows
      .filter((r) => {
        if (chip === "soldes") {
          const info = parseDispatchPaymentInfo(r.notes, r.totalAmount);
          return r.remainingAmount <= CREDIT_AMOUNT_EPS && info.mode === "credit";
        }
        return r.remainingAmount > CREDIT_AMOUNT_EPS;
      })
      .filter((r) => {
        if (!sellerId) return true;
        return (r.createdBy ?? "") === sellerId;
      })
      .filter((r) => {
        if (chip === "soldes") return true;
        const hasBalance = r.remainingAmount > CREDIT_AMOUNT_EPS;
        const hasEncaisse = r.paidAmount > CREDIT_AMOUNT_EPS;
        switch (chip) {
          case "all":
            break;
          case "non_paye":
            if (!(hasBalance && !hasEncaisse)) return false;
            break;
          case "partiel":
            if (!(hasBalance && hasEncaisse)) return false;
            break;
          case "en_retard":
          case "due_today":
          case "due_week":
            return false;
          default:
            break;
        }
        if (!q) return true;
        return (
          (r.documentNumber ?? "").toLowerCase().includes(q) ||
          (r.customerName ?? "").toLowerCase().includes(q) ||
          (r.createdByLabel ?? "").toLowerCase().includes(q) ||
          String(r.totalAmount).includes(q) ||
          "bon depot".includes(q) ||
          "depot".includes(q)
        );
      })
      .sort((a, b) => {
        if (q) {
          const sa = dispatchSearchRelevance(a, q, a.totalAmount);
          const sb = dispatchSearchRelevance(b, q, b.totalAmount);
          if (sb !== sa) return sb - sa;
        }
        return b.remainingAmount - a.remainingAmount;
      });
  }, [dispatchCreditRows, sellerId, chip, deferredSearch]);

  const customerRows = useMemo(() => {
    const ql = deferredSearch.trim().toLowerCase();
    const numOnly = ql.replace(/\s/g, "");
    const base = buildCustomerAggregates(filteredSales);
    if (!ql.length && !numOnly.length) return base;
    return [...base].sort((a, b) => {
      const sb = customerAggSearchRelevance(b, ql, numOnly);
      const sa = customerAggSearchRelevance(a, ql, numOnly);
      if (sb !== sa) return sb - sa;
      return b.totalDue - a.totalDue;
    });
  }, [filteredSales, deferredSearch]);
  const saleTableRows = useMemo<SaleTableRow[]>(
    () => [
      ...filteredSales.map((row) => ({ kind: "sale" as const, row })),
      ...filteredDispatchCredits.map((row) => ({ kind: "dispatch" as const, row })),
    ],
    [filteredSales, filteredDispatchCredits],
  );
  const saleTotalCount = saleTableRows.length;
  const salePageCount =
    saleTotalCount === 0 ? 0 : Math.floor((saleTotalCount - 1) / CREDIT_PAGE_SIZE) + 1;
  const safeSalePage = salePageCount > 0 ? Math.min(salePage, salePageCount - 1) : 0;
  const paginatedSaleRows = useMemo(
    () =>
      saleTableRows.slice(
        safeSalePage * CREDIT_PAGE_SIZE,
        safeSalePage * CREDIT_PAGE_SIZE + CREDIT_PAGE_SIZE,
      ),
    [saleTableRows, safeSalePage],
  );
  const customerTotalCount = customerRows.length;
  const customerPageCount =
    customerTotalCount === 0 ? 0 : Math.floor((customerTotalCount - 1) / CREDIT_PAGE_SIZE) + 1;
  const safeCustomerPage =
    customerPageCount > 0 ? Math.min(customerPage, customerPageCount - 1) : 0;
  const paginatedCustomerRows = useMemo(
    () =>
      customerRows.slice(
        safeCustomerPage * CREDIT_PAGE_SIZE,
        safeCustomerPage * CREDIT_PAGE_SIZE + CREDIT_PAGE_SIZE,
      ),
    [customerRows, safeCustomerPage],
  );

  const migrationHint =
    creditQ.error &&
    /credit_due_at|credit_internal_note|append_sale_payment|schema cache/i.test(
      String((creditQ.error as Error).message ?? ""),
    );

  function exportSalesExcel() {
    void (async () => {
      try {
        const { headers, rows } = creditSalesToSpreadsheetMatrix(filteredSales);
        await downloadProSpreadsheet(
          `credit-ventes-${toIsoDate(new Date())}.xlsx`,
          terms.creditTitle,
          headers,
          rows,
          {
            title: `FasoStock — ${terms.creditTitle}`,
            subtitle: `${filteredSales.length} vente(s) · ${formatOperationNowDateFull()}`,
          },
        );
        toast.success("Excel enregistré");
      } catch (e) {
        toast.error(messageFromUnknownError(e, "Export Excel impossible."));
      }
    })();
  }

  if (permLoading || ctx.isLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
        </div>
      </FsPage>
    );
  }

  if (!h || !h.canCredit) {
    return (
      <FsPage>
        <FsScreenHeader title={terms.creditTitle} subtitle={terms.creditSubtitle} />
        <FsCard padding="p-8" className="rounded-md sm:rounded-md">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              Vous n&apos;avez pas accès à cette section.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title={terms.creditTitle}
        subtitle={terms.creditSubtitle}
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
      />

      {migrationHint ? (
        <FsCard className="rounded-md sm:rounded-md mb-6 border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/40" padding="p-4">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
            Base de données à mettre à jour
          </p>
          <p className="mt-2 text-sm text-red-900/90 dark:text-red-100/90">
            Appliquez la migration Supabase <code className="rounded bg-black/10 px-1">00082_sale_credit_due_and_append_payment.sql</code> (colonnes
            <code className="mx-1 rounded bg-black/10 px-1">credit_due_at</code>, fonction
            <code className="mx-1 rounded bg-black/10 px-1">append_sale_payment</code>), puis rechargez la page.
          </p>
        </FsCard>
      ) : null}

      <FsCard className="rounded-md sm:rounded-md mb-6" padding="p-3 sm:p-3.5">
        <div className="flex w-full min-w-0 flex-col gap-2.5 min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-center">
          <div className="flex min-w-0 max-w-full shrink-0 items-center gap-1.5">
            <label
              className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-neutral-500 sm:text-[11px]"
              htmlFor="credit-store"
            >
              {terms.storeSingular}
            </label>
            <select
              id="credit-store"
              className={fsInputClass(
                "h-9 w-full min-w-0 max-w-full py-0! text-xs sm:w-52 sm:py-0! sm:text-xs",
              )}
              value={storeFilter}
              onChange={(e) => {
                allStoresChosen.current = e.target.value !== (currentStoreId ?? "");
                setStoreFilter(e.target.value);
                setSalePage(0);
                setCustomerPage(0);
              }}
            >
              <option value="">Tous les {terms.storesPlural.toLowerCase()}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
            <label className="sr-only" htmlFor="credit-from">
              Du
            </label>
            <input
              id="credit-from"
              type="date"
              className={fsInputClass(
                "h-9 w-[47%] min-w-[8.25rem] max-w-full shrink-0 py-0! text-xs sm:w-37 sm:py-0! sm:text-xs",
              )}
              value={from}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (to < v) setTo(v);
                setSalePage(0);
                setCustomerPage(0);
              }}
            />
            <span className="shrink-0 text-[11px] text-neutral-400" aria-hidden>
              —
            </span>
            <label className="sr-only" htmlFor="credit-to">
              Au
            </label>
            <input
              id="credit-to"
              type="date"
              className={fsInputClass(
                "h-9 w-[47%] min-w-[8.25rem] max-w-full shrink-0 py-0! text-xs sm:w-37 sm:py-0! sm:text-xs",
              )}
              value={to}
              onChange={(e) => {
                const v = e.target.value;
                setTo(v);
                if (from > v) setFrom(v);
                setSalePage(0);
                setCustomerPage(0);
              }}
            />
            <span className="min-w-0 max-w-full text-[10px] text-neutral-500 sm:text-[11px] sm:whitespace-nowrap">
              ({formatDateFr(from)} — {formatDateFr(to)})
            </span>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
              {[
                { label: "7j", days: 7 as const },
                { label: "30j", days: 30 as const },
                { label: "90j", days: 90 as const },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyQuickRange(p.days)}
                  className="rounded-md border border-black/10 bg-fs-surface-container px-2 py-1 text-[11px] font-bold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5 min-[900px]:ml-auto min-[900px]:justify-end">
            <button
              type="button"
              onClick={() => void creditQ.refetch()}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-black/10 bg-fs-surface-container px-2.5 text-xs font-semibold dark:border-white/10"
            >
              <MdRefresh className={cn("h-4 w-4 shrink-0", creditQ.isFetching && "animate-spin")} aria-hidden />
              Actualiser
            </button>
            <button
              type="button"
              onClick={resetCreditFilters}
              className="inline-flex h-9 items-center rounded-md border border-black/10 bg-fs-surface-container px-2.5 text-xs font-semibold dark:border-white/10"
            >
              Réinitialiser
            </button>
            {canExport ? (
              <button
                type="button"
                onClick={() => exportSalesExcel()}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-black/10 bg-fs-surface-container px-2.5 text-xs font-semibold dark:border-white/10"
              >
                <MdDownload className="h-4 w-4 shrink-0" aria-hidden />
                Excel
              </button>
            ) : null}
          </div>
        </div>
      </FsCard>

      <div
        className={cn(
          "grid gap-3 sm:gap-4",
          isWide ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <KpiCard
          label="Restant à recouvrer"
          value={formatCurrency(kpiBase.totalRem)}
          icon={MdAccountBalanceWallet}
          colorClass="bg-fs-accent/15 text-fs-accent"
          accentBorder
        />
        <KpiCard
          label="Déjà encaissé"
          value={formatCurrency(kpiBase.totalPaidAll)}
          subtitle={
            kpiBase.totalDownPayments > CREDIT_AMOUNT_EPS
              ? `Remboursements ${formatCurrency(kpiBase.totalRepaidAfterSale)} · acomptes à la vente ${formatCurrency(kpiBase.totalDownPayments)}`
              : "Tous dossiers · aucun acompte à la vente"
          }
          icon={MdPayments}
          colorClass="bg-emerald-500/15 text-emerald-600"
          onClick={() => setCashedInOpen(true)}
          actionLabel="Voir quelles ventes"
        />
        <KpiCard
          label="Crédit total (ventes)"
          value={formatCurrency(kpiBase.totalSaleTotal)}
          subtitle="TTC sur la période filtrée"
          icon={MdReceiptLong}
          colorClass="bg-sky-500/15 text-sky-600"
        />
        <KpiCard
          label="Ventes avec solde"
          value={String(kpiBase.countOpen)}
          icon={MdShoppingCart}
          colorClass="bg-blue-600/15 text-blue-700"
        />
        <KpiCard
          label="Clients débiteurs"
          value={String(kpiBase.debtors)}
          icon={MdPeople}
          colorClass="bg-violet-500/15 text-violet-700"
        />
        <KpiCard
          label="En retard"
          value={formatCurrency(kpiBase.overdue)}
          icon={MdWarningAmber}
          colorClass="bg-red-500/15 text-red-600"
        />
        <KpiCard
          label="Échéance aujourd'hui"
          value={formatCurrency(kpiBase.dueToday)}
          icon={MdCalendarToday}
          colorClass="bg-amber-500/15 text-amber-700"
        />
        <KpiCard
          label="Échéance cette semaine"
          value={formatCurrency(kpiBase.dueWeek)}
          icon={MdDateRange}
          colorClass="bg-teal-500/15 text-teal-700"
        />
        <KpiCard
          label="Taux de recouvrement"
          value={`${Math.max(0, Math.min(100, Math.round(kpiBase.recoveryRate)))}%`}
          subtitle={`Portefeuille: ${formatCurrency(kpiBase.portfolioTotal)}`}
          icon={MdTrendingUp}
          colorClass="bg-indigo-500/15 text-indigo-700"
        />
        <KpiCard
          label="Ticket moyen (dossiers ouverts)"
          value={formatCurrency(kpiBase.avgOpenTicket)}
          subtitle="Reste moyen par dossier"
          icon={MdInsights}
          colorClass="bg-fuchsia-500/15 text-fuchsia-700"
        />
      </div>

      <FsCard className="rounded-md sm:rounded-md mt-4" padding="p-4">
        <p className="text-sm font-bold text-fs-text">Priorité recouvrement</p>
        <div className="mt-2 grid grid-cols-1 gap-2 text-xs min-[900px]:grid-cols-3">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
            En retard: <span className="font-bold">{formatCurrency(kpiBase.overdue)}</span>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
            À relancer aujourd&apos;hui: <span className="font-bold">{formatCurrency(kpiBase.dueToday)}</span>
          </div>
          <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-teal-700">
            Échéance semaine: <span className="font-bold">{formatCurrency(kpiBase.dueWeek)}</span>
          </div>
        </div>
      </FsCard>

      <FsCard className="rounded-md sm:rounded-md mt-4" padding="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-fs-text">Top 5 clients à relancer</p>
          <span className="rounded-full bg-fs-accent/10 px-2 py-0.5 text-[11px] font-bold text-fs-accent">
            Tri: retard puis montant
          </span>
        </div>
        {topRelanceRows.length === 0 ? (
          <p className="text-xs text-neutral-600">Aucun client à relancer pour la période sélectionnée.</p>
        ) : (
          <FsHorizontalScroll className="rounded-md border border-black/8">
            <table className="w-full min-w-[680px] text-left text-[12px] [&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-black/10 bg-fs-surface-low/80 text-[10px] uppercase tracking-wide text-neutral-600">
                  <th className="px-2.5 py-2">Client</th>
                  <th className="px-2.5 py-2">Contact</th>
                  <th className="px-2.5 py-2 text-right">Dossiers</th>
                  <th className="px-2.5 py-2 text-right">Total dû</th>
                  <th className="px-2.5 py-2 text-right">En retard</th>
                  <th className="px-2.5 py-2 text-right">Retard max</th>
                </tr>
              </thead>
              <tbody>
                {topRelanceRows.map((r) => (
                  <tr key={r.key} className="border-b border-black/6 last:border-b-0">
                    <td className="max-w-[220px] truncate px-2.5 py-2 font-semibold text-fs-text">{r.customerName}</td>
                    <td className="px-2.5 py-2 text-neutral-700">
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} className="font-semibold text-fs-accent underline-offset-2 hover:underline">
                          {r.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{r.openCount}</td>
                    <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{formatCurrency(r.totalDue)}</td>
                    <td className="px-2.5 py-2 text-right font-bold tabular-nums text-red-600">{formatCurrency(r.overdueDue)}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      {r.maxDelayDays > 0 ? `${r.maxDelayDays} j` : r.dueTodayDue > 0 ? "Aujourd'hui" : "A venir"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FsHorizontalScroll>
        )}
      </FsCard>

      {cancelledCreditMeta.count > 0 ? (
        <FsCard className="rounded-md sm:rounded-md mt-4 border-slate-200 bg-slate-50/80" padding="p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold">Créances neutralisées</span>
            <span>
              {cancelledCreditMeta.count} vente(s) annulée(s)/remboursée(s) retirée(s) automatiquement des crédits
            </span>
            <span className="font-bold text-slate-900">({formatCurrency(cancelledCreditMeta.amount)})</span>
          </div>
        </FsCard>
      ) : null}

      <FsCard className="rounded-md sm:rounded-md mt-6" padding="p-4">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-end min-[900px]:gap-x-3 min-[900px]:gap-y-2">
          <div className="relative w-full min-w-0 shrink-0 min-[900px]:w-72 min-[900px]:max-w-sm">
            <MdSearch
              className={cn(
                "pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2",
                isMainSearchStale ? "text-fs-accent" : "text-neutral-400",
              )}
              aria-hidden
            />
            <input
              className={cn(
                fsInputClass("h-11 w-full pl-10 text-sm"),
                isMainSearchStale && "ring-1 ring-fs-accent/35",
              )}
              placeholder="Client, téléphone, référence, montant, vendeur…"
              value={search}
              aria-busy={isMainSearchStale}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              aria-label="Recherche"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <select
              className={cn(
                fsInputClass("h-11 text-sm"),
                "w-full max-w-40 shrink-0 sm:max-w-44",
              )}
              value={sellerId}
              onChange={(e) => {
                setSellerId(e.target.value);
                setSalePage(0);
                setCustomerPage(0);
              }}
              aria-label="Vendeur"
            >
              <option value="">Tous vendeurs</option>
              {sellers.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex rounded-md border border-black/10 p-0.5 dark:border-white/10">
              <button
                type="button"
                onClick={() => setView("sale")}
                className={cn(
                  "min-h-[40px] rounded-md px-3 py-1.5 text-xs font-bold",
                  view === "sale" ? "bg-fs-accent text-white" : "text-neutral-600",
                )}
              >
                Par vente
              </button>
              <button
                type="button"
                onClick={() => setView("customer")}
                className={cn(
                  "min-h-[40px] rounded-md px-3 py-1.5 text-xs font-bold",
                  view === "customer" ? "bg-fs-accent text-white" : "text-neutral-600",
                )}
              >
                Par client
              </button>
              <button
                type="button"
                onClick={() => setView("repayments")}
                className={cn(
                  "min-h-[40px] rounded-md px-3 py-1.5 text-xs font-bold",
                  view === "repayments" ? "bg-fs-accent text-white" : "text-neutral-600",
                )}
              >
                Par jour
              </button>
            </div>
            <span className="inline-flex min-h-[40px] items-center rounded-md bg-fs-accent/10 px-2.5 text-xs font-bold text-fs-accent">
              Filtres actifs: {activeFilterCount}
            </span>
          </div>
        </div>
        <FsHorizontalScroll className="mt-3 -mx-1 px-1">
          <div className="flex w-max items-center gap-1.5 pb-0.5">
          {(
            [
              ["all", "Tous"],
              ["non_paye", "Non payés"],
              ["partiel", "Partiels"],
              ["en_retard", "En retard"],
              ["due_today", "Échéance jour"],
              ["due_week", "Échéance semaine"],
              ["soldes", "Soldés"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setChip(key);
                setSalePage(0);
                setCustomerPage(0);
              }}
              className={cn(
                "min-h-[34px] whitespace-nowrap rounded-md px-3 py-1 text-[11px] font-bold",
                chip === key
                  ? "bg-fs-accent text-white"
                  : "bg-fs-surface-container text-neutral-700 dark:text-neutral-200",
              )}
            >
              {label}
            </button>
          ))}
          </div>
        </FsHorizontalScroll>
        {chip === "soldes" ? (
          <p className="mt-2 text-xs text-neutral-600">
            Ventes passées à crédit (ligne POS « à crédit ») et bons dépôt à crédit entièrement soldés sur la période — ouvrez « Voir » pour l&apos;historique des paiements.
          </p>
        ) : null}
      </FsCard>

      {view === "repayments" ? (
        <CreditRepaymentsPanel
          companyId={companyId}
          storeId={effectiveStoreId}
          onOpenSaleDetail={(id) => setDetailId(id)}
        />
      ) : (
      <FsCard className="rounded-md sm:rounded-md mt-6 overflow-hidden p-0" padding="p-0">
        {creditQ.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : view === "sale" ? (
          <FsHorizontalScroll>
            <table
              className={cn(
                "w-full min-w-[1220px] border-collapse text-left text-[13px]",
                "[&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap",
              )}
            >
            <thead>
              <tr className="border-b border-black/10 bg-fs-surface-low/80 dark:border-white/10">
                <th className="px-3 py-3 font-bold">Réf.</th>
                <th className="px-3 py-3 font-bold">Source</th>
                <th className="px-3 py-3 font-bold">Client</th>
                <th className="px-3 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold">{terms.storeSingular}</th>
                <th className="px-3 py-3 text-right font-bold">Total</th>
                <th
                  className="px-3 py-3 text-right font-bold"
                  title="Encaissé au moment de la vente (n'est pas un remboursement de crédit)"
                >
                  Acompte
                </th>
                <th
                  className="px-3 py-3 text-right font-bold"
                  title="Encaissé après la vente, en recouvrement du crédit"
                >
                  Remboursé
                </th>
                <th className="px-3 py-3 text-right font-bold">Reste</th>
                <th className="px-3 py-3 font-bold">Échéance</th>
                <th className="px-3 py-3 font-bold">Statut</th>
                <th className="px-3 py-3 font-bold">Vendeur</th>
                <th className="px-3 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {saleTotalCount === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="whitespace-normal px-3 py-10 text-center text-neutral-500"
                  >
                    Aucune ligne pour ces filtres.
                  </td>
                </tr>
              ) : (
                <>
                  {paginatedSaleRows.map((saleTableRow) => {
                    if (saleTableRow.kind === "sale") {
                      const s = saleTableRow.row;
                      const st = creditLineStatus(s);
                      const rem = remainingTotal(s);
                      return (
                        <tr key={s.id} className="border-b border-black/6 hover:bg-black/2 dark:border-white/6">
                          <td className="max-w-[7.5rem] truncate px-3 py-2.5 font-mono font-semibold">
                            {s.sale_number}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                              Vente
                            </span>
                          </td>
                          <td className="max-w-[180px] truncate px-3 py-2.5">{s.customer?.name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-neutral-600">
                            {formatOperationDateTime(s.created_at)}
                          </td>
                          <td className="max-w-[130px] truncate px-3 py-2.5">{s.store?.name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(s.total)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {downPaymentTotal(s) > CREDIT_AMOUNT_EPS ? (
                              <span
                                className="font-semibold text-amber-700 dark:text-amber-300"
                                title="Encaissé au moment de la vente"
                              >
                                {formatCurrency(downPaymentTotal(s))}
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <span className="block text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(repaidAfterSaleTotal(s))}
                            </span>
                            {(() => {
                              const lp = lastPaymentLabel(maxRealizedPaymentDate(s));
                              if (!lp) return null;
                              return (
                                <span
                                  className={cn(
                                    "mt-0.5 block whitespace-nowrap text-[10px] font-semibold",
                                    lp.today ? "text-fs-accent" : "text-neutral-500",
                                  )}
                                  title="Dernier remboursement"
                                >
                                  {lp.today ? "Remb. aujourd'hui" : `Remb. ${lp.text}`}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold text-fs-accent">
                            {formatCurrency(rem)}
                          </td>
                          <td className={cn("px-3 py-2.5", dueTone(s))}>
                            <span className="inline-flex whitespace-nowrap">
                              {formatOperationDateTime(effectiveDueDate(s))}
                              {daysOverdue(s) > 0 ? (
                                <span className="ml-1 shrink-0 text-red-600">(+{daysOverdue(s)} j)</span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex max-w-[220px] items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                                statusPillClass(st),
                              )}
                              title={CREDIT_STATUS_LABELS[st]}
                            >
                              <span className="min-w-0 truncate">{CREDIT_STATUS_LABELS[st]}</span>
                            </span>
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-2.5 text-xs">{s.created_by_label}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-nowrap items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailId(s.id)}
                                className="whitespace-nowrap rounded-md bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                              >
                                Voir
                              </button>
                              {canRecordPayment && rem > CREDIT_AMOUNT_EPS ? (
                                <button
                                  type="button"
                                  title="Enregistrer un paiement"
                                  onClick={() => setPaySale(s)}
                                  className="whitespace-nowrap rounded-md bg-fs-accent px-2 py-1 text-xs font-bold text-white"
                                >
                                  Encaisser
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const d = saleTableRow.row;
                    const hasBalance = d.remainingAmount > CREDIT_AMOUNT_EPS;
                    const hasEncaisse = d.paidAmount > CREDIT_AMOUNT_EPS;
                    const status: CreditLineStatus = !hasBalance
                      ? "solde"
                      : hasEncaisse
                        ? "partiel"
                        : "non_paye";
                    return (
                      <tr key={`dispatch-${d.id}`} className="border-b border-black/6 hover:bg-black/2 dark:border-white/6">
                        <td className="max-w-[7.5rem] truncate px-3 py-2.5 font-mono font-semibold">{d.documentNumber}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                            Bon dépôt
                          </span>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2.5">{d.customerName ?? "—"}</td>
                        <td className="px-3 py-2.5 text-neutral-600">
                          {formatOperationDateTime(d.createdAt)}
                        </td>
                        <td className="max-w-[130px] truncate px-3 py-2.5">Dépôt</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(d.totalAmount)}</td>
                        {/* Un bon dépôt n'a pas d'acompte de caisse : tout encaissement est un règlement. */}
                        <td className="px-3 py-2.5 text-right text-neutral-400">—</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(d.paidAmount)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-fs-accent">
                          {formatCurrency(d.remainingAmount)}
                        </td>
                        <td className="px-3 py-2.5 text-neutral-500">—</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex max-w-[220px] items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                              statusPillClass(status),
                            )}
                            title={CREDIT_STATUS_LABELS[status]}
                          >
                            <span className="min-w-0 truncate">{CREDIT_STATUS_LABELS[status]}</span>
                          </span>
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-2.5 text-xs">{d.createdByLabel}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-nowrap items-center justify-end gap-1">
                            <Link
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setDispatchDetailId(d.id);
                              }}
                              className="whitespace-nowrap rounded-md bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                            >
                              Voir
                            </Link>
                            {canRecordPayment && d.remainingAmount > CREDIT_AMOUNT_EPS ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setDispatchPayInvoice({
                                    id: d.id,
                                    documentNumber: d.documentNumber,
                                    totalAmount: d.totalAmount,
                                    paidAmount: d.paidAmount,
                                    remainingAmount: d.remainingAmount,
                                  })
                                }
                                className="whitespace-nowrap rounded-md bg-fs-accent px-2 py-1 text-xs font-bold text-white"
                              >
                                Encaisser
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
          </FsHorizontalScroll>
        ) : (
          <FsHorizontalScroll>
            <table
              className={cn(
                "w-full min-w-[800px] border-collapse text-left text-[13px]",
                "[&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap",
              )}
            >
            <thead>
              <tr className="border-b border-black/10 bg-fs-surface-low/80 dark:border-white/10">
                <th className="px-3 py-3 font-bold">Client</th>
                <th className="px-3 py-3 font-bold">Tél.</th>
                <th className="px-3 py-3 font-bold">Crédits</th>
                <th className="px-3 py-3 text-right font-bold">Total dû</th>
                <th className="px-3 py-3 text-right font-bold">En retard</th>
                <th className="px-3 py-3 font-bold">Dernier paiement</th>
                <th className="px-3 py-3 font-bold">Proch. échéance</th>
                <th className="px-3 py-3 font-bold">Risque</th>
                <th className="px-3 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {customerRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="whitespace-normal px-3 py-10 text-center text-neutral-500"
                  >
                    Aucun client débiteur pour ces filtres.
                  </td>
                </tr>
              ) : (
                paginatedCustomerRows.map((c) => (
                  <tr
                    key={c.customerId}
                    className="cursor-pointer border-b border-black/6 hover:bg-black/2 dark:border-white/6 dark:hover:bg-white/5"
                    onClick={() => setCustomerDetailId(c.customerId)}
                    title="Voir tous les crédits de ce client"
                  >
                    <td className="max-w-[200px] truncate px-3 py-2.5 font-semibold">{c.customerName}</td>
                    <td className="max-w-[9rem] truncate px-3 py-2.5">
                      {c.phone ? (
                        <a
                          className="text-fs-accent hover:underline"
                          href={`tel:${c.phone}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{c.openSaleCount}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{formatCurrency(c.totalDue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600">
                      {formatCurrency(c.overdueAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-neutral-600">
                      {c.lastPaymentAt
                        ? formatOperationDateTime(c.lastPaymentAt)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {c.nextDueAt
                        ? formatOperationDateTime(c.nextDueAt)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
                          c.risk === "critique"
                            ? "bg-red-500/20 text-red-800 dark:text-red-300"
                            : c.risk === "attention"
                              ? "bg-amber-500/20 text-amber-800 dark:text-amber-200"
                              : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                        )}
                      >
                        {c.risk === "critique" ? "Critique" : c.risk === "attention" ? "Attention" : "Normal"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCustomerDetailId(c.customerId);
                          }}
                          className="inline-flex whitespace-nowrap rounded-md bg-fs-accent px-2 py-1 text-xs font-bold text-white"
                        >
                          Détail
                        </button>
                        <Link
                          href={ROUTES.customers}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex whitespace-nowrap rounded-md bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                        >
                          Clients
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </FsHorizontalScroll>
        )}
      </FsCard>
      )}
      {view === "sale" && salePageCount > 1 ? (
        <FsCard className="rounded-md sm:rounded-md mt-4" padding="px-4 py-3 sm:py-3">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {!isPaginationNarrow ? (
              <span className="mr-2 text-xs text-neutral-600">
                {safeSalePage * CREDIT_PAGE_SIZE + 1} –{" "}
                {Math.min((safeSalePage + 1) * CREDIT_PAGE_SIZE, saleTotalCount)} sur {saleTotalCount}
              </span>
            ) : null}
            <button
              type="button"
              disabled={safeSalePage <= 0}
              onClick={() => setSalePage((p) => Math.max(0, p - 1))}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40",
                safeSalePage > 0 ? "bg-fs-accent" : "bg-neutral-300 dark:bg-neutral-600",
              )}
              aria-label="Page précédente"
            >
              <MdChevronLeft className="h-7 w-7" aria-hidden />
            </button>
            <span className="text-sm font-semibold text-fs-text">
              Page {safeSalePage + 1}
              {" / "}
              {salePageCount}
            </span>
            <button
              type="button"
              disabled={safeSalePage >= salePageCount - 1}
              onClick={() => setSalePage((p) => Math.min(salePageCount - 1, p + 1))}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40",
                safeSalePage < salePageCount - 1 ? "bg-fs-accent" : "bg-neutral-300 dark:bg-neutral-600",
              )}
              aria-label="Page suivante"
            >
              <MdChevronRight className="h-7 w-7" aria-hidden />
            </button>
            {isPaginationNarrow ? (
              <span className="w-full text-center text-xs text-neutral-600 sm:w-auto">
                {safeSalePage * CREDIT_PAGE_SIZE + 1} –{" "}
                {Math.min((safeSalePage + 1) * CREDIT_PAGE_SIZE, saleTotalCount)}
                {" / "}
                {saleTotalCount}
              </span>
            ) : null}
          </div>
        </FsCard>
      ) : null}
      {view === "customer" && customerPageCount > 1 ? (
        <FsCard className="rounded-md sm:rounded-md mt-4" padding="px-4 py-3 sm:py-3">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {!isPaginationNarrow ? (
              <span className="mr-2 text-xs text-neutral-600">
                {safeCustomerPage * CREDIT_PAGE_SIZE + 1} –{" "}
                {Math.min((safeCustomerPage + 1) * CREDIT_PAGE_SIZE, customerTotalCount)} sur{" "}
                {customerTotalCount}
              </span>
            ) : null}
            <button
              type="button"
              disabled={safeCustomerPage <= 0}
              onClick={() => setCustomerPage((p) => Math.max(0, p - 1))}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40",
                safeCustomerPage > 0 ? "bg-fs-accent" : "bg-neutral-300 dark:bg-neutral-600",
              )}
              aria-label="Page précédente"
            >
              <MdChevronLeft className="h-7 w-7" aria-hidden />
            </button>
            <span className="text-sm font-semibold text-fs-text">
              Page {safeCustomerPage + 1}
              {" / "}
              {customerPageCount}
            </span>
            <button
              type="button"
              disabled={safeCustomerPage >= customerPageCount - 1}
              onClick={() => setCustomerPage((p) => Math.min(customerPageCount - 1, p + 1))}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40",
                safeCustomerPage < customerPageCount - 1
                  ? "bg-fs-accent"
                  : "bg-neutral-300 dark:bg-neutral-600",
              )}
              aria-label="Page suivante"
            >
              <MdChevronRight className="h-7 w-7" aria-hidden />
            </button>
            {isPaginationNarrow ? (
              <span className="w-full text-center text-xs text-neutral-600 sm:w-auto">
                {safeCustomerPage * CREDIT_PAGE_SIZE + 1} –{" "}
                {Math.min((safeCustomerPage + 1) * CREDIT_PAGE_SIZE, customerTotalCount)}
                {" / "}
                {customerTotalCount}
              </span>
            ) : null}
          </div>
        </FsCard>
      ) : null}

      <LegacyCreditSection
        companyId={companyId}
        companyName={companyName}
        storeId={effectiveStoreId}
        from={from}
        to={to}
        canRecordPayment={canRecordPayment}
        isOwner={isOwner}
        tableSearch={deferredSearch}
        creditFilterResetNonce={creditFilterResetNonce}
        creditSaleRows={rawRows}
        sellerId={sellerId}
        onOpenSaleDetail={(saleId) => setDetailId(saleId)}
      />

      <p className="mt-6 text-center text-xs text-neutral-500">
        Après encaissement sur cette page, un reçu de remboursement PDF est proposé ; depuis{" "}
        <Link href={ROUTES.sales} className="font-semibold text-fs-accent underline-offset-2 hover:underline">
          Ventes
        </Link>{" "}
        vous pouvez aussi imprimer ticket ou facture. Rappels SMS / WhatsApp : à brancher côté intégration.
      </p>

      <CustomerCreditPanel
        customerId={customerDetailId}
        allSales={rawRows}
        canRecordPayment={canRecordPayment}
        onClose={() => setCustomerDetailId(null)}
        onOpenSaleDetail={(saleId) => setDetailId(saleId)}
        onPay={(sale) => setPaySale(sale)}
      />

      <CreditDetailPanel
        saleId={detailId}
        onClose={() => setDetailId(null)}
        creditQueryKey={queryKeys.creditSales(creditParams)}
      />

      <CreditCashedInDialog
        open={cashedInOpen}
        rows={rawRows}
        legacyPaidTotal={legacyPaidTotal}
        periodLabel={`Du ${from} au ${to} · ${storeFilter ? stores.find((s) => s.id === storeFilter)?.name ?? "Boutique" : "Toutes boutiques"}`}
        onClose={() => setCashedInOpen(false)}
        onOpenSaleDetail={(saleId) => setDetailId(saleId)}
      />

      <CreditQuickPayDialog
        key={paySale?.id ?? "credit-pay-closed"}
        sale={paySale}
        open={paySale !== null}
        onClose={() => setPaySale(null)}
        companyId={companyId}
        companyName={companyName}
      />

      {dispatchDetailId ? (
        <div className="fixed inset-0 z-56 flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4" role="dialog">
          <div className="flex max-h-[min(88dvh,640px)] w-full flex-col rounded-t-lg bg-fs-surface shadow-2xl sm:max-h-[85vh] sm:max-w-lg sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
              <h2 className="text-base font-bold">Bon de sortie</h2>
              <button type="button" onClick={() => setDispatchDetailId(null)} className="p-2" aria-label="Fermer">
                <MdClose className="h-6 w-6" />
              </button>
            </div>
            {dispatchDetailQ.isLoading ? (
              <div className="flex min-h-[160px] items-center justify-center">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
              </div>
            ) : null}
            {dispatchDetailQ.data ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {(() => {
                  const d = dispatchDetailQ.data;
                  const sub = d.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
                  return (
                    <>
                      <p className="text-lg font-bold">{d.documentNumber}</p>
                      <p className="mt-1 text-sm text-neutral-600">{formatOperationDateTime(d.createdAt)}</p>
                      <p className="mt-2 text-sm">
                        Client : {d.customerName ?? "—"}
                        {d.customerPhone ? ` · ${d.customerPhone}` : ""}
                      </p>
                      {humanDispatchNote(d.notes, sub) ? (
                        <p className="mt-2 text-xs text-neutral-600">{humanDispatchNote(d.notes, sub)}</p>
                      ) : null}
                      <div className="mt-4 space-y-2">
                        {d.lines.map((l, i) => (
                          <div key={i} className="flex justify-between gap-2 rounded-md border border-black/6 px-3 py-2 text-sm">
                            <span className="min-w-0 font-medium">{l.productName}</span>
                            <span className="shrink-0 text-neutral-600">
                              {l.quantity} × {formatCurrency(l.unitPrice)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 text-right text-base font-bold">Total {formatCurrency(sub)}</p>
                      {canRecordPayment ? (
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const info = parseDispatchPaymentInfo(d.notes, sub);
                              const paidAmount = Math.max(0, Math.round(info.paidAmount));
                              const remainingAmount = Math.max(0, Math.round(sub - paidAmount));
                              if (remainingAmount <= CREDIT_AMOUNT_EPS) return;
                              setDispatchPayInvoice({
                                id: d.id,
                                documentNumber: d.documentNumber,
                                totalAmount: Math.round(sub),
                                paidAmount,
                                remainingAmount,
                              });
                            }}
                            disabled={Math.max(0, Math.round(sub - parseDispatchPaymentInfo(d.notes, sub).paidAmount)) <= CREDIT_AMOUNT_EPS}
                            className={cn(
                              "inline-flex rounded-md px-3 py-1.5 text-xs font-bold text-white",
                              Math.max(0, Math.round(sub - parseDispatchPaymentInfo(d.notes, sub).paidAmount)) <= CREDIT_AMOUNT_EPS
                                ? "cursor-not-allowed bg-neutral-300 text-neutral-600"
                                : "bg-fs-accent",
                            )}
                          >
                            Encaisser
                          </button>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <DispatchCreditPayDialog
        open={dispatchPayInvoice !== null}
        invoice={dispatchPayInvoice}
        loading={dispatchPayMut.isPending}
        onClose={() => setDispatchPayInvoice(null)}
        onSubmit={async (payload) => {
          if (!dispatchPayInvoice) return;
          const rem = Math.max(0, Math.round(dispatchPayInvoice.remainingAmount));
          const tendered =
            payload.method === "cash" && payload.amount != null
              ? Math.round(payload.amount)
              : rem;
          const applied = payload.method === "cash" ? Math.min(tendered, rem) : rem;
          const changeDue = payload.method === "cash" ? Math.max(0, tendered - applied) : 0;
          await dispatchPayMut.mutateAsync({
            invoiceId: dispatchPayInvoice.id,
            method: payload.method,
            amount: payload.amount,
            mobileProvider: payload.mobileProvider,
          });
          if (changeDue > 0) {
            toast.success(`Paiement enregistré. Monnaie à rendre : ${formatCurrency(changeDue)}.`);
          } else {
            toast.success("Paiement enregistré.");
          }
        }}
      />
    </FsPage>
  );
}

type DispatchCreditPayDialogProps = {
  open: boolean;
  invoice: {
    id: string;
    documentNumber: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  } | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    method: "cash" | "mobile_money" | "card";
    amount?: number | null;
    mobileProvider?: "orange_money" | "moov_money" | "wave" | null;
  }) => Promise<void>;
};

function DispatchCreditPayDialog({ open, invoice, loading, onClose, onSubmit }: DispatchCreditPayDialogProps) {
  const [method, setMethod] = useState<"cash" | "mobile_money" | "card">("cash");
  const [amountText, setAmountText] = useState("");
  const [mobileProvider, setMobileProvider] = useState<"orange_money" | "moov_money" | "wave">("orange_money");

  useEffect(() => {
    if (!open || !invoice) return;
    setMethod("cash");
    setAmountText("");
    setMobileProvider("orange_money");
  }, [open, invoice]);

  if (!open || !invoice) return null;

  const remaining = Math.max(0, Math.round(invoice.remainingAmount));
  const parsedAmount = Number(amountText.replace(/\s+/g, ""));
  const tendered = Number.isFinite(parsedAmount) ? Math.round(parsedAmount) : NaN;
  const appliedToBalance =
    Number.isFinite(tendered) && tendered > 0 ? Math.min(tendered, remaining) : NaN;
  const changeDue =
    Number.isFinite(tendered) && Number.isFinite(appliedToBalance)
      ? Math.max(0, tendered - appliedToBalance)
      : 0;
  const isCash = method === "cash";
  const cashValid = isCash && tendered > 0 && Number.isFinite(tendered);
  const canSubmit = loading ? false : isCash ? cashValid : remaining > CREDIT_AMOUNT_EPS;

  return (
    <div className="fixed inset-0 z-58 flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4" role="dialog">
      <div className="w-full rounded-t-lg bg-fs-surface shadow-2xl sm:max-w-md sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
          <div>
            <p className="text-sm text-neutral-500">Encaisser bon dépôt</p>
            <p className="font-mono text-sm font-semibold">{invoice.documentNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2" aria-label="Fermer" disabled={loading}>
            <MdClose className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="rounded-md border border-black/8 bg-fs-surface-low/70 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Total</span>
              <span className="font-semibold">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-neutral-600">Déjà encaissé</span>
              <span className="font-semibold text-emerald-700">{formatCurrency(invoice.paidAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-neutral-600">Reste</span>
              <span className="font-bold text-fs-accent">{formatCurrency(remaining)}</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Méthode</label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { id: "cash", label: "Espèces" },
                { id: "mobile_money", label: "Mobile Money" },
                { id: "card", label: "Carte" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id as "cash" | "mobile_money" | "card")}
                  className={cn(
                    "rounded-md border px-2 py-2 font-bold transition",
                    method === m.id
                      ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                      : "border-black/8 bg-white text-neutral-700 hover:bg-black/2",
                  )}
                  disabled={loading}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {method === "mobile_money" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-700">Opérateur</label>
              <select
                className={cn(fsInputClass(), "h-10 text-sm")}
                value={mobileProvider}
                onChange={(e) => setMobileProvider(e.target.value as "orange_money" | "moov_money" | "wave")}
                disabled={loading}
              >
                <option value="orange_money">Orange Money</option>
                <option value="moov_money">Moov Money</option>
                <option value="wave">Wave</option>
              </select>
            </div>
          ) : null}

          {isCash ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-700">Montant reçu (F CFA)</label>
              <input
                className={cn(fsInputClass(), "h-10 text-sm")}
                inputMode="numeric"
                placeholder={`Reste ${remaining}`}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/[^\d]/g, ""))}
                disabled={loading}
              />
              {cashValid ? (
                <p className="mt-1 text-[11px] text-neutral-600">
                  Imputé au bon :{" "}
                  <span className="font-semibold text-fs-text">{formatCurrency(appliedToBalance)}</span>
                  {changeDue > 0 ? (
                    <>
                      {" "}
                      · Monnaie à rendre :{" "}
                      <span className="font-bold text-[#F97316]">{formatCurrency(changeDue)}</span>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-red-600">Saisissez le montant reçu en espèces.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-neutral-600">Cette methode solde le bon en totalite.</p>
          )}
        </div>

        <div className="flex gap-2 border-t border-black/6 px-4 pb-[max(1rem,var(--fs-safe-bottom))] pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-md border border-black/10 px-3 py-2 text-sm font-semibold text-neutral-700"
          >
            Fermer
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              void onSubmit({
                method,
                amount: isCash ? tendered : null,
                mobileProvider: method === "mobile_money" ? mobileProvider : null,
              })
            }
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-bold text-white",
              canSubmit ? "bg-fs-accent" : "cursor-not-allowed bg-neutral-300 text-neutral-500",
            )}
          >
            {loading ? "Enregistrement..." : "Valider encaissement"}
          </button>
        </div>
      </div>
    </div>
  );
}
