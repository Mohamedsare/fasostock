import { NextResponse } from "next/server";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import { renderStoreProductsHtml } from "@/lib/server/pdf/store-products-html";
import { createClient } from "@/lib/supabase/server";
import { isAllowedPdfEmbedImageUrl, requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  companyId: string;
  storeId?: string | null;
  companyName: string;
  companyLogoUrl?: string | null;
  storeName: string;
  generatedAtIso: string;
  items: Array<{ name: string; imageUrl: string | null; imageSrc?: string | null }>;
};

function parseBody(json: unknown): Body {
  if (!json || typeof json !== "object") throw new Error("Corps JSON invalide");
  const o = json as Record<string, unknown>;
  const companyId = typeof o.companyId === "string" ? o.companyId.trim() : "";
  if (!companyId) throw new Error("companyId requis");
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items = itemsRaw.map((x) => {
    const r = x as Record<string, unknown>;
    return {
      name: String(r.name ?? ""),
      imageUrl: r.imageUrl == null ? null : String(r.imageUrl),
    };
  });
  return {
    companyId,
    storeId: typeof o.storeId === "string" ? o.storeId : o.storeId === null ? null : undefined,
    companyName: String(o.companyName ?? ""),
    companyLogoUrl: o.companyLogoUrl == null ? null : String(o.companyLogoUrl),
    storeName: String(o.storeName ?? ""),
    generatedAtIso: String(o.generatedAtIso ?? new Date().toISOString()),
    items,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json: unknown = await req.json();
    const data = parseBody(json);

    const allowed = await userBelongsToCompany(supabase, auth.user.id, data.companyId);
    if (!allowed) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const storeId = typeof data.storeId === "string" ? data.storeId.trim() : "";
    if (storeId.length > 0) {
      const { data: st, error: stErr } = await supabase
        .from("stores")
        .select("company_id")
        .eq("id", storeId)
        .maybeSingle();
      if (stErr || !st || String((st as { company_id?: string }).company_id ?? "") !== data.companyId) {
        return NextResponse.json({ error: "Boutique invalide pour cette entreprise." }, { status: 403 });
      }
    }

    const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (data.companyLogoUrl && !isAllowedPdfEmbedImageUrl(data.companyLogoUrl, supabasePublicUrl)) {
      return NextResponse.json({ error: "URL de logo non autorisée." }, { status: 400 });
    }
    for (const it of data.items) {
      if (it.imageUrl && !isAllowedPdfEmbedImageUrl(it.imageUrl, supabasePublicUrl)) {
        return NextResponse.json({ error: "URL d'image produit non autorisée." }, { status: 400 });
      }
    }

    const itemsWithEmbedded = await Promise.all(
      data.items.map(async (it) => ({
        ...it,
        imageSrc: await remoteImageToDataUrl(it.imageUrl, supabasePublicUrl, "image/jpeg"),
      })),
    );
    const companyLogoSrc = await remoteImageToDataUrl(data.companyLogoUrl, supabasePublicUrl);
    const html = renderStoreProductsHtml({
      ...data,
      companyLogoSrc,
      items: itemsWithEmbedded,
    });
    const buf = await htmlToPdfBufferA4ResilientWithPageNumbers(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="produits-magasin.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
