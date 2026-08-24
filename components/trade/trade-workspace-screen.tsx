"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MdArrowForward, MdPointOfSale, MdWarningAmber } from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
} from "@/components/ui/fs-screen-primitives";
import { NAV_ITEMS } from "@/lib/config/navigation";
import { ROUTES } from "@/lib/config/routes";
import { getBusinessTypeBySlug } from "@/lib/config/business-types";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { fetchDashboardData } from "@/lib/features/dashboard/api";
import {
  TRADE_POS_ACTION,
  tradeWorkspace,
  type TradeQuickAction,
} from "@/lib/features/activity/trade-workspaces";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { operationTodayYmd } from "@/lib/utils/operation-datetime";

/** Icône du menu correspondant à une destination (cohérence visuelle avec la barre latérale). */
function iconForHref(href: string) {
  return NAV_ITEMS.find((i) => i.href === href)?.icon;
}

export function TradeWorkspaceScreen() {
  const ctx = useAppContext();
  const router = useRouter();
  const { isLoading: permLoading, helpers: h, filterNavItems } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const businessTypeSlug = ctx.data?.businessTypeSlug ?? null;
  const workspace = tradeWorkspace(businessTypeSlug);
  const businessType = getBusinessTypeBySlug(businessTypeSlug);
  const Icon = businessType?.icon;

  const today = useMemo(() => operationTodayYmd(), []);
  const todayLabel = useMemo(
    () => format(new Date(), "EEEE d MMMM yyyy", { locale: fr }),
    [],
  );

  const canDash = h?.canDashboard ?? false;

  /**
   * Mêmes clé et requête que le tableau de bord (période « aujourd'hui ») : les
   * deux écrans partagent le cache, aucune requête supplémentaire au serveur.
   */
  const dashQ = useQuery({
    queryKey: queryKeys.dashboard({
      companyId,
      storeId: null,
      period: "today",
      selectedDay: today,
      customFrom: null,
      customTo: null,
    }),
    queryFn: () =>
      fetchDashboardData({
        companyId,
        storeId: null,
        period: "today",
        selectedDay: today,
      }),
    enabled: !!companyId && !!workspace && canDash,
    staleTime: 20_000,
  });

  /**
   * Activité sans espace dédié : on renvoie au tableau de bord plutôt que
   * d'afficher une page vide (URL saisie à la main, changement d'activité…).
   */
  useEffect(() => {
    if (!permLoading && ctx.data && !workspace) router.replace(ROUTES.dashboard);
  }, [permLoading, ctx.data, workspace, router]);

  /**
   * Actions rapides réellement accessibles : on repart du menu déjà filtré par
   * les droits ET par le métier — impossible de proposer un écran interdit.
   */
  const allowedHrefs = useMemo(() => {
    const visible = filterNavItems(NAV_ITEMS);
    return new Set(visible.map((i) => i.href));
  }, [filterNavItems]);

  const actions = useMemo(() => {
    if (!workspace) return [];
    return workspace.quickActions.filter((a) =>
      a.href === TRADE_POS_ACTION ? !!storeId && (h?.canSales ?? false) : allowedHrefs.has(a.href),
    );
  }, [workspace, allowedHrefs, storeId, h]);

  if (!workspace) return null;

  const data = dashQ.data;
  const dayCount = data?.daySalesSummary.count ?? 0;
  const dayTotal = data?.daySalesSummary.totalAmount ?? 0;
  const dayAverage = dayCount > 0 ? dayTotal / dayCount : 0;
  const lowStock = data?.lowStockCount ?? 0;
  const watchSamples = data?.stockWatchSamples ?? [];

  function hrefOf(action: TradeQuickAction): string {
    if (action.href !== TRADE_POS_ACTION) return action.href;
    return storeId ? `${ROUTES.stores}/${storeId}/pos-quick` : ROUTES.stores;
  }

  return (
    <FsPage>
      <FsScreenHeader
        title={workspace.navLabel}
        subtitle={workspace.tagline}
        titleClassName="min-[900px]:text-2xl"
      />

      {/* Bandeau métier */}
      <FsCard
        padding="p-4 sm:p-5"
        className="relative overflow-hidden border-fs-accent/20 bg-gradient-to-br from-[color-mix(in_srgb,var(--fs-accent)_10%,var(--fs-card))] to-fs-card"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-fs-accent/10 blur-3xl"
        />
        <div className="relative flex items-center gap-3.5">
          {Icon ? (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-fs-accent/25 bg-fs-card text-fs-accent shadow-sm sm:h-14 sm:w-14">
              <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold leading-tight text-fs-text sm:text-lg">
              {ctx.data?.companyName ?? workspace.navLabel}
            </p>
            <p className="mt-0.5 text-xs text-neutral-600 first-letter:uppercase sm:text-sm dark:text-neutral-400">
              {todayLabel}
              {businessType ? ` · ${businessType.label}` : ""}
            </p>
          </div>
          {canDash ? (
            <Link
              href={ROUTES.dashboard}
              className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-fs-text transition-colors hover:border-fs-accent/40 hover:text-fs-accent min-[720px]:inline-flex dark:border-white/10"
            >
              Tableau de bord complet
              <MdArrowForward className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </FsCard>

      {/* Chiffres du jour */}
      {canDash ? (
        dashQ.isError ? (
          <FsQueryErrorPanel
            className="mt-3"
            error={dashQ.error}
            onRetry={() => void dashQ.refetch()}
          />
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
            <MetricTile
              label={workspace.metrics.revenue}
              value={formatCurrency(dayTotal)}
              loading={dashQ.isLoading}
              tone="accent"
            />
            <MetricTile
              label={workspace.metrics.count}
              value={String(dayCount)}
              loading={dashQ.isLoading}
            />
            <MetricTile
              label={workspace.metrics.average}
              value={formatCurrency(dayAverage)}
              loading={dashQ.isLoading}
            />
            <MetricTile
              label={workspace.metrics.lowStock}
              value={String(lowStock)}
              loading={dashQ.isLoading}
              tone={lowStock > 0 ? "warning" : "neutral"}
              href={lowStock > 0 ? ROUTES.inventory : undefined}
            />
          </div>
        )
      ) : null}

      {/* Actions rapides */}
      {actions.length > 0 ? (
        <section className="mt-4">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500 sm:text-xs dark:text-neutral-400">
            Actions rapides
          </h2>
          <div className="grid grid-cols-1 gap-2.5 min-[520px]:grid-cols-2 min-[1100px]:grid-cols-3">
            {actions.map((action) => {
              const ActionIcon =
                action.href === TRADE_POS_ACTION ? undefined : iconForHref(action.href);
              return (
                <Link
                  key={`${action.href}-${action.label}`}
                  href={hrefOf(action)}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border border-black/[0.06] bg-fs-card p-3 shadow-sm transition-all",
                    "hover:border-fs-accent/35 hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.25)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fs-accent/60",
                    "motion-safe:hover:-translate-y-0.5",
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fs-surface-container text-fs-accent transition-colors group-hover:bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)]">
                    {ActionIcon ? (
                      <ActionIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    ) : (
                      <MdPointOfSale className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fs-text">
                      {action.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-neutral-600 dark:text-neutral-400">
                      {action.hint}
                    </span>
                  </span>
                  <MdArrowForward
                    className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-fs-accent"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* À surveiller — uniquement s'il y a vraiment quelque chose à signaler */}
      {canDash && watchSamples.length > 0 ? (
        <section className="mt-4">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500 sm:text-xs dark:text-neutral-400">
            À surveiller
          </h2>
          <FsCard padding="p-3 sm:p-4">
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {watchSamples.slice(0, 5).map((s, idx) => (
                <li
                  key={`${s.productName}-${idx}`}
                  className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
                    <MdWarningAmber className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fs-text">
                      {s.productName}
                    </span>
                    <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                      {s.quantity} en stock · seuil {s.threshold}
                      {s.storeName ? ` · ${s.storeName}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={ROUTES.inventory}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-fs-accent hover:underline sm:text-sm"
            >
              Voir tout le stock
              <MdArrowForward className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </FsCard>
        </section>
      ) : null}

      {/* Mémo métier */}
      <section className="mt-4">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500 sm:text-xs dark:text-neutral-400">
          {workspace.playbook.title}
        </h2>
        <FsCard padding="p-3 sm:p-4">
          <ol className="space-y-2.5">
            {workspace.playbook.items.map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-[11px] font-bold text-fs-accent">
                  {idx + 1}
                </span>
                <span className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {item}
                </span>
              </li>
            ))}
          </ol>
        </FsCard>
      </section>
    </FsPage>
  );
}

function MetricTile({
  label,
  value,
  loading,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  loading?: boolean;
  tone?: "neutral" | "accent" | "warning";
  href?: string;
}) {
  const content = (
    <>
      <p className="text-[11px] font-medium leading-snug text-neutral-600 sm:text-xs dark:text-neutral-400">
        {label}
      </p>
      {loading ? (
        <span className="mt-2 block h-6 w-20 animate-pulse rounded bg-fs-surface-container" />
      ) : (
        <p
          className={cn(
            "mt-1 text-lg font-bold leading-tight tracking-tight sm:text-xl",
            tone === "accent" && "text-fs-accent",
            tone === "warning" && "text-amber-600 dark:text-amber-400",
            tone === "neutral" && "text-fs-text",
          )}
        >
          {value}
        </p>
      )}
    </>
  );

  const className = cn(
    "block rounded-xl border bg-fs-card p-3 shadow-sm transition-colors",
    tone === "accent"
      ? "border-fs-accent/25"
      : tone === "warning"
        ? "border-amber-500/30"
        : "border-black/[0.06]",
    href && "hover:border-fs-accent/40",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}
