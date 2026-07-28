import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HeartbeatBody = {
  sessionId?: string;
  pathname?: string;
  activity?: string;
  companyId?: string | null;
  storeId?: string | null;
  deviceKind?: string | null;
  /** Onglet fermé (`sendBeacon`) : la session sort immédiatement du compteur « en ligne ». */
  leaving?: boolean;
};

/** IP publique vue par l'hébergeur. `x-forwarded-for` = « client, proxy1, proxy2… ». */
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for")?.trim();
  if (xff) return xff.split(",")[0]?.trim() || null;
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    null
  );
}

/** En-têtes de géolocalisation de l'edge (Vercel, sinon Cloudflare). Absents en local. */
function clientGeo(req: Request): {
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
} {
  const h = (name: string) => {
    const v = req.headers.get(name)?.trim();
    if (!v) return null;
    // Vercel encode les accents en %XX (« Ouagadougou », « Bobo-Dioulasso »).
    try {
      return decodeURIComponent(v) || null;
    } catch {
      return v;
    }
  };
  const num = (v: string | null) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    city: h("x-vercel-ip-city") ?? h("cf-ipcity"),
    region: h("x-vercel-ip-country-region"),
    country: h("x-vercel-ip-country") ?? h("cf-ipcountry"),
    latitude: num(h("x-vercel-ip-latitude")),
    longitude: num(h("x-vercel-ip-longitude")),
  };
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

/**
 * Battement de cœur de présence (page Live du super admin).
 *
 * L'identité vient **du cookie de session** et l'origine (IP, ville) **des en-têtes serveur** :
 * le navigateur ne peut donc ni se faire passer pour un autre compte, ni maquiller sa ville.
 * L'écriture passe par `record_presence`, réservée à `service_role`.
 */
export async function POST(req: Request) {
  let body: HeartbeatBody;
  try {
    body = (await req.json()) as HeartbeatBody;
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId || sessionId.length > 100) {
    return NextResponse.json({ error: "sessionId requis" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let svc;
  try {
    svc = createServiceRoleClient();
  } catch {
    // Suivi de présence non configuré : ne jamais faire échouer la navigation pour autant.
    return NextResponse.json({ ok: false, skipped: true });
  }

  const geo = clientGeo(req);
  const { error } = await svc.rpc("record_presence", {
    p_user_id: user.id,
    p_session_id: sessionId,
    p_pathname: body.pathname ?? null,
    p_activity: body.activity ?? null,
    p_company_id: isUuid(body.companyId) ? body.companyId : null,
    p_store_id: isUuid(body.storeId) ? body.storeId : null,
    p_ip: clientIp(req),
    p_city: geo.city,
    p_region: geo.region,
    p_country: geo.country,
    p_latitude: geo.latitude,
    p_longitude: geo.longitude,
    p_user_agent: req.headers.get("user-agent"),
    p_device_kind: body.deviceKind ?? null,
    p_client_kind: "web",
    p_leaving: body.leaving === true,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
