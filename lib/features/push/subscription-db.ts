"use client";

import { createClient } from "@/lib/supabase/client";
import { arrayBufferToBase64 } from "@/lib/features/push/encoding";

export function pushSubscriptionToRow(
  sub: PushSubscription,
  userId: string,
  userAgent: string | null,
): {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  updated_at: string;
} {
  const key = sub.getKey("p256dh");
  const authKey = sub.getKey("auth");
  return {
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: arrayBufferToBase64(key),
    auth: arrayBufferToBase64(authKey),
    user_agent: userAgent,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertPushSubscriptionRow(sub: PushSubscription): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const key = sub.getKey("p256dh");
  const authKey = sub.getKey("auth");
  if (!key || !authKey) {
    throw new Error("Abonnement push incomplet (clés manquantes). Réessayez ou changez de navigateur.");
  }
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;
  const row = pushSubscriptionToRow(sub, user.id, ua);
  const { error } = await supabase.from("push_subscriptions").upsert(row, {
    onConflict: "endpoint",
  });
  if (error) throw error;
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export async function deleteAllPushSubscriptionsForCurrentUser(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  if (error) throw error;
}
