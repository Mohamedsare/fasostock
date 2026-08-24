import { NextResponse } from "next/server";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import { renderAccountingStatementsHtml } from "@/lib/server/pdf/accounting-statements-html";
import type { AccountBalance } from "@/lib/features/accounting/reports";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { resolveCompanyTimeZone } from "@/lib/server/company-timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as { companyId?: unknown; from?: unknown; to?: unknown; companyName?: unknown };
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    const from = typeof body.from === "string" ? body.from : "";
    const to = typeof body.to === "string" ? body.to : "";
    if (!companyId || !from || !to) return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });

    const allowed = await userBelongsToCompany(supabase, auth.user.id, companyId);
    if (!allowed) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

    const { data, error } = await supabase
      .from("accounting_entries")
      .select("lines:accounting_entry_lines(debit, credit, account:accounting_accounts(code, label))")
      .eq("company_id", companyId)
      .gte("entry_date", from)
      .lte("entry_date", to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const byCode = new Map<string, AccountBalance>();
    for (const entry of (data ?? []) as unknown as Record<string, unknown>[]) {
      const lines = Array.isArray(entry.lines) ? (entry.lines as Record<string, unknown>[]) : [];
      for (const l of lines) {
        const acc = (Array.isArray(l.account) ? l.account[0] : l.account) as Record<string, unknown> | null;
        const code = acc?.code != null ? String(acc.code) : "?";
        const cur = byCode.get(code) ?? { code, label: acc?.label != null ? String(acc.label) : "", debit: 0, credit: 0 };
        cur.debit += num(l.debit);
        cur.credit += num(l.credit);
        byCode.set(code, cur);
      }
    }

    const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();

    const tz = await resolveCompanyTimeZone(supabase, companyId);
    const html = renderAccountingStatementsHtml({
      companyName: String((company as { name?: string } | null)?.name ?? "Entreprise"),
      fromLabel: from,
      toLabel: to,
      rows: [...byCode.values()],
      generatedAtLabel: new Date().toLocaleDateString("fr-FR", { timeZone: tz }),
    });

    const buf = await htmlToPdfBufferA4ResilientWithPageNumbers(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="etats-financiers.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
