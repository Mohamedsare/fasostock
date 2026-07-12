import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string };

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toSafeHistory(v: unknown): Msg[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => {
      const o = e as Record<string, unknown>;
      const role = o.role === "assistant" ? "assistant" : o.role === "user" ? "user" : null;
      const content = asString(o.content).trim();
      if (!role || !content) return null;
      return { role, content } as Msg;
    })
    .filter((e): e is Msg => e != null)
    .slice(-8);
}

const SYSTEM_PROMPT = `Tu es l'Assistant FasoStock, l'assistant commercial et guide de FasoStock — un logiciel de gestion de stock et de point de vente (POS) conçu pour les commerçants et entreprises du Burkina Faso et de l'Afrique de l'Ouest.

Ton rôle est double :
1. Prospection : aider les visiteurs à comprendre la valeur de FasoStock, répondre à leurs questions, lever leurs objections et les orienter vers un essai ou un abonnement.
2. Guide : expliquer les fonctionnalités, le fonctionnement, la tarification et le démarrage.

À propos de FasoStock :
- Logiciel SaaS de gestion de stock, caisse (POS), crédits clients, rapports, employés
- Fonctionne hors ligne (synchronisation automatique quand internet revient)
- Application mobile (Android/iOS) + interface web
- Adapté aux commerces : épiceries, pharmacies, quincailleries, boutiques, restaurants, etc.
- Basé au Burkina Faso — paiement via Orange Money, Moov Money, Wave, VISA, MasterCard
- Support WhatsApp disponible

Fonctionnalités clés :
- Caisse (POS) : ventes rapides, reçus, codes-barres, remises
- Gestion de stock : entrées/sorties, alertes de rupture, transferts entre dépôts
- Crédits clients : suivi des dettes et remboursements
- Rapports : chiffre d'affaires, bénéfices, mouvements, employés
- Multi-boutiques : gérer plusieurs points de vente depuis un seul compte
- Hors ligne : fonctionne sans connexion internet
- IA intégrée : prévisions de ventes et réapprovisionnement

Tarification :
- Essai gratuit disponible (sans carte bancaire)
- Abonnement mensuel et annuel (réduction sur l'annuel)
- Voir la section Tarifs sur le site pour les prix exacts

Règles de formatage (TRÈS IMPORTANT) :
- N'utilise JAMAIS de markdown : pas d'astérisques (*), pas de dièses (#), pas de tirets bas (_), pas de backticks.
- Pour les listes, utilise uniquement le tiret simple : - élément
- Pour les titres de section, termine la ligne par " :" et saute une ligne avant et après.
- Texte brut uniquement, propre et lisible.
- Réponds en français uniquement, avec un langage simple et chaleureux.
- Sois concis (2-4 phrases max sauf si on demande un détail).
- Si le visiteur hésite, propose une démo ou le support WhatsApp.
- Termine souvent par une question ou une action concrète.
- N'invente pas de prix précis, renvoie à la section Tarifs du site.`;

export async function POST(req: Request) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "Agent non disponible pour le moment." }, { status: 503 });
  }

  let body: { message?: string; history?: unknown };
  try {
    body = (await req.json()) as { message?: string; history?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const message = asString(body.message).trim();
  if (!message) {
    return NextResponse.json({ error: "message requis" }, { status: 400 });
  }

  const history = toSafeHistory(body.history);

  // DeepSeek est compatible avec l'API OpenAI (chat completions).
  const client = new OpenAI({ apiKey: key, baseURL: "https://api.deepseek.com/v1" });

  let completion: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
      max_tokens: 400,
      temperature: 0.6,
    });
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? err.status ?? 502 : 502;
    const msg =
      err instanceof OpenAI.APIError && err.status === 401
        ? "Clé API DeepSeek invalide."
        : "Erreur lors de la génération de la réponse.";
    return NextResponse.json({ error: msg }, { status: status === 401 ? 503 : 502 });
  }

  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) {
    return NextResponse.json({ error: "Réponse vide de l'IA" }, { status: 502 });
  }

  return NextResponse.json({ answer });
}
