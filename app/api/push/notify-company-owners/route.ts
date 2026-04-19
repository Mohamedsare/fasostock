import { listOwnerUserIdsForCompanies, sendWebPushToUsers } from "@/lib/features/push/send-web-push";
import { createClient } from "@/lib/supabase/server";
import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";
import { createClient as createSupabaseJs, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  companyIds?: string[];
  title?: string;
  body?: string | null;
  url?: string | null;
};

function parseBody(raw: unknown): Body | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const companyIds = Array.isArray(o.companyIds)
    ? o.companyIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : undefined;
  return {
    companyIds,
    title: typeof o.title === "string" ? o.title : undefined,
    body: typeof o.body === "string" || o.body === null ? (o.body as string | null) : undefined,
    url: typeof o.url === "string" || o.url === null ? (o.url as string | null) : undefined,
  };
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() ?? null;
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }
  const body = parseBody(raw);
  const companyIds = body?.companyIds ?? [];
  if (!body?.title?.trim() || companyIds.length === 0) {
    return NextResponse.json({ error: "companyIds et title sont requis" }, { status: 400 });
  }

  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!urlRaw || !anon) {
    return NextResponse.json({ error: "Configuration Supabase manquante" }, { status: 500 });
  }
  const url = normalizeSupabaseUrl(urlRaw);

  const token = bearerToken(req);
  let supabaseUserClient: SupabaseClient;
  if (token) {
    supabaseUserClient = createSupabaseJs(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } else {
    supabaseUserClient = await createClient();
  }

  const {
    data: { user },
  } = await supabaseUserClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const uniqCompanies = [...new Set(companyIds)];
  const { data: memberships, error: memErr } = await supabaseUserClient
    .from("user_company_roles")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .in("company_id", uniqCompanies);
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 400 });
  }
  const allowed = new Set((memberships ?? []).map((r) => r.company_id as string));
  for (const cid of uniqCompanies) {
    if (!allowed.has(cid)) {
      return NextResponse.json({ error: "Accès refusé pour une ou plusieurs entreprises." }, { status: 403 });
    }
  }

  try {
    const ownerIds = await listOwnerUserIdsForCompanies(uniqCompanies);
    if (ownerIds.length === 0) {
      return NextResponse.json({
        ok: true,
        attempted: 0,
        failures: 0,
        owners: 0,
        ownerUserCount: 0,
        pushDeviceCount: 0,
        hint: "Aucun propriétaire actif trouvé pour ces entreprises (rôles / user_company_roles).",
      });
    }
    const result = await sendWebPushToUsers(ownerIds, {
      title: body.title.trim(),
      body: (typeof body.body === "string" ? body.body : body.body ?? "") ?? "",
      url:
        typeof body.url === "string" && body.url.trim()
          ? body.url.trim()
          : "/notifications",
    });
    return NextResponse.json({
      ok: true,
      ...result,
      /** Nombre d’utilisateurs distincts « owner » ciblés */
      owners: ownerIds.length,
      ownerUserCount: ownerIds.length,
      /** Nombre d’abonnements navigateur en base pour ces utilisateurs (0 = pas d’appareil activé) */
      pushDeviceCount: result.attempted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        { error: "Envoi push indisponible : définissez SUPABASE_SERVICE_ROLE_KEY sur le serveur." },
        { status: 503 },
      );
    }
    if (msg.includes("WEB_PUSH_VAPID")) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
