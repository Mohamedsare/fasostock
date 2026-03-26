"use client";

import { formatCurrency } from "@/lib/utils/currency";
import type { CategorySales, SalesByDay } from "@/lib/features/dashboard/types";
import { cn } from "@/lib/utils/cn";

const BAR_COLOR = "#EA580C";
const PIE_COLORS = [
  "var(--fs-accent)",
  "#059669",
  "#2563EB",
  "#D97706",
  "#7C3AED",
  "#DC2626",
];

export function DashboardBarChart({ data }: { data: SalesByDay[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] min-[900px]:h-[260px] items-center justify-center text-sm text-neutral-500">
        Aucune vente sur la période
      </div>
    );
  }
  const max = Math.max(
    1,
    ...data.map((d) => d.total),
    1,
  );
  const maxY = max * 1.15;
  const barW = data.length > 14 ? 6 : 12;
  return (
    <div className="flex h-[220px] min-[900px]:h-[260px] flex-col">
      <div className="flex min-h-0 flex-1 items-end gap-0.5 px-1">
        {data.map((d, i) => {
          const hPct = (d.total / maxY) * 100;
          return (
            <div
              key={`${d.date}-${i}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
              title={`${d.date}: ${formatCurrency(d.total)}`}
            >
              <div
                className="w-full rounded-t-md transition-[height]"
                style={{
                  height: `${hPct}%`,
                  minHeight: d.total > 0 ? 4 : 0,
                  backgroundColor: BAR_COLOR,
                  maxWidth: barW * 2,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-0.5 border-t border-black/[0.06] pt-2 text-[9px] text-neutral-500 min-[900px]:text-[10px]">
        {data.map((d, i) => {
          const interval = Math.max(1, Math.ceil(data.length / 8));
          const show = i % interval === 0 || i === data.length - 1;
          return (
            <span
              key={`${d.date}-lbl-${i}`}
              className={cn(
                "min-w-0 flex-1 truncate text-center",
                !show && "invisible pointer-events-none",
              )}
            >
              {d.date.slice(5).replace("-", "/")}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardLineChart({ data }: { data: SalesByDay[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] min-[900px]:h-[260px] items-center justify-center text-sm text-neutral-500">
        Aucune donnée
      </div>
    );
  }
  const max = Math.max(
    1,
    ...data.map((d) => d.total),
    1,
  );
  const maxY = Math.max(max * 1.12, 1);
  const w = 100;
  const h = 100;
  const pad = 4;
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad);
    const y = h - pad - (d.total / maxY) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(" L ")}`;
  const areaD = `M ${points[0]} L ${points.join(" ")} L ${pad + (w - 2 * pad)} ${h - pad} L ${pad} ${h - pad} Z`;

  return (
    <div className="h-[200px] min-[900px]:h-[260px] w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="dashLineFill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--fs-accent)"
              stopOpacity="0.2"
            />
            <stop
              offset="100%"
              stopColor="var(--fs-accent)"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#dashLineFill)" />
        <path
          d={pathD}
          fill="none"
          stroke="var(--fs-accent)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {data.length <= 18
          ? data.map((d, i) => {
              const x = pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad);
              const y =
                h - pad - (d.total / maxY) * (h - 2 * pad);
              return (
                <circle
                  key={`dot-${d.date}`}
                  cx={x}
                  cy={y}
                  r={1.2}
                  fill="var(--fs-accent)"
                />
              );
            })
          : null}
      </svg>
    </div>
  );
}

export function DashboardPieChart({
  categories,
  total,
  legendMax = 6,
}: {
  categories: CategorySales[];
  total: number;
  /** Flutter : 6 en large, 4 sur mobile pour la liste sous le camembert. */
  legendMax?: number;
}) {
  const slice = categories.slice(0, 6);
  if (slice.length === 0 || total <= 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-sm text-neutral-500">
        Aucune donnée
      </div>
    );
  }
  let acc = 0;
  const stops: string[] = [];
  slice.forEach((c, i) => {
    const pct = (c.revenue / total) * 100;
    const start = acc;
    acc += pct;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    stops.push(`${color} ${start}% ${acc}%`);
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-square w-[min(100%,200px)] min-[900px]:w-[220px]">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
        />
        <div
          className="absolute inset-[28%] rounded-full bg-fs-card"
          aria-hidden
        />
      </div>
      <ul className="space-y-1.5 min-[900px]:space-y-2">
        {slice.slice(0, legendMax).map((c, i) => {
          const pct = (c.revenue / total) * 100;
          return (
            <li
              key={c.categoryId ?? `cat-${i}`}
              className="flex items-start justify-between gap-2 text-xs min-[900px]:text-sm"
            >
              <span className="line-clamp-2 text-neutral-800">{c.categoryName}</span>
              <span className="shrink-0 font-semibold text-neutral-500">
                {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
