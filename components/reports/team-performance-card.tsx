"use client";

import { FsCard, FsSectionLabel, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { paymentMethodLabel } from "@/lib/features/dashboard/api";
import type {
  CashierPerformance,
  TeamPerformanceData,
} from "@/lib/features/dashboard/types";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { downloadProWorkbook } from "@/lib/utils/spreadsheet-export-pro";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  MdClose,
  MdCreditCard,
  MdEmojiEvents,
  MdGroups,
  MdPercent,
  MdReceiptLong,
  MdSearch,
  MdShoppingCart,
  MdTableChart,
  MdTrendingUp,
  MdWorkspacePremium,
} from "react-icons/md";

type SortKey =
  | "revenue"
  | "salesCount"
  | "margin"
  | "ticketAverage"
  | "itemsSold"
  | "creditOutstanding";

const SORTS: { key: SortKey; label: string; short: string }[] = [
  { key: "revenue", label: "CA encaissé", short: "CA" },
  { key: "margin", label: "Marge", short: "Marge" },
  { key: "salesCount", label: "Nb ventes", short: "Ventes" },
  { key: "ticketAverage", label: "Panier moyen", short: "Panier" },
  { key: "itemsSold", label: "Articles vendus", short: "Articles" },
  { key: "creditOutstanding", label: "Crédit accordé", short: "Crédit" },
];

/** Palette des podiums : or / argent / bronze puis accent. */
const RANK_STYLES = [
  {
    ring: "ring-[#D4A017]/45",
    badge: "bg-gradient-to-br from-[#F5C542] to-[#D4A017] text-[#3D2A00]",
    glow: "from-[#F5C542]/22 to-transparent",
    label: "1er",
  },
  {
    ring: "ring-neutral-400/45",
    badge: "bg-gradient-to-br from-[#DDE3EA] to-[#9CA8B4] text-[#26313B]",
    glow: "from-[#B9C4CF]/22 to-transparent",
    label: "2e",
  },
  {
    ring: "ring-[#B87333]/45",
    badge: "bg-gradient-to-br from-[#E0A470] to-[#B87333] text-[#3A2109]",
    glow: "from-[#D69A63]/22 to-transparent",
    label: "3e",
  },
] as const;

const AVATAR_COLORS = [
  "from-orange-500 to-red-500",
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-cyan-600",
  "from-rose-500 to-pink-600",
  "from-lime-500 to-green-600",
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarGradient(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({
  name,
  userId,
  className,
}: {
  name: string;
  userId: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br font-extrabold text-white shadow-sm",
        avatarGradient(userId),
        className ?? "h-10 w-10 text-xs",
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function formatShortDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function metricValue(c: CashierPerformance, key: SortKey): number {
  switch (key) {
    case "revenue":
      return c.revenue;
    case "margin":
      return c.margin;
    case "salesCount":
      return c.salesCount;
    case "ticketAverage":
      return c.ticketAverage;
    case "itemsSold":
      return c.itemsSold;
    case "creditOutstanding":
      return c.creditOutstanding;
  }
}

function formatMetric(c: CashierPerformance, key: SortKey): string {
  const v = metricValue(c, key);
  if (key === "salesCount" || key === "itemsSold") return String(v);
  return formatCurrency(v);
}

/** Mini stat du bandeau de synthèse équipe. */
function TeamStat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="min-w-0 rounded-[6px] border border-black/[0.06] bg-fs-card p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px]",
            tone,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </p>
      </div>
      <p className="mt-2 truncate text-sm font-extrabold tabular-nums text-fs-text min-[900px]:text-base">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 truncate text-[10px] text-neutral-500">{sub}</p>
      ) : null}
    </div>
  );
}

function PodiumCard({
  c,
  rank,
  share,
  onOpen,
}: {
  c: CashierPerformance;
  rank: 0 | 1 | 2;
  share: number;
  onOpen: () => void;
}) {
  const s = RANK_STYLES[rank];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-[6px] border border-black/[0.06] bg-fs-card p-3 text-left ring-2 transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 sm:p-4",
        s.ring,
        rank === 0 && "min-[560px]:order-2",
        rank === 1 && "min-[560px]:order-1",
        rank === 2 && "min-[560px]:order-3",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b",
          s.glow,
        )}
        aria-hidden
      />
      <div className="relative flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-black shadow-sm",
            s.badge,
          )}
        >
          {rank === 0 ? (
            <MdWorkspacePremium className="h-3 w-3" aria-hidden />
          ) : (
            <MdEmojiEvents className="h-3 w-3" aria-hidden />
          )}
          {s.label}
        </span>
        <span className="text-[10px] font-bold tabular-nums text-neutral-500">
          {share.toFixed(0)}% du CA
        </span>
      </div>
      <div className="relative mt-3 flex items-center gap-2.5">
        <Avatar
          name={c.displayName}
          userId={c.userId}
          className={cn(
            "text-sm",
            rank === 0 ? "h-14 w-14 min-[900px]:h-16 min-[900px]:w-16" : "h-11 w-11",
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold leading-tight text-fs-text">
            {c.displayName}
          </p>
          <p className="truncate text-[10px] font-medium text-neutral-500">
            {c.roleName}
          </p>
        </div>
      </div>
      <p className="relative mt-3 text-base font-black leading-none tabular-nums text-fs-accent min-[900px]:text-xl">
        {formatCurrency(c.revenue)}
      </p>
      <div className="relative mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <span className="truncate rounded-[4px] bg-fs-surface-container px-1.5 py-1 font-semibold tabular-nums text-neutral-700">
          {c.salesCount} ventes
        </span>
        <span className="truncate rounded-[4px] bg-emerald-500/12 px-1.5 py-1 font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatCurrency(c.margin)}
        </span>
      </div>
    </button>
  );
}

/** Ligne du classement — barre de progression relative au meilleur de la métrique. */
function LeaderRow({
  c,
  rank,
  sortKey,
  best,
  onOpen,
}: {
  c: CashierPerformance;
  rank: number;
  sortKey: SortKey;
  best: number;
  onOpen: () => void;
}) {
  const v = metricValue(c, sortKey);
  const pct = best > 0 ? Math.max(2, (v / best) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-[6px] px-2.5 py-2.5 text-left transition-colors hover:bg-fs-surface-container/70 focus:outline-none focus-visible:bg-fs-surface-container"
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-black tabular-nums",
          rank < 3
            ? RANK_STYLES[rank].badge
            : "bg-fs-surface-container text-neutral-500",
        )}
      >
        {rank + 1}
      </span>
      <Avatar name={c.displayName} userId={c.userId} className="h-9 w-9 text-[11px]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-bold text-fs-text">
            {c.displayName}
          </span>
          <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-fs-text">
            {formatMetric(c, sortKey)}
          </span>
        </span>
        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-[2px] bg-fs-surface-container">
          <span
            className="block h-full rounded-[2px] bg-gradient-to-r from-fs-accent/70 to-fs-accent transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
          <span className="truncate font-medium">{c.roleName}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{c.salesCount} ventes</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{c.itemsSold} art.</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
            marge {formatCurrency(c.margin)}
          </span>
          {c.creditOutstanding > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums text-amber-700 dark:text-amber-400">
                crédit {formatCurrency(c.creditOutstanding)}
              </span>
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** Mini histogramme du CA encaissé par jour pour un vendeur. */
function DayBars({ data }: { data: CashierPerformance["byDay"] }) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-neutral-500">
        Aucune activité sur la période
      </p>
    );
  }
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <FsHorizontalScroll className="overflow-x-auto pb-1">
      <div className="flex min-w-full items-end gap-1.5" style={{ height: 108 }}>
        {data.map((d) => {
          const h = Math.max(3, (d.total / max) * 100);
          return (
            <div
              key={d.date}
              className="group/bar flex min-w-[26px] flex-1 flex-col items-center justify-end gap-1"
              title={`${formatDayLabel(d.date)} · ${formatCurrency(d.total)} · ${d.count} vente(s)`}
            >
              <span
                className="w-full rounded-t-[4px] bg-gradient-to-t from-fs-accent/55 to-fs-accent transition-opacity group-hover/bar:opacity-80"
                style={{ height: `${h}%` }}
              />
              <span className="w-full truncate text-center text-[8px] text-neutral-500">
                {formatDayLabel(d.date)}
              </span>
            </div>
          );
        })}
      </div>
    </FsHorizontalScroll>
  );
}

/** Bande d'activité par heure (0–23) — repère les heures fortes du vendeur. */
function HourStrip({ data }: { data: CashierPerformance["byHour"] }) {
  const max = Math.max(...data.map((h) => h.count), 1);
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  return (
    <div>
      <div className="flex gap-[2px]">
        {data.map((h) => {
          const ratio = h.count / max;
          return (
            <span
              key={h.hour}
              className="h-8 flex-1 rounded-[3px]"
              style={{
                backgroundColor:
                  h.count === 0
                    ? "color-mix(in srgb, var(--fs-surface-container) 100%, transparent)"
                    : `color-mix(in srgb, var(--fs-accent) ${Math.round(18 + ratio * 82)}%, transparent)`,
              }}
              title={`${String(h.hour).padStart(2, "0")}h · ${h.count} vente(s) · ${formatCurrency(h.revenue)}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-neutral-500">
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
      {peak && peak.count > 0 ? (
        <p className="mt-2 text-[11px] text-neutral-600">
          Heure de pointe :{" "}
          <span className="font-bold text-fs-text">
            {String(peak.hour).padStart(2, "0")}h–{String((peak.hour + 1) % 24).padStart(2, "0")}h
          </span>{" "}
          ({peak.count} vente{peak.count > 1 ? "s" : ""})
        </p>
      ) : null}
    </div>
  );
}

function DetailStat({
  label,
  value,
  tone = "text-fs-text",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-[5px] bg-fs-surface-container/80 px-2.5 py-2">
      <p className="truncate text-[10px] font-medium text-neutral-600">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-extrabold tabular-nums", tone)}>
        {value}
      </p>
    </div>
  );
}

/** Panneau détail d'un vendeur — plein écran mobile, latéral desktop. */
function CashierDetailSheet({
  c,
  teamRevenue,
  rank,
  onClose,
  onFocus,
}: {
  c: CashierPerformance;
  teamRevenue: number;
  rank: number;
  onClose: () => void;
  /** Applique ce vendeur comme filtre à toute la page Rapports. */
  onFocus?: (userId: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const share = teamRevenue > 0 ? (c.revenue / teamRevenue) * 100 : 0;
  const paymentTotal = c.payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Détail ${c.displayName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full flex-col bg-fs-surface shadow-2xl min-[720px]:max-w-[520px]">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-black/[0.07] bg-fs-card px-4 py-3">
          <Avatar name={c.displayName} userId={c.userId} className="h-12 w-12 text-sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 truncate text-base font-extrabold text-fs-text">
                {c.displayName}
              </h2>
              {rank < 3 ? (
                <span
                  className={cn(
                    "shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-black",
                    RANK_STYLES[rank].badge,
                  )}
                >
                  {RANK_STYLES[rank].label}
                </span>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-neutral-500">
              {c.roleName}
              {c.storeNames.length > 0 ? ` · ${c.storeNames.join(", ")}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[5px] text-neutral-600 hover:bg-fs-surface-container"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
          <div className="rounded-[6px] bg-gradient-to-br from-fs-accent to-[#C2410C] p-4 text-white shadow-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/85">
              CA encaissé sur la période
            </p>
            <p className="mt-1 text-2xl font-black leading-none tabular-nums">
              {formatCurrency(c.revenue)}
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-[2px] bg-white/25">
              <div
                className="h-full rounded-[2px] bg-white"
                style={{ width: `${Math.min(100, share)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-white/90 tabular-nums">
              {share.toFixed(1)} % du CA encaissé de l&apos;équipe
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 min-[520px]:grid-cols-3">
            <DetailStat label="Ventes" value={String(c.salesCount)} />
            <DetailStat label="Articles vendus" value={String(c.itemsSold)} />
            <DetailStat label="Panier moyen" value={formatCurrency(c.ticketAverage)} />
            <DetailStat
              label="Marge apportée"
              value={formatCurrency(c.margin)}
              tone="text-emerald-700 dark:text-emerald-400"
            />
            <DetailStat
              label="Taux de marge"
              value={`${c.marginRatePercent.toFixed(1)} %`}
              tone="text-emerald-700 dark:text-emerald-400"
            />
            <DetailStat label="Total facturé" value={formatCurrency(c.billedTotal)} />
            <DetailStat
              label="Crédit accordé (dû)"
              value={formatCurrency(c.creditOutstanding)}
              tone={
                c.creditOutstanding > 0
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-fs-text"
              }
            />
            <DetailStat
              label="Crédits recouvrés"
              value={formatCurrency(c.creditRepayments)}
              tone="text-sky-700 dark:text-sky-400"
            />
            <DetailStat label="Remises accordées" value={formatCurrency(c.discountTotal)} />
          </div>

          <section className="mt-5">
            <FsSectionLabel className="mb-2">CA encaissé par jour</FsSectionLabel>
            <div className="rounded-[6px] border border-black/[0.06] bg-fs-card p-3">
              <DayBars data={c.byDay} />
            </div>
          </section>

          <section className="mt-5">
            <FsSectionLabel className="mb-2">Activité par heure</FsSectionLabel>
            <div className="rounded-[6px] border border-black/[0.06] bg-fs-card p-3">
              <HourStrip data={c.byHour} />
            </div>
          </section>

          {c.payments.length > 0 ? (
            <section className="mt-5">
              <FsSectionLabel className="mb-2">Moyens de paiement encaissés</FsSectionLabel>
              <div className="space-y-2 rounded-[6px] border border-black/[0.06] bg-fs-card p-3">
                {c.payments.map((p) => {
                  const pct = paymentTotal > 0 ? (p.amount / paymentTotal) * 100 : 0;
                  return (
                    <div key={p.method}>
                      <div className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="min-w-0 truncate font-semibold text-fs-text">
                          {paymentMethodLabel(p.method)}
                        </span>
                        <span className="shrink-0 tabular-nums text-neutral-600">
                          {formatCurrency(p.amount)} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-[2px] bg-fs-surface-container">
                        <div
                          className="h-full rounded-[2px] bg-sky-500"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {c.topProducts.length > 0 ? (
            <section className="mt-5">
              <FsSectionLabel className="mb-2">Ses meilleures ventes</FsSectionLabel>
              <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-[6px] border border-black/[0.06] bg-fs-card">
                {c.topProducts.map((p, i) => (
                  <li
                    key={p.productId}
                    className="flex items-center gap-2.5 px-3 py-2.5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-fs-accent/15 text-[10px] font-black text-fs-accent">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-fs-text">
                        {p.productName}
                      </span>
                      <span className="text-[10px] tabular-nums text-neutral-500">
                        {p.quantitySold} vendu(s) · marge {formatCurrency(p.margin)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-fs-text">
                      {formatCurrency(p.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-5 grid grid-cols-2 gap-2">
            <DetailStat label="Jours actifs" value={String(c.activeDays)} />
            <DetailStat
              label="Ventes / jour actif"
              value={
                c.activeDays > 0 ? (c.salesCount / c.activeDays).toFixed(1) : "—"
              }
            />
            <DetailStat
              label="Première vente"
              value={formatShortDateTime(c.firstSaleAt)}
            />
            <DetailStat
              label="Dernière vente"
              value={formatShortDateTime(c.lastSaleAt)}
            />
          </section>

          {onFocus ? (
            <button
              type="button"
              onClick={() => {
                onFocus(c.userId);
                onClose();
              }}
              className="mt-5 w-full rounded-[6px] bg-fs-accent px-4 py-3 text-sm font-bold text-white"
            >
              Analyser toute la page sur {c.displayName}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TeamPerformanceCard({
  data,
  isLoading,
  periodLabel,
  scopeLabel,
  onFocusCashier,
}: {
  data: TeamPerformanceData | undefined;
  isLoading: boolean;
  periodLabel: string;
  scopeLabel: string;
  /** Applique le vendeur sélectionné comme filtre global de la page. */
  onFocusCashier?: (userId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "table">("list");

  const sorted = useMemo(() => {
    const list = data?.cashiers ?? [];
    return [...list].sort((a, b) => metricValue(b, sortKey) - metricValue(a, sortKey));
  }, [data, sortKey]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter(
      (c) =>
        c.displayName.toLowerCase().includes(term) ||
        c.roleName.toLowerCase().includes(term),
    );
  }, [sorted, search]);

  const best = filtered.length > 0 ? metricValue(filtered[0], sortKey) : 0;
  const totals = data?.totals;
  const opened = openId ? sorted.find((c) => c.userId === openId) ?? null : null;
  const openedRank = opened ? sorted.findIndex((c) => c.userId === opened.userId) : -1;
  const podium = sortKey === "revenue" ? sorted.slice(0, 3) : [];

  const exportTeamExcel = () => {
    if (!data || data.cashiers.length === 0) return;
    void (async () => {
      try {
        const rows = sorted.map((c, i) => [
          i + 1,
          c.displayName,
          c.roleName,
          c.revenue,
          c.margin,
          Number(c.marginRatePercent.toFixed(2)),
          c.salesCount,
          c.itemsSold,
          c.ticketAverage,
          c.billedTotal,
          c.creditOutstanding,
          c.discountTotal,
          c.activeDays,
          c.storeNames.join(" / "),
        ]);
        const productRows = sorted.flatMap((c) =>
          c.topProducts.map((p) => [
            c.displayName,
            p.productName,
            p.quantitySold,
            p.revenue,
            p.margin,
          ]),
        );
        const paymentRows = sorted.flatMap((c) =>
          c.payments.map((p) => [
            c.displayName,
            paymentMethodLabel(p.method),
            p.amount,
            p.count,
          ]),
        );
        await downloadProWorkbook(
          `performance_equipe_${new Date().toISOString().slice(0, 10)}.xlsx`,
          [
            {
              name: "Classement",
              headers: [
                "Rang",
                "Vendeur",
                "Rôle",
                "CA encaissé",
                "Marge",
                "Taux marge %",
                "Nb ventes",
                "Articles",
                "Panier moyen",
                "Total facturé",
                "Crédit dû",
                "Remises",
                "Jours actifs",
                "Boutiques",
              ],
              rows,
            },
            {
              name: "Top produits",
              headers: ["Vendeur", "Produit", "Qté", "CA", "Marge"],
              rows: productRows,
            },
            {
              name: "Paiements",
              headers: ["Vendeur", "Moyen", "Montant", "Nb"],
              rows: paymentRows,
            },
          ],
        );
        toast.success("Excel équipe enregistré.");
      } catch (e) {
        toast.error(messageFromUnknownError(e, "Export impossible."));
      }
    })();
  };

  return (
    <FsCard className="overflow-hidden rounded-[6px] p-0 sm:rounded-[6px]">
      <div className="relative overflow-hidden border-b border-black/[0.06] bg-gradient-to-r from-fs-accent/12 via-fs-accent/5 to-transparent px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-fs-accent text-white shadow-sm">
                <MdGroups className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-extrabold leading-tight text-fs-text min-[900px]:text-lg">
                  Performance de l&apos;équipe
                </h2>
                <p className="truncate text-[11px] text-neutral-600">
                  Qui a vendu combien · {periodLabel} · {scopeLabel}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={exportTeamExcel}
            disabled={!data || data.cashiers.length === 0}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-black/[0.12] bg-fs-card px-3 py-2 text-xs font-bold text-fs-text disabled:opacity-50"
          >
            <MdTableChart className="h-4 w-4" aria-hidden />
            Excel équipe
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-[6px] bg-fs-surface-container"
            />
          ))}
        </div>
      ) : !data || data.cashiers.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <MdGroups className="mx-auto h-12 w-12 text-neutral-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-fs-text">
            Aucune vente enregistrée sur la période
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Les statistiques par vendeur apparaîtront dès la première vente.
          </p>
        </div>
      ) : (
        <>
          {totals ? (
            <div className="grid grid-cols-2 gap-2 border-b border-black/[0.06] p-3 min-[700px]:grid-cols-4">
              <TeamStat
                label="CA encaissé équipe"
                value={formatCurrency(totals.revenue)}
                sub={`${data.cashiers.length} vendeur(s) actif(s)`}
                icon={MdTrendingUp}
                tone="bg-fs-accent/15 text-fs-accent"
              />
              <TeamStat
                label="Ventes"
                value={String(totals.salesCount)}
                sub={`${totals.itemsSold} articles`}
                icon={MdShoppingCart}
                tone="bg-blue-500/15 text-blue-700 dark:text-blue-400"
              />
              <TeamStat
                label="Marge apportée"
                value={formatCurrency(totals.margin)}
                sub={
                  totals.revenue > 0
                    ? `Taux ${((totals.margin / totals.revenue) * 100).toFixed(1)} %`
                    : undefined
                }
                icon={MdPercent}
                tone="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              />
              <TeamStat
                label="Crédit accordé"
                value={formatCurrency(totals.creditOutstanding)}
                sub="Reste dû sur la période"
                icon={MdCreditCard}
                tone="bg-amber-500/15 text-amber-700 dark:text-amber-400"
              />
            </div>
          ) : null}

          {podium.length >= 2 ? (
            <div className="border-b border-black/[0.06] p-3">
              <FsSectionLabel className="mb-2 px-1">Podium de la période</FsSectionLabel>
              <div className="grid gap-2 min-[560px]:grid-cols-3 min-[560px]:items-end">
                {podium.map((c, i) => (
                  <PodiumCard
                    key={c.userId}
                    c={c}
                    rank={i as 0 | 1 | 2}
                    share={
                      totals && totals.revenue > 0
                        ? (c.revenue / totals.revenue) * 100
                        : 0
                    }
                    onOpen={() => setOpenId(c.userId)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] px-3 py-3">
            <FsHorizontalScroll className="-mx-1 flex-1 overflow-x-auto px-1">
              <div className="flex gap-1.5">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSortKey(s.key)}
                    className={cn(
                      "shrink-0 rounded-[5px] px-3 py-1.5 text-[11px] font-bold transition-colors",
                      sortKey === s.key
                        ? "bg-fs-accent text-white shadow-sm"
                        : "bg-fs-surface-container text-neutral-700 hover:bg-fs-surface-container/70",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </FsHorizontalScroll>
            <button
              type="button"
              onClick={() => setView((v) => (v === "list" ? "table" : "list"))}
              className="shrink-0 rounded-[6px] border border-black/[0.12] px-2.5 py-1.5 text-[11px] font-bold text-fs-text"
            >
              {view === "list" ? "Vue tableau" : "Vue classement"}
            </button>
          </div>

          {data.cashiers.length > 4 ? (
            <div className="relative px-3 pt-3">
              <MdSearch
                className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un vendeur…"
                className={fsInputClass("rounded-[6px] pl-9")}
              />
            </div>
          ) : null}

          {view === "list" ? (
            <div className="space-y-0.5 p-2">
              {filtered.map((c) => (
                <LeaderRow
                  key={c.userId}
                  c={c}
                  rank={sorted.findIndex((s) => s.userId === c.userId)}
                  sortKey={sortKey}
                  best={best}
                  onOpen={() => setOpenId(c.userId)}
                />
              ))}
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-neutral-500">
                  Aucun vendeur ne correspond à « {search} ».
                </p>
              ) : null}
            </div>
          ) : (
            <FsHorizontalScroll>
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="bg-fs-surface-container/80 text-[11px] text-neutral-600">
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-2 py-2 font-semibold">Vendeur</th>
                    <th className="px-2 py-2 text-right font-semibold">CA encaissé</th>
                    <th className="px-2 py-2 text-right font-semibold">Marge</th>
                    <th className="px-2 py-2 text-right font-semibold">Ventes</th>
                    <th className="px-2 py-2 text-right font-semibold">Articles</th>
                    <th className="px-2 py-2 text-right font-semibold">Panier moy.</th>
                    <th className="px-3 py-2 text-right font-semibold">Crédit dû</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const rank = sorted.findIndex((s) => s.userId === c.userId);
                    return (
                      <tr
                        key={c.userId}
                        onClick={() => setOpenId(c.userId)}
                        className="cursor-pointer border-t border-black/[0.06] odd:bg-fs-card/50 hover:bg-fs-surface-container/60"
                      >
                        <td className="px-3 py-2.5 font-bold tabular-nums text-neutral-500">
                          {rank + 1}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={c.displayName}
                              userId={c.userId}
                              className="h-7 w-7 text-[10px]"
                            />
                            <div className="min-w-0">
                              <p className="max-w-[160px] truncate font-semibold text-fs-text">
                                {c.displayName}
                              </p>
                              <p className="truncate text-[10px] text-neutral-500">
                                {c.roleName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right font-extrabold tabular-nums text-fs-text">
                          {formatCurrency(c.revenue)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(c.margin)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {c.salesCount}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {c.itemsSold}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {formatCurrency(c.ticketAverage)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right tabular-nums",
                            c.creditOutstanding > 0
                              ? "font-semibold text-amber-700 dark:text-amber-400"
                              : "text-neutral-500",
                          )}
                        >
                          {formatCurrency(c.creditOutstanding)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </FsHorizontalScroll>
          )}

          <p className="flex items-center gap-1.5 border-t border-black/[0.06] px-4 py-3 text-[11px] leading-relaxed text-neutral-500">
            <MdReceiptLong className="h-4 w-4 shrink-0" aria-hidden />
            Touchez un vendeur pour voir son détail complet (jours, heures, moyens de
            paiement, produits phares).
          </p>
        </>
      )}

      {opened ? (
        <CashierDetailSheet
          c={opened}
          rank={openedRank}
          teamRevenue={totals?.revenue ?? 0}
          onClose={() => setOpenId(null)}
          onFocus={onFocusCashier}
        />
      ) : null}
    </FsCard>
  );
}
