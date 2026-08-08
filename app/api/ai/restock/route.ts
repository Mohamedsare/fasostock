import { NextResponse } from "next/server";

import { extractJsonFromModelContent } from "@/lib/features/ai/deepseek-parse";
import { mapRestockRow } from "@/lib/features/restock/map-row";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Avis IA sur le réassort : quelle quantité commander pour chaque produit, et pourquoi.
 *
 * Le serveur recalcule LUI-MÊME les candidats (RPC `restock_candidates`) : le client
 * ne peut donc pas faire raisonner l'IA sur des chiffres inventés. Le modèle ne voit
 * que des lignes réelles, référencées par un numéro d'ordre — pas par nom, ce qui
 * évite toute confusion entre deux produits aux libellés proches.
 */

const SYSTEM_PROMPT = `Tu es un expert en gestion de stock pour un commerce en Afrique de l'Ouest (FasoStock).
On te donne, pour chaque produit, l'historique réel : ventes sur la période, vitesse de vente par jour,
stock actuel, seuil d'alerte, jours de couverture restants et une quantité conseillée calculée
statistiquement (vitesse × jours de couverture visés − stock).

Ta mission : décider la quantité à COMMANDER pour chaque produit et l'expliquer en une phrase simple.

Règles impératives :
- Réponds UNIQUEMENT avec un objet JSON valide. Pas de markdown, pas de \`\`\`json, aucun texte autour.
- Utilise exclusivement les données fournies. N'invente aucun produit, aucun chiffre.
- Réfère chaque produit par son numéro "ref" tel que fourni. Ne renvoie jamais de nom à la place.
- Reste proche de la quantité conseillée : tu peux l'ajuster de -50 % à +100 % au maximum,
  et seulement si les données le justifient (rupture totale, vente très régulière, produit à faible rotation).
- Arrondis à des quantités d'achat réalistes (5, 10, 12, 20, 24, 50…), sans jamais descendre sous 1.
- "priority": "high" si le produit est en rupture ou couvre moins de 7 jours, "low" s'il tient encore,
  "medium" sinon.
- "reason": une seule phrase en français, concrète et chiffrée (ex. « Vend 3/jour, il reste 4 jours de stock »).
- "summary": 2 à 4 phrases en français résumant la commande : les urgences d'abord, le budget ensuite,
  ton professionnel et encourageant.

Schéma exact :
{
  "items": [ { "ref": number, "quantity": number, "priority": "high"|"medium"|"low", "reason": "string" } ],
  "summary": "string"
}`;

const MAX_ITEMS_SENT = 40;

export async function POST(req: Request) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "L'assistant IA n'est pas configuré. Les quantités conseillées restent disponibles." },
      { status: 503 },
    );
  }

  let body: {
    companyId?: string;
    storeId?: string | null;
    days?: number;
    coverDays?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const companyId = String(body.companyId ?? "").trim();
  if (!companyId) {
    return NextResponse.json({ error: "companyId requis" }, { status: 400 });
  }
  const storeId =
    body.storeId == null ? null : String(body.storeId).trim() || null;
  const days = clampInt(body.days, 7, 365, 30);
  const coverDays = clampInt(body.coverDays, 7, 180, 30);

  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  const member = await userBelongsToCompany(supabase, auth.user.id, companyId);
  if (!member) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  // Le module doit être actif ici : sinon la page n'existe pas pour ce client.
  const { data: moduleOn, error: flagErr } = await supabase.rpc("restock_module_enabled", {
    p_company_id: companyId,
    p_store_id: storeId,
  });
  if (flagErr) {
    return NextResponse.json({ error: flagErr.message }, { status: 500 });
  }
  if (moduleOn !== true) {
    return NextResponse.json(
      { error: "Le module Réassort n'est pas activé pour cette boutique." },
      { status: 403 },
    );
  }

  const { data: rows, error: rpcErr } = await supabase.rpc("restock_candidates", {
    p_company_id: companyId,
    p_store_id: storeId,
    p_days: days,
    p_cover_days: coverDays,
    p_limit: 100,
  });
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const candidates = ((rows ?? []) as Record<string, unknown>[])
    .map(mapRestockRow)
    .slice(0, MAX_ITEMS_SENT);

  if (candidates.length === 0) {
    return NextResponse.json({
      items: [],
      summary: "Aucun produit à recommander : vos meilleures ventes ont assez de stock.",
    });
  }

  // `ref` = position dans la liste. Le modèle ne manipule jamais d'identifiant technique.
  const lines = candidates.map((c, i) =>
    [
      `ref=${i + 1}`,
      `produit="${c.productName}"`,
      `vendu_${days}j=${c.soldQty}`,
      `ventes=${c.salesCount}`,
      `vitesse_jour=${c.dailyRate}`,
      `stock=${c.stock}`,
      `seuil=${c.stockMin}`,
      `couverture_jours=${c.coverDays == null ? "n/a" : c.coverDays}`,
      `conseil_calcule=${c.suggestedQty}`,
      `prix_achat=${c.lastPurchasePrice ?? c.purchasePrice}`,
      `urgence=${c.urgency}`,
    ].join(" "),
  );

  const userContent = [
    `Période analysée : ${days} derniers jours. Couverture visée : ${coverDays} jours.`,
    `Produits (${candidates.length}) :`,
    ...lines,
    "",
    "Renvoie UNIQUEMENT l'objet JSON demandé, avec un item par ref ci-dessus.",
  ].join("\n");

  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 2000,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      /* Une connexion DeepSeek qui pend garderait un slot de concurrence occupé jusqu'au
         délai de l'hébergeur — de quoi rendre l'app injoignable sous quelques requêtes. */
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return NextResponse.json(
      { error: "L'assistant IA est injoignable pour le moment." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const t = await response.text();
    return NextResponse.json({ error: `DeepSeek API: ${response.status} ${t}` }, { status: 502 });
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (content == null) {
    return NextResponse.json({ error: "Réponse IA invalide" }, { status: 502 });
  }

  let parsed: { items?: unknown; summary?: unknown };
  try {
    parsed = JSON.parse(extractJsonFromModelContent(content)) as typeof parsed;
  } catch {
    return NextResponse.json({ error: "Réponse IA invalide (JSON attendu)" }, { status: 502 });
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const seen = new Set<string>();
  const items: {
    productId: string;
    quantity: number;
    priority: "high" | "medium" | "low";
    reason: string;
  }[] = [];

  for (const raw of rawItems) {
    if (raw == null || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const ref = Number(r.ref);
    if (!Number.isInteger(ref) || ref < 1 || ref > candidates.length) continue;
    const candidate = candidates[ref - 1]!;
    if (seen.has(candidate.productId)) continue;
    seen.add(candidate.productId);

    // Garde-fou : l'IA reste dans une fourchette autour du calcul statistique.
    const base = candidate.suggestedQty;
    const proposed = Math.round(Number(r.quantity));
    const quantity = Number.isFinite(proposed)
      ? Math.min(Math.max(proposed, Math.max(1, Math.floor(base * 0.5))), Math.max(1, base * 2))
      : base;

    const priorityRaw = String(r.priority ?? "");
    const priority =
      priorityRaw === "high" || priorityRaw === "low"
        ? (priorityRaw as "high" | "low")
        : ("medium" as const);

    items.push({
      productId: candidate.productId,
      quantity,
      priority,
      reason: String(r.reason ?? "").trim().slice(0, 220),
    });
  }

  const summary = String(parsed.summary ?? "").trim().slice(0, 1200);

  return NextResponse.json({ items, summary });
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
