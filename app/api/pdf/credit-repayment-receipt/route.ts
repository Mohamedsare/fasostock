import { NextResponse } from "next/server";
import { htmlToPdfBufferA4 } from "@/lib/server/pdf/html-to-pdf";
import { parseCreditRepaymentReceiptPayload } from "@/lib/server/pdf/parse-pdf-payload";
import { renderCreditRepaymentReceiptHtml } from "@/lib/server/pdf/credit-repayment-receipt-html";
import { resolveCompanyNameForReceiptPdf } from "@/lib/server/pdf/resolve-company-name-for-receipt-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const json: unknown = await req.json();
    const data = parseCreditRepaymentReceiptPayload(json);
    const supabase = await createClient();
    const companyName = await resolveCompanyNameForReceiptPdf(supabase, data.companyId, data.companyName);
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
