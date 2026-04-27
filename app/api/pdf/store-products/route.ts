import { NextResponse } from "next/server";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import { renderStoreProductsHtml } from "@/lib/server/pdf/store-products-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  companyName: string;
  companyLogoUrl?: string | null;
  storeName: string;
  generatedAtIso: string;
  items: Array<{ name: string; imageUrl: string | null; imageSrc?: string | null }>;
};

function parseBody(json: unknown): Body {
  if (!json || typeof json !== "object") throw new Error("Corps JSON invalide");
  const o = json as Record<string, unknown>;
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items = itemsRaw.map((x) => {
    const r = x as Record<string, unknown>;
    return {
      name: String(r.name ?? ""),
      imageUrl: r.imageUrl == null ? null : String(r.imageUrl),
    };
  });
  return {
    companyName: String(o.companyName ?? ""),
    companyLogoUrl: o.companyLogoUrl == null ? null : String(o.companyLogoUrl),
    storeName: String(o.storeName ?? ""),
    generatedAtIso: String(o.generatedAtIso ?? new Date().toISOString()),
    items,
  };
}

async function toDataUrlFromHttp(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    const ab = await res.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const json: unknown = await req.json();
    const data = parseBody(json);
    const itemsWithEmbedded = await Promise.all(
      data.items.map(async (it) => {
        if (!it.imageUrl) return { ...it, imageSrc: null };
        if (it.imageUrl.startsWith("data:")) return { ...it, imageSrc: it.imageUrl };
        const embedded = await toDataUrlFromHttp(it.imageUrl);
        return { ...it, imageSrc: embedded ?? it.imageUrl };
      }),
    );
    const companyLogoSrc =
      data.companyLogoUrl && data.companyLogoUrl.trim().length > 0
        ? await toDataUrlFromHttp(data.companyLogoUrl).catch(() => null)
        : null;
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
