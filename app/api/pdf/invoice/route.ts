import { NextResponse } from "next/server";
import { htmlToPdfBufferA4 } from "@/lib/server/pdf/html-to-pdf";
import { renderInvoiceA4Html } from "@/lib/server/pdf/invoice-a4-html";
import { parseInvoiceA4Payload } from "@/lib/server/pdf/parse-pdf-payload";
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
    const data = parseInvoiceA4Payload(json);
    const companyId = String(data.store?.company_id ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Identifiant entreprise (boutique) manquant." }, { status: 400 });
    }
    const allowed = await userBelongsToCompany(supabase, auth.user.id, companyId);
    if (!allowed) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const html = renderInvoiceA4Html(data);
    const buf = await htmlToPdfBufferA4(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="facture.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
