import {
  listOwnerUserIdsForCompanies,
  PushNotConfiguredError,
  sendWebPushToUsers,
} from "@/lib/features/push/send-web-push";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  /*
   * Il suffit d'appartenir à l'entreprise : le cas nominal est justement une
   * caissière dont la vente doit alerter le propriétaire. Exiger le rôle owner
   * ici rendait la notification impossible depuis un poste de caisse.
   */
  const uniqCompanies = [...new Set(companyIds)];
  for (const cid of uniqCompanies) {
    const isMember = await userBelongsToCompany(supabase, auth.user.id, cid);
    if (!isMember) {
      return NextResponse.json(
        { error: "Entreprise non autorisée.", code: "push_forbidden" },
        { status: 403 },
      );
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
      owners: ownerIds.length,
      ownerUserCount: ownerIds.length,
      pushDeviceCount: result.attempted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    /*
     * `code: "push_not_configured"` = problème d'installation serveur, pas
     * d'erreur métier : le client doit le journaliser sans jamais l'afficher
     * au vendeur, dont la vente est déjà enregistrée.
     */
    if (e instanceof PushNotConfiguredError || msg.includes("WEB_PUSH_VAPID")) {
      return NextResponse.json({ error: msg, code: "push_not_configured" }, { status: 503 });
    }
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          error: "Envoi push indisponible : définissez SUPABASE_SERVICE_ROLE_KEY sur le serveur.",
          code: "push_not_configured",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg, code: "push_failed" }, { status: 500 });
  }
}
