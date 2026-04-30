"use client";

import { AdminCard } from "@/components/admin/admin-page-header";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

export function KpiCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <AdminCard padding="p-4" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 truncate text-2xl font-extrabold text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {icon ? <div className="text-orange-500">{icon}</div> : null}
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
    safe >= 80 ? "text-emerald-600 bg-emerald-50 border-emerald-200" : safe >= 60 ? "text-amber-600 bg-amber-50 border-amber-200" : "text-red-600 bg-red-50 border-red-200";
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-800">Santé plateforme</p>
      <div className={cn("mt-3 inline-flex items-center rounded-xl border px-3 py-1.5 text-sm font-bold", tone)}>
        Score {safe}/100
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${safe}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{subtitle}</p>
    </AdminCard>
  );
}

export function RevenueCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return <KpiCard title={title} value={value} hint={hint} />;
}

export function TopCompaniesCard({
  title,
  rows,
  valueLabel,
}: {
  title: string;
  rows: Array<{ companyName: string; value: string }>;
  valueLabel: string;
}) {
  return (
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? <p className="text-xs text-slate-500">Aucune donnée</p> : null}
        {rows.map((r, i) => (
          <div key={`${r.companyName}-${i}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
            <p className="truncate text-xs font-semibold text-slate-700">{r.companyName}</p>
            <p className="shrink-0 text-xs font-bold text-slate-900">{r.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{valueLabel}</p>
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
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <div className="mt-3 space-y-2">
        {alerts.length === 0 ? <p className="text-xs text-emerald-600">Aucune alerte critique.</p> : null}
        {alerts.map((a, i) => (
          <p key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
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
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Activité en temps réel</p>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? <p className="text-xs text-slate-500">Aucun événement récent.</p> : null}
        {rows.map((r, i) => (
          <div key={`${r.time}-${i}`} className="rounded-xl border border-slate-100 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800">{r.title}</p>
              <p className="text-[11px] text-slate-500">{r.time}</p>
            </div>
            <p className="mt-1 text-xs text-slate-600">{r.detail}</p>
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
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Risque de churn</p>
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
    <AdminCard className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Adoption produit</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-2">Entreprise</th>
              <th className="py-2">Adoption</th>
              <th className="py-2">Users actifs</th>
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
    <AdminCard className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
      <p className="text-sm font-extrabold text-slate-900">AI Insights</p>
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

