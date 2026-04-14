"use client";

import {
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { formatCurrency } from "@/lib/utils/currency";
import type { CategorySales, SalesByDay } from "@/lib/features/dashboard/types";
import { cn } from "@/lib/utils/cn";

const BAR_COLOR = "#EA580C";
/** Doit correspondre à `h-[200px] min-[900px]:h-[240px]` sur la zone des barres. */
const CHART_DRAW_PX = 200;
const CHART_DRAW_PX_WIDE = 240;
const MQ_WIDE = "(min-width: 900px)";

/** Courbe « Évolution du CA » : viewBox interne (axes + grille + zone utile). */
const LINE_VB = { w: 520, h: 248 };
const LINE_PAD = { l: 54, r: 14, t: 14, b: 40 };

function formatAxisFcfa(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("fr-FR", {
      notation: "compact",
      style: "currency",
      currency: "XOF",
      maximumFractionDigits: v >= 1_000_000 ? 1 : 0,
    }).format(v);
  } catch {
    return formatCurrency(Math.round(v));
  }
}

/** Catmull-Rom → courbe C cubique (ligne lisse sans dépendance). */
function smoothLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const PIE_COLORS = [
  "var(--fs-accent)",
  "#059669",
  "#2563EB",
  "#D97706",
  "#7C3AED",
  "#DC2626",
];

export function DashboardBarChart({ data }: { data: SalesByDay[] }) {
  const [drawPx, setDrawPx] = useState(CHART_DRAW_PX);

  useLayoutEffect(() => {
    const mq = window.matchMedia(MQ_WIDE);
    const apply = () =>
      setDrawPx(mq.matches ? CHART_DRAW_PX_WIDE : CHART_DRAW_PX);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] min-[900px]:h-[260px] items-center justify-center text-sm text-neutral-500">
        Aucune vente sur la période
      </div>
    );
  }
  const totals = data.map((d) => {
    const n = Number(d.total);
    return Number.isFinite(n) ? n : 0;
  });
  const maxVal = Math.max(...totals, 0);
  if (maxVal <= 0) {
    return (
      <div className="flex h-[220px] min-[900px]:h-[260px] items-center justify-center text-sm text-neutral-500">
        Aucune vente sur la période
      </div>
    );
  }
  const maxY = maxVal * 1.15;
  const barW = data.length > 14 ? 6 : 12;
  return (
    <div className="flex h-[220px] min-[900px]:h-[260px] flex-col">
      <div className="flex h-[200px] min-[900px]:h-[240px] shrink-0 items-end gap-0.5 px-1">
        {data.map((d, i) => {
          const v = totals[i] ?? 0;
          const hPx =
            v > 0 && maxY > 0 ? Math.max(1, (v / maxY) * drawPx) : 0;
          return (
            <div
              key={`${d.date}-${i}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
              title={`${d.date}: ${formatCurrency(v)}`}
            >
              <div
                className="w-full rounded-t-md transition-[height]"
                style={{
                  height: `${hPx}px`,
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
  const fillGradId = useId().replace(/:/g, "");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

  const totals = useMemo(
    () =>
      data.map((d) => {
        const n = Number(d.total);
        return Number.isFinite(n) ? n : 0;
      }),
    [data],
  );

  const chart = useMemo(() => {
    if (data.length === 0) return null;
    const maxVal = Math.max(...totals, 0);
    if (maxVal <= 0) return null;

    const { w: vbW, h: vbH } = LINE_VB;
    const { l: pl, r: pr, t: pt, b: pb } = LINE_PAD;
    const innerW = vbW - pl - pr;
    const innerH = vbH - pt - pb;
    const bottomY = pt + innerH;
    const maxY = maxVal * 1.08;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxY);

    const n = data.length;
    const xs =
      n <= 1
        ? [pl + innerW / 2]
        : data.map((_, i) => pl + (i / Math.max(1, n - 1)) * innerW);

    const pts = data.map((d, i) => {
      const v = totals[i] ?? 0;
      const x = xs[i] ?? pl;
      const y = bottomY - (v / maxY) * innerH;
      return { x, y, date: d.date, total: v };
    });

    const lineD = smoothLinePath(pts.map((p) => ({ x: p.x, y: p.y })));
    let areaD = "";
    if (pts.length >= 2) {
      areaD = `${lineD} L ${pts[pts.length - 1]!.x} ${bottomY} L ${pts[0]!.x} ${bottomY} Z`;
    } else if (pts.length === 1) {
      const p = pts[0]!;
      const half = 4;
      areaD = `M ${p.x - half} ${bottomY} L ${p.x + half} ${bottomY} L ${p.x} ${p.y} Z`;
    }

    return {
      vbW,
      vbH,
      pl,
      pr,
      pt,
      pb,
      innerW,
      innerH,
      bottomY,
      maxY,
      yTicks,
      xs,
      pts,
      lineD,
      areaD,
    };
  }, [data, totals]);

  const tooltipStyle = useMemo(() => {
    const pad = 12;
    const tw = 220;
    const th = 56;
    let left = tipPos.x + 14;
    let top = tipPos.y - th - 6;
    if (typeof window !== "undefined") {
      left = Math.min(Math.max(pad, left), window.innerWidth - tw - pad);
      if (top < pad) top = tipPos.y + 18;
    }
    return { left, top };
  }, [tipPos]);

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] min-[900px]:h-[280px] items-center justify-center text-sm text-neutral-500">
        Aucune donnée
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="flex h-[220px] min-[900px]:h-[280px] items-center justify-center text-sm text-neutral-500">
        Aucune vente sur la période
      </div>
    );
  }

  const {
    vbW,
    vbH,
    pl,
    pr,
    pt,
    innerW,
    innerH,
    bottomY,
    maxY,
    yTicks,
    xs,
    pts,
    lineD,
    areaD,
  } = chart;

  const xLabelInterval = Math.max(1, Math.ceil(data.length / 7));
  const accent = "var(--fs-accent)";

  function handleSvgMove(e: ReactMouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;
    const loc = svgPoint.matrixTransform(ctm.inverse());
    const svgX = loc.x;

    setTipPos({ x: e.clientX, y: e.clientY });

    const n = xs.length;
    if (n === 1) {
      setHoverIdx(0);
      return;
    }
    const step = innerW / Math.max(1, n - 1);
    const maxDist = Math.max(step * 0.45, 12);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(svgX - (xs[i] ?? 0));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHoverIdx(bestD <= maxDist ? best : null);
  }

  function handleSvgLeave() {
    setHoverIdx(null);
  }

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="h-[220px] w-full min-[900px]:h-[280px] cursor-crosshair touch-none select-none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Évolution du chiffre d'affaires sur ${data.length} jour(s). Survoler pour le détail.`}
        onMouseMove={handleSvgMove}
        onMouseLeave={handleSvgLeave}
      >
        <title>Évolution du CA</title>
        <defs>
          <linearGradient id={fillGradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="55%" stopColor={accent} stopOpacity="0.08" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, i) => {
          const yy = bottomY - (tick / maxY) * innerH;
          const isBase = i === 0;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={pl}
                y1={yy}
                x2={vbW - pr}
                y2={yy}
                stroke="currentColor"
                strokeOpacity={isBase ? 0.14 : 0.08}
                className="text-neutral-900"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={pl - 8}
                y={yy + 4}
                textAnchor="end"
                className="fill-neutral-500"
                style={{ fontSize: 10, fontWeight: 500 }}
              >
                {formatAxisFcfa(tick)}
              </text>
            </g>
          );
        })}

        {areaD ? (
          <path d={areaD} fill={`url(#${fillGradId})`} />
        ) : null}

        {lineD ? (
          <path
            d={lineD}
            fill="none"
            stroke={accent}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {hoverIdx !== null && pts[hoverIdx] ? (
          <g className="pointer-events-none">
            <line
              x1={pts[hoverIdx]!.x}
              y1={pt}
              x2={pts[hoverIdx]!.x}
              y2={bottomY}
              stroke={accent}
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="4 5"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={pts[hoverIdx]!.x}
              cy={pts[hoverIdx]!.y}
              r={6}
              fill="white"
              stroke={accent}
              strokeWidth={2.25}
              vectorEffect="non-scaling-stroke"
              className="dark:fill-neutral-950"
            />
          </g>
        ) : null}

        {data.length <= 16
          ? pts.map((p, i) => (
              <circle
                key={`pt-${p.date}-${i}`}
                cx={p.x}
                cy={p.y}
                r={hoverIdx === i ? 0 : 2.25}
                fill={accent}
                className="pointer-events-none transition-all"
                opacity={hoverIdx === i ? 0 : 0.85}
              />
            ))
          : null}

        {data.map((d, i) => {
          const show = i % xLabelInterval === 0 || i === data.length - 1;
          if (!show) return null;
          return (
            <text
              key={`xl-${d.date}-${i}`}
              x={xs[i]}
              y={vbH - 10}
              textAnchor="middle"
              className="fill-neutral-500"
              style={{ fontSize: 10, fontWeight: 500 }}
            >
              {d.date.slice(5).replace("-", "/")}
            </text>
          );
        })}
      </svg>

      {hoverIdx !== null && pts[hoverIdx] ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-[220px] rounded-lg border border-black/8 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-900/95"
          style={tooltipStyle}
        >
          <p className="font-semibold text-neutral-800 dark:text-neutral-100">
            {pts[hoverIdx]!.date.slice(5).replace("-", "/")}
          </p>
          <p className="mt-0.5 tabular-nums text-fs-accent">
            {formatCurrency(pts[hoverIdx]!.total)}
          </p>
        </div>
      ) : null}
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
