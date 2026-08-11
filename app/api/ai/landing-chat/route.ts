import { NextResponse } from "next/server";
import OpenAI from "openai";

import { consumePublicRateLimit } from "@/lib/server/public-rate-limit";

export const runtime = "nodejs";
/**
 * Plafond explicite : sans lui, la durée maximale dépend du réglage de l'hébergeur, qui
 * peut être bien plus généreux que ce que cette route mérite. 40 s couvre le délai LLM
 * (30 s) et la réponse, sans laisser un slot de concurrence occupé plus longtemps.
 */
export const maxDuration = 40;

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Plafonds de taille — la route est publique et le corps de requête n'est borné par rien
 * côté Next. Sans eux, une seule requête pouvait pousser plusieurs mégaoctets de texte
 * vers le fournisseur LLM : facturé à l'entrée, et surtout un slot de concurrence retenu
 * le temps de tout transférer et tokeniser.
 *
 * 2000 caractères pour une question, 1000 par tour d'historique : très large pour un chat
 * de site vitrine où les réponses font 2 à 4 phrases.
 */
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_MESSAGE_CHARS = 1000;
const MAX_HISTORY_MESSAGES = 8;
/** Au-delà, le corps est rejeté sans même être analysé (garde grossière, avant parsing). */
const MAX_BODY_BYTES = 64 * 1024;

/** Quota par adresse IP : 15 questions par tranche de 5 minutes. */
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_SECONDS = 300;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toSafeHistory(v: unknown): Msg[] {
  if (!Array.isArray(v)) return [];
  return v
    // On coupe AVANT de traiter : inutile de parcourir un tableau de 100 000 entrées
    // pour n'en garder que les 8 dernières.
    .slice(-MAX_HISTORY_MESSAGES)
    .map((e) => {
      const o = e as Record<string, unknown>;
      const role = o.role === "assistant" ? "assistant" : o.role === "user" ? "user" : null;
      const content = asString(o.content).trim().slice(0, MAX_HISTORY_MESSAGE_CHARS);
      if (!role || !content) return null;
      return { role, content } as Msg;
    })
    .filter((e): e is Msg => e != null);
}

const SYSTEM_PROMPT = `Tu es l'Assistant FasoStock, l'assistant commercial et guide de FasoStock — un logiciel de gestion de stock et de point de vente (POS) conçu pour les commerçants et entreprises du Burkina Faso et de l'Afrique de l'Ouest.

Ton rôle est double :
1. Prospection : aider les visiteurs à comprendre la valeur de FasoStock, répondre à leurs questions, lever leurs objections et les orienter vers un essai ou un abonnement.
2. Guide : expliquer les fonctionnalités, le fonctionnement, la tarification et le démarrage.

À propos de FasoStock :
- Logiciel SaaS de gestion de stock, caisse (POS), crédits clients, rapports, employés
- Optimisé pour les faibles débits : fonctionne même avec une connexion internet faible ou instable (synchronisation automatique quand le débit s'améliore)
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
- Faible connexion : fonctionne même avec une connexion internet faible (jamais bloqué par un réseau lent)
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

  // Refus immédiat des corps manifestement hors norme, avant tout travail — y compris
  // avant de consommer un jeton de quota.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Message trop long." }, { status: 413 });
  }

  // Limite de débit AVANT l'appel au LLM : c'est l'appel coûteux qu'il s'agit de
  // protéger, pas seulement la base.
  const limit = await consumePublicRateLimit({
    req,
    scope: "landing-chat",
    max: RATE_LIMIT_MAX,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Vous avez envoyé beaucoup de messages. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Corps de requête illisible" }, { status: 400 });
  }
  // `content-length` est déclaratif : on revérifie sur la taille réellement reçue.
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Message trop long." }, { status: 413 });
  }

  let body: { message?: string; history?: unknown };
  try {
    body = JSON.parse(raw) as { message?: string; history?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const message = asString(body.message).trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) {
    return NextResponse.json({ error: "message requis" }, { status: 400 });
  }

  const history = toSafeHistory(body.history);

  /*
   * DeepSeek est compatible avec l'API OpenAI (chat completions).
   *
   * Route **publique** (chat du site vitrine) : c'est la plus exposée. Le SDK attend
   * 10 minutes par défaut et retente 2 fois — soit une demi-heure pendant laquelle une
   * requête garderait son slot de concurrence. Quelques visiteurs sur un incident
   * DeepSeek suffiraient à saturer les fonctions et à emporter tout le site avec elles.
   */
  const client = new OpenAI({
    apiKey: key,
    baseURL: "https://api.deepseek.com/v1",
    timeout: 30_000,
    maxRetries: 1,
  });

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
