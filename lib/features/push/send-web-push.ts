import webpush from "web-push";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type WebPushPayload = { title: string; body: string; url?: string };

let vapidConfigured = false;

function ensureVapid(): void {
  if (vapidConfigured) return;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      "WEB_PUSH_VAPID_SUBJECT, NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY et WEB_PUSH_VAPID_PRIVATE_KEY sont requis.",
    );
  }
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

async function removeDeadSubscription(endpoint: string): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    await svc.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    /* ignore */
  }
}

export async function sendWebPushToUsers(
  userIds: string[],
  payload: WebPushPayload,
): Promise<{ attempted: number; failures: number }> {
  ensureVapid();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const rows = await loadSubscriptionsForUsers(uniqueIds);
  let failures = 0;
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/notifications",
  });
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body,
        { TTL: 86_400 },
      );
    } catch (e: unknown) {
      failures += 1;
      const status = typeof e === "object" && e !== null && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined;
      if (status === 410 || status === 404) {
        await removeDeadSubscription(row.endpoint);
      }
    }
  }
  return { attempted: rows.length, failures };
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
