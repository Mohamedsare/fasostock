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
 * « Panier IA » de la caisse Facture (tableau) : le client tend sa liste (papier,
 * écran, message WhatsApp) ou envoie son bon de commande en PDF, et le panier se
 * remplit — avec les PRIX ÉCRITS SUR LE DOCUMENT quand il en porte.
 *
 * Deux étages, volontairement séparés :
 *  1. le modèle LIT — il ne fait qu'extraire des libellés et des quantités ;
 *  2. le serveur RAPPROCHE — c'est `ai-cart-match` qui choisit, parmi les produits
 *     RÉELS de la boutique, ceux qui peuvent correspondre.
 * Un modèle qui hallucine un article ne peut donc rien injecter dans le panier :
 * au pire la ligne reste « non reconnue » et le caissier la traite à la main.
 * Aucune vente n'est créée ici — la caisse reste la seule à écrire en base, et
 * c'est elle qui borne au stock disponible et applique les règles du tableau.
 */

const MAX_PRODUCTS = 4000;
const MAX_TURNS = 12;
/** Data URL (base64) : au-delà, la requête ne passerait plus l'hébergeur. */
const MAX_FILE_CHARS = 6_000_000;
const MAX_LINES = 60;

const READ_SYSTEM = [
  "Tu assistes un caissier d'un commerce en Afrique de l'Ouest (FasoStock).",
  "Tu reçois la commande d'un client : une photo (liste manuscrite, capture WhatsApp),",
  "un document PDF (devis, bon de commande, facture, proforma), et/ou des précisions",
  "dictées par le caissier.",
  "",
  "Ta mission : en extraire les articles, leurs quantités, et — s'ils y figurent — leurs",
  "prix unitaires, EXACTEMENT tels qu'ils sont écrits.",
  "",
  "Règles impératives :",
  "- Réponds UNIQUEMENT avec un objet JSON valide. Pas de markdown, aucun texte autour.",
  "- N'invente RIEN. Si le document est illisible ou ne contient aucune liste, renvoie \"items\": [].",
  "- Renvoie la liste COMPLÈTE et à jour après chaque message : si le caissier dit « enlève le savon »",
  "  ou « mets 5 au lieu de 2 », tu renvoies la liste corrigée, pas seulement la modification.",
  "- \"label\" : la désignation de l'article telle qu'elle est écrite, nettoyée (sans numéro de",
  "  ligne, sans quantité, sans prix). Garde la marque, le modèle et le format",
  "  (« Savon Mont Blanc 400g », « DISQUE EMBRAYAGE (SR) SUZUKI F150 »). Si la désignation",
  "  est coupée par des points de suspension, recopie-la telle quelle sans la compléter.",
  "- Ne prends QUE des lignes d'articles. Les lignes de synthèse d'un tableau — TOTAL,",
  "  sous-total, TVA, remise, transport, acompte, « net à payer » — ne sont pas des articles :",
  "  ne les mets jamais dans \"items\". Le total va dans \"documentTotal\", rien d'autre.",
  "- \"quantity\" : entier >= 1. Si aucune quantité n'est écrite, mets 1.",
  "- \"unit\" : l'unité écrite si elle existe (carton, paquet, sac, kg, litre, m²...), sinon \"\".",
  "- \"unitPrice\" : le PRIX UNITAIRE écrit sur le document, en nombre entier, sans espace ni",
  "  devise (« 12 500 F CFA » -> 12500). RECOPIE-LE, ne le recalcule pas et ne l'arrondis pas.",
  "  Si le document ne donne que le total de la ligne et la quantité, laisse unitPrice à null",
  "  et mets ce total dans \"lineTotal\". Si aucun prix n'est écrit, les deux valent null.",
  "- \"lineTotal\" : le total de la ligne écrit sur le document, sinon null.",
  "- \"note\" : très courte précision utile au caissier (« remise -10% notée sur la ligne »), sinon \"\".",
  "- \"documentTotal\" : le total général écrit sur le document (nombre entier), sinon null.",
  "  Ne l'additionne jamais toi-même : c'est ce total qui servira à vérifier ta lecture.",
  "- \"reply\" : 1 à 2 phrases en français, ton simple et direct, qui disent ce que tu as lu et",
  "  ce qui reste flou. Ne liste pas les articles un par un : le caissier les voit à l'écran.",
  "",
  "Schéma exact :",
  '{ "reply": "string", "documentTotal": number|null, "items": [ { "label": "string",',
  '  "quantity": number, "unit": "string", "unitPrice": number|null, "lineTotal": number|null,',
  '  "note": "string" } ] }',
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

type IncomingTurn = { role?: unknown; text?: unknown; file?: unknown };

type ReadItem = {
  label: string;
  quantity: number;
  unit: string;
  note: string;
  /** P.U. RECOPIÉ du document, `null` si le document n'en porte pas. */
  unitPrice: number | null;
  /** Total de ligne écrit sur le document — sert à retrouver un P.U. manquant. */
  lineTotal: number | null;
};

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

  let read: { reply: string; items: ReadItem[]; documentTotal: number | null };
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
    unitPrice: it.unitPrice,
    lineTotal: it.lineTotal,
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
    documentTotal: read.documentTotal,
    lines: lines.map((l, i) => ({
      label: l.label,
      quantity: l.quantity,
      unit: l.unit,
      note: l.note,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
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

type TurnFile = { kind: "image" | "pdf"; dataUrl: string; name: string };

type Turn = { role: "user" | "assistant"; text: string; file: TurnFile | null };

/** Une pièce jointe n'est retenue que si elle est VRAIMENT une image ou un PDF encodés. */
function normalizeFile(raw: unknown): TurnFile | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const dataUrl = typeof o.dataUrl === "string" ? o.dataUrl.trim() : "";
  if (!dataUrl || dataUrl.length > MAX_FILE_CHARS) return null;
  const name = String(o.name ?? "").trim().slice(0, 120);
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    return { kind: "image", dataUrl, name: name || "photo" };
  }
  if (/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    // `filename` est obligatoire côté OpenAI pour une pièce jointe inline.
    return { kind: "pdf", dataUrl, name: name.toLowerCase().endsWith(".pdf") ? name : "document.pdf" };
  }
  return null;
}

function normalizeTurns(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const out: Turn[] = [];
  for (const t of raw as IncomingTurn[]) {
    const role = t?.role === "assistant" ? "assistant" : "user";
    const text = String(t?.text ?? "").trim().slice(0, 2000);
    const file = role === "user" ? normalizeFile(t?.file) : null;
    if (!text && !file) continue;
    out.push({ role, text, file });
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
): Promise<{ reply: string; items: ReadItem[]; documentTotal: number | null }> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: READ_SYSTEM },
  ];
  for (const t of turns) {
    if (t.role === "assistant") {
      messages.push({ role: "assistant", content: t.text });
      continue;
    }
    if (t.file) {
      const attachment: OpenAI.Chat.ChatCompletionContentPart =
        t.file.kind === "pdf"
          ? { type: "file", file: { filename: t.file.name, file_data: t.file.dataUrl } }
          : { type: "image_url", image_url: { url: t.file.dataUrl, detail: "high" } };
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text:
              t.text ||
              (t.file.kind === "pdf"
                ? "Voici le document du client (PDF)."
                : "Voici la liste du client."),
          },
          attachment,
        ],
      });
    } else {
      messages.push({ role: "user", content: t.text });
    }
  }

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    /*
     * Un tableau d'articles de fournisseur fait couramment 30 à 60 lignes, et chaque
     * ligne pèse ~50 jetons en JSON. Trop court, la réponse est coupée en plein objet :
     * le JSON ne parse plus et TOUTE la lecture est perdue — un document de 35 lignes
     * échouait ainsi en bloc. On prévoit donc de quoi rendre `MAX_LINES` lignes.
     */
    max_tokens: 4000,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const content = res.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(extractJsonFromModelContent(content)) as {
    reply?: unknown;
    items?: unknown;
    documentTotal?: unknown;
  };

  const items: ReadItem[] = [];
  for (const raw of Array.isArray(parsed.items) ? parsed.items : []) {
    const o = raw as Record<string, unknown>;
    const label = String(o.label ?? "").trim().slice(0, 120);
    if (!label) continue;
    const quantity = Math.max(1, Math.min(9999, Math.round(Number(o.quantity ?? 1) || 1)));
    const lineTotal = money(o.lineTotal);
    /*
     * Un document ne porte pas toujours le P.U. : beaucoup de bons de commande ne
     * donnent que la quantité et le total de la ligne. On redescend alors au P.U.
     * par division — c'est de l'arithmétique sur des chiffres LUS, jamais une
     * estimation. Une division qui ne tombe pas juste (remise sur la ligne, arrondi)
     * est écartée : mieux vaut laisser le prix du catalogue que d'inventer un tarif.
     */
    const unitPrice =
      money(o.unitPrice) ??
      (lineTotal != null && quantity > 0 && lineTotal % quantity === 0
        ? lineTotal / quantity
        : null);
    items.push({
      label,
      quantity,
      unit: String(o.unit ?? "").trim().slice(0, 24),
      note: String(o.note ?? "").trim().slice(0, 160),
      unitPrice,
      lineTotal,
    });
  }

  return {
    reply: String(parsed.reply ?? "").trim().slice(0, 600),
    items,
    documentTotal: money(parsed.documentTotal),
  };
}

/** Montant lu sur un document : entier positif, ou `null` si ce n'en est pas un. */
function money(raw: unknown): number | null {
  if (raw == null) return null;
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else {
    // « 3 500 FCFA », « 1 400 », « 12.500 », « 1,400 » : on ne garde que les chiffres
    // et les séparateurs, espaces (y compris insécables) compris.
    const cleaned = String(raw).replace(/[^0-9.,-]/g, "");
    /*
     * Pas un seul chiffre : `Number("")` vaut 0, et une ligne serait facturée
     * ZÉRO franc sur un `unitPrice` vide ou fantaisiste renvoyé par le modèle.
     * Absence de prix = `null`, ce qui rend la main au prix du catalogue.
     */
    if (!/\d/.test(cleaned)) return null;
    /*
     * Virgule ou point suivis de TROIS chiffres exactement, sans autre séparateur :
     * c'est un séparateur de milliers, pas des décimales. Sans cette lecture,
     * « 1,400 FCFA » (ligne d'un tableau) devenait 1 F et la facture était fausse.
     * Les centimes n'existent pas en FCFA : rien ne se perd à trancher ainsi.
     */
    const thousandsOnly = /^-?\d{1,3}([.,]\d{3})+$/.test(cleaned);
    n = Number(
      thousandsOnly ? cleaned.replace(/[.,]/g, "") : cleaned.replace(/,/g, "."),
    );
  }
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999) return null;
  return Math.round(n);
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
    // Même raison que la lecture : coupée, la réponse ne parse plus et tous les
    // rapprochements du modèle sont perdus d'un coup.
    max_tokens: Math.min(4000, 200 + lines.length * 40),
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
