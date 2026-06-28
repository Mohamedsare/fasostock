import { NextResponse } from "next/server";
import { htmlToPdfBufferThermal } from "@/lib/server/pdf/html-to-pdf";
import {
  parseReceiptThermalPaperWidth,
  parseReceiptThermalPayload,
} from "@/lib/server/pdf/parse-pdf-payload";
import { renderReceiptThermalHtml } from "@/lib/server/pdf/receipt-thermal-html";
import { createClient } from "@/lib/supabase/server";
import {
  getSaleCompanyAndNumber,
  requireAuthUser,
  userBelongsToCompany,
} from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json: unknown = await req.json();
    const data = parseReceiptThermalPayload(json);
    const paperWidthMm = parseReceiptThermalPaperWidth(json);

    const saleId = String(data.saleId ?? "").trim();
    if (!saleId) {
      return NextResponse.json(
        { error: "saleId requis pour générer le ticket de façon sécurisée." },
        { status: 400 },
      );
    }
    const sale = await getSaleCompanyAndNumber(supabase, saleId);
    if (!sale) {
      return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
    }
    if (sale.saleNumber !== String(data.saleNumber ?? "").trim()) {
      return NextResponse.json({ error: "Données ticket incohérentes avec la vente." }, { status: 403 });
    }
    const allowed = await userBelongsToCompany(supabase, auth.user.id, sale.companyId);
    if (!allowed) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const html = await renderReceiptThermalHtml(data, paperWidthMm);
    const buf = await htmlToPdfBufferThermal(html, paperWidthMm);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="ticket.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
