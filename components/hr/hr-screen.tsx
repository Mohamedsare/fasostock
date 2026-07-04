"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdBeachAccess,
  MdCheck,
  MdClose,
  MdDashboard,
  MdDelete,
  MdDownload,
  MdEdit,
  MdGroups,
  MdPayments,
  MdPictureAsPdf,
  MdSettings,
  MdTune,
} from "react-icons/md";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { ModuleLockedCard } from "@/components/modules/module-locked-card";
import { EmployeeDialog } from "@/components/hr/employee-dialog";
import { HrSettingsTab } from "@/components/hr/hr-settings-tab";
import { PayslipEditorDialog } from "@/components/hr/payslip-editor-dialog";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  createLeave,
  downloadPayslipPdf,
  generatePayslips,
  listEmployees,
  listLeaves,
  listPayslips,
  setEmployeeActive,
  setLeaveStatus,
  setPayslipStatus,
  deletePayslip,
} from "@/lib/features/hr/api";
import type { HrEmployee, LeaveType, Payslip } from "@/lib/features/hr/types";
import { downloadProWorkbook } from "@/lib/utils/spreadsheet-export-pro";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const LEAVE_LABELS: Record<LeaveType, string> = {
  paid: "Congé payé",
  sick: "Maladie",
  maternity: "Maternité",
  unpaid: "Sans solde",
  other: "Autre",
};

type Tab = "dashboard" | "employees" | "leaves" | "payroll" | "settings";

export function HrScreen() {
  const qc = useQueryClient();
  const { data: ctx, isLoading: permLoading, helpers } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const canManage = helpers?.canManageHr ?? false;
  const canPayroll = helpers?.canPayroll ?? false;
  const hrOn = Boolean(ctx?.hrModuleEnabled);

  const now = new Date();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editEmp, setEditEmp] = useState<HrEmployee | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [editPayslip, setEditPayslip] = useState<Payslip | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const employeesQ = useQuery({
    queryKey: queryKeys.hrEmployees(companyId),
    queryFn: () => listEmployees(companyId),
    enabled: Boolean(companyId) && hrOn,
  });
  const leavesQ = useQuery({
    queryKey: queryKeys.hrLeaves(companyId),
    queryFn: () => listLeaves(companyId),
    enabled: Boolean(companyId) && hrOn && (tab === "leaves" || tab === "dashboard"),
  });
  const payslipsQ = useQuery({
    queryKey: queryKeys.hrPayslips({ companyId, year, month }),
    queryFn: () => listPayslips({ companyId, year, month }),
    enabled: Boolean(companyId) && hrOn && tab === "payroll",
  });

  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);
  const activeEmployees = employees.filter((e) => e.isActive);
  const masseSalariale = activeEmployees.reduce((s, e) => s + e.baseSalary, 0);

  const empActiveMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setEmployeeActive(id, active),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.hrEmployees(companyId) });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const leaveStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) => setLeaveStatus(id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.hrLeaves(companyId) }),
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const generateMut = useMutation({
    mutationFn: () => generatePayslips({ companyId, year, month }),
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: queryKeys.hrPayslips({ companyId, year, month }) });
      toast.success(n > 0 ? `${n} bulletin(s) généré(s)` : "Aucun nouveau bulletin (déjà générés ou validés)");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const payslipStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "validated" | "paid" }) => setPayslipStatus(id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.hrPayslips({ companyId, year, month }) }),
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const payslipDeleteMut = useMutation({
    mutationFn: (id: string) => deletePayslip(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.hrPayslips({ companyId, year, month }) }),
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const dependentsById = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of employees) m.set(e.id, e.dependents);
    return m;
  }, [employees]);

  async function handlePdf(p: Payslip) {
    setPdfBusyId(p.id);
    try {
      await downloadPayslipPdf(p.id, `bulletin-${p.employeeName.replace(/\s+/g, "-")}-${p.periodMonth}-${p.periodYear}`);
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setPdfBusyId(null);
    }
  }

  function exportPayroll(payslips: Payslip[]) {
    if (payslips.length === 0) {
      toast.error("Aucun bulletin à exporter.");
      return;
    }
    const period = `${MONTHS[month - 1]} ${year}`;
    void downloadProWorkbook(`paie-${year}-${String(month).padStart(2, "0")}`, [
      {
        name: "Livre de paie",
        headers: ["Employé", "Brut", "Base CNSS", "CNSS salarié", "CNSS patronal", "IUTS", "Autres retenues", "Net à payer", "Statut"],
        rows: payslips.map((p) => [
          p.employeeName, p.gross, p.taxableBase, p.cnssEmployee, p.cnssEmployer, p.iuts, p.otherDeductions, p.netPay, p.status,
        ]),
      },
      {
        name: `Déclaration CNSS ${period}`,
        headers: ["Employé", "Salaire brut", "CNSS part salariale", "CNSS part patronale", "Total CNSS"],
        rows: payslips.map((p) => [p.employeeName, p.gross, p.cnssEmployee, p.cnssEmployer, p.cnssEmployee + p.cnssEmployer]),
      },
      {
        name: `Déclaration IUTS ${period}`,
        headers: ["Employé", "Base imposable", "IUTS retenu"],
        rows: payslips.map((p) => [p.employeeName, p.taxableBase, p.iuts]),
      },
    ]);
  }

  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }
  if (ctx?.hrModuleEnabled === false) {
    return (
      <ModuleLockedCard
        title="R. Humaine"
        heading="Module non activé"
        message="Le module R. Humaine + Paie n'est pas activé pour votre entreprise. Contactez l'administrateur de la plateforme pour l'activer."
      />
    );
  }
  if (!helpers?.canHr) {
    return (
      <ModuleLockedCard
        title="R. Humaine"
        heading="Accès réservé"
        message="Ce module est réservé au propriétaire ou aux utilisateurs disposant du droit « Ressources humaines »."
      />
    );
  }

  const TABS: Array<{ id: Tab; label: string; icon: typeof MdDashboard }> = [
    { id: "dashboard", label: "Tableau de bord", icon: MdDashboard },
    { id: "employees", label: "Employés", icon: MdGroups },
    { id: "leaves", label: "Congés", icon: MdBeachAccess },
    { id: "payroll", label: "Paie", icon: MdPayments },
    { id: "settings", label: "Paramètres", icon: MdSettings },
  ];

  return (
    <FsPage>
      <FsScreenHeader
        title="R. Humaine & Paie"
        subtitle="Employés, contrats, congés et paie conforme (CNSS, IUTS — Burkina Faso)."
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <FsFilterChip key={t.id} icon={t.icon} label={t.label} selected={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {tab === "dashboard" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Effectif actif" value={String(activeEmployees.length)} />
          <Kpi label="Masse salariale (base)" value={`${fmt(masseSalariale)} F`} />
          <Kpi label="Congés en attente" value={String((leavesQ.data ?? []).filter((l) => l.status === "pending").length)} />
          <Kpi label="Total employés" value={String(employees.length)} />
        </div>
      ) : tab === "employees" ? (
        <EmployeesTab
          companyId={companyId}
          error={employeesQ.error}
          isError={employeesQ.isError}
          isLoading={employeesQ.isLoading}
          onRetry={() => void employeesQ.refetch()}
          employees={employees}
          canManage={canManage}
          onAdd={() => {
            setEditEmp(null);
            setDialogOpen(true);
          }}
          onEdit={(e) => {
            setEditEmp(e);
            setDialogOpen(true);
          }}
          onToggleActive={(e) => empActiveMut.mutate({ id: e.id, active: !e.isActive })}
        />
      ) : tab === "leaves" ? (
        <LeavesTab
          companyId={companyId}
          employees={activeEmployees}
          leaves={leavesQ.data ?? []}
          isLoading={leavesQ.isLoading}
          canManage={canManage}
          onCreated={() => void qc.invalidateQueries({ queryKey: queryKeys.hrLeaves(companyId) })}
          onDecide={(id, status) => leaveStatusMut.mutate({ id, status })}
        />
      ) : tab === "payroll" ? (
        <PayrollTab
          year={year}
          month={month}
          onYear={setYear}
          onMonth={setMonth}
          payslips={payslipsQ.data ?? []}
          isLoading={payslipsQ.isLoading}
          canPayroll={canPayroll}
          generating={generateMut.isPending}
          onGenerate={() => generateMut.mutate()}
          onValidate={(id) => payslipStatusMut.mutate({ id, status: "validated" })}
          onPay={(id) => payslipStatusMut.mutate({ id, status: "paid" })}
          onDelete={(id) => payslipDeleteMut.mutate(id)}
          onEditRubriques={(p) => setEditPayslip(p)}
          onPdf={handlePdf}
          pdfBusyId={pdfBusyId}
          onExport={exportPayroll}
        />
      ) : (
        <HrSettingsTab companyId={companyId} canManage={canManage} />
      )}

      {dialogOpen ? (
        <EmployeeDialog
          companyId={companyId}
          employee={editEmp}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.hrEmployees(companyId) });
          }}
        />
      ) : null}

      {editPayslip ? (
        <PayslipEditorDialog
          companyId={companyId}
          payslipId={editPayslip.id}
          employeeName={editPayslip.employeeName}
          baseSalary={editPayslip.baseSalary}
          dependents={dependentsById.get(editPayslip.employeeId) ?? 0}
          periodLabel={`${MONTHS[editPayslip.periodMonth - 1]} ${editPayslip.periodYear}`}
          onClose={() => setEditPayslip(null)}
          onSaved={() => {
            setEditPayslip(null);
            void qc.invalidateQueries({ queryKey: queryKeys.hrPayslips({ companyId, year, month }) });
          }}
        />
      ) : null}
    </FsPage>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <FsCard>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-fs-text">{value}</p>
    </FsCard>
  );
}

function EmployeesTab({
  error, isError, isLoading, onRetry, employees, canManage, onAdd, onEdit, onToggleActive,
}: {
  companyId: string;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  employees: HrEmployee[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (e: HrEmployee) => void;
  onToggleActive: (e: HrEmployee) => void;
}) {
  if (isError) return <FsQueryErrorPanel error={error} onRetry={onRetry} />;
  if (isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {canManage ? (
        <div className="flex justify-end">
          <button type="button" onClick={onAdd} className="inline-flex items-center gap-1.5 rounded-xl bg-fs-accent px-3.5 py-2 text-sm font-semibold text-white">
            <MdAdd className="h-5 w-5" aria-hidden />
            Nouvel employé
          </button>
        </div>
      ) : null}
      {employees.length === 0 ? (
        <FsCard><p className="px-2 py-8 text-center text-sm text-neutral-500">Aucun employé enregistré.</p></FsCard>
      ) : (
        <FsCard padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-black/6 bg-fs-surface/50 text-xs font-bold uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Employé</th>
                  <th className="px-3 py-2">Poste</th>
                  <th className="px-3 py-2">Contrat</th>
                  <th className="px-3 py-2 text-right">Salaire base</th>
                  <th className="px-3 py-2 text-center">Statut</th>
                  {canManage ? <th className="px-3 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b border-black/[0.04]">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-fs-text">{e.lastName} {e.firstName}</div>
                      {e.matricule ? <div className="text-xs text-neutral-500">Mat. {e.matricule}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{e.jobTitle ?? "—"}</td>
                    <td className="px-3 py-2 uppercase text-neutral-600">{e.contractType}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(e.baseSalary)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={"rounded-full px-2 py-0.5 text-xs " + (e.isActive ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500")}>
                        {e.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => onEdit(e)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-fs-surface-container" aria-label="Modifier">
                            <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                          <button type="button" onClick={() => onToggleActive(e)} className="rounded-lg px-2 py-1 text-xs font-semibold text-fs-accent hover:bg-fs-accent/10">
                            {e.isActive ? "Désactiver" : "Réactiver"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FsCard>
      )}
    </div>
  );
}

function LeavesTab({
  companyId, employees, leaves, isLoading, canManage, onCreated, onDecide,
}: {
  companyId: string;
  employees: HrEmployee[];
  leaves: import("@/lib/features/hr/types").HrLeave[];
  isLoading: boolean;
  canManage: boolean;
  onCreated: () => void;
  onDecide: (id: string, status: "approved" | "rejected") => void;
}) {
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState<LeaveType>("paid");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => {
    if (!start || !end) return 0;
    const d = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000 + 1;
    return d > 0 ? Math.round(d) : 0;
  }, [start, end]);

  async function submit() {
    if (!empId || !start || !end || days <= 0) {
      toast.error("Employé et dates valides requis.");
      return;
    }
    setSaving(true);
    try {
      await createLeave(companyId, { employeeId: empId, leaveType: type, startDate: start, endDate: end, days, reason: reason.trim() || null });
      toast.success("Demande de congé enregistrée");
      setEmpId(""); setStart(""); setEnd(""); setReason("");
      onCreated();
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {canManage ? (
        <FsCard>
          <h3 className="mb-3 text-sm font-bold text-fs-text">Nouvelle demande de congé</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <select className={fsInputClass()} value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">Employé…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.lastName} {e.firstName}</option>)}
            </select>
            <select className={fsInputClass()} value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
              {(Object.keys(LEAVE_LABELS) as LeaveType[]).map((k) => <option key={k} value={k}>{LEAVE_LABELS[k]}</option>)}
            </select>
            <div className="text-sm text-neutral-600 sm:self-center">{days > 0 ? `${days} jour(s)` : ""}</div>
            <input type="date" className={fsInputClass()} value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="date" className={fsInputClass()} value={end} onChange={(e) => setEnd(e.target.value)} />
            <input className={fsInputClass()} placeholder="Motif (optionnel)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={submit} disabled={saving} className="rounded-xl bg-fs-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Enregistrement…" : "Enregistrer la demande"}
            </button>
          </div>
        </FsCard>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : leaves.length === 0 ? (
        <FsCard><p className="px-2 py-8 text-center text-sm text-neutral-500">Aucun congé enregistré.</p></FsCard>
      ) : (
        <FsCard padding="p-0">
          <ul className="divide-y divide-black/[0.04]">
            {leaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-fs-text">{l.employeeName}</div>
                  <div className="text-xs text-neutral-500">
                    {LEAVE_LABELS[l.leaveType]} · {l.startDate} → {l.endDate} · {l.days} j
                    {l.reason ? ` · ${l.reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={"rounded-full px-2 py-0.5 text-xs " + (l.status === "approved" ? "bg-green-100 text-green-700" : l.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700")}>
                    {l.status === "approved" ? "Approuvé" : l.status === "rejected" ? "Refusé" : "En attente"}
                  </span>
                  {canManage && l.status === "pending" ? (
                    <>
                      <button type="button" onClick={() => onDecide(l.id, "approved")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-green-700 hover:bg-green-50" aria-label="Approuver">
                        <MdCheck className="h-5 w-5" aria-hidden />
                      </button>
                      <button type="button" onClick={() => onDecide(l.id, "rejected")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Refuser">
                        <MdClose className="h-5 w-5" aria-hidden />
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </FsCard>
      )}
    </div>
  );
}

function PayrollTab({
  year, month, onYear, onMonth, payslips, isLoading, canPayroll, generating, onGenerate, onValidate, onPay, onDelete,
  onEditRubriques, onPdf, pdfBusyId, onExport,
}: {
  year: number;
  month: number;
  onYear: (y: number) => void;
  onMonth: (m: number) => void;
  payslips: Payslip[];
  isLoading: boolean;
  canPayroll: boolean;
  generating: boolean;
  onGenerate: () => void;
  onValidate: (id: string) => void;
  onPay: (id: string) => void;
  onDelete: (id: string) => void;
  onEditRubriques: (p: Payslip) => void;
  onPdf: (p: Payslip) => void;
  pdfBusyId: string | null;
  onExport: (payslips: Payslip[]) => void;
}) {
  const totals = payslips.reduce(
    (a, p) => ({
      gross: a.gross + p.gross,
      cnss: a.cnss + p.cnssEmployee + p.cnssEmployer,
      iuts: a.iuts + p.iuts,
      net: a.net + p.netPay,
    }),
    { gross: 0, cnss: 0, iuts: 0, net: 0 },
  );
  const years = [year - 1, year, year + 1];

  return (
    <div className="space-y-3">
      <FsCard>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-600">Mois</span>
              <select className={fsInputClass("w-auto")} value={month} onChange={(e) => onMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-600">Année</span>
              <select className={fsInputClass("w-auto")} value={year} onChange={(e) => onYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onExport(payslips)} className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold text-fs-text hover:bg-fs-surface-container">
              <MdDownload className="h-5 w-5" aria-hidden />
              Exporter (Excel)
            </button>
            {canPayroll ? (
              <button type="button" onClick={onGenerate} disabled={generating} className="inline-flex items-center gap-1.5 rounded-xl bg-fs-accent px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <MdAdd className="h-5 w-5" aria-hidden />
                {generating ? "Génération…" : "Générer les bulletins"}
              </button>
            ) : null}
          </div>
        </div>
      </FsCard>

      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠️ Barème IUTS et taux CNSS par défaut — à faire valider selon la réglementation en vigueur
        (onglet Paramètres).
      </p>

      {isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : payslips.length === 0 ? (
        <FsCard><p className="px-2 py-8 text-center text-sm text-neutral-500">Aucun bulletin pour {MONTHS[month - 1]} {year}.</p></FsCard>
      ) : (
        <FsCard padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-black/6 bg-fs-surface/50 text-xs font-bold uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Employé</th>
                  <th className="px-3 py-2 text-right">Brut</th>
                  <th className="px-3 py-2 text-right">CNSS sal.</th>
                  <th className="px-3 py-2 text-right">IUTS</th>
                  <th className="px-3 py-2 text-right">Net à payer</th>
                  <th className="px-3 py-2 text-center">Statut</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p.id} className="border-b border-black/[0.04]">
                    <td className="px-3 py-2 font-semibold text-fs-text">{p.employeeName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(p.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(p.cnssEmployee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(p.iuts)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(p.netPay)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={"rounded-full px-2 py-0.5 text-xs " + (p.status === "paid" ? "bg-green-100 text-green-700" : p.status === "validated" ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-500")}>
                        {p.status === "paid" ? "Payé" : p.status === "validated" ? "Validé" : "Brouillon"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => onPdf(p)} disabled={pdfBusyId === p.id} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-fs-surface-container disabled:opacity-40" aria-label="Télécharger le bulletin PDF" title="Bulletin PDF">
                          <MdPictureAsPdf className="h-[18px] w-[18px]" aria-hidden />
                        </button>
                        {canPayroll && p.status === "draft" ? (
                          <>
                            <button type="button" onClick={() => onEditRubriques(p)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-fs-surface-container" aria-label="Rubriques" title="Primes / retenues">
                              <MdTune className="h-[18px] w-[18px]" aria-hidden />
                            </button>
                            <button type="button" onClick={() => onValidate(p.id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">Valider</button>
                            <button type="button" onClick={() => onDelete(p.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Supprimer">
                              <MdDelete className="h-[18px] w-[18px]" aria-hidden />
                            </button>
                          </>
                        ) : canPayroll && p.status === "validated" ? (
                          <button type="button" onClick={() => onPay(p.id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50">Marquer payé</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black/10 bg-fs-surface/40 font-bold text-fs-text">
                  <td className="px-3 py-2.5">Totaux ({payslips.length})</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.gross)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" colSpan={2}>CNSS {fmt(totals.cnss)} · IUTS {fmt(totals.iuts)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.net)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </FsCard>
      )}
    </div>
  );
}
