import {
  extractJsonFromModelContent,
  parseStructuredFromDeepseekJson,
} from "@/lib/features/ai/deepseek-parse";
import { NextResponse } from "next/server";

const STRUCTURED_SYSTEM_PROMPT = `Tu es un expert IA senior en pilotage commercial et gestion de stock (FasoStock).
Objectif: fournir des prédictions robustes, actionnables et un discours valorisant orienté performance.
Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans texte avant ou après. Pas de markdown, pas de \`\`\`json.

Règles de qualité obligatoires:
- Utilise uniquement les données fournies (aucune invention).
- Donne des hypothèses prudentes et cohérentes avec la tendance observée.
- Les montants forecast_* doivent être des nombres strictement positifs et réalistes en XOF.
- recommendations: exactement 3 à 6 actions concrètes, chacune commençant par un verbe d'action.
- commentary: ton professionnel, positif et valorisant; mets en avant les points forts, puis les leviers d'amélioration.
- alerts: seulement si nécessaire; pas d'alarmisme inutile.

Schéma strict de l'objet à renvoyer (tous les champs obligatoires) :
{
  "forecast_week_ca": number (estimation CA en XOF pour la semaine à venir, 0 si impossible),
  "forecast_month_ca": number (estimation CA en XOF pour le mois à venir, 0 si impossible),
  "trend": "up" | "down" | "stable",
  "trend_reason": "string (une phrase)",
  "restock_priorities": [ { "product_name": "string", "quantity_suggested": "string (ex: 20 unités)", "priority": "high"|"medium"|"low" } ],
  "alerts": [ { "type": "string (ex: rupture, promo, trésorerie)", "message": "string" } ],
  "recommendations": [ { "action": "string" } ],
  "commentary": "string (résumé en 2 à 4 paragraphes en français: prévision CA, réappro, alertes, recommandations)"
}
Utilise les noms de produits des données fournies pour restock_priorities. Garde des tableaux vides [] si rien à signaler.`;

function enforceQuality(structured: ReturnType<typeof parseStructuredFromDeepseekJson>) {
  const week = Number.isFinite(structured.forecastWeekCa) ? Math.max(0, structured.forecastWeekCa) : 0;
  const month = Number.isFinite(structured.forecastMonthCa) ? Math.max(0, structured.forecastMonthCa) : 0;

  const normalizedRecommendations = structured.recommendations
    .map((r) => ({ action: String(r.action ?? "").trim() }))
    .filter((r) => r.action.length >= 8)
    .slice(0, 6);

  if (normalizedRecommendations.length === 0) {
    normalizedRecommendations.push(
      { action: "Renforcer les réassorts sur les meilleures ventes pour sécuriser la croissance." },
      { action: "Optimiser les prix sur les produits à forte rotation pour améliorer la marge." },
      { action: "Mettre en place un suivi hebdomadaire des alertes stock pour éviter les ruptures." },
    );
  }

  const commentary = (structured.commentary || "").trim();
  const strongCommentary =
    commentary.length >= 80
      ? commentary
      : "L'activité montre une base commerciale solide avec des opportunités concrètes de progression. En capitalisant sur les meilleures ventes, en anticipant les réassorts et en pilotant les marges de façon hebdomadaire, l'entreprise peut sécuriser une croissance régulière et durable.";

  return {
    ...structured,
    forecastWeekCa: week,
    forecastMonthCa: month,
    recommendations: normalizedRecommendations,
    commentary: strongCommentary,
  };
}

export async function POST(req: Request) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "Clé API DeepSeek non configurée" }, { status: 503 });
  }

  let body: { contextText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const contextText = body.contextText?.trim();
  if (!contextText) {
    return NextResponse.json({ error: "contextText requis" }, { status: 400 });
  }

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: STRUCTURED_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Données:\n${contextText}\n\nRéponds UNIQUEMENT avec l'objet JSON demandé (forecast en XOF, tableaux restock_priorities/alerts/recommendations, commentary en français).`,
        },
      ],
      max_tokens: 1200,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const t = await response.text();
    return NextResponse.json({ error: `DeepSeek API: ${response.status} ${t}` }, { status: 502 });
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (content == null) {
    return NextResponse.json({ error: "Réponse DeepSeek invalide" }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonFromModelContent(content)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Réponse IA invalide (JSON attendu)" }, { status: 502 });
  }

  const forecastWeekCa = Number(parsed.forecast_week_ca ?? 0);
  const forecastMonthCa = Number(parsed.forecast_month_ca ?? 0);
  if (forecastWeekCa === 0 && forecastMonthCa === 0) {
    return NextResponse.json({ error: "Réponse IA incomplète" }, { status: 502 });
  }

  const structured = enforceQuality(parseStructuredFromDeepseekJson(parsed));
  const text = structured.commentary || "";

  return NextResponse.json({ structured, text });
}
