import "server-only";

import webpush from "web-push";

import { getVapidPublicKey } from "@/lib/features/push/public-key";
import { toWirePayload, type WebPushPayload } from "@/lib/features/push/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type { WebPushPayload } from "@/lib/features/push/types";

let vapidConfigured = false;

/** Contact technique exigé par VAPID — sans valeur métier, donc jamais bloquant. */
const DEFAULT_VAPID_SUBJECT = "mailto:contact@fasostock.com";

/** Push non configuré côté serveur : l'appelant doit rester silencieux, pas alerter le vendeur. */
export class PushNotConfiguredError extends Error {
  readonly code = "push_not_configured";
  constructor(message: string) {
    super(message);
    this.name = "PushNotConfiguredError";
  }
}

/** VAPID n'accepte qu'un `mailto:` ou une URL — on répare une saisie approximative. */
function normalizeSubject(raw: string): string {
  const s = raw.trim();
  if (/^(mailto:|https?:\/\/)/i.test(s)) return s;
  return s.includes("@") ? `mailto:${s}` : DEFAULT_VAPID_SUBJECT;
}

/**
 * Clé privée VAPID — `VAPID_PRIVATE_KEY`, avec repli sur l'ancien nom déjà déployé.
 * Ce module est `server-only` : cette valeur ne peut pas fuir dans un bundle client.
 */
function getVapidPrivateKey(): string | null {
  const preferred = process.env.VAPID_PRIVATE_KEY?.trim();
  if (preferred) return preferred;
  const legacy = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  return legacy || null;
}

function ensureVapid(): void {
  if (vapidConfigured) return;
  const publicKey = getVapidPublicKey();
  const privateKey = getVapidPrivateKey();
  if (!publicKey || !privateKey) {
    throw new PushNotConfiguredError(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY sont requis pour envoyer des notifications push.",
    );
  }
  // Le sujet est facultatif : sans lui, on retombe sur l'URL de l'app puis un mailto par défaut.
  const subject = normalizeSubject(
    process.env.VAPID_SUBJECT?.trim() ||
      process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      DEFAULT_VAPID_SUBJECT,
  );
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

type SubRow = { endpoint: string; p256dh: string; auth: string };

async function loadSubscriptionsForUsers(userIds: string[]): Promise<SubRow[]> {
  if (userIds.length === 0) return [];
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error) throw error;
  return (data ?? []) as SubRow[];
}

/**
 * Purge groupée : un client service-role par endpoint mort (et une requête par endpoint)
 * ferait exploser le temps d'envoi le jour où un lot d'appareils expire ensemble —
 * exactement le moment où l'alerte doit partir vite.
 *
 * Les endpoints sont de longues URL : on les découpe pour que le filtre `in.(…)`, qui
 * voyage dans l'URL de la requête, reste sous la taille acceptée par le serveur.
 */
const DELETE_CHUNK = 25;

async function removeDeadSubscriptions(endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) return;
  try {
    const svc = createServiceRoleClient();
    for (let i = 0; i < endpoints.length; i += DELETE_CHUNK) {
      const chunk = endpoints.slice(i, i + DELETE_CHUNK);
      await svc.from("push_subscriptions").delete().in("endpoint", chunk);
    }
  } catch {
    /* ignore : un abonnement mort de plus ne justifie pas de faire échouer l'envoi */
  }
}

/**
 * Nombre d'appareils contactés en parallèle.
 *
 * Sans bornes, un envoi à tous les propriétaires ouvrirait autant de connexions HTTPS
 * qu'il y a d'appareils : au-delà de quelques centaines, la fonction serverless épuise
 * ses sockets et sa mémoire, et l'envoi entier échoue au lieu d'être simplement lent.
 */
const PUSH_CONCURRENCY = 20;

/** `task` ne doit jamais rejeter : chaque échec est déjà transformé en valeur. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      results[i] = await task(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export type PushSendResult = {
  /** Nombre d'appareils (lignes `push_subscriptions`) réellement contactés. */
  attempted: number;
  failures: number;
  /** Abonnements périmés supprimés en base (404 / 410 définitifs). */
  removed: number;
  /**
   * Détail des refus du service de push (FCM, Apple…). Décisif pour diagnostiquer :
   * un `201` partout alors que le téléphone n'affiche rien innocente le serveur et
   * désigne l'appareil (restriction de batterie, canal muet).
   */
  errors: { status?: number; message: string }[];
};

/**
 * Envoie un push à tous les appareils des utilisateurs indiqués.
 *
 * Un échec par appareil n'interrompt jamais la boucle : un téléphone perdu ne doit pas
 * priver les autres de l'alerte. Les endpoints définitivement morts (404 / 410) sont
 * purgés au passage — sans cela la table grossit indéfiniment et chaque envoi ralentit.
 */
export async function sendPushNotificationToUsers(
  userIds: string[],
  payload: WebPushPayload,
): Promise<PushSendResult> {
  ensureVapid();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const rows = await loadSubscriptionsForUsers(uniqueIds);
  const body = JSON.stringify(toWirePayload(payload));

  let failures = 0;
  const errors: { status?: number; message: string }[] = [];
  const deadEndpoints: string[] = [];

  const results = await mapWithConcurrency(rows, PUSH_CONCURRENCY, async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
        {
          TTL: 86_400,
          /*
           * `high` est indispensable sur Android : en urgence normale, le message
           * hérite d'une priorité FCM normale, que le mode Doze met en file jusqu'à
           * la prochaine fenêtre de maintenance — le propriétaire recevait donc
           * l'alerte de vente avec des minutes, voire des heures de retard, écran
           * éteint. En `high`, FCM réveille l'appareil immédiatement.
           */
          urgency: "high",
          /* Un service de push qui ne répond jamais bloquerait sinon l'envoi entier. */
          timeout: 10_000,
        },
      );
      return "sent" as const;
    } catch (e: unknown) {
      const status =
        typeof e === "object" && e !== null && "statusCode" in e
          ? (e as { statusCode?: number }).statusCode
          : undefined;
      errors.push({ status, message: e instanceof Error ? e.message : String(e) });
      // 404 / 410 : l'abonnement n'existe plus chez le service de push, il ne reviendra pas.
      if (status === 410 || status === 404) {
        deadEndpoints.push(row.endpoint);
        return "removed" as const;
      }
      return "failed" as const;
    }
  });

  for (const r of results) {
    if (r !== "sent") failures += 1;
  }

  // Purge après coup : la notification part d'abord, le ménage ensuite.
  await removeDeadSubscriptions(deadEndpoints);

  return { attempted: rows.length, failures, removed: deadEndpoints.length, errors };
}

/** Envoi à un seul utilisateur (tous ses appareils). */
export async function sendPushNotification(
  userId: string,
  payload: WebPushPayload,
): Promise<PushSendResult> {
  return sendPushNotificationToUsers([userId], payload);
}

/** Envoi à tous les propriétaires d'entreprise (message plateforme). */
export async function sendPushNotificationToAllOwners(
  payload: WebPushPayload,
): Promise<PushSendResult> {
  const ownerIds = await listOwnerUserIds();
  return sendPushNotificationToUsers(ownerIds, payload);
}

/**
 * Ancien nom, conservé pour les appelants existants (`/api/push/*`).
 * @deprecated Utiliser `sendPushNotificationToUsers`.
 */
export async function sendWebPushToUsers(
  userIds: string[],
  payload: WebPushPayload,
): Promise<PushSendResult> {
  return sendPushNotificationToUsers(userIds, payload);
}

export async function listOwnerUserIds(): Promise<string[]> {
  const svc = createServiceRoleClient();
  const { data: roleRow, error: roleErr } = await svc.from("roles").select("id").eq("slug", "owner").maybeSingle();
  if (roleErr) throw roleErr;
  const roleId = roleRow?.id as string | undefined;
  if (!roleId) return [];
  const { data: members, error: mErr } = await svc
    .from("user_company_roles")
    .select("user_id")
    .eq("role_id", roleId)
    .eq("is_active", true);
  if (mErr) throw mErr;
  const ids = (members ?? []).map((r) => r.user_id as string).filter(Boolean);
  return [...new Set(ids)];
}

/** Propriétaires actifs pour une liste d’entreprises (push / alertes). */
export async function listOwnerUserIdsForCompanies(companyIds: string[]): Promise<string[]> {
  const uniq = [...new Set(companyIds.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) return [];
  const svc = createServiceRoleClient();
  const { data: roleRow, error: roleErr } = await svc.from("roles").select("id").eq("slug", "owner").maybeSingle();
  if (roleErr) throw roleErr;
  const roleId = roleRow?.id as string | undefined;
  if (!roleId) return [];
  const { data: members, error: mErr } = await svc
    .from("user_company_roles")
    .select("user_id")
    .in("company_id", uniq)
    .eq("role_id", roleId)
    .eq("is_active", true);
  if (mErr) throw mErr;
  const ids = (members ?? []).map((r) => r.user_id as string).filter(Boolean);
  return [...new Set(ids)];
}
