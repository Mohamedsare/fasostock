import { NextResponse } from "next/server";
import { htmlToPdfBufferThermal } from "@/lib/server/pdf/html-to-pdf";
import { renderProgressiveTicketHtml } from "@/lib/server/pdf/progressive-ticket-html";
import { mapProgressiveTicketRow } from "@/lib/features/progressive/ticket-types";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ticket thermique d'un mouvement d'achat progressif (versement / remboursement).
 *
 * Le client n'envoie que l'identifiant du mouvement : tous les montants viennent
 * du RPC `progressive_ticket_data`, qui applique lui-même le contrôle d'accès
 * (membre de l'entreprise + droit « achats progressifs »). Rien n'est falsifiable
 * depuis le navigateur.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as {
      ledgerId?: unknown;
      paperWidthMm?: unknown;
    };
    const ledgerId = String(json.ledgerId ?? "").trim();
    if (!UUID_RE.test(ledgerId)) {
      return NextResponse.json({ error: "Mouvement invalide." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("progressive_ticket_data", {
      p_ledger_id: ledgerId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) {
      return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
    }

    const ticket = mapProgressiveTicketRow(row);
    // Largeur demandée si valide, sinon réglage de la boutique, sinon 80 mm.
    const asked = Number(json.paperWidthMm ?? 0);
    const paperWidthMm: 58 | 80 =
      asked === 58 || asked === 80 ? asked : (ticket.paperWidthMm ?? 80);

    const html = await renderProgressiveTicketHtml(ticket, paperWidthMm);
    const buf = await htmlToPdfBufferThermal(html, paperWidthMm);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="ticket-${ticket.receiptNumber || "avance"}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
