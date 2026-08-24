import { after, NextResponse } from "next/server";

import {
  PushNotConfiguredError,
  sendPushNotification,
  type PushSendResult,
} from "@/lib/features/push/send-web-push";
import { requireAuthUser } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveServerTimeZone } from "@/lib/server/company-timezone";

export const runtime = "nodejs";
/* L'envoi différé se poursuit après la réponse : la fonction doit vivre jusque-là. */
export const maxDuration = 60;

const MAX_DELAY_SECONDS = 25;

/**
 * Notification de test envoyée **à ses propres appareils uniquement**.
 *
 * Tout le travail se fait dans `after()`, donc **après** que la réponse est partie :
 * un test lancé puis suivi de la fermeture de l'app ne doit pas dépendre de la
 * connexion HTTP du téléphone, sinon on ne teste plus le push mais la connexion —
 * c'était le défaut de la première version.
 *
 * Le résultat est écrit dans `notifications` : en rouvrant l'app, on lit si le
 * serveur a bien émis. Sans cette trace, « je n'ai rien reçu » ne permet pas de
 * distinguer un serveur muet d'un téléphone qui a filtré la notification.
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
  const userId = auth.user.id;
  // Lu AVANT le `after()` : la requête y est déjà close, la session n'est plus lisible.
  const tz = await resolveServerTimeZone(supabase);

  after(async () => {
    if (delaySeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
    const sentAt = new Date();
    try {
      const result = await sendPushNotification(userId, {
        title: "Test FasoStock",
        body:
          delaySeconds > 0
            ? "Vous recevez ceci alors que l’application est fermée : les notifications fonctionnent."
            : "Les notifications fonctionnent sur cet appareil.",
        url: "/notifications",
        type: "test",
      });
      await recordOutcome(userId, describeResult(result, sentAt, delaySeconds, tz));
    } catch (e) {
      const msg =
        e instanceof PushNotConfiguredError
          ? "Clés VAPID absentes sur le serveur : aucun envoi possible."
          : e instanceof Error
            ? e.message
            : String(e);
      await recordOutcome(userId, `Test non envoyé — ${msg}`);
    }
  });

  return NextResponse.json({ ok: true, scheduledInSeconds: delaySeconds });
}

function describeResult(
  result: PushSendResult,
  sentAt: Date,
  delaySeconds: number,
  tz: string,
): string {
  const heure = sentAt.toLocaleTimeString("fr-FR", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (result.attempted === 0) {
    return `Aucun appareil abonné au moment du test (${heure}). Activez les notifications sur l’appareil concerné.`;
  }
  const delivered = result.attempted - result.failures;
  const lines = [
    `Test envoyé à ${heure}${delaySeconds > 0 ? ` (après ${delaySeconds} s d’attente)` : ""}.`,
    `Appareils contactés : ${result.attempted} — acceptés par le service de push : ${delivered}, refusés : ${result.failures}.`,
  ];
  for (const err of result.errors.slice(0, 3)) {
    lines.push(`Refus : ${err.status ?? "?"} ${err.message}`);
  }
  if (result.failures === 0) {
    lines.push(
      "Le service de push a tout accepté. Si rien ne s’est affiché, la notification a été bloquée par le téléphone : autorisez l’activité en arrière-plan et retirez l’économiseur de batterie pour cette application.",
    );
  }
  return lines.join("\n");
}

/** Trace lisible dans l'app — jamais de push en retour, ce serait circulaire. */
async function recordOutcome(userId: string, body: string): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    await svc.from("notifications").insert({
      user_id: userId,
      type: "push_diagnostic",
      title: "Résultat du test de notification",
      body,
    });
  } catch {
    /* le diagnostic ne doit jamais casser la route */
  }
}
