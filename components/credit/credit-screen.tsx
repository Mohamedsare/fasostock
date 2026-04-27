"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MdAccountBalanceWallet,
  MdCalendarToday,
  MdDateRange,
  MdDownload,
  MdLock,
  MdPayments,
  MdPeople,
  MdReceiptLong,
  MdRefresh,
  MdSearch,
  MdShoppingCart,
  MdWarningAmber,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { listCreditSales } from "@/lib/features/credit/api";
import {
  buildCustomerAggregates,
  CREDIT_AMOUNT_EPS,
  creditLineStatus,
  CREDIT_STATUS_LABELS,
  daysOverdue,
  dueBadgeVariant,
  effectiveDueDate,
  isDueThisWeek,
  isDueToday,
  paidTotal,
  remainingTotal,
} from "@/lib/features/credit/credit-math";
import type { CreditLineStatus, CreditSaleRow } from "@/lib/features/credit/types";
import { listLegacyCredits } from "@/lib/features/credit/legacy-api";
import { listWarehouseDispatchInvoices } from "@/lib/features/warehouse/api";
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
import { CreditDetailPanel } from "./credit-detail-panel";
import { CreditQuickPayDialog } from "./credit-quick-pay-dialog";
import { LegacyCreditSection } from "./legacy-credit-section";

type QuickChip =
  | "all"
  | "non_paye"
  | "partiel"
  | "en_retard"
  | "due_today"
  | "due_week";

const DISPATCH_PAYMENT_NOTE_PREFIX = "__PAYMENT_INFO__:";
type DispatchPaymentMode = "cash" | "mobile_money" | "card" | "credit";

function parseDispatchPaymentInfo(note: string | null, totalAmount: number): {
  mode: DispatchPaymentMode;
  paidAmount: number;
} {
  const raw = (note ?? "").trim();
  if (!raw.startsWith(DISPATCH_PAYMENT_NOTE_PREFIX)) {
    return { mode: "credit", paidAmount: 0 };
  }
  const payloadRaw = raw.slice(DISPATCH_PAYMENT_NOTE_PREFIX.length).trim();
  try {
    const payload = JSON.parse(payloadRaw) as { mode?: DispatchPaymentMode; paid_amount?: number };
    const mode = payload.mode;
    const paidRaw = Number(payload.paid_amount ?? 0);
    if (mode === "cash" || mode === "mobile_money" || mode === "card" || mode === "credit") {
      const paidAmount =
        mode === "cash"
          ? Math.min(totalAmount, Math.max(0, Math.round(Number.isFinite(paidRaw) ? paidRaw : 0)))
          : mode === "credit"
            ? 0
            : totalAmount;
      return { mode, paidAmount };
    }
  } catch {
    const mode = payloadRaw as DispatchPaymentMode;
    if (mode === "cash" || mode === "mobile_money" || mode === "card" || mode === "credit") {
      return { mode, paidAmount: mode === "credit" ? 0 : totalAmount };
    }
  }
  return { mode: "credit", paidAmount: 0 };
}

function toIsoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function formatDateFr(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return format(d, "d MMM yyyy", { locale: fr });
}

function KpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  colorClass,
  accentBorder,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  colorClass: string;
  accentBorder?: boolean;
}) {
  return (
    <FsCard
      padding="p-4"
      className={cn(
        "flex min-h-[120px] flex-col justify-between",
        accentBorder && "border-2 border-fs-accent/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-xs text-neutral-600 min-[900px]:text-sm">{label}</p>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
            colorClass,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      <div>
        <p className="text-base font-bold text-fs-text min-[900px]:text-lg">{value}</p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-500">{subtitle}</p>
        ) : null}
      </div>
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
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h, hasPermission } = usePermissions();
  const canExport = hasPermission(P.salesView);
  const canRecordPayment = hasPermission(P.salesUpdate);
  const isOwner = h?.isOwner ?? false;
  const isWide = useMediaQuery("(min-width: 900px)");

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
  const [sellerId, setSellerId] = useState("");
  const [chip, setChip] = useState<QuickChip>("all");
  const [view, setView] = useState<"sale" | "customer">("sale");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paySale, setPaySale] = useState<CreditSaleRow | null>(null);

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

  const rawRows = creditQ.data ?? [];
  const legacyQ = useQuery({
    queryKey: queryKeys.legacyCredits(creditParams),
    queryFn: () => listLegacyCredits(creditParams),
    enabled: !!companyId && !!h?.canCredit,
    staleTime: 15_000,
  });
  const legacyRows = legacyQ.data ?? [];
  const dispatchQ = useQuery({
    queryKey: ["credit-warehouse-dispatch", companyId, from, to],
    queryFn: () => listWarehouseDispatchInvoices(companyId, 500),
    enabled: !!companyId && !!h?.canCredit,
    staleTime: 15_000,
  });
  const dispatchRowsRaw = dispatchQ.data ?? [];
  const dispatchCreditRows = useMemo(() => {
    const fromMs = Date.parse(`${from}T00:00:00.000Z`);
    const toMs = Date.parse(`${to}T23:59:59.999Z`);
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

  const openRows = useMemo(
    () => rawRows.filter((s) => remainingTotal(s) > CREDIT_AMOUNT_EPS),
    [rawRows],
  );

  const sellers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of openRows) {
      m.set(r.created_by, r.created_by_label ?? r.created_by);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [openRows]);

  const kpiBase = useMemo(() => {
    let totalRem = 0;
    let totalPaidOpen = 0;
    let totalPaidAll = 0;
    let totalSaleTotal = 0;
    let overdue = 0;
    let dueToday = 0;
    let dueWeek = 0;
    const debtors = new Set<string>();
    for (const s of rawRows) {
      totalPaidAll += paidTotal(s);
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
    for (const d of dispatchCreditRows) {
      totalPaidAll += d.paidAmount;
      totalSaleTotal += d.totalAmount;
      if (d.remainingAmount <= CREDIT_AMOUNT_EPS) continue;
      totalRem += d.remainingAmount;
      totalPaidOpen += d.paidAmount;
      if (d.customerId) debtors.add(d.customerId);
    }
    return {
      totalRem,
      totalPaidOpen,
      totalPaidAll,
      totalSaleTotal,
      countOpen: openRows.length + dispatchCreditRows.filter((d) => d.remainingAmount > CREDIT_AMOUNT_EPS).length,
      debtors: debtors.size,
      overdue,
      dueToday,
      dueWeek,
    };
  }, [rawRows, openRows, legacyRows, dispatchCreditRows]);

  /**
   * Filtres rapides : basés sur encaissements réels vs reste (pas uniquement le statut affiché,
   * car « en retard » + partiel peut aussi matcher « Partiels » / « Non payés »).
   */
  const matchesChip = (s: CreditSaleRow): boolean => {
    const rem = remainingTotal(s);
    const paid = paidTotal(s);
    const hasBalance = rem > CREDIT_AMOUNT_EPS;
    const hasEncaisse = paid > CREDIT_AMOUNT_EPS;
    switch (chip) {
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
  };

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = openRows.filter((s) => {
      if (sellerId && s.created_by !== sellerId) return false;
      if (!matchesChip(s)) return false;
      if (!q) return true;
      const num = q.replace(/\s/g, "");
      return (
        (s.sale_number ?? "").toLowerCase().includes(q) ||
        (s.customer?.name ?? "").toLowerCase().includes(q) ||
        (s.customer?.phone ?? "").replace(/\s/g, "").includes(num) ||
        String(s.total).includes(q) ||
        (s.created_by_label ?? "").toLowerCase().includes(q)
      );
    });
    rows.sort((a, b) => {
      const db = daysOverdue(b);
      const da = daysOverdue(a);
      if (db !== da) return db - da;
      return remainingTotal(b) - remainingTotal(a);
    });
    return rows;
  }, [openRows, search, sellerId, chip]);

  const customerRows = useMemo(() => buildCustomerAggregates(filteredSales), [filteredSales]);

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
            subtitle: `${filteredSales.length} vente(s) · ${format(new Date(), "PPP", { locale: fr })}`,
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
        <FsCard padding="p-8">
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
        <FsCard className="mb-6 border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/40" padding="p-4">
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

      <FsCard className="mb-6" padding="p-3 sm:p-3.5">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
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
                "h-8 w-52 min-w-0 max-w-full py-0! text-xs sm:py-0! sm:text-xs",
              )}
              value={storeFilter}
              onChange={(e) => {
                allStoresChosen.current = e.target.value !== (currentStoreId ?? "");
                setStoreFilter(e.target.value);
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

          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-1">
            <label className="sr-only" htmlFor="credit-from">
              Du
            </label>
            <input
              id="credit-from"
              type="date"
              className={fsInputClass(
                "h-8 w-37 max-w-full shrink-0 py-0! text-xs sm:py-0! sm:text-xs",
              )}
              value={from}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (to < v) setTo(v);
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
                "h-8 w-37 max-w-full shrink-0 py-0! text-xs sm:py-0! sm:text-xs",
              )}
              value={to}
              onChange={(e) => {
                const v = e.target.value;
                setTo(v);
                if (from > v) setFrom(v);
              }}
            />
            <span className="min-w-0 max-w-full text-[10px] text-neutral-500 sm:text-[11px] sm:whitespace-nowrap">
              ({formatDateFr(from)} — {formatDateFr(to)})
            </span>
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => void creditQ.refetch()}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/10 bg-fs-surface-container px-2.5 text-xs font-semibold dark:border-white/10"
            >
              <MdRefresh className={cn("h-4 w-4 shrink-0", creditQ.isFetching && "animate-spin")} aria-hidden />
              Actualiser
            </button>
            {canExport ? (
              <button
                type="button"
                onClick={() => exportSalesExcel()}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/10 bg-fs-surface-container px-2.5 text-xs font-semibold dark:border-white/10"
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
          subtitle="Tous dossiers"
          icon={MdPayments}
          colorClass="bg-emerald-500/15 text-emerald-600"
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
      </div>

      <FsCard className="mt-4" padding="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-fs-text">Crédits dépôt (Facture / Sortie)</p>
          <span className="rounded-full bg-fs-accent/10 px-2 py-0.5 text-xs font-bold text-fs-accent">
            Traçabilité séparée
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs text-neutral-700 min-[900px]:grid-cols-3">
          <p>
            Dossiers: <span className="font-bold">{dispatchCreditRows.length}</span>
          </p>
          <p>
            Restant:{" "}
            <span className="font-bold text-fs-accent">
              {formatCurrency(
                dispatchCreditRows.reduce((s, r) => s + (r.remainingAmount > CREDIT_AMOUNT_EPS ? r.remainingAmount : 0), 0),
              )}
            </span>
          </p>
          <p>
            Déjà encaissé:{" "}
            <span className="font-bold text-emerald-700">
              {formatCurrency(dispatchCreditRows.reduce((s, r) => s + r.paidAmount, 0))}
            </span>
          </p>
        </div>
      </FsCard>

      <FsCard className="mt-6" padding="p-4">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
          <div className="relative min-w-0 flex-1">
            <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
            <input
              className={fsInputClass("w-full pl-10 text-sm")}
              placeholder="Client, téléphone, référence, montant, vendeur…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className={fsInputClass("text-sm")}
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              aria-label="Vendeur"
            >
              <option value="">Tous vendeurs</option>
              {sellers.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex rounded-xl border border-black/10 p-0.5 dark:border-white/10">
              <button
                type="button"
                onClick={() => setView("sale")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold",
                  view === "sale" ? "bg-fs-accent text-white" : "text-neutral-600",
                )}
              >
                Par vente
              </button>
              <button
                type="button"
                onClick={() => setView("customer")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold",
                  view === "customer" ? "bg-fs-accent text-white" : "text-neutral-600",
                )}
              >
                Par client
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Tous"],
              ["non_paye", "Non payés"],
              ["partiel", "Partiels"],
              ["en_retard", "En retard"],
              ["due_today", "Échéance jour"],
              ["due_week", "Échéance semaine"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setChip(key)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-bold",
                chip === key
                  ? "bg-fs-accent text-white"
                  : "bg-fs-surface-container text-neutral-700 dark:text-neutral-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </FsCard>

      <FsCard className="mt-6 overflow-hidden p-0" padding="p-0">
        {creditQ.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : view === "sale" ? (
          <div className="overflow-x-auto">
            <table
              className={cn(
                "w-full min-w-[1000px] border-collapse text-left text-[13px]",
                "[&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap",
              )}
            >
            <thead>
              <tr className="border-b border-black/10 bg-fs-surface-low/80 dark:border-white/10">
                <th className="px-3 py-3 font-bold">Réf.</th>
                <th className="px-3 py-3 font-bold">Client</th>
                <th className="px-3 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold">{terms.storeSingular}</th>
                <th className="px-3 py-3 text-right font-bold">Total</th>
                <th className="px-3 py-3 text-right font-bold">Encaissé</th>
                <th className="px-3 py-3 text-right font-bold">Reste</th>
                <th className="px-3 py-3 font-bold">Échéance</th>
                <th className="px-3 py-3 font-bold">Statut</th>
                <th className="px-3 py-3 font-bold">Vendeur</th>
                <th className="px-3 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="whitespace-normal px-3 py-10 text-center text-neutral-500"
                  >
                    Aucune ligne pour ces filtres.
                  </td>
                </tr>
              ) : (
                filteredSales.map((s) => {
                  const st = creditLineStatus(s);
                  const rem = remainingTotal(s);
                  return (
                    <tr key={s.id} className="border-b border-black/6 hover:bg-black/2 dark:border-white/6">
                      <td className="max-w-[7.5rem] truncate px-3 py-2.5 font-mono font-semibold">
                        {s.sale_number}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5">{s.customer?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-neutral-600">
                        {format(new Date(s.created_at), "dd/MM/yyyy", { locale: fr })}
                      </td>
                      <td className="max-w-[130px] truncate px-3 py-2.5">{s.store?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(s.total)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(paidTotal(s))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-fs-accent">
                        {formatCurrency(rem)}
                      </td>
                      <td className={cn("px-3 py-2.5", dueTone(s))}>
                        <span className="inline-flex whitespace-nowrap">
                          {format(effectiveDueDate(s), "dd/MM/yyyy", { locale: fr })}
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
                            className="whitespace-nowrap rounded-lg bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                          >
                            Voir
                          </button>
                          {canRecordPayment && rem > CREDIT_AMOUNT_EPS ? (
                            <button
                              type="button"
                              title="Enregistrer un paiement"
                              onClick={() => setPaySale(s)}
                              className="whitespace-nowrap rounded-lg bg-fs-accent px-2 py-1 text-xs font-bold text-white"
                            >
                              Encaisser
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                customerRows.map((c) => (
                  <tr key={c.customerId} className="border-b border-black/6 dark:border-white/6">
                    <td className="max-w-[200px] truncate px-3 py-2.5 font-semibold">{c.customerName}</td>
                    <td className="max-w-[9rem] truncate px-3 py-2.5">
                      {c.phone ? (
                        <a className="text-fs-accent hover:underline" href={`tel:${c.phone}`}>
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
                        ? format(new Date(c.lastPaymentAt), "dd/MM/yyyy", { locale: fr })
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {c.nextDueAt
                        ? format(new Date(c.nextDueAt), "dd/MM/yyyy", { locale: fr })
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
                      <Link
                        href={ROUTES.customers}
                        className="inline-flex whitespace-nowrap rounded-lg bg-fs-accent/15 px-2 py-1 text-xs font-bold text-fs-accent"
                      >
                        Clients
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        )}
      </FsCard>

      <LegacyCreditSection
        companyId={companyId}
        companyName={companyName}
        storeId={effectiveStoreId}
        from={from}
        to={to}
        canRecordPayment={canRecordPayment}
        isOwner={isOwner}
      />

      <p className="mt-6 text-center text-xs text-neutral-500">
        Reçu après paiement : utilisez le détail vente depuis{" "}
        <Link href={ROUTES.sales} className="font-semibold text-fs-accent underline-offset-2 hover:underline">
          Ventes
        </Link>{" "}
        (impression ticket / facture). Rappels SMS / WhatsApp : à brancher côté intégration.
      </p>

      <CreditDetailPanel
        saleId={detailId}
        onClose={() => setDetailId(null)}
        creditQueryKey={queryKeys.creditSales(creditParams)}
      />

      <CreditQuickPayDialog sale={paySale} open={paySale !== null} onClose={() => setPaySale(null)} />
    </FsPage>
  );
}
