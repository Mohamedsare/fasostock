import { NextResponse } from "next/server";
import { htmlToPdfBufferA4Resilient } from "@/lib/server/pdf/html-to-pdf";
import { renderSaleDocumentHtml } from "@/lib/server/pdf/sale-document-html";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";
import { mapSaleDocumentPdfRow } from "@/lib/features/sale-documents/pdf-types";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/server/api-auth";
import { resolveServerTimeZone } from "@/lib/server/company-timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Date SQL (`2026-08-16`) → « 16/08/2026 ». Le serveur PDF n'a pas de locale ambiante. */
function frDate(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", {
    timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Devis / facture A4.
 *
 * Le navigateur n'envoie que l'identifiant du document : lignes, montants et en-tête
 * viennent du RPC `sale_document_pdf_data`, qui applique lui-même le contrôle d'accès
 * (membre de l'entreprise + droit « Gérer les devis et factures »). Un document
 * imprimé ne peut donc pas afficher un total que la base ne reconnaît pas.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as { documentId?: unknown; currencyCode?: unknown };
    const documentId = String(json.documentId ?? "").trim();
    if (!UUID_RE.test(documentId)) {
      return NextResponse.json({ error: "Document invalide." }, { status: 400 });
    }
    const askedCurrency = String(json.currencyCode ?? "").trim();

    const { data, error } = await supabase.rpc("sale_document_pdf_data", {
      p_document_id: documentId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

    const doc = mapSaleDocumentPdfRow(row, {
      // Devise de l'écran si elle est plausible, sinon celle de la boutique.
      currencyCode: /^[A-Za-z]{3}$/.test(askedCurrency) ? askedCurrency.toUpperCase() : null,
    });

    // Logo embarqué en data URL : le rendu ne dépend plus d'un téléchargement réseau.
    const logoDataUrl = await remoteImageToDataUrl(
      doc.storeLogoUrl,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );

    const tz = await resolveServerTimeZone(supabase);
    const html = renderSaleDocumentHtml({
      ...doc,
      logoDataUrl,
      issueDateLabel: frDate(doc.issueDate, tz) ?? doc.issueDate,
      validUntilLabel: frDate(doc.validUntil, tz),
      dueDateLabel: frDate(doc.dueDate, tz),
    });

    const buf = await htmlToPdfBufferA4Resilient(html);
    const prefix = doc.kind === "quote" ? "devis" : "facture";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${prefix}-${doc.number || "document"}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
