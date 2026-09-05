import { NextResponse } from "next/server";
import { htmlToPdfBufferThermal } from "@/lib/server/pdf/html-to-pdf";
import {
  parseReceiptThermalPaperWidth,
  parseReceiptThermalPayload,
} from "@/lib/server/pdf/parse-pdf-payload";
import { renderReceiptThermalHtml } from "@/lib/server/pdf/receipt-thermal-html";
import { storeLogoDataUrl } from "@/lib/server/pdf/store-logo-data-url";
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

    /*
     * Identité de l'appelant et vente : deux lectures indépendantes, menées de front.
     *
     * Un aller-retour Supabase de moins sur le chemin du ticket — et le client attend
     * au comptoir pendant ces allers-retours. Les contrôles restent les mêmes, dans le
     * même ordre : c'est bien l'authentification qui refuse la première, et la vente
     * n'est lue que sous la RLS de l'appelant, qui ne voit donc jamais celle d'une
     * autre entreprise.
     */
    const [auth, sale] = await Promise.all([
      requireAuthUser(supabase),
      getSaleCompanyAndNumber(supabase, saleId),
    ]);
    if (!auth.ok) return auth.response;
    if (!sale) {
      return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
    }
    if (sale.saleNumber !== String(data.saleNumber ?? "").trim()) {
      return NextResponse.json({ error: "Données ticket incohérentes avec la vente." }, { status: 403 });
    }
    /*
     * Dernier contrôle, et logo du ticket, menés de front.
     *
     * Le logo est embarqué en data URL AVANT le rendu, comme le font déjà toutes les
     * autres routes PDF. Laissé en URL distante, il obligeait Chromium à aller le
     * chercher lui-même pendant `setContent` : le ticket entier attendait alors un
     * téléchargement fait depuis le conteneur, sans autre limite que le délai du rendu.
     * Un Storage lent, et c'est le client au comptoir qui patientait. Logo
     * indisponible ⇒ ticket sans logo, ce qui vaut mieux qu'un ticket qui ne sort pas.
     *
     * Le téléchargement part avant que l'appartenance à l'entreprise soit confirmée,
     * mais jamais avant l'authentification, et il ne peut viser que le Storage de ce
     * projet (`isAllowedPdfEmbedImageUrl`). Un refus plus bas jette simplement l'image :
     * rien n'en sort, et le ticket légitime ne paie plus cette attente.
     */
    const [allowed, storeLogoUrl] = await Promise.all([
      userBelongsToCompany(supabase, auth.user.id, sale.companyId),
      storeLogoDataUrl(data.storeLogoUrl),
    ]);
    if (!allowed) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const html = await renderReceiptThermalHtml({ ...data, storeLogoUrl }, paperWidthMm);
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
