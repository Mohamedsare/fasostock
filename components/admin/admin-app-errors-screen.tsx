"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminListAppErrors,
  adminListCompanies,
  adminListUsers,
} from "@/lib/features/admin/api";
import type { AdminAppClientKind, AdminAppErrorLog } from "@/lib/features/admin/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

function clientKindLabel(kind: AdminAppErrorLog["clientKind"]): string {
  if (kind === "web") return "Web";
  if (kind === "flutter") return "Flutter";
  return "Non classé";
}

function ClientKindBadge({ kind }: { kind: AdminAppErrorLog["clientKind"] }) {
  const label = clientKindLabel(kind);
  const cls =
    kind === "web"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : kind === "flutter"
        ? "bg-sky-100 text-sky-900 ring-sky-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${cls}`}
      title="Origine de l’erreur (FasoStock web vs app Flutter)"
    >
      {label}
    </span>
  );
}

const RESOLVED_KEY = "admin_app_errors_resolved_until";

export function AdminAppErrorsScreen() {
  const [companyId, setCompanyId] = useState("");
  const [userId, setUserId] = useState("");
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [clientKind, setClientKind] = useState<"" | AdminAppClientKind>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [resolvedUntil, setResolvedUntil] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESOLVED_KEY);
      setResolvedUntil(raw && raw.trim() ? raw : null);
    } catch {
      setResolvedUntil(null);
    }
  }, []);

  const companiesQ = useQuery({
    queryKey: ["admin-companies-err"] as const,
    queryFn: () => adminListCompanies(),
  });

  const usersQ = useQuery({
    queryKey: ["admin-users-err"] as const,
    queryFn: () => adminListUsers(),
  });

  const q = useQuery({
    queryKey: [
      "admin-app-errors",
      companyId,
      userId,
      level,
      source,
      clientKind,
      fromDate,
      toDate,
    ] as const,
    queryFn: () =>
      adminListAppErrors({
        companyId: companyId || null,
        userId: userId || null,
        level: level || null,
        source: source || null,
        clientKind: clientKind || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        limit: 200,
      }),
  });

  function setResolvedNow() {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(RESOLVED_KEY, now);
      setResolvedUntil(now);
    } catch {
      /* ignore */
    }
  }

  function clearResolved() {
    try {
      localStorage.removeItem(RESOLVED_KEY);
      setResolvedUntil(null);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Erreurs applicatives"
        description="Distinction claire entre erreurs remontées par l’app web (navigateur) et par l’app Flutter."
      />

      <AdminCard>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800"
            onClick={setResolvedNow}
          >
            Marquer repère maintenant
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800"
            onClick={clearResolved}
          >
            Réinitialiser repère
          </button>
          {resolvedUntil ? (
            <span className="text-xs text-slate-500">
              Repère : {new Date(resolvedUntil).toLocaleString("fr-FR")}
            </span>
          ) : null}
        </div>
      </AdminCard>

      <AdminCard>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Toutes entreprises</option>
            {(companiesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Tous utilisateurs</option>
            {(usersQ.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName ?? u.email ?? u.id}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Niveau (error, warn…)"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={clientKind}
            onChange={(e) => setClientKind((e.target.value || "") as "" | AdminAppClientKind)}
          >
            <option value="">Toutes origines</option>
            <option value="web">App web (navigateur)</option>
            <option value="flutter">App Flutter</option>
          </select>
          <input
            type="date"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <input
            type="date"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => q.refetch()}
        >
          Actualiser
        </button>
      </AdminCard>

      {q.isLoading ? (
        <div className="flex justify-center p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      ) : q.isError ? (
        <p className="text-red-600">{(q.error as Error).message}</p>
      ) : (
        <AdminCard padding="p-0" className="max-h-[70vh] overflow-auto">
          <table className="min-w-[800px] w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-600">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">App</th>
                <th className="p-2">Niveau</th>
                <th className="p-2">Message</th>
                <th className="p-2">Plateforme</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className="whitespace-nowrap p-2 text-slate-600">
                    {new Date(row.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="p-2">
                    <ClientKindBadge kind={row.clientKind} />
                  </td>
                  <td className="p-2">{row.level}</td>
                  <td className="p-2 text-slate-900">
                    <div className="max-w-md font-medium">{row.message}</div>
                    {row.stackTrace ? (
                      <pre className="mt-1 max-h-24 overflow-auto text-[10px] text-slate-500">
                        {row.stackTrace.slice(0, 500)}
                      </pre>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <span className="text-slate-800">{row.platform ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminCard>
      )}
    </div>
  );
}
