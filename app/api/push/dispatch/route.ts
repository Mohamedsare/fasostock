import {
  listOwnerUserIds,
  PushNotConfiguredError,
  sendPushNotificationToUsers,
} from "@/lib/features/push/send-web-push";
import { safeEqualStrings } from "@/lib/server/safe-compare";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type BodyUser = {
  userId?: string;
  companyId?: string;
  allOwners?: boolean;
  title?: string;
  body?: string | null;
  url?: string | null;
  /** Catégorie (`admin_message` par défaut) — sert de `tag` côté Service Worker. */
  type?: string | null;
};

function parseBody(raw: unknown): BodyUser | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  return {
    userId: typeof o.userId === "string" ? o.userId : undefined,
    companyId: typeof o.companyId === "string" ? o.companyId : undefined,
    allOwners: o.allOwners === true,
    title: typeof o.title === "string" ? o.title : undefined,
    body: typeof o.body === "string" || o.body === null ? (o.body as string | null) : undefined,
    url: typeof o.url === "string" || o.url === null ? (o.url as string | null) : undefined,
    type: typeof o.type === "string" ? o.type : undefined,
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
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "Champ title requis" }, { status: 400 });
  }

  const webhookSecret = process.env.WEB_PUSH_WEBHOOK_SECRET?.trim();
  const headerSecret = req.headers.get("x-webhook-secret")?.trim();
  // Comparaison en temps constant : un `===` fuirait le secret par timing.
  const webhookOk = Boolean(
    webhookSecret && headerSecret && safeEqualStrings(headerSecret, webhookSecret),
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let superAdmin = false;
  if (user && !webhookOk) {
    const { data: isSa, error: rpcErr } = await supabase.rpc("is_super_admin");
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }
    superAdmin = Boolean(isSa);
  }

  if (!webhookOk && !superAdmin) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  if (webhookOk && body.allOwners) {
    return NextResponse.json(
      { error: "Le mode allOwners n’est pas autorisé via webhook" },
      { status: 403 },
    );
  }

  if (!body.userId && !body.allOwners) {
    return NextResponse.json({ error: "userId ou allOwners requis" }, { status: 400 });
  }

  let userIds: string[] = [];
  if (body.allOwners) {
    try {
      userIds = await listOwnerUserIds();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        return NextResponse.json(
          { error: "Envoi push indisponible : définissez SUPABASE_SERVICE_ROLE_KEY sur le serveur." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } else if (body.userId) {
    if (webhookOk) {
      const companyId = String(body.companyId ?? "").trim();
      if (!companyId) {
        return NextResponse.json(
          { error: "companyId requis avec userId pour le webhook push." },
          { status: 400 },
        );
      }
      try {
        const svc = createServiceRoleClient();
        const { data: link, error: linkErr } = await svc
          .from("user_company_roles")
          .select("user_id")
          .eq("user_id", body.userId)
          .eq("company_id", companyId)
          .eq("is_active", true)
          .maybeSingle();
        if (linkErr || !link) {
          return NextResponse.json(
            { error: "Utilisateur non membre actif de cette entreprise." },
            { status: 403 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Validation push webhook indisponible (service role)." },
          { status: 503 },
        );
      }
    }
    userIds = [body.userId];
  }

  try {
    const result = await sendPushNotificationToUsers(userIds, {
      title: body.title.trim(),
      body: typeof body.body === "string" ? body.body : "",
      url: typeof body.url === "string" && body.url.trim() ? body.url.trim() : "/notifications",
      type: typeof body.type === "string" && body.type.trim() ? body.type.trim() : "admin_message",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        { error: "Envoi push indisponible : définissez SUPABASE_SERVICE_ROLE_KEY sur le serveur." },
        { status: 503 },
      );
    }
    // Clés VAPID absentes : défaut d'installation serveur, pas une erreur de l'appelant.
    if (e instanceof PushNotConfiguredError) {
      return NextResponse.json({ error: msg, code: "push_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
