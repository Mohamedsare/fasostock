import { NextResponse } from "next/server";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import {
  renderPackagingsHtml,
  type PackagingsPdfItem,
} from "@/lib/server/pdf/packagings-html";
import { createClient } from "@/lib/supabase/server";
import {
  isAllowedPdfEmbedImageUrl,
  requireAuthUser,
  userBelongsToCompany,
} from "@/lib/server/api-auth";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Un catalogue entier tient largement dessous ; au-delà, le PDF n'est plus relisable. */
const MAX_ITEMS = 2000;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseItems(raw: unknown): PackagingsPdfItem[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_ITEMS) : [];
  return list.map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const lotsRaw = Array.isArray(r.lots) ? r.lots : [];
    return {
      name: String(r.name ?? ""),
      sku: r.sku == null ? null : String(r.sku),
      unit: String(r.unit ?? "pce"),
      unitPrice: num(r.unitPrice),
      lots: lotsRaw.map((y) => {
        const l = (y ?? {}) as Record<string, unknown>;
        return {
          label: String(l.label ?? ""),
          factor: Math.max(1, Math.floor(num(l.factor)) || 1),
          total: num(l.total),
          piecePrice: num(l.piecePrice),
          deltaPercent: l.deltaPercent == null ? null : num(l.deltaPercent),
          suspicious: l.suspicious === true,
          barcode: l.barcode == null ? null : String(l.barcode),
        };
      }),
    };
  });
}

/**
 * PDF « Conditionnements » : la feuille qu'on imprime pour relire, au calme, ce que
 * contient chaque carton et à combien revient la pièce.
 *
 * Les lignes viennent du client (elles reproduisent exactement ce qu'il a filtré à
 * l'écran) ; le serveur ne fait qu'authentifier, vérifier l'appartenance à
 * l'entreprise et rendre. Aucun prix n'est recalculé ici — le document doit montrer
 * ce que l'utilisateur avait sous les yeux.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") throw new Error("Corps JSON invalide");

    const companyId = typeof json.companyId === "string" ? json.companyId.trim() : "";
    if (!companyId) throw new Error("companyId requis");

    const allowed = await userBelongsToCompany(supabase, auth.user.id, companyId);
    if (!allowed) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const companyLogoUrl = json.companyLogoUrl == null ? null : String(json.companyLogoUrl);
    const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (companyLogoUrl && !isAllowedPdfEmbedImageUrl(companyLogoUrl, supabasePublicUrl)) {
      return NextResponse.json({ error: "URL de logo non autorisée." }, { status: 400 });
    }

    const html = renderPackagingsHtml({
      companyName: String(json.companyName ?? ""),
      companyLogoSrc: await remoteImageToDataUrl(companyLogoUrl, supabasePublicUrl),
      storeName: String(json.storeName ?? ""),
      scopeLabel: String(json.scopeLabel ?? "Tous les produits"),
      generatedAtIso: String(json.generatedAtIso ?? new Date().toISOString()),
      currencyCode: String(json.currencyCode ?? ""),
      items: parseItems(json.items),
    });

    const buf = await htmlToPdfBufferA4ResilientWithPageNumbers(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="conditionnements.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
