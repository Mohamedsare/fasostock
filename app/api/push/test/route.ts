import { NextResponse } from "next/server";

import {
  PushNotConfiguredError,
  sendPushNotification,
} from "@/lib/features/push/send-web-push";
import { requireAuthUser } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
/* Le test différé attend jusqu'à 20 s avant d'émettre : la fonction doit vivre plus longtemps. */
export const maxDuration = 30;

const MAX_DELAY_SECONDS = 20;

/**
 * Envoie une notification de test **à ses propres appareils uniquement** — jamais à
 * un autre utilisateur, quel que soit le corps de la requête.
 *
 * `delaySeconds` existe pour la seule question qu'on ne peut pas trancher autrement :
 * « est-ce que ça arrive quand l'app est fermée ? ». L'utilisateur lance le test,
 * ferme l'application, et la notification part une fois l'app hors de l'écran.
 */
export async function POST(req: Request) {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    /* corps facultatif */
  }
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const requested = typeof o.delaySeconds === "number" ? o.delaySeconds : 0;
  const delaySeconds = Math.min(Math.max(Math.trunc(requested) || 0, 0), MAX_DELAY_SECONDS);

  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  if (delaySeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  }

  try {
    const result = await sendPushNotification(auth.user.id, {
      title: "Test FasoStock",
      body: delaySeconds > 0
        ? "Vous recevez ceci alors que l’application est fermée : les notifications fonctionnent."
        : "Les notifications fonctionnent sur cet appareil.",
      url: "/notifications",
      type: "test",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof PushNotConfiguredError) {
      return NextResponse.json(
        { error: e.message, code: "push_not_configured" },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        { error: "Envoi push indisponible : SUPABASE_SERVICE_ROLE_KEY manquant sur le serveur.", code: "push_not_configured" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg, code: "push_failed" }, { status: 500 });
  }
}
