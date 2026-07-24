import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  isAllowedPdfEmbedImageUrl,
  requireAuthUser,
  userBelongsToCompany,
} from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function fcfa(n: number): string {
  return `${Math.max(0, Math.round(Number(n) || 0)).toLocaleString("fr-FR")} F CFA`;
}

const COPY_SYSTEM = `Tu es rédacteur publicitaire pour des commerces d'Afrique de l'Ouest.
Réponds UNIQUEMENT en JSON: {"headline":"...","cta":"..."}.
headline = accroche très courte et vendeuse (2 à 4 mots, majuscules ok). cta = appel à l'action court (ex: Passez en boutique !). Français, pas d'emoji.`;

async function makeCopy(
  client: OpenAI,
  productName: string,
  discountPercent: number,
): Promise<{ headline: string; cta: string }> {
  try {
    const c = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: COPY_SYSTEM },
        { role: "user", content: `Produit: ${productName}. Remise: -${discountPercent}%.` },
      ],
      max_tokens: 60,
      temperature: 0.8,
      response_format: { type: "json_object" },
    });
    const j = JSON.parse(c.choices[0]?.message?.content ?? "{}") as {
      headline?: string;
      cta?: string;
    };
    return {
      headline: String(j.headline ?? "").trim().slice(0, 40) || "PROMO CHOC !",
      cta: String(j.cta ?? "").trim().slice(0, 40) || "Passez en boutique !",
    };
  } catch {
    return { headline: "PROMO CHOC !", cta: "Passez en boutique !" };
  }
}

function buildImagePrompt(p: {
  shopName: string;
  productName: string;
  oldPrice: number;
  newPrice: number;
  discountPercent: number;
  periodLabel: string | null;
  headline: string;
  cta: string;
}): string {
  return `Crée une AFFICHE PUBLICITAIRE PROFESSIONNELLE carrée (format 1:1), style flyer commercial premium haute qualité, couleurs vives et contrastées, mise en page équilibrée et moderne comme une publicité de grande marque.

Mets en valeur LE PRODUIT DE L'IMAGE FOURNIE : garde-le fidèle, reconnaissable et net, bien éclairé (éclairage studio), sur un fond attractif et élégant.

Intègre ces textes de façon TRÈS LISIBLE, sans faute d'orthographe, EXACTEMENT tels quels (français) :
- Nom de la boutique en haut : "${p.shopName}"
- Grand badge promo bien visible : "-${p.discountPercent}%"
- Titre accrocheur : "${p.headline}"
- Nom du produit : "${p.productName}"
- Ancien prix barré : "${fcfa(p.oldPrice)}"
- Nouveau prix en très gros, mis en avant : "${fcfa(p.newPrice)}"${
    p.periodLabel ? `\n- Période de l'offre : "${p.periodLabel}"` : ""
  }
- Appel à l'action en bas : "${p.cta}"

Typographie nette et professionnelle. N'ajoute AUCUN autre texte, ni logo inventé, ni watermark. Rendu final : image carrée prête à publier.`;
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "Clé OpenAI (ChatGPT) non configurée." }, { status: 503 });
  }

  let body: {
    companyId?: string;
    productId?: string;
    imageUrl?: string;
    shopName?: string;
    productName?: string;
    oldPrice?: number;
    newPrice?: number;
    discountPercent?: number;
    periodLabel?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const companyId = String(body.companyId ?? "").trim();
  const productId = String(body.productId ?? "").trim();
  const imageUrl = String(body.imageUrl ?? "").trim();
  if (!companyId || !productId || !imageUrl) {
    return NextResponse.json({ error: "companyId, productId et imageUrl requis" }, { status: 400 });
  }

  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;
  const member = await userBelongsToCompany(supabase, auth.user.id, companyId);
  if (!member) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  // Interrupteur GLOBAL (super admin) : la fonctionnalité doit être activée pour la plateforme.
  const { data: featureOn } = await supabase.rpc("promo_ad_generation_enabled");
  if (featureOn !== true) {
    return NextResponse.json(
      { error: "Fonctionnalité désactivée par l'administrateur de la plateforme." },
      { status: 403 },
    );
  }

  const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!isAllowedPdfEmbedImageUrl(imageUrl, supabasePublicUrl)) {
    return NextResponse.json({ error: "Image source non autorisée." }, { status: 400 });
  }

  const { data: prod } = await supabase
    .from("products")
    .select("id, company_id")
    .eq("id", productId)
    .maybeSingle();
  if (!prod || String((prod as { company_id?: string }).company_id ?? "") !== companyId) {
    return NextResponse.json({ error: "Produit invalide pour cette entreprise." }, { status: 403 });
  }

  // 1) Récupère la vraie photo du produit.
  let srcBytes: Buffer;
  try {
    const r = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error("fetch");
    const ab = await r.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > 8_000_000) throw new Error("size");
    srcBytes = Buffer.from(ab);
  } catch {
    return NextResponse.json({ error: "Impossible de lire la photo du produit." }, { status: 400 });
  }

  const shopName = String(body.shopName ?? "Notre boutique").trim().slice(0, 60);
  const productName = String(body.productName ?? "Produit").trim().slice(0, 60);
  const oldPrice = Math.max(0, Math.round(Number(body.oldPrice ?? 0)));
  const newPrice = Math.max(0, Math.round(Number(body.newPrice ?? 0)));
  const discountPercent = Math.max(0, Math.min(100, Math.round(Number(body.discountPercent ?? 0))));
  const periodLabel = body.periodLabel ? String(body.periodLabel).trim().slice(0, 60) : null;

  const client = new OpenAI({ apiKey: key });

  // 2) Accroche + CTA (texte).
  const copy = await makeCopy(client, productName, discountPercent);

  // 3) Affiche carrée (image-to-image gpt-image-1).
  let b64: string | null = null;
  try {
    const image = await toFile(srcBytes, "product.png", { type: "image/png" });
    const result = await client.images.edit({
      model: "gpt-image-1",
      image,
      prompt: buildImagePrompt({
        shopName,
        productName,
        oldPrice,
        newPrice,
        discountPercent,
        periodLabel,
        headline: copy.headline,
        cta: copy.cta,
      }),
      size: "1024x1024",
      quality: "high",
      n: 1,
    });
    b64 = result.data?.[0]?.b64_json ?? null;
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? err.status ?? 502 : 502;
    let msg = "Génération de l'affiche impossible.";
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401) msg = "Clé OpenAI invalide.";
      else if (err.status === 403)
        msg = "Génération d'images non autorisée : l'organisation OpenAI doit être vérifiée pour gpt-image-1.";
      else if (err.status === 429) msg = "Limite OpenAI atteinte, réessayez dans un instant.";
    }
    return NextResponse.json({ error: msg }, { status: status === 401 || status === 403 ? 503 : 502 });
  }

  if (!b64) return NextResponse.json({ error: "Affiche générée vide." }, { status: 502 });

  return NextResponse.json({ imageBase64: b64, mime: "image/png", headline: copy.headline });
}
