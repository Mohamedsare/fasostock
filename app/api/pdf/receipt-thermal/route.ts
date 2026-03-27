import { NextResponse } from "next/server";
import { htmlToPdfBufferThermal } from "@/lib/server/pdf/html-to-pdf";
import { parseReceiptThermalPayload } from "@/lib/server/pdf/parse-pdf-payload";
import { renderReceiptThermalHtml } from "@/lib/server/pdf/receipt-thermal-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const json: unknown = await req.json();
    const data = parseReceiptThermalPayload(json);
    const html = await renderReceiptThermalHtml(data);
    const buf = await htmlToPdfBufferThermal(html);
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
