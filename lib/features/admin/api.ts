"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import { compressImageForUpload } from "@/lib/utils/image-compress";
import { localDayEndIso, localDayStartIso } from "@/lib/utils/local-day";
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
  LoginLockLookup,
  AdminPublicPartner,
  AdminPublicLandingMedia,
  AdminPublicLandingSetting,
  AdminNewsletterSubscriber,
  AdminCockpitData,
  AdminCockpitPlatformMetrics,
  AdminCompanyLite,
  AdminStoreLite,
  AdminUserRoleLite,
  AdminSalesRow,
  AdminSubscriptionRow,
  AdminAuditLite,
  AdminAppErrorLite,
  AdminSubscriptionPlanLite,
  AdminCompanySubscriptionRow,
  AdminOnlineStoreRow,
  AdminSubscriptionRequestRow,
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
      "id, name, slug, is_active, store_quota, ai_predictions_enabled, warehouse_feature_enabled, purchases_feature_enabled, transfers_feature_enabled, store_quota_increase_enabled, warehouse_kpi_show_purchase_value, warehouse_kpi_show_sale_value, warehouse_quota, accounting_module_enabled, hr_module_enabled, expiry_module_enabled, parts_module_enabled, restock_module_enabled, online_store_enabled, created_at",
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
      purchasesFeatureEnabled: r.purchases_feature_enabled !== false,
      transfersFeatureEnabled: r.transfers_feature_enabled === true,
      storeQuotaIncreaseEnabled: r.store_quota_increase_enabled !== false,
      warehouseKpiShowPurchaseValue: r.warehouse_kpi_show_purchase_value !== false,
      warehouseKpiShowSaleValue: r.warehouse_kpi_show_sale_value !== false,
      warehouseQuota: (() => { const q = toNum(r.warehouse_quota); return q > 0 ? q : 1; })(),
      accountingModuleEnabled: r.accounting_module_enabled === true,
      hrModuleEnabled: r.hr_module_enabled === true,
      expiryModuleEnabled: r.expiry_module_enabled === true,
      partsModuleEnabled: r.parts_module_enabled === true,
      // Soustractif : actif tant que la plateforme ne l'a pas coupé.
      restockModuleEnabled: r.restock_module_enabled !== false,
      onlineStoreEnabled: r.online_store_enabled === true,
      createdAt: r.created_at != null ? String(r.created_at) : null,
    };
  });
}

/**
 * Crée un compte entreprise complet (propriétaire + entreprise + première boutique)
 * à remettre à un client. L'email est confirmé automatiquement côté serveur.
 * Réservé au super admin (contrôlé par la route API).
 */
export async function adminCreateCompanyAccount(params: {
  companyName: string;
  companySlug?: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFullName?: string;
  firstStoreName: string;
  firstStorePhone?: string;
  businessTypeSlug?: string | null;
}): Promise<{ userId: string; companyId: string | null; storeId: string | null }> {
  const res = await fetch("/api/admin/create-company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(params),
  });
  const raw = await res.text();
  let parsed: {
    error?: string;
    userId?: string;
    companyId?: string | null;
    storeId?: string | null;
  } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(parsed.error || raw || `Erreur API ${res.status}`);
  return {
    userId: String(parsed.userId ?? ""),
    companyId: parsed.companyId ?? null,
    storeId: parsed.storeId ?? null,
  };
}

/** Email du compte super admin connecté (affiché dans « Mon compte »). */
export async function adminGetMyAccountEmail(): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return String(data.user?.email ?? "");
}

/**
 * Change l'email et/ou le mot de passe du super admin connecté.
 * Le mot de passe actuel est exigé et vérifié par la route API.
 */
export async function adminUpdateMyAccount(params: {
  currentPassword: string;
  newEmail?: string;
  newPassword?: string;
}): Promise<{ email: string; emailChanged: boolean; passwordChanged: boolean }> {
  const res = await fetch("/api/admin/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(params),
  });
  const raw = await res.text();
  let parsed: {
    error?: string;
    email?: string;
    emailChanged?: boolean;
    passwordChanged?: boolean;
  } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(parsed.error || raw || `Erreur API ${res.status}`);
  return {
    email: String(parsed.email ?? ""),
    emailChanged: parsed.emailChanged === true,
    passwordChanged: parsed.passwordChanged === true,
  };
}

export async function adminListStores(companyId?: string | null): Promise<AdminStore[]> {
  const supabase = createClient();
  let q = supabase
    .from("stores")
    .select("id, company_id, name, code, phone, is_active, is_primary, engine_sales_enabled, engine_registration_enabled, progressive_purchases_enabled, rental_module_enabled, expiry_module_enabled, parts_module_enabled, restock_module_enabled, online_store_enabled, created_at")
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
      phone: (r.phone as string | null)?.trim() || null,
      isActive: r.is_active !== false,
      isPrimary: r.is_primary === true,
      engineSalesEnabled: r.engine_sales_enabled === true,
      engineRegistrationEnabled: r.engine_registration_enabled === true,
      progressivePurchasesEnabled: r.progressive_purchases_enabled === true,
      rentalModuleEnabled: r.rental_module_enabled === true,
      expiryModuleEnabled: r.expiry_module_enabled === true,
      partsModuleEnabled: r.parts_module_enabled === true,
      restockModuleEnabled: r.restock_module_enabled !== false,
      onlineStoreEnabled: r.online_store_enabled === true,
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
    purchasesFeatureEnabled?: boolean;
    transfersFeatureEnabled?: boolean;
    storeQuotaIncreaseEnabled?: boolean;
    warehouseKpiShowPurchaseValue?: boolean;
    warehouseKpiShowSaleValue?: boolean;
    accountingModuleEnabled?: boolean;
    hrModuleEnabled?: boolean;
    expiryModuleEnabled?: boolean;
    partsModuleEnabled?: boolean;
    restockModuleEnabled?: boolean;
    onlineStoreEnabled?: boolean;
    storeQuota?: number;
    warehouseQuota?: number;
  },
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = {};
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.aiPredictionsEnabled !== undefined) row.ai_predictions_enabled = patch.aiPredictionsEnabled;
  if (patch.warehouseFeatureEnabled !== undefined) {
    row.warehouse_feature_enabled = patch.warehouseFeatureEnabled;
  }
  if (patch.purchasesFeatureEnabled !== undefined) {
    row.purchases_feature_enabled = patch.purchasesFeatureEnabled;
  }
  if (patch.transfersFeatureEnabled !== undefined) {
    row.transfers_feature_enabled = patch.transfersFeatureEnabled;
  }
  if (patch.storeQuotaIncreaseEnabled !== undefined) {
    row.store_quota_increase_enabled = patch.storeQuotaIncreaseEnabled;
  }
  if (patch.warehouseKpiShowPurchaseValue !== undefined) {
    row.warehouse_kpi_show_purchase_value = patch.warehouseKpiShowPurchaseValue;
  }
  if (patch.warehouseKpiShowSaleValue !== undefined) {
    row.warehouse_kpi_show_sale_value = patch.warehouseKpiShowSaleValue;
  }
  if (patch.accountingModuleEnabled !== undefined) {
    row.accounting_module_enabled = patch.accountingModuleEnabled;
  }
  if (patch.hrModuleEnabled !== undefined) {
    row.hr_module_enabled = patch.hrModuleEnabled;
  }
  if (patch.expiryModuleEnabled !== undefined) {
    row.expiry_module_enabled = patch.expiryModuleEnabled;
  }
  if (patch.partsModuleEnabled !== undefined) {
    row.parts_module_enabled = patch.partsModuleEnabled;
  }
  if (patch.restockModuleEnabled !== undefined) {
    row.restock_module_enabled = patch.restockModuleEnabled;
  }
  if (patch.onlineStoreEnabled !== undefined) {
    row.online_store_enabled = patch.onlineStoreEnabled;
  }
  if (patch.storeQuota !== undefined) {
    const n = Math.floor(Number(patch.storeQuota));
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("Quota de boutiques invalide (minimum 1).");
    }
    row.store_quota = n;
  }
  if (patch.warehouseQuota !== undefined) {
    const n = Math.floor(Number(patch.warehouseQuota));
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("Quota de dépôts invalide (minimum 1).");
    }
    row.warehouse_quota = n;
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("companies").update(row).eq("id", id);
  if (error) throw mapSupabaseError(error);

  // Synchronise les dépôts physiques après un changement de quota
  if (patch.warehouseQuota !== undefined) {
    const { error: syncErr } = await supabase.rpc("sync_warehouses_to_quota", {
      p_company_id: id,
      p_quota: Math.floor(Number(patch.warehouseQuota)),
    });
    if (syncErr) throw mapSupabaseError(syncErr);
  }
}

export async function adminUpdateStore(id: string, isActive: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("stores").update({ is_active: isActive }).eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Active/désactive le module Vente Engins pour une boutique (super admin). */
export async function adminSetStoreEngineSales(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stores")
    .update({ engine_sales_enabled: enabled })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Active/désactive le module Immatriculation Engins pour une boutique (super admin). */
export async function adminSetStoreEngineRegistration(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stores")
    .update({ engine_registration_enabled: enabled })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Active/désactive le module Achats Progressifs pour une boutique (super admin). */
export async function adminSetStoreProgressive(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stores")
    .update({ progressive_purchases_enabled: enabled })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Suivi de péremption (DLC/DLUO) — activation par boutique (super admin). */
export async function adminSetStoreExpiryModule(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stores")
    .update({ expiry_module_enabled: enabled })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Module Pièces (compatibilités / équivalences / variantes) — activation par boutique. */
export async function adminSetStorePartsModule(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stores")
    .update({ parts_module_enabled: enabled })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Module Réassort — activé par défaut ; ce réglage sert surtout à le COUPER. */
export async function adminSetStoreRestockModule(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stores")
    .update({ restock_module_enabled: enabled })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Boutique en ligne (catalogue public + commandes) — activation par boutique. */
export async function adminSetStoreOnlineStore(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stores")
    .update({ online_store_enabled: enabled })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Vue d'ensemble des boutiques en ligne (activation, lien, commandes) — super admin. */
export async function adminListOnlineStores(): Promise<AdminOnlineStoreRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_online_store_overview");
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    storeId: String(r.store_id ?? ""),
    storeName: String(r.store_name ?? ""),
    companyId: String(r.company_id ?? ""),
    companyName: String(r.company_name ?? ""),
    companyEnabled: r.company_enabled === true,
    storeEnabled: r.store_enabled === true,
    slug: r.slug != null ? String(r.slug) : null,
    isPublished: r.is_published === true,
    ordersCount: toNum(r.orders_count),
    ordersPending: toNum(r.orders_pending),
    ordersTotal: toNum(r.orders_total),
    lastOrderAt: r.last_order_at != null ? String(r.last_order_at) : null,
  }));
}

/** Module Location (gestion locative immobilière) — activation par boutique. */
export async function adminSetStoreRental(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stores")
    .update({ rental_module_enabled: enabled })
    .eq("id", id);
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

/**
 * Compteurs plateforme — agrégés en base (`admin_platform_stats`, migration 00184).
 *
 * Cette page téléchargeait auparavant toutes les ventes de toutes les entreprises pour
 * les compter dans le navigateur. PostgREST tronquant chaque réponse à 1000 lignes sans
 * le dire, les chiffres affichés étaient **déjà faux** — et le seraient devenus de plus
 * en plus. Le compte se fait désormais là où sont les données ; la charge utile ne
 * dépend plus de la taille de la plateforme.
 */
export async function adminGetStats(): Promise<AdminStats> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_platform_stats");
  if (error) throw mapSupabaseError(error);

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  return {
    companiesCount: toNum(row?.companies_count),
    storesCount: toNum(row?.stores_count),
    usersCount: toNum(row?.users_count),
    salesCount: toNum(row?.sales_count),
    salesTotalAmount: toNum(row?.sales_total_amount),
    activeSubscriptionsCount: toNum(row?.active_subscriptions_count),
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

/** Ventes par entreprise — agrégées en base, déjà triées par montant décroissant. */
export async function adminGetSalesByCompany(): Promise<AdminSalesByCompany[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_sales_by_company");
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    companyId: String(r.company_id ?? ""),
    companyName: String(r.company_name ?? "—"),
    salesCount: toNum(r.sales_count),
    totalAmount: toNum(r.total_amount),
  }));
}

/**
 * Courbe des ventes plateforme — agrégée en base. Les jours sans vente sont renvoyés
 * à zéro par la fonction SQL (`generate_series`) : la courbe garde ses creux, et le
 * client n'a plus à reconstruire le calendrier.
 */
export async function adminGetSalesOverTime(days = 30): Promise<AdminSalesOverTimeItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_sales_over_time", { p_days: days });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    date: String(r.day ?? ""),
    count: toNum(r.sales_count),
    total: toNum(r.total_amount),
  }));
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
  const token = session?.access_token ?? "";

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
    locked: row.locked === true,
    unlockAt: row.unlock_at != null ? String(row.unlock_at) : null,
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
  }));
}

/**
 * Déblocage immédiat d'un email. Retourne `false` quand aucun compteur/verrou
 * n'existait (email déjà libre ou mal orthographié) — l'appelant le signale.
 */
export async function adminUnlockLogin(email: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_unlock_login", { p_email: email });
  if (error) throw mapSupabaseError(error);
  return data === true;
}

/** État de verrouillage d'un email précis (celui dicté par le client au téléphone). */
export async function adminLookupLoginStatus(email: string): Promise<LoginLockLookup> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_lookup_login_status", {
    p_email: email,
  });
  if (error) throw mapSupabaseError(error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    emailLower: String(row?.email_lower ?? email.trim().toLowerCase()),
    failedAttempts: toNum(row?.failed_attempts),
    locked: row?.locked === true,
    unlockAt: row?.unlock_at != null ? String(row.unlock_at) : null,
  };
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

export async function adminListPublicPartners(): Promise<AdminPublicPartner[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("public_partners")
    .select("id, name, logo_url, sort_order, is_active, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    logoUrl: String(row.logo_url ?? ""),
    sortOrder: toNum(row.sort_order),
    isActive: row.is_active !== false,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  }));
}

/** Bucket Storage public pour la landing page — voir migration 00104_landing_images_bucket.sql. */
const LANDING_IMAGES_BUCKET = "landing-images";

/**
 * Upload une image vers le bucket Storage public de la landing et renvoie l'URL publique.
 * Préférable à un stockage en Data URL (base64) qui gonfle le HTML et casse le cache.
 */
export async function adminUploadLandingImage(file: File, prefix = "general"): Promise<string> {
  const supabase = createClient();
  // Les vidéos (bannière hero) ne sont pas des images : `compressImageForUpload`
  // les renvoie telles quelles, sans jamais les ré-encoder.
  const optimized = await compressImageForUpload(file, "cover");
  const ext = optimized.name.includes(".") ? optimized.name.split(".").pop() || "jpg" : "jpg";
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage.from(LANDING_IMAGES_BUCKET).upload(path, optimized, {
    contentType: optimized.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) throw mapSupabaseError(upErr);
  const { data } = supabase.storage.from(LANDING_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function adminCreatePublicPartner(params: {
  name: string;
  logoUrl: string;
  sortOrder?: number;
}): Promise<void> {
  const supabase = createClient();
  const payload = {
    name: params.name.trim(),
    logo_url: params.logoUrl.trim(),
    sort_order: Math.max(0, Math.floor(Number(params.sortOrder ?? 0))),
    is_active: true,
  };
  const { error } = await supabase.from("public_partners").insert(payload);
  if (error) throw mapSupabaseError(error);
}

/**
 * Met à jour un partenaire existant. Tous les champs sont optionnels —
 * seuls ceux fournis sont envoyés à Supabase.
 */
export async function adminUpdatePublicPartner(
  id: string,
  patch: { name?: string; logoUrl?: string; sortOrder?: number; isActive?: boolean },
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length < 2) throw new Error("Le nom doit contenir au moins 2 caractères.");
    row.name = trimmed;
  }
  if (patch.logoUrl !== undefined) {
    const trimmed = patch.logoUrl.trim();
    if (!trimmed) throw new Error("Logo invalide.");
    row.logo_url = trimmed;
  }
  if (patch.sortOrder !== undefined) {
    row.sort_order = Math.max(0, Math.floor(Number(patch.sortOrder)));
  }
  if (patch.isActive !== undefined) {
    row.is_active = patch.isActive === true;
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("public_partners").update(row).eq("id", id);
  if (error) throw mapSupabaseError(error);
}

export async function adminDeletePublicPartner(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("public_partners").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

export async function adminListPublicLandingMedia(): Promise<AdminPublicLandingMedia[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("public_landing_media")
    .select("key, image_url, updated_at")
    .order("key", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    key: String(row.key ?? ""),
    imageUrl: String(row.image_url ?? ""),
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
  }));
}

export async function adminSetPublicLandingMediaImage(key: string, imageUrl: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("public_landing_media").upsert(
    {
      key: key.trim(),
      image_url: imageUrl.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw mapSupabaseError(error);
}

export async function adminListPublicLandingSettings(): Promise<AdminPublicLandingSetting[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("public_landing_settings")
    .select("key, value, updated_at")
    .order("key", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    key: String(row.key ?? ""),
    value: String(row.value ?? ""),
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
  }));
}

export async function adminSetPublicLandingSettings(settings: Record<string, string>): Promise<void> {
  const supabase = createClient();
  const rows = Object.entries(settings).map(([key, value]) => ({
    key: key.trim(),
    value: String(value ?? "").trim(),
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("public_landing_settings").upsert(rows, { onConflict: "key" });
  if (error) throw mapSupabaseError(error);
}

export async function adminListNewsletterSubscribers(): Promise<AdminNewsletterSubscriber[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("id, email, source, created_at")
    .order("created_at", { ascending: false });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    email: String(row.email ?? ""),
    source: String(row.source ?? ""),
    createdAt: row.created_at != null ? String(row.created_at) : null,
  }));
}

export async function adminDeleteNewsletterSubscriber(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
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
  if (params.fromDate) q = q.gte("created_at", localDayStartIso(params.fromDate));
  if (params.toDate) q = q.lte("created_at", localDayEndIso(params.toDate));
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

export async function adminListSubscriptionPlansLite(): Promise<AdminSubscriptionPlanLite[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id, slug, name, price_cents, interval, is_active")
    .order("price_cents", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    slug: String(r.slug ?? ""),
    name: String(r.name ?? ""),
    priceCents: toNum(r.price_cents),
    interval: String(r.interval ?? "month") === "year" ? "year" : "month",
    isActive: r.is_active !== false,
  }));
}

export async function adminListCompanySubscriptions(): Promise<AdminCompanySubscriptionRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, created_at, sub:company_subscriptions(id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, plan:subscription_plans(slug, name))",
    )
    .order("name", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const subs = Array.isArray(r.sub) ? (r.sub[0] as Record<string, unknown> | undefined) : (r.sub as Record<string, unknown> | null);
    const plan = subs?.plan;
    const planObj = Array.isArray(plan) ? (plan[0] as Record<string, unknown> | undefined) : (plan as Record<string, unknown> | undefined);
    return {
      companyId: String(r.id ?? ""),
      companyName: String(r.name ?? ""),
      companyCreatedAt: r.created_at != null ? String(r.created_at) : null,
      subscriptionId: subs?.id != null ? String(subs.id) : null,
      planId: subs?.plan_id != null ? String(subs.plan_id) : null,
      planSlug: planObj?.slug != null ? String(planObj.slug) : null,
      planName: planObj?.name != null ? String(planObj.name) : null,
      status: ((subs?.status != null ? String(subs.status) : "trialing") as AdminCompanySubscriptionRow["status"]) ?? "trialing",
      currentPeriodStart: subs?.current_period_start != null ? String(subs.current_period_start) : null,
      currentPeriodEnd: subs?.current_period_end != null ? String(subs.current_period_end) : null,
      cancelAtPeriodEnd: subs?.cancel_at_period_end === true,
    };
  });
}

export async function adminListSubscriptionRequests(
  onlyPending = false,
): Promise<AdminSubscriptionRequestRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("subscription_requests")
    .select(
      "id, company_id, billing_interval, amount_cents, currency, first_name, last_name, phone, city, payment_method, transaction_id, status, created_at, company:companies(name), plan:subscription_plans(name)",
    )
    .order("created_at", { ascending: false });
  if (onlyPending) query = query.eq("status", "pending");
  const { data, error } = await query;
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const companyRaw = r.company;
    const company = Array.isArray(companyRaw)
      ? (companyRaw[0] as Record<string, unknown> | undefined)
      : (companyRaw as Record<string, unknown> | undefined);
    const planRaw = r.plan;
    const plan = Array.isArray(planRaw)
      ? (planRaw[0] as Record<string, unknown> | undefined)
      : (planRaw as Record<string, unknown> | undefined);
    return {
      id: String(r.id ?? ""),
      companyId: String(r.company_id ?? ""),
      companyName: company?.name != null ? String(company.name) : null,
      planName: plan?.name != null ? String(plan.name) : null,
      billingInterval: String(r.billing_interval ?? "month") === "year" ? "year" : "month",
      amountCents: toNum(r.amount_cents),
      currency: String(r.currency ?? "XOF"),
      firstName: String(r.first_name ?? ""),
      lastName: String(r.last_name ?? ""),
      phone: String(r.phone ?? ""),
      city: r.city != null ? String(r.city) : null,
      paymentMethod: String(r.payment_method ?? ""),
      transactionId: r.transaction_id != null ? String(r.transaction_id) : null,
      status: (String(r.status ?? "pending") as AdminSubscriptionRequestRow["status"]) ?? "pending",
      createdAt: String(r.created_at ?? ""),
    };
  });
}

/** Valide (active l'abonnement) ou refuse une demande — via RPC super-admin. */
export async function adminReviewSubscriptionRequest(params: {
  requestId: string;
  approve: boolean;
  note?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("review_subscription_request", {
    p_request_id: params.requestId,
    p_approve: params.approve,
    p_note: params.note ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function adminUpsertCompanySubscription(params: {
  companyId: string;
  planId: string;
  status: AdminCompanySubscriptionRow["status"];
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const res = await fetch("/api/admin/company-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      companyId: params.companyId,
      planId: params.planId,
      status: params.status,
      currentPeriodStart: params.currentPeriodStart,
      currentPeriodEnd: params.currentPeriodEnd,
      cancelAtPeriodEnd: params.cancelAtPeriodEnd,
    }),
  });
  const raw = await res.text();
  let parsed: { error?: string } = {};
  try {
    parsed = JSON.parse(raw) as { error?: string };
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(parsed.error || raw || `Erreur API ${res.status}`);
}

export async function adminAskAiAssistant(params: {
  question: string;
  companyId?: string | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{
  answer: string;
  structuredAnswer?: {
    intro: string;
    direct_answer: string;
    table_title: string;
    table_columns: string[];
    table_rows: string[][];
    key_figures: string[];
    recommended_actions: string[];
  };
  contextScope: string;
  suggestedActions: Array<{
    type: "set_company_active" | "set_company_ai_predictions";
    company_name: string;
    value: boolean;
    reason: string;
  }>;
}> {
  const res = await fetch("/api/ai/admin-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      question: params.question,
      companyId: params.companyId ?? null,
      history: params.history ?? [],
    }),
  });
  const raw = await res.text();
  let parsed: {
    answer?: string;
    structuredAnswer?: {
      intro?: string;
      direct_answer?: string;
      table_title?: string;
      table_columns?: string[];
      table_rows?: string[][];
      key_figures?: string[];
      recommended_actions?: string[];
    };
    contextScope?: string;
    error?: string;
    suggestedActions?: Array<{
      type?: "set_company_active" | "set_company_ai_predictions";
      company_name?: string;
      value?: boolean;
      reason?: string;
    }>;
  } = {};
  try {
    parsed = JSON.parse(raw) as { answer?: string; contextScope?: string; error?: string };
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(parsed.error || raw || `Erreur API ${res.status}`);
  }
  return {
    answer: String(parsed.answer ?? "").trim(),
    structuredAnswer:
      parsed.structuredAnswer != null
        ? {
            intro: String(parsed.structuredAnswer.intro ?? "").trim(),
            direct_answer: String(parsed.structuredAnswer.direct_answer ?? "").trim(),
            table_title: String(parsed.structuredAnswer.table_title ?? "").trim(),
            table_columns: Array.isArray(parsed.structuredAnswer.table_columns)
              ? parsed.structuredAnswer.table_columns.map((e) => String(e ?? ""))
              : [],
            table_rows: Array.isArray(parsed.structuredAnswer.table_rows)
              ? parsed.structuredAnswer.table_rows.map((r) =>
                  Array.isArray(r) ? r.map((c) => String(c ?? "")) : [],
                )
              : [],
            key_figures: Array.isArray(parsed.structuredAnswer.key_figures)
              ? parsed.structuredAnswer.key_figures.map((e) => String(e ?? ""))
              : [],
            recommended_actions: Array.isArray(parsed.structuredAnswer.recommended_actions)
              ? parsed.structuredAnswer.recommended_actions.map((e) => String(e ?? ""))
              : [],
          }
        : undefined,
    contextScope: String(parsed.contextScope ?? ""),
    suggestedActions: (parsed.suggestedActions ?? [])
      .filter((a) => a.type === "set_company_active" || a.type === "set_company_ai_predictions")
      .map((a) => ({
        type: a.type as "set_company_active" | "set_company_ai_predictions",
        company_name: String(a.company_name ?? "").trim(),
        value: a.value === true,
        reason: String(a.reason ?? "").trim(),
      })),
  };
}

export async function adminExecuteAiAction(params: {
  type: "set_company_active" | "set_company_ai_predictions";
  companyId: string;
  value: boolean;
}): Promise<{ message: string }> {
  const res = await fetch("/api/ai/admin-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(params),
  });
  const raw = await res.text();
  let parsed: { message?: string; error?: string } = {};
  try {
    parsed = JSON.parse(raw) as { message?: string; error?: string };
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(parsed.error || raw || `Erreur API ${res.status}`);
  return { message: String(parsed.message ?? "Action executee") };
}

const COCKPIT_SALES_LOAD_CAP = 15_000;

export async function adminGetCockpitData(): Promise<AdminCockpitData> {
  const supabase = createClient();

  const [
    companiesRes,
    storesRes,
    userRolesRes,
    salesRes,
    subscriptionsRes,
    auditsRes,
    appErrorsRes,
    metricsRes,
  ] = await Promise.all([
    supabase.from("companies").select("id, name, is_active, created_at"),
    supabase.from("stores").select("id, company_id, name, city, is_active"),
    supabase.from("user_company_roles").select("id, user_id, company_id, created_at"),
    supabase
      .from("sales")
      .select("id, company_id, store_id, total, status, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(COCKPIT_SALES_LOAD_CAP),
    supabase
      .from("company_subscriptions")
      .select(
        "id, company_id, plan_id, status, current_period_start, current_period_end, created_at, plan:subscription_plans(slug, price_cents)",
      )
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("audit_logs")
      .select("id, company_id, entity_type, action, created_at")
      .order("created_at", { ascending: false })
      .limit(2500),
    supabase
      .from("app_error_logs")
      .select("id, company_id, level, message, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.rpc("admin_cockpit_dashboard_metrics"),
  ]);

  if (companiesRes.error) throw mapSupabaseError(companiesRes.error);
  if (storesRes.error) throw mapSupabaseError(storesRes.error);
  if (userRolesRes.error) throw mapSupabaseError(userRolesRes.error);
  if (salesRes.error) throw mapSupabaseError(salesRes.error);

  const companies: AdminCompanyLite[] = ((companiesRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    isActive: r.is_active !== false,
    createdAt: r.created_at != null ? String(r.created_at) : null,
  }));
  const stores: AdminStoreLite[] = ((storesRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    companyId: String(r.company_id ?? ""),
    name: String(r.name ?? ""),
    city: r.city != null ? String(r.city) : null,
    isActive: r.is_active !== false,
  }));
  const userRoles: AdminUserRoleLite[] = ((userRolesRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    userId: String(r.user_id ?? ""),
    companyId: String(r.company_id ?? ""),
    createdAt: r.created_at != null ? String(r.created_at) : null,
  }));
  const sales: AdminSalesRow[] = ((salesRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    companyId: String(r.company_id ?? ""),
    storeId: r.store_id != null ? String(r.store_id) : null,
    total: toNum(r.total),
    status: String(r.status ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));

  const subscriptions: AdminSubscriptionRow[] = subscriptionsRes.error
    ? []
    : ((subscriptionsRes.data ?? []) as Record<string, unknown>[]).map((r) => {
        const planRaw = r.plan;
        const plan = Array.isArray(planRaw)
          ? (planRaw[0] as Record<string, unknown> | undefined)
          : (planRaw as Record<string, unknown> | undefined);
        const status = String(r.status ?? "active") as AdminSubscriptionRow["status"];
        const periodEnd = r.current_period_end != null ? String(r.current_period_end) : null;
        return {
          id: String(r.id ?? ""),
          companyId: String(r.company_id ?? ""),
          planCode: plan?.slug != null ? String(plan.slug) : null,
          status: status ?? "active",
          amountFcfa: toNum(plan?.price_cents),
          startedAt: r.current_period_start != null ? String(r.current_period_start) : null,
          endsAt: periodEnd,
          trialEndsAt: status === "trialing" ? periodEnd : null,
          createdAt: r.created_at != null ? String(r.created_at) : null,
        };
      });

  const audits: AdminAuditLite[] = auditsRes.error
    ? []
    : ((auditsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id ?? ""),
        companyId: r.company_id != null ? String(r.company_id) : null,
        entityType: String(r.entity_type ?? ""),
        action: String(r.action ?? ""),
        createdAt: String(r.created_at ?? ""),
      }));

  const appErrors: AdminAppErrorLite[] = appErrorsRes.error
    ? []
    : ((appErrorsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id ?? ""),
        companyId: r.company_id != null ? String(r.company_id) : null,
        level: String(r.level ?? "error"),
        message: String(r.message ?? ""),
        createdAt: String(r.created_at ?? ""),
      }));

  let platformMetrics: AdminCockpitPlatformMetrics | null = null;
  if (!metricsRes.error && metricsRes.data != null && typeof metricsRes.data === "object") {
    const m = metricsRes.data as Record<string, unknown>;
    platformMetrics = {
      completedSalesCount: toNum(m.completed_sales_count),
      completedSalesTotal: toNum(m.completed_sales_total),
      productsCount: toNum(m.products_count),
      customersCount: toNum(m.customers_count),
      auditDistinctUsers24h: toNum(m.audit_distinct_users_24h),
    };
  }

  return {
    companies,
    stores,
    userRoles,
    sales,
    subscriptions,
    audits,
    appErrors,
    platformMetrics,
    salesLoadedCap: COCKPIT_SALES_LOAD_CAP,
  };
}
