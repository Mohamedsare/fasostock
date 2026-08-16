import { NextResponse } from "next/server";
import { htmlToPdfBufferA4Resilient } from "@/lib/server/pdf/html-to-pdf";
import { renderProgressiveQuoteHtml } from "@/lib/server/pdf/progressive-quote-html";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";
import { mapProgressiveQuoteRow } from "@/lib/features/progressive/quote-types";
import { progressiveTerms } from "@/lib/features/progressive/progressive-terms";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Facture proforma A4 d'un dossier d'achat progressif (sélection du client).
 *
 * Le navigateur n'envoie que l'identifiant du dossier : lignes, montants et
 * en-tête viennent du RPC `progressive_quote_data`, qui applique lui-même le
 * contrôle d'accès (membre de l'entreprise + droit « achats progressifs »).
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as { planId?: unknown; currencyCode?: unknown };
    const planId = String(json.planId ?? "").trim();
    if (!UUID_RE.test(planId)) {
      return NextResponse.json({ error: "Dossier invalide." }, { status: 400 });
    }
    const askedCurrency = String(json.currencyCode ?? "").trim();

    const { data, error } = await supabase.rpc("progressive_quote_data", {
      p_plan_id: planId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

    const quote = mapProgressiveQuoteRow(row, {
      // Devise de l'écran si elle est plausible, sinon celle de la boutique.
      currencyCode: /^[A-Za-z]{3}$/.test(askedCurrency) ? askedCurrency.toUpperCase() : null,
    });

    // Logo embarqué en data URL : le rendu ne dépend plus d'un téléchargement réseau.
    const logoDataUrl = await remoteImageToDataUrl(
      quote.storeLogoUrl,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );

    const now = new Date();
    const html = renderProgressiveQuoteHtml({
      ...quote,
      logoDataUrl,
      dateLabel: now.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      timeLabel: now.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      openedLabel: quote.createdAt.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      itemsWord: progressiveTerms(quote.businessTypeSlug).plural,
    });

    const buf = await htmlToPdfBufferA4Resilient(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="proforma-${quote.planNumber || "dossier"}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
