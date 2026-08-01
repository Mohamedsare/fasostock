"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { PERMISSIONS_ALL } from "@/lib/constants/permissions";
import type { AppContextData } from "@/lib/features/permissions/access";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import { queryKeys } from "@/lib/query/query-keys";
import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";

export type { AppContextData };

const FETCH_TIMEOUT_MS = 25_000;

/**
 * La session n'a **pas pu être vérifiée** (réseau coupé, délai dépassé, Supabase injoignable).
 * À ne jamais confondre avec « pas de session » : l'utilisateur est probablement encore connecté.
 * Remontée en erreur (et non en `null`), React Query conserve alors le contexte précédent
 * et l'app continue de fonctionner au lieu d'afficher « Session non synchronisée ».
 */
export class SessionUnavailableError extends Error {
  constructor(message = "Connexion au serveur impossible pour le moment.") {
    super(message);
    this.name = "SessionUnavailableError";
  }
}

/** Panne passagère (réseau / serveur) plutôt que refus d'authentification. */
function isTransientAuthFailure(err: unknown): boolean {
  if (err instanceof SessionUnavailableError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;

  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "AuthRetryableFetchError" || name === "AbortError") return true;

  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number" && (status === 0 || status === 408 || status === 429 || status >= 500)) {
    return true;
  }

  const msg = formatUnknownErrorMessage(err).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("délai dépassé") ||
    msg.includes("timeout")
  );
}

/**
 * Résout l'utilisateur courant côté navigateur.
 * - `User`  → session valide
 * - `null`  → **certitude** qu'il n'y a plus de session (jeton refusé par le serveur)
 * - throw `SessionUnavailableError` → indécidable (réseau) : surtout ne pas déconnecter l'écran
 */
async function resolveCurrentUser(
  supabase: ReturnType<typeof createClient>,
): Promise<{ id: string } | null> {
  // 1) Lecture locale (cookies) — instantanée dans le cas nominal.
  try {
    const {
      data: { session },
    } = await withTimeout(supabase.auth.getSession(), 8_000, "Lecture de session");
    if (session?.user) return session.user;
  } catch (e) {
    if (isTransientAuthFailure(e)) throw new SessionUnavailableError();
  }

  // 2) Après une longue inactivité, le jeton d'accès a pu expirer sans rafraîchissement
  //    (timers d'onglet en veille throttlés par le navigateur) : on force le refresh.
  try {
    const { data, error } = await withTimeout(
      supabase.auth.refreshSession(),
      10_000,
      "Rafraîchissement de session",
    );
    if (error) throw error;
    const u = data.session?.user ?? data.user ?? null;
    if (u) return u;
  } catch (e) {
    if (isTransientAuthFailure(e)) throw new SessionUnavailableError();
    // Refresh token refusé / déjà consommé (le proxy serveur a pu le faire tourner) :
    // ce n'est pas concluant, on demande l'avis du serveur ci-dessous.
  }

  // 3) Vérification serveur : cookie rafraîchi par le proxy, ou connexion depuis un autre onglet.
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(),
      10_000,
      "Authentification",
    );
    if (error) {
      if (isTransientAuthFailure(error)) throw new SessionUnavailableError();
      return null;
    }
    return data.user ?? null;
  } catch (e) {
    if (isTransientAuthFailure(e)) throw new SessionUnavailableError();
    return null;
  }
}

/** Préférence utilisateur (Paramètres) — même idée que `CompanyProvider` Flutter. */
function pickActiveCompanyId(orderedIds: string[]): string {
  if (orderedIds.length === 0) return "";
  if (typeof window === "undefined") return orderedIds[0]!;
  try {
    const v = localStorage.getItem("fs_active_company_id");
    if (v && orderedIds.includes(v)) return v;
  } catch {
    /* */
  }
  return orderedIds[0]!;
}

/**
 * Comme `defaultSelectedStoreId ` (Flutter) : tri stable nom + id ;
 * si au moins une boutique `isPrimary`, la première dans cet ordre ; sinon première du tri.
 */
function defaultStoreIdFromList(
  stores: { id: string; name?: string; isPrimary?: boolean }[],
): string | null {
  if (stores.length === 0) return null;
  const sorted = [...stores].sort((a, b) => {
    const an = (a.name ?? "").toLowerCase();
    const bn = (b.name ?? "").toLowerCase();
    const c = an.localeCompare(bn);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
  const primary = sorted.find((s) => s.isPrimary === true);
  return primary?.id ?? sorted[0]!.id;
}

function pickActiveStoreId(
  stores: { id: string; name: string; isPrimary?: boolean }[],
): string | null {
  if (stores.length === 0) return null;
  if (typeof window === "undefined") return defaultStoreIdFromList(stores);
  try {
    const v = localStorage.getItem("fs_active_store_id");
    if (v === "__all__") return null;
    if (v && stores.some((s) => s.id === v)) return v;
  } catch {
    /* */
  }
  return defaultStoreIdFromList(stores);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} (délai dépassé ${ms / 1000}s)`));
    }, ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

async function fetchAppContext(): Promise<AppContextData | null> {
  const supabase = createClient();

  // `null` seulement si le serveur refuse explicitement le jeton ; sinon `SessionUnavailableError`.
  const user = await resolveCurrentUser(supabase);
  if (!user) return null;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) throw mapSupabaseError(pErr);
  const isSuperAdmin = profile?.is_super_admin === true;

  // Flag GLOBAL plateforme (super admin) : génération d'affiches publicitaires IA. Défaut off.
  let promoAdGenerationEnabled = false;
  try {
    const { data: flag } = await supabase.rpc("promo_ad_generation_enabled");
    promoAdGenerationEnabled = flag === true;
  } catch {
    promoAdGenerationEnabled = false;
  }

  /**
   * Même logique que `CompanyRepository.getCompaniesForUser` (Flutter) :
   * `user_company_roles` actifs → ids entreprise → ligne `companies`.
   * (Pas `company_members`, table absente du schéma courant.)
   */
  const { data: roles, error: rErr } = await supabase
    .from("user_company_roles")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (rErr) throw mapSupabaseError(rErr);
  const seen = new Set<string>();
  const orderedCompanyIds: string[] = [];
  for (const r of roles ?? []) {
    const cid = (r as { company_id?: string }).company_id;
    if (cid && !seen.has(cid)) {
      seen.add(cid);
      orderedCompanyIds.push(cid);
    }
  }
  if (orderedCompanyIds.length === 0) {
    return {
      companyId: "",
      companyName: "",
      businessTypeSlug: null,
      companyLogoUrl: null,
      storeId: null,
      stores: [],
      isSuperAdmin,
      permissionKeys: isSuperAdmin ? [...PERMISSIONS_ALL] : [],
      roleSlug: isSuperAdmin ? "super_admin" : null,
      warehouseFeatureEnabled: true,
      purchasesFeatureEnabled: true,
      transfersFeatureEnabled: true,
      storeQuotaIncreaseEnabled: true,
      aiPredictionsEnabled: true,
      warehouseKpiShowPurchaseValue: true,
      warehouseKpiShowSaleValue: true,
      accountingModuleEnabled: false,
      hrModuleEnabled: false,
      expiryModuleEnabled: false,
      partsModuleEnabled: false,
      restockModuleEnabled: true,
      productLocationsEnabled: false,
      onlineStoreEnabled: false,
      promoAdGenerationEnabled,
    };
  }

  const primaryCompanyId = pickActiveCompanyId(orderedCompanyIds);
  const { data: companyRow, error: cErr } = await supabase
    .from("companies")
    .select(
      "id, name, logo_url, business_type_slug, warehouse_feature_enabled, purchases_feature_enabled, transfers_feature_enabled, store_quota_increase_enabled, ai_predictions_enabled, warehouse_kpi_show_purchase_value, warehouse_kpi_show_sale_value, accounting_module_enabled, hr_module_enabled, expiry_module_enabled, parts_module_enabled, restock_module_enabled, product_locations_enabled, online_store_enabled",
    )
    .eq("id", primaryCompanyId)
    .maybeSingle();
  if (cErr) throw mapSupabaseError(cErr);
  if (!companyRow?.id) {
    void reportHandledClientError(
      new Error(
        "Contexte app: ligne companies absente pour un company_id issu de user_company_roles (RLS, suppression ou incohérence).",
      ),
      {
        source: "app_context_company_row_missing",
        extra: { primaryCompanyId, userId: user.id },
      },
    );
    return {
      companyId: "",
      companyName: "",
      businessTypeSlug: null,
      companyLogoUrl: null,
      storeId: null,
      stores: [],
      isSuperAdmin,
      permissionKeys: isSuperAdmin ? [...PERMISSIONS_ALL] : [],
      roleSlug: isSuperAdmin ? "super_admin" : null,
      warehouseFeatureEnabled: true,
      purchasesFeatureEnabled: true,
      transfersFeatureEnabled: true,
      storeQuotaIncreaseEnabled: true,
      aiPredictionsEnabled: true,
      warehouseKpiShowPurchaseValue: true,
      warehouseKpiShowSaleValue: true,
      accountingModuleEnabled: false,
      hrModuleEnabled: false,
      expiryModuleEnabled: false,
      partsModuleEnabled: false,
      restockModuleEnabled: true,
      productLocationsEnabled: false,
      onlineStoreEnabled: false,
      promoAdGenerationEnabled,
    };
  }

  const companyId = companyRow.id as string;
  const companyName = (companyRow.name as string) ?? "Entreprise";
  const businessTypeSlugRaw = (companyRow as { business_type_slug?: string | null })
    .business_type_slug;
  const businessTypeSlug =
    businessTypeSlugRaw != null && String(businessTypeSlugRaw).trim() !== ""
      ? String(businessTypeSlugRaw).trim()
      : null;
  const companyLogoUrl =
    ((companyRow as { logo_url?: string | null }).logo_url ?? null)?.trim() || null;
  const cr = companyRow as {
    warehouse_feature_enabled?: boolean | null;
    purchases_feature_enabled?: boolean | null;
    transfers_feature_enabled?: boolean | null;
    store_quota_increase_enabled?: boolean | null;
    ai_predictions_enabled?: boolean | null;
    warehouse_kpi_show_purchase_value?: boolean | null;
    warehouse_kpi_show_sale_value?: boolean | null;
    accounting_module_enabled?: boolean | null;
    hr_module_enabled?: boolean | null;
    expiry_module_enabled?: boolean | null;
    parts_module_enabled?: boolean | null;
    restock_module_enabled?: boolean | null;
    product_locations_enabled?: boolean | null;
    online_store_enabled?: boolean | null;
  };
  const warehouseFeatureEnabled = cr.warehouse_feature_enabled !== false;
  const purchasesFeatureEnabled = cr.purchases_feature_enabled !== false;
  const transfersFeatureEnabled = cr.transfers_feature_enabled !== false;
  const storeQuotaIncreaseEnabled = cr.store_quota_increase_enabled !== false;
  const aiPredictionsEnabled = cr.ai_predictions_enabled === true;
  const warehouseKpiShowPurchaseValue = cr.warehouse_kpi_show_purchase_value !== false;
  const warehouseKpiShowSaleValue = cr.warehouse_kpi_show_sale_value !== false;
  const accountingModuleEnabled = cr.accounting_module_enabled === true;
  const hrModuleEnabled = cr.hr_module_enabled === true;
  const expiryModuleEnabled = cr.expiry_module_enabled === true;
  const partsModuleEnabled = cr.parts_module_enabled === true;
  // Réassort : actif tant que la plateforme ne l'a pas explicitement coupé.
  const restockModuleEnabled = cr.restock_module_enabled !== false;
  // Emplacements : additif, activé par le propriétaire dans Paramètres.
  const productLocationsEnabled = cr.product_locations_enabled === true;
  // Boutique en ligne : additif, ouvert par la plateforme (super admin).
  const onlineStoreEnabled = cr.online_store_enabled === true;

  if (isSuperAdmin) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name, is_primary, engine_sales_enabled, engine_registration_enabled, progressive_purchases_enabled, rental_module_enabled, expiry_module_enabled, parts_module_enabled, restock_module_enabled, online_store_enabled")
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true });
    const mapped = (stores ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      isPrimary: (s as { is_primary?: boolean }).is_primary === true,
      engineSalesEnabled: (s as { engine_sales_enabled?: boolean }).engine_sales_enabled === true,
      engineRegistrationEnabled:
        (s as { engine_registration_enabled?: boolean }).engine_registration_enabled === true,
      progressivePurchasesEnabled:
        (s as { progressive_purchases_enabled?: boolean }).progressive_purchases_enabled === true,
      rentalModuleEnabled:
        (s as { rental_module_enabled?: boolean }).rental_module_enabled === true,
      expiryModuleEnabled:
        (s as { expiry_module_enabled?: boolean }).expiry_module_enabled === true,
      partsModuleEnabled:
        (s as { parts_module_enabled?: boolean }).parts_module_enabled === true,
      // Soustractif : seul un `false` explicite coupe le module pour la boutique.
      restockModuleEnabled:
        (s as { restock_module_enabled?: boolean }).restock_module_enabled !== false,
      onlineStoreEnabled:
        (s as { online_store_enabled?: boolean }).online_store_enabled === true,
    }));
    return {
      companyId,
      companyName,
      businessTypeSlug,
      companyLogoUrl,
      storeId: pickActiveStoreId(mapped),
      stores: mapped,
      isSuperAdmin: true,
      permissionKeys: [...PERMISSIONS_ALL],
      roleSlug: "super_admin",
      warehouseFeatureEnabled,
      purchasesFeatureEnabled,
      transfersFeatureEnabled,
      storeQuotaIncreaseEnabled,
      aiPredictionsEnabled,
      warehouseKpiShowPurchaseValue,
      warehouseKpiShowSaleValue,
      accountingModuleEnabled,
      hrModuleEnabled,
      expiryModuleEnabled,
      partsModuleEnabled,
      restockModuleEnabled,
      productLocationsEnabled,
      onlineStoreEnabled,
      promoAdGenerationEnabled,
    };
  }

  const { data: stores, error: sErr } = await supabase
    .from("stores")
    .select("id, name, is_primary, engine_sales_enabled, engine_registration_enabled, progressive_purchases_enabled, rental_module_enabled, expiry_module_enabled, parts_module_enabled, restock_module_enabled, online_store_enabled")
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (sErr) throw mapSupabaseError(sErr);

  const mapped = (stores ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    isPrimary: (s as { is_primary?: boolean }).is_primary === true,
    engineSalesEnabled: (s as { engine_sales_enabled?: boolean }).engine_sales_enabled === true,
    engineRegistrationEnabled:
      (s as { engine_registration_enabled?: boolean }).engine_registration_enabled === true,
    progressivePurchasesEnabled:
      (s as { progressive_purchases_enabled?: boolean }).progressive_purchases_enabled === true,
    rentalModuleEnabled:
      (s as { rental_module_enabled?: boolean }).rental_module_enabled === true,
    expiryModuleEnabled:
      (s as { expiry_module_enabled?: boolean }).expiry_module_enabled === true,
    partsModuleEnabled:
      (s as { parts_module_enabled?: boolean }).parts_module_enabled === true,
    // Soustractif : seul un `false` explicite coupe le module pour la boutique.
    restockModuleEnabled:
      (s as { restock_module_enabled?: boolean }).restock_module_enabled !== false,
    onlineStoreEnabled:
      (s as { online_store_enabled?: boolean }).online_store_enabled === true,
  }));

  let permissionKeys: string[] = [];
  let roleSlug: string | null = null;
  try {
    const { data: keys, error: kErr } = await supabase.rpc("get_my_permission_keys", {
      p_company_id: companyId,
    });
    if (kErr) throw kErr;
    permissionKeys = Array.isArray(keys) ? keys.map((k) => String(k)) : [];
    const { data: slug, error: sErr2 } = await supabase.rpc("get_my_role_slug", {
      p_company_id: companyId,
    });
    if (sErr2) throw sErr2;
    roleSlug = slug != null ? String(slug) : null;
  } catch {
    permissionKeys = [];
    roleSlug = null;
  }

  return {
    companyId,
    companyName,
    businessTypeSlug,
    companyLogoUrl,
    storeId: pickActiveStoreId(mapped),
    stores: mapped,
    isSuperAdmin: false,
    permissionKeys,
    roleSlug,
    warehouseFeatureEnabled,
    purchasesFeatureEnabled,
    transfersFeatureEnabled,
    storeQuotaIncreaseEnabled,
    aiPredictionsEnabled,
    warehouseKpiShowPurchaseValue,
    warehouseKpiShowSaleValue,
    accountingModuleEnabled,
    hrModuleEnabled,
    expiryModuleEnabled,
    partsModuleEnabled,
    restockModuleEnabled,
    productLocationsEnabled,
    onlineStoreEnabled,
    promoAdGenerationEnabled,
  };
}

async function fetchAppContextWithTimeout(): Promise<AppContextData | null> {
  return withTimeout(fetchAppContext(), FETCH_TIMEOUT_MS, "Chargement du contexte");
}

export function useAppContext() {
  const q = useQuery({
    queryKey: queryKeys.appContext,
    queryFn: fetchAppContextWithTimeout,
    staleTime: 2 * 60 * 1000,
    /**
     * Une session simplement invérifiable (réseau faible, onglet réveillé) mérite plus
     * d'insistance qu'une vraie erreur : on réessaie longtemps, en silence, pendant que
     * React Query conserve le contexte précédent — l'utilisateur ne voit rien.
     */
    retry: (failureCount, error) =>
      error instanceof SessionUnavailableError ? failureCount < 5 : failureCount < 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 15_000),
  });

  useEffect(() => {
    if (!q.isError || !q.error) return;
    // Coupure réseau : incident d'environnement, pas un défaut applicatif à remonter.
    if (q.error instanceof SessionUnavailableError) return;
    void reportHandledClientError(q.error, {
      source: "app_context_fetch",
      extra: {
        queryKey: "appContext",
        fetchStatus: q.fetchStatus,
        failureReason: q.failureReason,
      },
    });
  }, [q.isError, q.error, q.fetchStatus, q.failureReason]);

  /**
   * `data === null` = pas de session côté client (expirée, autre onglet, désync cookie / SSR).
   * Cas métier déjà couvert par `AppRouteGuard` (« Session non synchronisée ») — **ne pas**
   * remonter comme erreur super-admin : ce n’est pas un défaut applicatif.
   */

  return q;
}
