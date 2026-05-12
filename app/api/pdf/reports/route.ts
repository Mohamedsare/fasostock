import { NextResponse } from "next/server";
import { htmlToPdfBufferA4 } from "@/lib/server/pdf/html-to-pdf";
import { parseReportsPdfRouteBody } from "@/lib/server/pdf/parse-pdf-payload";
import { renderReportsHtml } from "@/lib/server/pdf/reports-html";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser, requireSuperAdmin, userBelongsToCompany } from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const json: unknown = await req.json();
    const { data, meta, companyId, asPlatformAdmin } = parseReportsPdfRouteBody(json);

    if (asPlatformAdmin) {
      const sa = await requireSuperAdmin(supabase);
      if (!sa.ok) return sa.response;
    } else {
      const auth = await requireAuthUser(supabase);
      if (!auth.ok) return auth.response;
      if (!companyId) {
        return NextResponse.json({ error: "companyId requis." }, { status: 400 });
      }
      const allowed = await userBelongsToCompany(supabase, auth.user.id, companyId);
      if (!allowed) {
        return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
      }
    }

    const html = renderReportsHtml(data, meta);
    const buf = await htmlToPdfBufferA4(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="rapports.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
