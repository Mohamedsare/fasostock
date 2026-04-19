"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  AdminAppClientKind,
  AdminAppErrorLog,
  AdminCompany,
  AdminSalesByCompany,
  AdminSalesOverTimeItem,
  AdminStats,
  AdminStore,
  AdminUser,
  AuditLogEntry,
  LockedLogin,
} from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function adminListCompanies(): Promise<AdminCompany[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, slug, is_active, store_quota, ai_predictions_enabled, warehouse_feature_enabled, store_quota_increase_enabled, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      slug: (r.slug as string | null) ?? null,
      isActive: r.is_active === true,
      storeQuota: toNum(r.store_quota),
      aiPredictionsEnabled: r.ai_predictions_enabled === true,
      warehouseFeatureEnabled: r.warehouse_feature_enabled !== false,
      storeQuotaIncreaseEnabled: r.store_quota_increase_enabled !== false,
      createdAt: r.created_at != null ? String(r.created_at) : null,
    };
  });
}

export async function adminListStores(companyId?: string | null): Promise<AdminStore[]> {
  const supabase = createClient();
  let q = supabase
    .from("stores")
    .select("id, company_id, name, code, is_active, is_primary, created_at")
    .order("created_at", { ascending: false });
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      companyId: String(r.company_id),
      name: String(r.name ?? ""),
      code: (r.code as string | null) ?? null,
      isActive: r.is_active !== false,
      isPrimary: r.is_primary === true,
      createdAt: r.created_at != null ? String(r.created_at) : null,
    };
  });
}

export async function adminUpdateCompany(
  id: string,
  patch: {
    isActive?: boolean;
    aiPredictionsEnabled?: boolean;
    warehouseFeatureEnabled?: boolean;
    storeQuotaIncreaseEnabled?: boolean;
    storeQuota?: number;
  },
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = {};
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.aiPredictionsEnabled !== undefined) row.ai_predictions_enabled = patch.aiPredictionsEnabled;
  if (patch.warehouseFeatureEnabled !== undefined) {
    row.warehouse_feature_enabled = patch.warehouseFeatureEnabled;
  }
  if (patch.storeQuotaIncreaseEnabled !== undefined) {
    row.store_quota_increase_enabled = patch.storeQuotaIncreaseEnabled;
  }
  if (patch.storeQuota !== undefined) {
    const n = Math.floor(Number(patch.storeQuota));
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("Quota de boutiques invalide (minimum 1).");
    }
    row.store_quota = n;
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("companies").update(row).eq("id", id);
  if (error) throw mapSupabaseError(error);
}

export async function adminUpdateStore(id: string, isActive: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("stores").update({ is_active: isActive }).eq("id", id);
  if (error) throw mapSupabaseError(error);
}

export async function adminDeleteCompany(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

export async function adminDeleteStore(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("stores").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

export async function adminGetStats(): Promise<AdminStats> {
  const supabase = createClient();
  const [{ data: companies }, { data: stores }, { data: ucr }, { data: salesData }] = await Promise.all([
    supabase.from("companies").select("id"),
    supabase.from("stores").select("id"),
    supabase.from("user_company_roles").select("id"),
    supabase.from("sales").select("id, total").eq("status", "completed"),
  ]);

  let salesTotalAmount = 0;
  for (const r of salesData ?? []) {
    const row = r as { total?: unknown };
    salesTotalAmount += toNum(row.total);
  }

  let activeSubscriptionsCount = 0;
  try {
    const { data: subs } = await supabase.from("company_subscriptions").select("id").eq("status", "active");
    activeSubscriptionsCount = (subs ?? []).length;
  } catch {
    /* table optionnelle */
  }

  return {
    companiesCount: (companies ?? []).length,
    storesCount: (stores ?? []).length,
    usersCount: (ucr ?? []).length,
    salesCount: (salesData ?? []).length,
    salesTotalAmount,
    activeSubscriptionsCount,
  };
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    email: (row.email as string | null) ?? null,
    fullName: (row.full_name as string | null) ?? null,
    isSuperAdmin: row.is_super_admin === true,
    isActive: row.is_active !== false,
    companyNames: Array.isArray(row.company_names)
      ? (row.company_names as unknown[]).map((x) => String(x))
      : [],
  }));
}

export async function adminGetSalesByCompany(): Promise<AdminSalesByCompany[]> {
  const supabase = createClient();
  const [{ data: sales }, { data: companies }] = await Promise.all([
    supabase.from("sales").select("company_id, total").eq("status", "completed"),
    supabase.from("companies").select("id, name"),
  ]);
  const byCompany = new Map<string, { count: number; total: number }>();
  for (const s of sales ?? []) {
    const row = s as { company_id?: string; total?: unknown };
    const cid = row.company_id;
    if (!cid) continue;
    const cur = byCompany.get(cid) ?? { count: 0, total: 0 };
    byCompany.set(cid, {
      count: cur.count + 1,
      total: cur.total + toNum(row.total),
    });
  }
  const list: AdminSalesByCompany[] = [];
  for (const c of companies ?? []) {
    const row = c as { id?: string; name?: string };
    const id = row.id;
    if (!id) continue;
    const agg = byCompany.get(id) ?? { count: 0, total: 0 };
    list.push({
      companyId: id,
      companyName: row.name ?? "—",
      salesCount: agg.count,
      totalAmount: agg.total,
    });
  }
  list.sort((a, b) => b.totalAmount - a.totalAmount);
  return list;
}

export async function adminGetSalesOverTime(days = 30): Promise<AdminSalesOverTimeItem[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  const fromStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

  const supabase = createClient();
  const { data: sales, error } = await supabase
    .from("sales")
    .select("created_at, total")
    .eq("status", "completed")
    .gte("created_at", fromStr);
  if (error) throw mapSupabaseError(error);

  const byDay = new Map<string, { count: number; total: number }>();
  for (const s of sales ?? []) {
    const row = s as { created_at?: string; total?: unknown };
    const day = (row.created_at ?? "").slice(0, 10);
    if (!day) continue;
    const cur = byDay.get(day) ?? { count: 0, total: 0 };
    byDay.set(day, {
      count: cur.count + 1,
      total: cur.total + toNum(row.total),
    });
  }

  const result: AdminSalesOverTimeItem[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const dayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const agg = byDay.get(dayStr) ?? { count: 0, total: 0 };
    result.push({ date: dayStr, count: agg.count, total: agg.total });
  }
  return result;
}

export async function adminUpdateProfile(
  userId: string,
  params: { fullName?: string | null; isSuperAdmin?: boolean },
): Promise<void> {
  const supabase = createClient();
  const rpcParams: Record<string, unknown> = { p_user_id: userId };
  if (params.fullName !== undefined) rpcParams.p_full_name = params.fullName;
  if (params.isSuperAdmin !== undefined) rpcParams.p_is_super_admin = params.isSuperAdmin;
  const { error } = await supabase.rpc("admin_update_profile", rpcParams);
  if (error) throw mapSupabaseError(error);
}

export async function adminGetUserCompanyIds(userId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_get_user_company_ids", { p_user_id: userId });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as unknown[]).map((e) => String(e));
}

export async function adminSetUserCompanies(
  userId: string,
  companyIds: string[],
  roleSlug = "store_manager",
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_set_user_companies", {
    p_user_id: userId,
    p_company_ids: companyIds,
    p_role_slug: roleSlug,
  });
  if (error) throw mapSupabaseError(error);
}

export async function adminSetUserActive(userId: string, active: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_set_user_active", {
    p_user_id: userId,
    p_active: active,
  });
  if (error) throw mapSupabaseError(error);
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let token = session?.access_token ?? "";

  const invoke = async (accessToken: string) => {
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: userId, access_token: accessToken },
    });
    if (error) throw error;
    const err = (data as { error?: string } | null)?.error;
    if (err) throw new Error(err);
  };

  try {
    await invoke(token);
  } catch {
    const { data: refreshed } = await supabase.auth.refreshSession();
    const t = refreshed.session?.access_token;
    if (!t) throw new Error("Session expirée. Reconnectez-vous puis réessayez.");
    await invoke(t);
  }
}

export async function adminListLockedLogins(): Promise<LockedLogin[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_list_locked_logins");
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    emailLower: String(row.email_lower ?? ""),
    failedAttempts: toNum(row.failed_attempts),
    lockedAt: row.locked_at != null ? String(row.locked_at) : null,
  }));
}

export async function adminUnlockLogin(email: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_unlock_login", { p_email: email });
  if (error) throw mapSupabaseError(error);
}

export async function adminGetPlatformSettings(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("platform_settings").select("key, value");
  if (error) throw mapSupabaseError(error);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const r = row as { key?: string; value?: string };
    if (r.key) out[r.key] = String(r.value ?? "");
  }
  return out;
}

export async function adminSetPlatformSetting(key: string, value: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("platform_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw mapSupabaseError(error);
}

export async function adminSetPlatformSettings(settings: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(settings)) {
    await adminSetPlatformSetting(k, v);
  }
}

export async function adminListLandingChatMessages(limit = 500): Promise<Record<string, unknown>[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("landing_chat_messages")
    .select("id, session_id, role, content, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((e) => ({ ...(e as object) }));
}

export async function adminSendNotificationToUser(
  userId: string,
  title: string,
  body?: string | null,
  type = "admin_message",
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_create_notification", {
    p_user_id: userId,
    p_title: title,
    p_body: body ?? null,
    p_type: type,
  });
  if (error) throw mapSupabaseError(error);
  const { fireAndForgetWebPushDispatch } = await import("@/lib/features/push/dispatch-client");
  fireAndForgetWebPushDispatch({
    userId,
    title,
    body: body ?? undefined,
  });
}

export async function adminSendNotificationToAllOwners(
  title: string,
  body?: string | null,
  type = "admin_message",
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_create_notification_to_owners", {
    p_title: title,
    p_body: body ?? null,
    p_type: type,
  });
  if (error) throw mapSupabaseError(error);
  const { fireAndForgetWebPushDispatch } = await import("@/lib/features/push/dispatch-client");
  fireAndForgetWebPushDispatch({
    allOwners: true,
    title,
    body: body ?? undefined,
  });
  return typeof data === "number" ? data : toNum(data);
}

function parseClientKind(v: unknown): AdminAppClientKind | null {
  if (v === "web" || v === "flutter") return v;
  return null;
}

function deriveClientKindFromRow(r: Record<string, unknown>): AdminAppClientKind | null {
  const col = parseClientKind(r.client_kind);
  if (col) return col;
  const ctx = r.context;
  if (ctx != null && typeof ctx === "object" && !Array.isArray(ctx)) {
    const fromCtx = parseClientKind((ctx as Record<string, unknown>).client_kind);
    if (fromCtx) return fromCtx;
  }
  const plat = r.platform != null ? String(r.platform).toLowerCase().trim() : "";
  if (plat === "web") return "web";
  if (plat && plat !== "web") return "flutter";
  return null;
}

export async function adminListAppErrors(params: {
  companyId?: string | null;
  userId?: string | null;
  source?: string | null;
  level?: string | null;
  clientKind?: AdminAppClientKind | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
}): Promise<AdminAppErrorLog[]> {
  const supabase = createClient();
  let q = supabase
    .from("app_error_logs")
    .select(
      "id, created_at, user_id, company_id, store_id, source, level, message, stack_trace, error_type, platform, client_kind, context",
    );
  if (params.companyId) q = q.eq("company_id", params.companyId);
  if (params.userId) q = q.eq("user_id", params.userId);
  if (params.source) q = q.eq("source", params.source);
  if (params.level) q = q.eq("level", params.level);
  if (params.clientKind) q = q.eq("client_kind", params.clientKind);
  if (params.fromDate) q = q.gte("created_at", params.fromDate);
  if (params.toDate) q = q.lte("created_at", `${params.toDate}T23:59:59.999Z`);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(params.limit ?? 200);
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    let ctx: Record<string, unknown> | null = null;
    if (r.context != null && typeof r.context === "object" && !Array.isArray(r.context)) {
      ctx = { ...(r.context as Record<string, unknown>) };
    }
    return {
      id: String(r.id),
      createdAt: String(r.created_at ?? ""),
      userId: r.user_id != null ? String(r.user_id) : null,
      companyId: r.company_id != null ? String(r.company_id) : null,
      storeId: r.store_id != null ? String(r.store_id) : null,
      source: String(r.source ?? "app"),
      level: String(r.level ?? "error"),
      message: String(r.message ?? ""),
      stackTrace: r.stack_trace != null ? String(r.stack_trace) : null,
      errorType: r.error_type != null ? String(r.error_type) : null,
      platform: r.platform != null ? String(r.platform) : null,
      clientKind: deriveClientKindFromRow(r),
      context: ctx,
    };
  });
}

export async function adminListAuditLogs(
  companyId: string | null,
  limit = 100,
): Promise<AuditLogEntry[]> {
  const supabase = createClient();
  let q = supabase
    .from("audit_logs")
    .select("id, company_id, store_id, user_id, action, entity_type, entity_id, old_data, new_data, created_at");
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q.order("created_at", { ascending: false }).range(0, limit - 1);
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      companyId: r.company_id != null ? String(r.company_id) : null,
      storeId: r.store_id != null ? String(r.store_id) : null,
      userId: r.user_id != null ? String(r.user_id) : null,
      action: String(r.action ?? ""),
      entityType: String(r.entity_type ?? ""),
      entityId: r.entity_id != null ? String(r.entity_id) : null,
      oldData:
        r.old_data != null && typeof r.old_data === "object"
          ? (r.old_data as Record<string, unknown>)
          : null,
      newData:
        r.new_data != null && typeof r.new_data === "object"
          ? (r.new_data as Record<string, unknown>)
          : null,
      createdAt: String(r.created_at ?? ""),
    };
  });
}
