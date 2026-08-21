import { NextResponse } from "next/server";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import { renderStoreProductsHtml } from "@/lib/server/pdf/store-products-html";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Garde-fous d'embarquement des vignettes.
 *
 * Le magasin exporte tout le catalogue en stock au dépôt : plusieurs centaines
 * de lignes. Sans limites, la route téléchargeait les N images d'un coup
 * (`Promise.all`) et les inlinait toutes en base64 — un HTML de dizaines de Mo
 * que `page.setContent` (20 s) n'avale jamais. Résultat : l'export échouait
 * systématiquement dès que le dépôt était réellement rempli.
 *
 * On borne donc la concurrence, le nombre d'images et le poids total. Au-delà,
 * les lignes restent dans le document — sans vignette. Une liste complète sans
 * photos vaut mieux qu'un PDF qui ne sort pas.
 */
const IMAGE_FETCH_CONCURRENCY = 6;
const MAX_EMBEDDED_IMAGES = 400;
// 8 Mo : mesuré, un HTML de cette taille s'imprime en ~3 s sur Chrome local.
// Chromium serverless étant nettement plus lent, la marge sous les 20 s de
// `setContent` reste confortable. Une vignette pèse ~20 Ko : ~350 photos.
const MAX_EMBEDDED_TOTAL_BYTES = 8_000_000;

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

/**
 * Télécharge et inline les vignettes, quelques-unes à la fois, dans la limite du
 * budget. `remoteImageToDataUrl` refait lui-même le contrôle d'origine (Supabase
 * Storage du projet uniquement) et renvoie `null` sur URL non autorisée : une
 * image douteuse est ignorée au lieu de faire échouer tout le document.
 */
async function embedItemImages(
  items: Array<{ imageUrl: string | null }>,
  supabasePublicUrl: string | undefined,
): Promise<Array<string | null>> {
  const out: Array<string | null> = new Array(items.length).fill(null);
  let budget = MAX_EMBEDDED_TOTAL_BYTES;
  let embedded = 0;
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      if (budget <= 0 || embedded >= MAX_EMBEDDED_IMAGES) return;
      const i = next++;
      if (i >= items.length) return;
      const src = await remoteImageToDataUrl(items[i]!.imageUrl, supabasePublicUrl, "image/jpeg");
      if (!src) continue;
      if (src.length > budget) {
        budget = 0;
        return;
      }
      budget -= src.length;
      embedded++;
      out[i] = src;
    }
  }

  const workers = Math.min(IMAGE_FETCH_CONCURRENCY, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
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
    const embedded = await embedItemImages(data.items, supabasePublicUrl);
    const itemsWithEmbedded = data.items.map((it, i) => ({ ...it, imageSrc: embedded[i] ?? null }));
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
