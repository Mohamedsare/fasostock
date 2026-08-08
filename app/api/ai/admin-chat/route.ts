import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Sans plafond, une connexion DeepSeek qui reste ouverte sans jamais répondre garde
 * la fonction serverless — et son slot de concurrence — occupée jusqu'au délai de
 * l'hébergeur. Quelques requêtes de ce type suffisent à rendre l'app injoignable.
 */
const LLM_TIMEOUT_MS = 60_000;

type Msg = { role: "user" | "assistant"; content: string };
type SuggestedAction = {
  type: "set_company_active" | "set_company_ai_predictions";
  company_name: string;
  value: boolean;
  reason: string;
};

type StructuredAnswer = {
  intro: string;
  direct_answer: string;
  table_title: string;
  table_columns: string[];
  table_rows: string[][];
  key_figures: string[];
  recommended_actions: string[];
};

function normalizeStructuredAnswer(v: unknown): StructuredAnswer {
  const obj = (v ?? {}) as Record<string, unknown>;
  const cols = Array.isArray(obj.table_columns)
    ? obj.table_columns.map((e) => String(e ?? "").trim()).filter((e) => e.length > 0).slice(0, 6)
    : [];
  const rows = Array.isArray(obj.table_rows)
    ? obj.table_rows
        .map((r) =>
          Array.isArray(r)
            ? r.map((c) => String(c ?? "").trim()).slice(0, Math.max(cols.length, 1))
            : null,
        )
        .filter((r): r is string[] => r != null && r.length > 0)
        .slice(0, 30)
    : [];
  const keyFigures = Array.isArray(obj.key_figures)
    ? obj.key_figures.map((e) => String(e ?? "").trim()).filter((e) => e.length > 0).slice(0, 10)
    : [];
  const actions = Array.isArray(obj.recommended_actions)
    ? obj.recommended_actions.map((e) => String(e ?? "").trim()).filter((e) => e.length > 0).slice(0, 10)
    : [];
  return {
    intro: String(obj.intro ?? "Voici la synthese demandee.").trim(),
    direct_answer: String(obj.direct_answer ?? "").trim(),
    table_title: String(obj.table_title ?? "Liste").trim(),
    table_columns: cols.length > 0 ? cols : ["Element", "Detail", "Observation"],
    table_rows: rows.length > 0 ? rows : [["Synthese", "Donnees disponibles", "Analyse en cours"]],
    key_figures: keyFigures.length > 0 ? keyFigures : ["Indicateurs disponibles selon le contexte SaaS."],
    recommended_actions:
      actions.length > 0
        ? actions
        : ["Verifier les indicateurs prioritaires.", "Executer les actions IA pertinentes."],
  };
}

function asPlainAnswer(v: StructuredAnswer): string {
  const lines: string[] = [];
  lines.push(v.intro);
  lines.push("");
  lines.push("Reponse directe:");
  lines.push(v.direct_answer);
  lines.push("");
  lines.push(v.table_title + ":");
  lines.push(v.table_columns.join(" | "));
  for (const row of v.table_rows.slice(0, 8)) lines.push(row.join(" | "));
  lines.push("");
  lines.push("Chiffres cles:");
  for (const k of v.key_figures) lines.push(`- ${k}`);
  lines.push("");
  lines.push("Actions recommandees:");
  v.recommended_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  return lines.join("\n");
}

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
    .slice(-10);
}

async function ensureSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, reason: "not_auth" };
  const { data: isSa, error } = await supabase.rpc("is_super_admin");
  if (error) return { ok: false as const, reason: error.message };
  if (!isSa) return { ok: false as const, reason: "forbidden" };
  return { ok: true as const, supabase };
}

export async function POST(req: Request) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "Clé API DeepSeek non configurée" }, { status: 503 });
  }

  const auth = await ensureSuperAdmin();
  if (!auth.ok) {
    const status = auth.reason === "not_auth" ? 401 : auth.reason === "forbidden" ? 403 : 500;
    return NextResponse.json({ error: "Non autorisé" }, { status });
  }

  let body: { question?: string; companyId?: string | null; history?: unknown };
  try {
    body = (await req.json()) as { question?: string; companyId?: string | null; history?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const question = asString(body.question).trim();
  if (!question) {
    return NextResponse.json({ error: "question requise" }, { status: 400 });
  }

  const companyId = body.companyId && String(body.companyId).trim() ? String(body.companyId) : null;
  const history = toSafeHistory(body.history);
  const supabase = auth.supabase;

  let companyName = "Toutes les entreprises";
  let companiesCount = 0;

  let companiesQ = supabase.from("companies").select("id, name, is_active, created_at").order("name", { ascending: true });
  if (companyId) companiesQ = companiesQ.eq("id", companyId);
  const { data: companies, error: companiesError } = await companiesQ.limit(40);
  if (companiesError) return NextResponse.json({ error: companiesError.message }, { status: 500 });
  const companiesRows = (companies ?? []) as Array<Record<string, unknown>>;
  companiesCount = companiesRows.length;
  if (companyId && companiesRows[0]?.name) companyName = String(companiesRows[0].name);

  let storesQ = supabase.from("stores").select("id, company_id, name, city, is_active");
  if (companyId) storesQ = storesQ.eq("company_id", companyId);
  const { data: stores, error: storesError } = await storesQ.limit(120);
  if (storesError) return NextResponse.json({ error: storesError.message }, { status: 500 });

  let subsQ = supabase
    .from("company_subscriptions")
    .select("company_id, status, current_period_start, current_period_end, cancel_at_period_end");
  if (companyId) subsQ = subsQ.eq("company_id", companyId);
  const { data: subs, error: subsError } = await subsQ.limit(60);
  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 500 });

  const since90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  let salesQ = supabase
    .from("sales")
    .select("id, company_id, total, status, created_at")
    .eq("status", "completed")
    .gte("created_at", since90)
    .order("created_at", { ascending: false });
  if (companyId) salesQ = salesQ.eq("company_id", companyId);
  const { data: sales, error: salesError } = await salesQ.limit(4000);
  if (salesError) return NextResponse.json({ error: salesError.message }, { status: 500 });

  let errorsQ = supabase
    .from("app_error_logs")
    .select("id, company_id, level, source, message, created_at")
    .order("created_at", { ascending: false });
  if (companyId) errorsQ = errorsQ.eq("company_id", companyId);
  const { data: appErrors, error: appErrorsError } = await errorsQ.limit(120);
  if (appErrorsError) return NextResponse.json({ error: appErrorsError.message }, { status: 500 });

  const salesRows = (sales ?? []) as Array<Record<string, unknown>>;
  const totalSales = salesRows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const salesCount = salesRows.length;

  const salesByCompany = new Map<string, { name: string; total: number; count: number }>();
  for (const c of companiesRows) {
    salesByCompany.set(String(c.id ?? ""), { name: String(c.name ?? ""), total: 0, count: 0 });
  }
  for (const r of salesRows) {
    const id = String(r.company_id ?? "");
    const cur = salesByCompany.get(id) ?? { name: id, total: 0, count: 0 };
    cur.total += Number(r.total ?? 0);
    cur.count += 1;
    salesByCompany.set(id, cur);
  }

  const topCompanies = [...salesByCompany.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((e) => ({
      company: e.name,
      total_xof: Math.round(e.total),
      sales_count: e.count,
    }));

  const contextPayload = {
    scope: companyId ? `Entreprise ciblée: ${companyName}` : "Vue globale multi-entreprises",
    kpis: {
      companies_count: companiesCount,
      stores_count: (stores ?? []).length,
      sales_90d_count: salesCount,
      sales_90d_total_xof: Math.round(totalSales),
      subscriptions_count: (subs ?? []).length,
      recent_app_errors_count: (appErrors ?? []).length,
    },
    companies: companiesRows.map((c) => ({
      id: String(c.id ?? ""),
      name: String(c.name ?? ""),
      is_active: c.is_active === true,
      created_at: c.created_at ? String(c.created_at) : null,
    })),
    subscriptions: (subs ?? []).map((s) => {
      const r = s as Record<string, unknown>;
      return {
        company_id: String(r.company_id ?? ""),
        status: String(r.status ?? ""),
        current_period_end: r.current_period_end ? String(r.current_period_end) : null,
      };
    }),
    top_companies_90d: topCompanies,
    recent_errors: (appErrors ?? []).slice(0, 20).map((e) => {
      const r = e as Record<string, unknown>;
      return {
        company_id: r.company_id ? String(r.company_id) : null,
        level: String(r.level ?? ""),
        source: String(r.source ?? ""),
        message: String(r.message ?? "").slice(0, 220),
        created_at: r.created_at ? String(r.created_at) : null,
      };
    }),
  };

  const systemPrompt = `Tu es l'Assistant IA Super Admin de FasoStock.
Tu dois repondre EXCLUSIVEMENT en francais (langue obligatoire), avec un vocabulaire simple et clair.
Tu dois repondre UNIQUEMENT en JSON valide, sans markdown, sans etoiles, sans emojis, sans icones.
Utilise seulement les donnees fournies. N'invente rien.
Si une info manque, indique-le clairement.
Structure JSON obligatoire:
{
  "intro": "string",
  "direct_answer": "string",
  "table_title": "string",
  "table_columns": ["col1","col2","col3"],
  "table_rows": [["v11","v12","v13"]],
  "key_figures": ["string"],
  "recommended_actions": ["string"]
}
Contraintes:
- table_columns: 3 a 6 colonnes.
- table_rows: coherent avec les colonnes.
- key_figures: 3 a 8 elements.
- recommended_actions: 3 a 6 elements.
- Francais professionnel, clair, facile a comprendre.
- Montants en XOF si pertinent.`;

  const modelMessages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `Contexte SaaS JSON:\n${JSON.stringify(
        contextPayload,
      )}\n\nQuestion utilisateur:\n${question}\n\nImportant: reponds uniquement en francais.`,
    },
  ];

  let llmRes: Response;
  try {
    llmRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: modelMessages,
        max_tokens: 1200,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json(
      { error: "Le service IA ne répond pas. Réessayez dans un instant." },
      { status: 504 },
    );
  }

  if (!llmRes.ok) {
    const t = await llmRes.text();
    return NextResponse.json({ error: `DeepSeek API: ${llmRes.status} ${t}` }, { status: 502 });
  }

  const data = (await llmRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const rawAnswer = data.choices?.[0]?.message?.content?.trim();
  if (!rawAnswer) return NextResponse.json({ error: "Reponse IA vide" }, { status: 502 });
  let structuredAnswer: StructuredAnswer;
  try {
    structuredAnswer = normalizeStructuredAnswer(JSON.parse(rawAnswer));
  } catch {
    structuredAnswer = normalizeStructuredAnswer({});
  }
  const plainAnswer = asPlainAnswer(structuredAnswer);

  const actionsPrompt = `Tu dois proposer 0 a 3 actions executables, seulement si la demande utilisateur implique explicitement une action.
Actions autorisees:
1) set_company_active: activer/desactiver une entreprise
2) set_company_ai_predictions: activer/desactiver les predictions IA d'une entreprise
Reponds strictement en JSON valide:
{
  "actions":[
    {
      "type":"set_company_active|set_company_ai_predictions",
      "company_name":"Nom exact entreprise",
      "value":true,
      "reason":"courte justification"
    }
  ]
}
Si aucune action: {"actions":[]}`;

  /*
   * Second appel purement optionnel (suggestions d'actions) : une panne ou une lenteur
   * de DeepSeek ne doit pas priver le super-admin de la réponse déjà obtenue — on
   * retombe simplement sur « aucune action suggérée ».
   */
  const actionRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: actionsPrompt },
        {
          role: "user",
          content: `Entreprises disponibles JSON:\n${JSON.stringify(
            companiesRows.map((c) => ({ name: String(c.name ?? "") })),
          )}\n\nQuestion: ${question}\n\nReponse IA: ${plainAnswer}`,
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 500,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  }).catch(() => null);

  let suggestedActions: SuggestedAction[] = [];
  if (actionRes?.ok) {
    try {
      const j = (await actionRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const txt = j.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(txt) as { actions?: SuggestedAction[] };
      const allowed = new Set(["set_company_active", "set_company_ai_predictions"]);
      suggestedActions = (parsed.actions ?? [])
        .filter((a) => allowed.has(String(a.type)))
        .map((a) => ({
          type: a.type,
          company_name: String(a.company_name ?? "").trim(),
          value: a.value === true,
          reason: String(a.reason ?? "").trim(),
        }))
        .filter((a) => a.company_name.length > 0)
        .slice(0, 3);
    } catch {
      suggestedActions = [];
    }
  }

  return NextResponse.json({
    answer: plainAnswer,
    structuredAnswer,
    contextScope: companyId ? `entreprise:${companyName}` : "global",
    suggestedActions,
  });
}
