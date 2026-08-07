"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type { AppNotification } from "./types";

function mapRow(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id ?? ""),
    companyId: row.company_id == null ? null : String(row.company_id),
    type: String(row.type ?? "app_message"),
    title: String(row.title ?? ""),
    body: row.body == null ? null : String(row.body),
    readAt: row.read_at == null ? null : String(row.read_at),
    createdAt: String(row.created_at ?? ""),
  };
}

/**
 * Notifications de l'utilisateur connecté. La RLS (`user_id = auth.uid()`) fait le
 * filtrage : inutile — et risqué — de dupliquer ce `.eq()` côté client.
 */
export async function listMyNotifications(limit = 100): Promise<AppNotification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, company_id, type, title, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function countMyUnreadNotifications(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw mapSupabaseError(error);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw mapSupabaseError(error);
}

export async function markAllMyNotificationsRead(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw mapSupabaseError(error);
}

export async function deleteNotification(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}
