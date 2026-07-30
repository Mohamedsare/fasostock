"use client";

import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { FsInitialsAvatar } from "@/components/ui/fs-initials-avatar";
import { FsSectionLabel } from "@/components/ui/fs-screen-primitives";
import type { SalesSellerStat } from "@/lib/features/sales/analytics";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MdGroups, MdInsights, MdSchedule } from "react-icons/md";

function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return format(d, "d MMM", { locale: fr });
}

function timeLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM 'à' HH:mm", { locale: fr });
}

/** Ligne de classement : un vendeur, sa part du total, cliquable pour filtrer. */
function SellerRow({
  stat,
  rank,
  best,
  selected,
  onSelect,
}: {
  stat: SalesSellerStat;
  rank: number;
  /** Meilleur total facturé du classement (échelle des barres). */
  best: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const pct = best > 0 ? Math.max(2, (stat.billed / best) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[6px] px-2 py-2.5 text-left transition-colors",
        selected
          ? "bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] ring-1 ring-fs-accent/35"
          : "hover:bg-fs-surface-container/70 focus-visible:bg-fs-surface-container",
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-fs-surface-container text-[11px] font-black tabular-nums text-neutral-600">
        {rank + 1}
      </span>
      <FsInitialsAvatar
        name={stat.label}
        seed={stat.userId}
        className="h-9 w-9 text-[11px]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-bold text-fs-text">
            {stat.label}
          </span>
          <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-fs-text">
            {formatCurrency(stat.billed)}
          </span>
        </span>
        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-[2px] bg-fs-surface-container">
          <span
            className="block h-full rounded-[2px] bg-gradient-to-r from-fs-accent/70 to-fs-accent transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
          <span className="tabular-nums font-semibold">
            {stat.count} vente{stat.count > 1 ? "s" : ""}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">panier {formatCurrency(stat.average)}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{stat.sharePercent.toFixed(0)} % du total</span>
          {stat.cancelledCount > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums text-red-600">
                {stat.cancelledCount} annulée{stat.cancelledCount > 1 ? "s" : ""}
              </span>
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** Histogramme du facturé par jour — visible dès qu'un vendeur est sélectionné. */
function DayBars({ data }: { data: SalesSellerStat["byDay"] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.billed), 1);
  return (
    <FsHorizontalScroll className="pb-1">
      <div className="flex min-w-full items-end gap-1.5" style={{ height: 92 }}>
        {data.map((d) => (
          <div
            key={d.date}
            className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1"
            title={`${dayLabel(d.date)} · ${formatCurrency(d.billed)} · ${d.count} vente(s)`}
          >
            <span
              className="w-full rounded-t-[4px] bg-gradient-to-t from-fs-accent/55 to-fs-accent"
              style={{ height: `${Math.max(3, (d.billed / max) * 100)}%` }}
            />
            <span className="w-full truncate text-center text-[8px] text-neutral-500">
              {dayLabel(d.date)}
            </span>
          </div>
        ))}
      </div>
    </FsHorizontalScroll>
  );
}

/** Heures d'activité (0–23) — repère les coups de feu du vendeur. */
function HourStrip({ data }: { data: SalesSellerStat["byHour"] }) {
  const max = Math.max(...data.map((h) => h.count), 1);
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  return (
    <div>
      <div className="flex gap-[2px]">
        {data.map((h) => (
          <span
            key={h.hour}
            className="h-7 flex-1 rounded-[3px]"
            style={{
              backgroundColor:
                h.count === 0
                  ? "color-mix(in srgb, var(--fs-surface-container) 100%, transparent)"
                  : `color-mix(in srgb, var(--fs-accent) ${Math.round(18 + (h.count / max) * 82)}%, transparent)`,
            }}
            title={`${String(h.hour).padStart(2, "0")}h · ${h.count} vente(s) · ${formatCurrency(h.billed)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-neutral-500">
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
      {peak.count > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-600">
          <MdSchedule className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Heure de pointe :{" "}
          <span className="font-bold text-fs-text">
            {String(peak.hour).padStart(2, "0")}h–
            {String((peak.hour + 1) % 24).padStart(2, "0")}h
          </span>{" "}
          ({peak.count} vente{peak.count > 1 ? "s" : ""})
        </p>
      ) : null}
    </div>
  );
}

function FocusStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[6px] bg-fs-surface-container/80 px-2.5 py-2">
      <p className="truncate text-[10px] font-medium text-neutral-600">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-extrabold tabular-nums text-fs-text">
        {value}
      </p>
    </div>
  );
}

/**
 * Classement des vendeurs sur la période filtrée + détail du vendeur sélectionné.
 * Tous les chiffres proviennent de la liste de ventes déjà affichée : ils bougent
 * donc avec les filtres (période, boutique, statut, recherche).
 */
export function SalesSellerBoard({
  stats,
  selectedUserId,
  onSelect,
  periodLabel,
  sellerTerm,
}: {
  stats: SalesSellerStat[];
  selectedUserId: string;
  /** Chaîne vide = tous les vendeurs. */
  onSelect: (userId: string) => void;
  periodLabel: string;
  /** « Vendeur » / « Serveur » selon le métier. */
  sellerTerm: string;
}) {
  if (stats.length === 0) return null;
  const best = stats[0]?.billed ?? 0;
  const focused = selectedUserId
    ? stats.find((s) => s.userId === selectedUserId) ?? null
    : null;
  const multiDay = (focused?.byDay.length ?? 0) > 1;

  return (
    <section className="rounded-lg border border-black/[0.06] bg-fs-card shadow-sm sm:rounded-xl">
      <header className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-fs-accent/15 text-fs-accent">
          <MdGroups className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-extrabold leading-tight text-fs-text sm:text-sm">
            Qui a vendu combien
          </h2>
          <p className="truncate text-[11px] text-neutral-500">
            {stats.length} {sellerTerm.toLowerCase()}
            {stats.length > 1 ? "s" : ""} · {periodLabel} · total facturé
          </p>
        </div>
        {selectedUserId ? (
          <button
            type="button"
            onClick={() => onSelect("")}
            className="shrink-0 rounded-[6px] border border-black/10 px-2.5 py-1.5 text-[11px] font-bold text-neutral-700"
          >
            Tout voir
          </button>
        ) : null}
      </header>

      <div className="space-y-0.5 p-1.5 sm:p-2">
        {stats.map((s, i) => (
          <SellerRow
            key={s.userId}
            stat={s}
            rank={i}
            best={best}
            selected={s.userId === selectedUserId}
            onSelect={() => onSelect(s.userId === selectedUserId ? "" : s.userId)}
          />
        ))}
      </div>

      {focused ? (
        <div className="border-t border-black/[0.06] p-3">
          <FsSectionLabel className="mb-2 flex items-center gap-1.5">
            <MdInsights className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {focused.label} — {periodLabel}
          </FsSectionLabel>
          <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
            <FocusStat label="Total facturé" value={formatCurrency(focused.billed)} />
            <FocusStat label="Ventes" value={String(focused.count)} />
            <FocusStat label="Panier moyen" value={formatCurrency(focused.average)} />
            <FocusStat label="Remises" value={formatCurrency(focused.discount)} />
            <FocusStat label="Première vente" value={timeLabel(focused.firstSaleAt)} />
            <FocusStat label="Dernière vente" value={timeLabel(focused.lastSaleAt)} />
            <FocusStat
              label="Jours avec vente"
              value={String(focused.byDay.length)}
            />
            <FocusStat
              label={focused.storeNames.length > 1 ? "Boutiques" : "Boutique"}
              value={focused.storeNames.join(", ") || "—"}
            />
          </div>

          {multiDay ? (
            <div className="mt-3">
              <FsSectionLabel className="mb-1.5">Facturé par jour</FsSectionLabel>
              <DayBars data={focused.byDay} />
            </div>
          ) : null}

          <div className="mt-3">
            <FsSectionLabel className="mb-1.5">Activité par heure</FsSectionLabel>
            <HourStrip data={focused.byHour} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
