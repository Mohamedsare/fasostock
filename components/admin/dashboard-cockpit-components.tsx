"use client";

import { AdminCard } from "@/components/admin/admin-page-header";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

export function KpiCard({
  title,
  caption,
  value,
  hint,
  icon,
}: {
  title: string;
  caption?: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <AdminCard
      padding="p-4"
      className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-linear-to-br from-white via-white to-slate-50/80 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80 transition hover:border-orange-200/70 hover:shadow-[0_14px_40px_-14px_rgba(234,88,12,0.14)] hover:ring-orange-100/60"
    >
      <div
        className="absolute left-0 top-0 h-full w-1 bg-linear-to-b from-orange-500 to-amber-400 opacity-95"
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
          {caption ? (
            <p className="mt-1 text-[11px] font-medium leading-snug text-slate-500">{caption}</p>
          ) : null}
          <p className="mt-1.5 truncate text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {value}
          </p>
          {hint ? <p className="mt-1 text-[11px] font-medium text-slate-500">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="rounded-xl bg-linear-to-br from-orange-500/12 to-amber-500/8 p-2.5 text-orange-600 shadow-sm ring-1 ring-orange-500/20 transition group-hover:from-orange-500/18 group-hover:ring-orange-400/35">
            {icon}
          </div>
        ) : null}
      </div>
    </AdminCard>
  );
}

export function HealthScoreCard({
  score,
  subtitle,
}: {
  score: number;
  subtitle: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(score)));
  const tone =
    safe >= 80
      ? "border-emerald-400/45 bg-emerald-500/18 text-emerald-50"
      : safe >= 60
        ? "border-amber-400/45 bg-amber-500/18 text-amber-50"
        : "border-red-400/45 bg-red-500/18 text-red-50";
  return (
    <AdminCard className="relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-[#0c1222] via-[#141b2e] to-[#0f172a] p-6 text-white shadow-[0_24px_64px_-20px_rgba(15,23,42,0.55)] ring-1 ring-white/5">
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orange-500/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-8 left-1/3 h-28 w-28 rounded-full bg-cyan-500/10 blur-2xl" aria-hidden />
      <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Indicateur global</p>
      <p className="relative mt-1 text-sm font-semibold text-slate-200">Santé de la plateforme</p>
      <p className="relative mt-1 text-xs leading-relaxed text-slate-400">
        Synthèse activité, conversion et incidents — utile pour prioriser vos actions.
      </p>
      <div className={cn("relative mt-4 inline-flex items-center rounded-xl border px-3.5 py-2 text-sm font-bold shadow-lg backdrop-blur-sm", tone)}>
        Score {safe}/100
      </div>
      <div className="relative mt-5 h-3 w-full overflow-hidden rounded-full bg-white/10 shadow-inner">
        <div
          className="h-full rounded-full bg-linear-to-r from-orange-400 via-amber-400 to-yellow-300 shadow-[0_0_20px_rgba(251,146,60,0.45)]"
          style={{ width: `${safe}%` }}
        />
      </div>
      <p className="relative mt-4 text-xs leading-relaxed text-slate-300">{subtitle}</p>
    </AdminCard>
  );
}

export function RevenueCard({
  title,
  caption,
  value,
  hint,
}: {
  title: string;
  caption?: string;
  value: string;
  hint?: string;
}) {
  return <KpiCard title={title} caption={caption} value={value} hint={hint} />;
}

export function TopCompaniesCard({
  title,
  subtitle,
  rows,
  valueLabel,
}: {
  title: string;
  subtitle?: string;
  rows: Array<{ companyName: string; value: string }>;
  valueLabel: string;
}) {
  return (
    <AdminCard className="rounded-3xl border border-slate-200/70 bg-linear-to-b from-white to-slate-50/40 p-5 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.1)] ring-1 ring-slate-100/80">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-600/90">Classement</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{title}</p>
      {subtitle ? <p className="mt-1 text-xs leading-snug text-slate-600">{subtitle}</p> : null}
      <div className="mt-4 max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
        {rows.length === 0 ? <p className="text-xs text-slate-500">Aucune donnée</p> : null}
        {rows.map((r, i) => (
          <div
            key={`${r.companyName}-${i}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100/90 bg-white/80 px-3 py-2.5 shadow-sm transition hover:border-orange-200/60 hover:bg-white hover:shadow-md"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-[11px] font-extrabold text-orange-700">
              {i + 1}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{r.companyName}</p>
            <p className="shrink-0 text-xs font-bold tabular-nums text-slate-900">{r.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{valueLabel}</p>
    </AdminCard>
  );
}

export function AlertCard({
  title,
  alerts,
}: {
  title: string;
  alerts: string[];
}) {
  return (
    <AdminCard className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.1)] ring-1 ring-slate-100/80">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700/90">À traiter</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-600">Points qui méritent un coup d’œil aujourd’hui.</p>
      <div className="mt-3 space-y-2">
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-800">
            Aucune alerte critique.
          </p>
        ) : null}
        {alerts.map((a, i) => (
          <p
            key={i}
            className="rounded-xl border border-amber-200/80 bg-linear-to-r from-amber-50 to-orange-50/50 px-3 py-2 text-xs font-medium text-amber-950"
          >
            {a}
          </p>
        ))}
      </div>
    </AdminCard>
  );
}

export function ActivityFeed({
  rows,
}: {
  rows: Array<{ time: string; title: string; detail: string }>;
}) {
  return (
    <AdminCard className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.1)] ring-1 ring-slate-100/80">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Temps réel</p>
      <p className="mt-1 text-sm font-bold text-slate-900">Dernières actions</p>
      <p className="mt-1 text-xs text-slate-600">Ventes et événements récents sur l’échantillon chargé.</p>
      <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {rows.length === 0 ? <p className="text-xs text-slate-500">Aucun événement récent.</p> : null}
        {rows.map((r, i) => (
          <div
            key={`${r.time}-${i}`}
            className="relative rounded-xl border border-slate-100/80 bg-slate-50/40 px-3 py-2.5 pl-4 before:absolute before:left-0 before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:rounded-full before:bg-orange-500/70"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800">{r.title}</p>
              <p className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">{r.time}</p>
            </div>
            <p className="mt-1 text-xs leading-snug text-slate-600">{r.detail}</p>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

export function ChurnRiskTable({
  rows,
}: {
  rows: Array<{ companyName: string; riskScore: number; reason: string }>;
}) {
  return (
    <AdminCard className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.1)] ring-1 ring-slate-100/80">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700/80">Rétention</p>
      <p className="mt-1 text-sm font-bold text-slate-900">Risque de désabonnement</p>
      <p className="mt-1 text-xs text-slate-600">Score indicatif (inactivité, abonnement, baisse d’activité).</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-2">Entreprise</th>
              <th className="py-2">Score</th>
              <th className="py-2">Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.companyName}-${i}`} className="border-t border-slate-100">
                <td className="py-2 font-semibold text-slate-700">{r.companyName}</td>
                <td className="py-2 font-bold text-slate-900">{r.riskScore}/100</td>
                <td className="py-2 text-slate-600">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}

export function AdoptionTable({
  rows,
}: {
  rows: Array<{ companyName: string; score: number; activeUsers: number; sales: number }>;
}) {
  return (
    <AdminCard className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.1)] ring-1 ring-slate-100/80">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700/85">Engagement</p>
      <p className="mt-1 text-sm font-bold text-slate-900">Adoption par entreprise</p>
      <p className="mt-1 text-xs text-slate-600">Score interne (ventes, utilisateurs actifs récents).</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-2">Entreprise</th>
              <th className="py-2">Adoption</th>
              <th className="py-2">Comptes actifs (30 j.)</th>
              <th className="py-2">Ventes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.companyName}-${i}`} className="border-t border-slate-100">
                <td className="py-2 font-semibold text-slate-700">{r.companyName}</td>
                <td className="py-2 font-bold text-slate-900">{r.score}/100</td>
                <td className="py-2 text-slate-600">{r.activeUsers}</td>
                <td className="py-2 text-slate-600">{r.sales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}

export function AiInsightsCard({
  insights,
}: {
  insights: string[];
}) {
  return (
    <AdminCard className="rounded-3xl border border-orange-200/70 bg-linear-to-br from-orange-50/95 via-amber-50/40 to-white p-5 shadow-[0_14px_44px_-18px_rgba(234,88,12,0.2)] ring-1 ring-orange-100/60">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-orange-900/85">Lecture rapide</p>
      <p className="mt-1 text-sm font-bold text-slate-900">Phrases clés</p>
      <p className="mt-1 text-xs text-slate-700">Résumé généré à partir des métriques affichées.</p>
      <div className="mt-3 space-y-2">
        {insights.length === 0 ? <p className="text-xs text-slate-600">Aucune observation disponible.</p> : null}
        {insights.map((line, idx) => (
          <p key={idx} className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-xs text-slate-700">
            {line}
          </p>
        ))}
      </div>
    </AdminCard>
  );
}
