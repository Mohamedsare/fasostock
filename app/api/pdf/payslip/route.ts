import { NextResponse } from "next/server";
import { htmlToPdfBufferA4 } from "@/lib/server/pdf/html-to-pdf";
import { renderPayslipHtml, type PayslipLineData } from "@/lib/server/pdf/payslip-html";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { resolveCompanyTimeZone } from "@/lib/server/company-timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as { payslipId?: unknown };
    const payslipId = typeof json.payslipId === "string" ? json.payslipId.trim() : "";
    if (!payslipId) return NextResponse.json({ error: "payslipId requis" }, { status: 400 });

    const { data: ps, error } = await supabase
      .from("hr_payslips")
      .select(
        "company_id, period_year, period_month, base_salary, gross, cnss_employee, cnss_employer, iuts, other_deductions, net_pay, " +
          "employee:hr_employees(first_name, last_name, matricule, job_title, category, contract_type, cnss_number, hire_date), " +
          "lines:hr_payslip_lines(label, amount, kind, position)",
      )
      .eq("id", payslipId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!ps) return NextResponse.json({ error: "Bulletin introuvable." }, { status: 404 });

    const r = ps as unknown as Record<string, unknown>;
    const companyId = String(r.company_id ?? "");
    const allowed = await userBelongsToCompany(supabase, auth.user.id, companyId);
    if (!allowed) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

    const emp = (Array.isArray(r.employee) ? r.employee[0] : r.employee) as Record<string, unknown> | null;
    const rawLines = Array.isArray(r.lines) ? (r.lines as Record<string, unknown>[]) : [];
    const lines: PayslipLineData[] = rawLines
      .sort((a, b) => num(a.position) - num(b.position))
      .map((l) => ({
        label: String(l.label ?? ""),
        amount: num(l.amount),
        kind: l.kind === "deduction" ? "deduction" : "earning",
      }));

    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .maybeSingle();

    const month = num(r.period_month);
    const year = num(r.period_year);

    const tz = await resolveCompanyTimeZone(supabase, companyId);
    const html = renderPayslipHtml({
      companyName: String((company as { name?: string } | null)?.name ?? "Entreprise"),
      employeeName: emp ? `${String(emp.last_name ?? "")} ${String(emp.first_name ?? "")}`.trim() : "—",
      matricule: emp?.matricule != null ? String(emp.matricule) : null,
      jobTitle: emp?.job_title != null ? String(emp.job_title) : null,
      category: emp?.category != null ? String(emp.category) : null,
      contractType: emp?.contract_type != null ? String(emp.contract_type) : "cdi",
      cnssNumber: emp?.cnss_number != null ? String(emp.cnss_number) : null,
      hireDate: emp?.hire_date != null ? String(emp.hire_date) : null,
      periodLabel: `${MONTHS[month - 1] ?? ""} ${year}`.trim(),
      baseSalary: num(r.base_salary),
      gross: num(r.gross),
      cnssEmployee: num(r.cnss_employee),
      cnssEmployer: num(r.cnss_employer),
      iuts: num(r.iuts),
      otherDeductions: num(r.other_deductions),
      netPay: num(r.net_pay),
      lines,
      generatedAtLabel: new Date().toLocaleDateString("fr-FR", { timeZone: tz }),
    });

    const buf = await htmlToPdfBufferA4(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="bulletin-paie.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
