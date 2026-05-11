"use client";

import { AdminCard } from "@/components/admin/admin-page-header";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";
import { MdContentCopy } from "react-icons/md";

export function ReportHeader({
  onExportPdf,
  onExportExcel,
  onGenerateAi,
  onShare,
}: {
  onExportPdf: () => void;
  onExportExcel: () => void;
  onGenerateAi: () => void;
  onShare: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Rapports & Intelligence Décisionnelle</h1>
        <p className="mt-1 text-sm text-slate-600">
          Analysez la performance de FasoStock, identifiez les opportunités et prenez les bonnes décisions rapidement.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <HeaderActionButton label="Exporter PDF" onClick={onExportPdf} />
        <HeaderActionButton label="Exporter Excel" onClick={onExportExcel} />
        <HeaderActionButton label="Générer rapport IA" onClick={onGenerateAi} />
        <HeaderActionButton label="Partager" onClick={onShare} />
      </div>
    </div>
  );
}

function HeaderActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 min-w-[142px] items-center justify-center whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-800 shadow-[0_8px_18px_-12px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50/60 hover:text-orange-700"
    >
      {label}
    </button>
  );
}

export function ReportFilters({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Filtres globaux</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{children}</div>
    </AdminCard>
  );
}

export function ExecutiveSummaryCard({
  lines,
}: {
  lines: string[];
}) {
  return (
    <AdminCard className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5 shadow-sm">
      <p className="text-sm font-extrabold text-slate-900">Résumé intelligent</p>
      <div className="mt-3 space-y-2">
        {lines.map((line, idx) => (
          <p key={idx} className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm text-slate-700">
            {line}
          </p>
        ))}
      </div>
    </AdminCard>
  );
}

export function PerformanceScoreCard({
  score,
  parts,
}: {
  score: number;
  parts: Array<{ label: string; value: number }>;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-extrabold text-slate-900">Score global de performance</p>
      <p className="mt-1 text-3xl font-black text-orange-600">{Math.round(score)}/100</p>
      <div className="mt-3 space-y-2">
        {parts.map((p) => (
          <div key={p.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">{p.label}</span>
              <span className="font-bold text-slate-800">{Math.round(p.value)}</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(0, Math.min(100, p.value))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

export function DecisionKpiCard({
  title,
  value,
  hint,
  tone = "default",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-red-600"
          : "text-slate-900";
  return (
    <AdminCard padding="p-4" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className={cn("mt-1 truncate text-2xl font-black", toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </AdminCard>
  );
}

export function RevenueCharts({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 xl:grid-cols-2">{children}</div>;
}

export function ActivityRevenueMatrix({
  rows,
}: {
  rows: Array<{ company: string; activity: number; revenue: number; risk: number; zone: string }>;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Matrice activité / revenu</p>
      <FsHorizontalScroll className="mt-3">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-2">Entreprise</th>
              <th className="py-2">Activité</th>
              <th className="py-2">Revenu</th>
              <th className="py-2">Risque</th>
              <th className="py-2">Zone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.company}-${i}`} className="border-t border-slate-100">
                <td className="py-2 font-semibold text-slate-700">{r.company}</td>
                <td className="py-2 text-slate-600">{r.activity}</td>
                <td className="py-2 text-slate-600">{r.revenue}</td>
                <td className="py-2 text-slate-600">{r.risk}/100</td>
                <td className="py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{r.zone}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </FsHorizontalScroll>
    </AdminCard>
  );
}

export function TopFlopSection({
  top,
  flop,
}: {
  top: string[];
  flop: string[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SimpleListCard title="Top" items={top} tone="good" />
      <SimpleListCard title="Flop" items={flop} tone="danger" />
    </div>
  );
}

function SimpleListCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "danger";
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item, i) => (
          <p
            key={i}
            className={cn(
              "rounded-xl px-3 py-2 text-xs",
              tone === "good" ? "border border-emerald-100 bg-emerald-50 text-emerald-700" : "border border-red-100 bg-red-50 text-red-700",
            )}
          >
            {item}
          </p>
        ))}
      </div>
    </AdminCard>
  );
}

export function CompanyReportTable({
  rows,
}: {
  rows: Array<{
    company: string;
    city: string;
    ca: string;
    sales: number;
    avgTicket: string;
    stores: number;
    activeUsers: number;
    plan: string;
    subscriptionStatus: string;
    adoption: number;
    churnRisk: number;
    lastActivity: string;
    action: string;
  }>;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Rapports par entreprise</p>
      <FsHorizontalScroll className="mt-3">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-2">Entreprise</th><th className="py-2">Ville</th><th className="py-2">CA</th><th className="py-2">Ventes</th><th className="py-2">Ticket</th>
              <th className="py-2">Boutiques</th><th className="py-2">Users actifs</th><th className="py-2">Plan</th><th className="py-2">Abonnement</th>
              <th className="py-2">Adoption</th><th className="py-2">Risque</th><th className="py-2">Dernière activité</th><th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.company}-${i}`} className="border-t border-slate-100">
                <td className="py-2 font-semibold text-slate-700">{r.company}</td>
                <td className="py-2 text-slate-600">{r.city}</td>
                <td className="py-2 text-slate-600">{r.ca}</td>
                <td className="py-2 text-slate-600">{r.sales}</td>
                <td className="py-2 text-slate-600">{r.avgTicket}</td>
                <td className="py-2 text-slate-600">{r.stores}</td>
                <td className="py-2 text-slate-600">{r.activeUsers}</td>
                <td className="py-2 text-slate-600">{r.plan}</td>
                <td className="py-2"><StatusBadge value={r.subscriptionStatus} /></td>
                <td className="py-2 text-slate-600">{r.adoption}/100</td>
                <td className="py-2 text-slate-600">{r.churnRisk}/100</td>
                <td className="py-2 text-slate-600">{r.lastActivity}</td>
                <td className="py-2 text-slate-600">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FsHorizontalScroll>
    </AdminCard>
  );
}

function StatusBadge({ value }: { value: string }) {
  const c =
    value === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : value === "trialing"
        ? "bg-blue-50 text-blue-700 border-blue-100"
        : value === "past_due"
          ? "bg-amber-50 text-amber-700 border-amber-100"
          : "bg-red-50 text-red-700 border-red-100";
  return <span className={cn("rounded-full border px-2 py-0.5 font-semibold", c)}>{value}</span>;
}

export function ProductAdoptionSection({
  rows,
}: {
  rows: Array<{ module: string; score: number; trend: "up" | "down" | "flat" }>;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Adoption produit</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => (
          <div key={r.module} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-700">{r.module}</p>
            <p className="text-xl font-black text-slate-900">{r.score}%</p>
            <p className="text-[11px] text-slate-500">Tendance: {r.trend}</p>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

export function MonetizationReport({
  rows,
}: {
  rows: Array<{ label: string; value: string; hint?: string }>;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Monétisation & abonnements</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-slate-100 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase text-slate-500">{r.label}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{r.value}</p>
            {r.hint ? <p className="text-xs text-slate-500">{r.hint}</p> : null}
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

export function FollowUpClientsTable({
  rows,
  onCopy,
}: {
  rows: Array<{ company: string; reason: string; urgency: string; potential: string; message: string }>;
  onCopy: (message: string) => void;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Clients à relancer</p>
      <FsHorizontalScroll className="mt-3">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-2">Entreprise</th><th className="py-2">Raison</th><th className="py-2">Urgence</th><th className="py-2">Potentiel</th><th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.company}-${i}`} className="border-t border-slate-100">
                <td className="py-2 font-semibold text-slate-700">{r.company}</td>
                <td className="py-2 text-slate-600">{r.reason}</td>
                <td className="py-2 text-slate-600">{r.urgency}</td>
                <td className="py-2 text-slate-600">{r.potential}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onCopy(r.message)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1">
                      <MdContentCopy className="h-3.5 w-3.5" /> Copier message
                    </button>
                    <button type="button" className="rounded-lg border border-slate-200 px-2 py-1">Marquer relancé</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </FsHorizontalScroll>
    </AdminCard>
  );
}

export function AnomalyDetectionPanel({
  items,
}: {
  items: string[];
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Anomalies détectées</p>
      <div className="mt-3 space-y-2">
        {items.map((it, i) => (
          <p key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{it}</p>
        ))}
      </div>
    </AdminCard>
  );
}

export function ForecastSection({
  rows,
}: {
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Prévisions</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase text-slate-500">{r.label}</p>
            <p className="text-lg font-black text-slate-900">{r.value}</p>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

export function RecommendedDecisions({
  rows,
}: {
  rows: Array<{ title: string; priority: "haute" | "moyenne" | "basse"; reason: string; impact: string }>;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Décisions recommandées</p>
      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <div key={`${r.title}-${i}`} className="rounded-xl border border-slate-100 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800">{r.title}</p>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.priority === "haute" ? "bg-red-50 text-red-700" : r.priority === "moyenne" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                {r.priority}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{r.reason}</p>
            <p className="text-xs font-semibold text-slate-700">Impact estimé: {r.impact}</p>
            <button type="button" className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">Agir</button>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

export function AiInsightsCard({
  lines,
}: {
  lines: string[];
}) {
  return (
    <AdminCard className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Analyse intelligente</p>
      <div className="mt-3 space-y-2">
        {lines.map((line, i) => (
          <p key={i} className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-xs text-slate-700">{line}</p>
        ))}
      </div>
    </AdminCard>
  );
}

