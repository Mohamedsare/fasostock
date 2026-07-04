"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import { computePayslip, type PayrollRubrique } from "@/lib/features/hr/payroll/compute";
import type {
  ContractType,
  HrEmployee,
  HrLeave,
  IutsBracketRow,
  LeaveStatus,
  LeaveType,
  Payslip,
  PayrollSettingsRow,
  PayslipStatus,
} from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const empName = (r: Record<string, unknown>) =>
  `${String(r.first_name ?? "").trim()} ${String(r.last_name ?? "").trim()}`.trim();

// ---------------------------------------------------------------- Employés ---
export async function listEmployees(companyId: string): Promise<HrEmployee[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("hr_employees")
    .select("*")
    .eq("company_id", companyId)
    .order("last_name", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      matricule: r.matricule != null ? String(r.matricule) : null,
      firstName: String(r.first_name ?? ""),
      lastName: String(r.last_name ?? ""),
      gender: r.gender === "M" || r.gender === "F" ? r.gender : null,
      birthDate: r.birth_date != null ? String(r.birth_date) : null,
      hireDate: String(r.hire_date ?? ""),
      jobTitle: r.job_title != null ? String(r.job_title) : null,
      category: r.category != null ? String(r.category) : null,
      contractType: (String(r.contract_type ?? "cdi") as ContractType),
      baseSalary: toNum(r.base_salary),
      cnssNumber: r.cnss_number != null ? String(r.cnss_number) : null,
      maritalStatus: r.marital_status != null ? String(r.marital_status) : null,
      dependents: toNum(r.dependents),
      phone: r.phone != null ? String(r.phone) : null,
      email: r.email != null ? String(r.email) : null,
      address: r.address != null ? String(r.address) : null,
      paymentMethod: String(r.payment_method ?? "cash"),
      bankAccount: r.bank_account != null ? String(r.bank_account) : null,
      isActive: r.is_active !== false,
    };
  });
}

export async function upsertEmployee(
  companyId: string,
  emp: Partial<HrEmployee> & { id?: string },
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = {
    company_id: companyId,
    matricule: emp.matricule?.trim() || null,
    first_name: (emp.firstName ?? "").trim(),
    last_name: (emp.lastName ?? "").trim(),
    gender: emp.gender ?? null,
    birth_date: emp.birthDate || null,
    hire_date: emp.hireDate || new Date().toISOString().slice(0, 10),
    job_title: emp.jobTitle?.trim() || null,
    category: emp.category?.trim() || null,
    contract_type: emp.contractType ?? "cdi",
    base_salary: Math.max(0, Math.round(emp.baseSalary ?? 0)),
    cnss_number: emp.cnssNumber?.trim() || null,
    marital_status: emp.maritalStatus?.trim() || null,
    dependents: Math.max(0, Math.round(emp.dependents ?? 0)),
    phone: emp.phone?.trim() || null,
    email: emp.email?.trim() || null,
    address: emp.address?.trim() || null,
    payment_method: emp.paymentMethod ?? "cash",
    bank_account: emp.bankAccount?.trim() || null,
    is_active: emp.isActive ?? true,
  };
  if (emp.id) {
    const { error } = await supabase.from("hr_employees").update(row).eq("id", emp.id);
    if (error) throw mapSupabaseError(error);
  } else {
    const { error } = await supabase.from("hr_employees").insert(row);
    if (error) throw mapSupabaseError(error);
  }
}

export async function setEmployeeActive(id: string, active: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("hr_employees").update({ is_active: active }).eq("id", id);
  if (error) throw mapSupabaseError(error);
}

// ------------------------------------------------------------------ Congés ---
export async function listLeaves(companyId: string): Promise<HrLeave[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("hr_leaves")
    .select("id, employee_id, leave_type, start_date, end_date, days, status, reason, employee:hr_employees(first_name, last_name)")
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const e = Array.isArray(r.employee) ? (r.employee[0] as Record<string, unknown>) : (r.employee as Record<string, unknown> | null);
    return {
      id: String(r.id),
      employeeId: String(r.employee_id),
      employeeName: e ? empName(e) : "—",
      leaveType: (String(r.leave_type ?? "paid") as LeaveType),
      startDate: String(r.start_date ?? ""),
      endDate: String(r.end_date ?? ""),
      days: toNum(r.days),
      status: (String(r.status ?? "pending") as LeaveStatus),
      reason: r.reason != null ? String(r.reason) : null,
    };
  });
}

export async function createLeave(companyId: string, leave: {
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("hr_leaves").insert({
    company_id: companyId,
    employee_id: leave.employeeId,
    leave_type: leave.leaveType,
    start_date: leave.startDate,
    end_date: leave.endDate,
    days: leave.days,
    reason: leave.reason,
    status: "pending",
  });
  if (error) throw mapSupabaseError(error);
}

export async function setLeaveStatus(id: string, status: LeaveStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("hr_leaves").update({ status }).eq("id", id);
  if (error) throw mapSupabaseError(error);
}

// --------------------------------------------------------- Paramètres paie ---
export async function getPayrollSettings(companyId: string): Promise<PayrollSettingsRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payroll_settings")
    .select("cnss_employee_rate, cnss_employer_rate, cnss_ceiling, iuts_charge_reduction_rate, iuts_charge_reduction_max, transport_nontaxable_cap")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    cnssEmployeeRate: toNum(r.cnss_employee_rate),
    cnssEmployerRate: toNum(r.cnss_employer_rate),
    cnssCeiling: toNum(r.cnss_ceiling),
    iutsChargeReductionRate: toNum(r.iuts_charge_reduction_rate),
    iutsChargeReductionMax: toNum(r.iuts_charge_reduction_max),
    transportNontaxableCap: toNum(r.transport_nontaxable_cap),
  };
}

export async function updatePayrollSettings(
  companyId: string,
  patch: Partial<PayrollSettingsRow>,
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = {};
  if (patch.cnssEmployeeRate !== undefined) row.cnss_employee_rate = patch.cnssEmployeeRate;
  if (patch.cnssEmployerRate !== undefined) row.cnss_employer_rate = patch.cnssEmployerRate;
  if (patch.cnssCeiling !== undefined) row.cnss_ceiling = patch.cnssCeiling;
  if (patch.iutsChargeReductionRate !== undefined) row.iuts_charge_reduction_rate = patch.iutsChargeReductionRate;
  if (patch.iutsChargeReductionMax !== undefined) row.iuts_charge_reduction_max = patch.iutsChargeReductionMax;
  if (patch.transportNontaxableCap !== undefined) row.transport_nontaxable_cap = patch.transportNontaxableCap;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("payroll_settings").update(row).eq("company_id", companyId);
  if (error) throw mapSupabaseError(error);
}

export async function listIutsBrackets(companyId: string): Promise<IutsBracketRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payroll_iuts_brackets")
    .select("id, lower_bound, upper_bound, rate, position")
    .eq("company_id", companyId)
    .order("position", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      lowerBound: toNum(r.lower_bound),
      upperBound: r.upper_bound != null ? toNum(r.upper_bound) : null,
      rate: toNum(r.rate),
      position: toNum(r.position),
    };
  });
}

// ------------------------------------------------------------------- Paie ----
export async function listPayslips(params: {
  companyId: string;
  year: number;
  month: number;
}): Promise<Payslip[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("hr_payslips")
    .select("id, employee_id, period_year, period_month, base_salary, gross, taxable_base, cnss_employee, cnss_employer, iuts, other_deductions, net_pay, status, employee:hr_employees(first_name, last_name)")
    .eq("company_id", params.companyId)
    .eq("period_year", params.year)
    .eq("period_month", params.month)
    .order("created_at", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const e = Array.isArray(r.employee) ? (r.employee[0] as Record<string, unknown>) : (r.employee as Record<string, unknown> | null);
    return {
      id: String(r.id),
      employeeId: String(r.employee_id),
      employeeName: e ? empName(e) : "—",
      periodYear: toNum(r.period_year),
      periodMonth: toNum(r.period_month),
      baseSalary: toNum(r.base_salary),
      gross: toNum(r.gross),
      taxableBase: toNum(r.taxable_base),
      cnssEmployee: toNum(r.cnss_employee),
      cnssEmployer: toNum(r.cnss_employer),
      iuts: toNum(r.iuts),
      otherDeductions: toNum(r.other_deductions),
      netPay: toNum(r.net_pay),
      status: (String(r.status ?? "draft") as PayslipStatus),
    };
  });
}

/**
 * Génère (ou régénère) les bulletins d'un mois pour tous les employés actifs
 * sans bulletin déjà validé sur la période. Calcul CNSS/IUTS côté client (moteur pur).
 */
export async function generatePayslips(params: {
  companyId: string;
  year: number;
  month: number;
}): Promise<number> {
  const supabase = createClient();
  const [employees, settings, brackets, existing] = await Promise.all([
    listEmployees(params.companyId),
    getPayrollSettings(params.companyId),
    listIutsBrackets(params.companyId),
    listPayslips(params),
  ]);
  if (!settings) throw new Error("Paramètres de paie introuvables.");

  const settingsInput = {
    cnssEmployeeRate: settings.cnssEmployeeRate,
    cnssEmployerRate: settings.cnssEmployerRate,
    cnssCeiling: settings.cnssCeiling,
    iutsChargeReductionRate: settings.iutsChargeReductionRate,
    iutsChargeReductionMax: settings.iutsChargeReductionMax,
    transportNontaxableCap: settings.transportNontaxableCap,
  };
  const bracketsInput = brackets.map((b) => ({
    lowerBound: b.lowerBound,
    upperBound: b.upperBound,
    rate: b.rate,
  }));
  const lockedEmpIds = new Set(existing.filter((p) => p.status !== "draft").map((p) => p.employeeId));

  let count = 0;
  for (const emp of employees) {
    if (!emp.isActive || lockedEmpIds.has(emp.id)) continue;
    const rubriques: PayrollRubrique[] = [];
    const res = computePayslip({
      baseSalary: emp.baseSalary,
      dependents: emp.dependents,
      rubriques,
      settings: settingsInput,
      brackets: bracketsInput,
    });
    // Remplace un éventuel brouillon existant pour cet employé/période.
    await supabase
      .from("hr_payslips")
      .delete()
      .eq("company_id", params.companyId)
      .eq("employee_id", emp.id)
      .eq("period_year", params.year)
      .eq("period_month", params.month)
      .eq("status", "draft");
    const { error } = await supabase.from("hr_payslips").insert({
      company_id: params.companyId,
      employee_id: emp.id,
      period_year: params.year,
      period_month: params.month,
      base_salary: emp.baseSalary,
      gross: res.gross,
      taxable_base: res.taxableBase,
      cnss_employee: res.cnssEmployee,
      cnss_employer: res.cnssEmployer,
      iuts: res.iuts,
      other_deductions: res.otherDeductions,
      net_pay: res.netPay,
      status: "draft",
    });
    if (error) throw mapSupabaseError(error);
    count++;
  }
  return count;
}

export async function setPayslipStatus(id: string, status: PayslipStatus): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "paid") patch.paid_at = new Date().toISOString();
  const { error } = await supabase.from("hr_payslips").update(patch).eq("id", id);
  if (error) throw mapSupabaseError(error);
}

export async function deletePayslip(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("hr_payslips").delete().eq("id", id).eq("status", "draft");
  if (error) throw mapSupabaseError(error);
}

// ---------------------------------------------------- Rubriques de bulletin ---
export type PayslipRubriqueRow = {
  id: string;
  kind: "earning" | "deduction";
  label: string;
  amount: number;
  taxable: boolean;
  cnssBase: boolean;
  position: number;
};

export async function listPayslipLines(payslipId: string): Promise<PayslipRubriqueRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("hr_payslip_lines")
    .select("id, kind, label, amount, taxable, cnss_base, position")
    .eq("payslip_id", payslipId)
    .order("position", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      kind: r.kind === "deduction" ? "deduction" : "earning",
      label: String(r.label ?? ""),
      amount: toNum(r.amount),
      taxable: r.taxable !== false,
      cnssBase: r.cnss_base !== false,
      position: toNum(r.position),
    };
  });
}

/**
 * Recalcule un bulletin (brouillon) avec ses rubriques et remplace ses lignes.
 * Le bulletin doit exister (généré au préalable) et être en brouillon.
 */
export async function savePayslipRubriques(params: {
  companyId: string;
  payslipId: string;
  baseSalary: number;
  dependents: number;
  rubriques: PayrollRubrique[];
}): Promise<void> {
  const supabase = createClient();
  const [settings, brackets] = await Promise.all([
    getPayrollSettings(params.companyId),
    listIutsBrackets(params.companyId),
  ]);
  if (!settings) throw new Error("Paramètres de paie introuvables.");

  const res = computePayslip({
    baseSalary: params.baseSalary,
    dependents: params.dependents,
    rubriques: params.rubriques,
    settings: {
      cnssEmployeeRate: settings.cnssEmployeeRate,
      cnssEmployerRate: settings.cnssEmployerRate,
      cnssCeiling: settings.cnssCeiling,
      iutsChargeReductionRate: settings.iutsChargeReductionRate,
      iutsChargeReductionMax: settings.iutsChargeReductionMax,
      transportNontaxableCap: settings.transportNontaxableCap,
    },
    brackets: brackets.map((b) => ({ lowerBound: b.lowerBound, upperBound: b.upperBound, rate: b.rate })),
  });

  const { error: upErr } = await supabase
    .from("hr_payslips")
    .update({
      base_salary: params.baseSalary,
      gross: res.gross,
      taxable_base: res.taxableBase,
      cnss_employee: res.cnssEmployee,
      cnss_employer: res.cnssEmployer,
      iuts: res.iuts,
      other_deductions: res.otherDeductions,
      net_pay: res.netPay,
    })
    .eq("id", params.payslipId)
    .eq("status", "draft");
  if (upErr) throw mapSupabaseError(upErr);

  const { error: delErr } = await supabase
    .from("hr_payslip_lines")
    .delete()
    .eq("payslip_id", params.payslipId);
  if (delErr) throw mapSupabaseError(delErr);

  if (params.rubriques.length > 0) {
    const rows = params.rubriques.map((r, i) => ({
      company_id: params.companyId,
      payslip_id: params.payslipId,
      kind: r.kind,
      label: r.label.trim() || (r.kind === "earning" ? "Prime" : "Retenue"),
      amount: Math.max(0, Math.round(r.amount)),
      taxable: r.taxable,
      cnss_base: r.cnssBase,
      position: i + 1,
    }));
    const { error: insErr } = await supabase.from("hr_payslip_lines").insert(rows);
    if (insErr) throw mapSupabaseError(insErr);
  }
}

/** Télécharge le bulletin de paie en PDF (rendu serveur). */
export async function downloadPayslipPdf(payslipId: string, filename: string): Promise<void> {
  const res = await fetch("/api/pdf/payslip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ payslipId }),
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try {
      const j = JSON.parse(t) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* texte brut */
    }
    throw new Error(msg || `Échec PDF (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
