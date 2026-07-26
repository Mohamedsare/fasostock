import { NextResponse } from "next/server";
import { htmlToPdfBufferThermal } from "@/lib/server/pdf/html-to-pdf";
import { renderRentalReceiptHtml } from "@/lib/server/pdf/rental-receipt-html";
import { mapRentalReceiptRow } from "@/lib/features/rental/ticket-types";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Quittance thermique d'un encaissement locatif (loyer, caution, charges).
 *
 * Le client n'envoie que l'identifiant de l'encaissement : tous les montants
 * viennent du RPC `rental_receipt_data`, qui applique lui-même le contrôle
 * d'accès (membre de l'entreprise + droit « location »). Rien n'est falsifiable
 * depuis le navigateur.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as {
      paymentId?: unknown;
      paperWidthMm?: unknown;
    };
    const paymentId = String(json.paymentId ?? "").trim();
    if (!UUID_RE.test(paymentId)) {
      return NextResponse.json({ error: "Encaissement invalide." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("rental_receipt_data", {
      p_payment_id: paymentId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) {
      return NextResponse.json({ error: "Quittance introuvable." }, { status: 404 });
    }

    const receipt = mapRentalReceiptRow(row);
    // Largeur demandée si valide, sinon réglage de la boutique, sinon 80 mm.
    const asked = Number(json.paperWidthMm ?? 0);
    const paperWidthMm: 58 | 80 =
      asked === 58 || asked === 80 ? asked : (receipt.paperWidthMm ?? 80);

    const html = await renderRentalReceiptHtml(receipt, paperWidthMm);
    const buf = await htmlToPdfBufferThermal(html, paperWidthMm);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="quittance-${receipt.receiptNumber || "location"}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
