import { NextResponse } from "next/server";
import OpenAI from "openai";

import { extractJsonFromModelContent } from "@/lib/features/ai/deepseek-parse";
import {
  MATCH_SURE,
  matchCandidates,
  type MatchableProduct,
} from "@/lib/features/pos/ai-cart-match";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * « Panier IA » : le client tend sa liste (papier, écran, message WhatsApp), le
 * caissier la photographie, et le panier se remplit.
 *
 * Deux étages, volontairement séparés :
 *  1. le modèle LIT — il ne fait qu'extraire des libellés et des quantités ;
 *  2. le serveur RAPPROCHE — c'est `ai-cart-match` qui choisit, parmi les produits
 *     RÉELS de la boutique, ceux qui peuvent correspondre.
 * Un modèle qui hallucine un article ne peut donc rien injecter dans le panier :
 * au pire la ligne reste « non reconnue » et le caissier la traite à la main.
 * Aucune vente n'est créée ici — la caisse reste la seule à écrire en base.
 */

const MAX_PRODUCTS = 4000;
const MAX_TURNS = 12;
const MAX_IMAGE_CHARS = 6_000_000;
const MAX_LINES = 60;

const READ_SYSTEM = [
  "Tu assistes un caissier d'un commerce en Afrique de l'Ouest (FasoStock).",
  "Tu reçois la liste de courses d'un client : une photo (liste manuscrite, bon de commande,",
  "capture d'écran WhatsApp, ordonnance...) et/ou des précisions dictées par le caissier.",
  "",
  "Ta mission : en extraire les articles demandés, avec leur quantité.",
  "",
  "Règles impératives :",
  "- Réponds UNIQUEMENT avec un objet JSON valide. Pas de markdown, aucun texte autour.",
  "- N'invente RIEN. Si la photo est illisible ou ne contient pas de liste, renvoie \"items\": [].",
  "- Renvoie la liste COMPLÈTE et à jour après chaque message : si le caissier dit « enlève le savon »",
  "  ou « mets 5 au lieu de 2 », tu renvoies la liste corrigée, pas seulement la modification.",
  "- \"label\" : le nom de l'article tel qu'il est écrit ou dit, nettoyé (sans quantité, sans prix,",
  "  sans puce ni numéro). Garde la marque et le format s'ils sont indiqués (« Savon Mont Blanc 400g »).",
  "- \"quantity\" : entier >= 1. Si aucune quantité n'est écrite, mets 1.",
  "- \"unit\" : l'unité écrite si elle existe (sac, carton, paquet, kg, litre...), sinon \"\".",
  "- \"note\" : très courte précision utile au caissier (« écrit à la main, peu lisible »), sinon \"\".",
  "- \"reply\" : 1 à 2 phrases en français, ton simple et direct, qui disent ce que tu as compris",
  "  et ce qui reste flou. Ne liste pas les articles un par un : le caissier les voit à l'écran.",
  "",
  "Schéma exact :",
  '{ "reply": "string", "items": [ { "label": "string", "quantity": number, "unit": "string", "note": "string" } ] }',
].join("\n");

const PICK_SYSTEM = [
  "Tu rapproches des articles demandés par un client des produits RÉELS d'une boutique.",
  "Pour chaque ligne, on te donne le libellé demandé et une courte liste de produits candidats numérotés.",
  "",
  "Règles impératives :",
  "- Réponds UNIQUEMENT avec un objet JSON valide, sans markdown.",
  "- Pour chaque ligne, choisis l'index du candidat qui désigne le MÊME article, ou null si aucun",
  "  ne correspond vraiment. Dans le doute, mets null : une erreur de produit coûte plus cher au",
  "  commerçant qu'une ligne à saisir à la main.",
  "- Ne choisis jamais un candidat au seul motif qu'il partage un mot (« huile moteur » n'est pas « huile de cuisine »).",
  "",
  'Schéma exact : { "picks": [ { "line": number, "index": number|null } ] }',
].join("\n");

type IncomingTurn = { role?: unknown; text?: unknown; image?: unknown };

type ReadItem = { label: string; quantity: number; unit: string; note: string };

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "Le panier IA n'est pas configuré sur ce serveur." },
      { status: 503 },
    );
  }

  let body: {
    companyId?: string;
    storeId?: string;
    messages?: IncomingTurn[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const companyId = String(body.companyId ?? "").trim();
  const storeId = String(body.storeId ?? "").trim();
  if (!companyId || !storeId) {
    return NextResponse.json({ error: "companyId et storeId requis" }, { status: 400 });
  }

  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  const member = await userBelongsToCompany(supabase, auth.user.id, companyId);
  if (!member) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  // Fonction fermée par défaut : le propriétaire l'ouvre depuis Paramètres.
  const { data: flagRow, error: flagErr } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "ai_cart_vision_enabled")
    .maybeSingle();
  if (flagErr) {
    return NextResponse.json({ error: flagErr.message }, { status: 500 });
  }
  if (!truthy((flagRow as { value?: unknown } | null)?.value)) {
    return NextResponse.json(
      { error: "Le panier IA n'est pas activé pour cette entreprise." },
      { status: 403 },
    );
  }

  const turns = normalizeTurns(body.messages);
  if (turns.length === 0) {
    return NextResponse.json(
      { error: "Envoyez une photo de la liste ou décrivez la commande." },
      { status: 400 },
    );
  }

  let catalog: MatchableProduct[];
  try {
    catalog = await loadCatalog(supabase, companyId, storeId);
  } catch (e) {
    return NextResponse.json(
      { error: (e as { message?: string } | null)?.message ?? "Catalogue illisible" },
      { status: 500 },
    );
  }
  if (catalog.length === 0) {
    return NextResponse.json(
      { error: "Cette boutique n'a aucun produit vendable au comptoir." },
      { status: 409 },
    );
  }

  const client = new OpenAI({ apiKey: key, timeout: 90_000 });

  let read: { reply: string; items: ReadItem[] };
  try {
    read = await readList(client, turns);
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    return NextResponse.json(
      {
        error:
          status === 429
            ? "L'assistant IA est saturé, réessayez dans un instant."
            : "L'assistant IA est injoignable pour le moment.",
      },
      { status: 502 },
    );
  }

  const lines = read.items.slice(0, MAX_LINES).map((it) => ({
    label: it.label,
    quantity: it.quantity,
    unit: it.unit,
    note: it.note,
    candidates: matchCandidates(it.label, catalog),
  }));

  /*
   * Étage 2 : le rapprochement lexical se trompe sur les synonymes du terrain
   * (« sucre roux » / « sucre en morceaux », un nom de marque pour une catégorie).
   * On ne redemande au modèle QUE les lignes indécises, et uniquement pour choisir
   * parmi des produits qui existent déjà.
   */
  const unsure = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.candidates.length > 0 && l.candidates[0].score < MATCH_SURE);

  const picked = new Map<number, string | null>();
  if (unsure.length > 0) {
    try {
      const picks = await pickCandidates(
        client,
        unsure.map(({ l, i }) => ({ line: i, label: l.label, candidates: l.candidates })),
      );
      for (const p of picks) picked.set(p.line, p.productId);
    } catch {
      /* Le rapprochement lexical reste affiché : le caissier tranche à l'écran. */
    }
  }

  return NextResponse.json({
    reply: read.reply,
    lines: lines.map((l, i) => ({
      label: l.label,
      quantity: l.quantity,
      unit: l.unit,
      note: l.note,
      productId:
        l.candidates.length > 0 && l.candidates[0].score >= MATCH_SURE
          ? l.candidates[0].id
          : (picked.get(i) ?? null),
      candidates: l.candidates,
    })),
  });
}

function truthy(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

type Turn = { role: "user" | "assistant"; text: string; image: string | null };

function normalizeTurns(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const out: Turn[] = [];
  for (const t of raw as IncomingTurn[]) {
    const role = t?.role === "assistant" ? "assistant" : "user";
    const text = String(t?.text ?? "").trim().slice(0, 2000);
    const imageRaw = typeof t?.image === "string" ? t.image.trim() : "";
    const image =
      role === "user" &&
      imageRaw.length <= MAX_IMAGE_CHARS &&
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(imageRaw)
        ? imageRaw
        : null;
    if (!text && !image) continue;
    out.push({ role, text, image });
  }
  // Seuls les derniers échanges comptent : au-delà, on paierait un contexte que le
  // modèle n'utilise plus (la liste à jour est renvoyée entièrement à chaque tour).
  return out.slice(-MAX_TURNS);
}

async function loadCatalog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  storeId: string,
): Promise<MatchableProduct[]> {
  const [inv, prods] = await Promise.all([
    supabase
      .from("store_inventory")
      .select("product_id, quantity")
      .eq("store_id", storeId)
      .limit(MAX_PRODUCTS),
    supabase
      .from("products")
      .select("id, name, search_aliases, sku, barcode, unit, sale_price, product_scope")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .limit(MAX_PRODUCTS),
  ]);
  if (inv.error) throw inv.error;
  if (prods.error) throw prods.error;

  const stock = new Map<string, number>();
  for (const r of (inv.data ?? []) as Array<{ product_id: string; quantity: unknown }>) {
    stock.set(String(r.product_id), Number(r.quantity ?? 0));
  }

  const rows = (prods.data ?? []) as Array<{
    id: string;
    name: string;
    search_aliases: string[] | null;
    sku: string | null;
    barcode: string | null;
    unit: string | null;
    sale_price: unknown;
    product_scope: string | null;
  }>;

  return (
    rows
      // Le stock d'entrepôt ne se vend pas au comptoir : même filtre que la caisse.
      .filter((p) => {
        const scope = p.product_scope ?? "both";
        return scope === "both" || scope === "boutique_only";
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        unit: p.unit,
        salePrice: Number(p.sale_price ?? 0),
        aliases: p.search_aliases,
        stock: stock.get(p.id) ?? 0,
      }))
  );
}

async function readList(
  client: OpenAI,
  turns: Turn[],
): Promise<{ reply: string; items: ReadItem[] }> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: READ_SYSTEM },
  ];
  for (const t of turns) {
    if (t.role === "assistant") {
      messages.push({ role: "assistant", content: t.text });
      continue;
    }
    if (t.image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: t.text || "Voici la liste du client." },
          { type: "image_url", image_url: { url: t.image, detail: "high" } },
        ],
      });
    } else {
      messages.push({ role: "user", content: t.text });
    }
  }

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 1500,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const content = res.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(extractJsonFromModelContent(content)) as {
    reply?: unknown;
    items?: unknown;
  };

  const items: ReadItem[] = [];
  for (const raw of Array.isArray(parsed.items) ? parsed.items : []) {
    const o = raw as Record<string, unknown>;
    const label = String(o.label ?? "").trim().slice(0, 120);
    if (!label) continue;
    items.push({
      label,
      quantity: Math.max(1, Math.min(9999, Math.round(Number(o.quantity ?? 1) || 1))),
      unit: String(o.unit ?? "").trim().slice(0, 24),
      note: String(o.note ?? "").trim().slice(0, 160),
    });
  }

  return { reply: String(parsed.reply ?? "").trim().slice(0, 600), items };
}

async function pickCandidates(
  client: OpenAI,
  lines: Array<{
    line: number;
    label: string;
    candidates: Array<{ id: string; name: string }>;
  }>,
): Promise<Array<{ line: number; productId: string | null }>> {
  const userContent = lines
    .map((l) =>
      [
        `ligne=${l.line} demandé="${l.label}"`,
        ...l.candidates.map((c, i) => `  ${i}. ${c.name}`),
      ].join("\n"),
    )
    .join("\n");

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: PICK_SYSTEM },
      { role: "user", content: userContent },
    ],
    max_tokens: 600,
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(
    extractJsonFromModelContent(res.choices[0]?.message?.content ?? ""),
  ) as { picks?: unknown };

  const byLine = new Map(lines.map((l) => [l.line, l.candidates]));
  const out: Array<{ line: number; productId: string | null }> = [];
  for (const raw of Array.isArray(parsed.picks) ? parsed.picks : []) {
    const o = raw as Record<string, unknown>;
    const line = Number(o.line);
    const candidates = byLine.get(line);
    if (!candidates) continue;
    const idx = o.index == null ? null : Number(o.index);
    // Un index hors liste = produit inventé : on ne garde rien.
    out.push({
      line,
      productId:
        idx != null && Number.isInteger(idx) && idx >= 0 && idx < candidates.length
          ? candidates[idx].id
          : null,
    });
  }
  return out;
}
