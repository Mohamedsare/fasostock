import { NextResponse } from "next/server";
import { htmlToPdfBufferA4 } from "@/lib/server/pdf/html-to-pdf";
import { parseCreditRepaymentReceiptPayload } from "@/lib/server/pdf/parse-pdf-payload";
import { renderCreditRepaymentReceiptHtml } from "@/lib/server/pdf/credit-repayment-receipt-html";
import { resolveCompanyNameForReceiptPdf } from "@/lib/server/pdf/resolve-company-name-for-receipt-pdf";
import { verifyCreditRepaymentBinding } from "@/lib/server/pdf/verify-pdf-bindings";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json: unknown = await req.json();
    const data = parseCreditRepaymentReceiptPayload(json);

    const bound = await verifyCreditRepaymentBinding(supabase, data);
    if (!bound.ok) {
      return NextResponse.json({ error: bound.error }, { status: bound.status });
    }

    const allowed = await userBelongsToCompany(supabase, auth.user.id, bound.companyId);
    if (!allowed) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const companyName = await resolveCompanyNameForReceiptPdf(
      supabase,
      bound.companyId,
      data.companyName,
    );
    const html = await renderCreditRepaymentReceiptHtml({ ...data, companyName });
    const buf = await htmlToPdfBufferA4(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="recu-remboursement-credit.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
