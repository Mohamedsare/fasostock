import type { SupabaseClient } from "@supabase/supabase-js";

import { PERMISSIONS_ALL } from "@/lib/constants/permissions";
import type { AppContextData } from "@/lib/features/permissions/access";
import {
  buildAccessHelpers,
  canAccessPathname,
} from "@/lib/features/permissions/access";

/**
 * Colonne `companies.quick_supply_enabled` (migration 00193) demandée de façon
 * optimiste. Tant que la migration n'est pas jouée, la réclamer ferait échouer la
 * lecture — et cette garde-là répondrait « Accès réservé » sur TOUTES les pages, pour
 * tous les clients. On rejoue donc sans la colonne à la première erreur, et le module
 * se comporte comme désactivé. Même parade que côté client (`app-context.ts`).
 */
let quickSupplyColumnAvailable = true;

/** 42703 = undefined_column (Postgres) ; PGRST204 = colonne absente du cache PostgREST. */
function isUndefinedColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  return typeof e.message === "string" && e.message.includes("quick_supply_enabled");
}

const COMPANY_SELECT_BASE =
  "id, name, logo_url, business_type_slug, warehouse_feature_enabled, purchases_feature_enabled, transfers_feature_enabled, store_quota_increase_enabled, ai_predictions_enabled, warehouse_kpi_show_purchase_value, warehouse_kpi_show_sale_value, accounting_module_enabled, hr_module_enabled, expiry_module_enabled, parts_module_enabled, restock_module_enabled, product_locations_enabled, product_aliases_enabled, landed_cost_enabled, custom_expenses_enabled, dual_cashier_enabled, online_store_enabled";

/** Contexte applicatif pour une entreprise (serveur, sans localStorage). */
export async function fetchAppContextForCompany(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  isSuperAdmin: boolean,
): Promise<AppContextData | null> {
  const cid = companyId.trim();
  if (!cid) return null;

  const runCompanyQuery = () =>
    supabase
      .from("companies")
      .select(
        quickSupplyColumnAvailable
          ? `${COMPANY_SELECT_BASE}, quick_supply_enabled`
          : COMPANY_SELECT_BASE,
      )
      .eq("id", cid)
      .maybeSingle();

  let { data: companyRaw, error: cErr } = await runCompanyQuery();
  if (cErr && quickSupplyColumnAvailable && isUndefinedColumnError(cErr)) {
    quickSupplyColumnAvailable = false;
    ({ data: companyRaw, error: cErr } = await runCompanyQuery());
  }
  // `select()` dynamique : PostgREST ne peut plus inférer la forme de la ligne.
  const companyRow = (companyRaw ?? null) as unknown as Record<string, unknown> | null;
  if (cErr || !companyRow?.id) return null;

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
    product_aliases_enabled?: boolean | null;
    landed_cost_enabled?: boolean | null;
    custom_expenses_enabled?: boolean | null;
    dual_cashier_enabled?: boolean | null;
    quick_supply_enabled?: boolean | null;
    online_store_enabled?: boolean | null;
  };

  const { data: stores, error: sErr } = await supabase
    .from("stores")
    .select("id, name, is_primary, expiry_module_enabled, parts_module_enabled, restock_module_enabled, online_store_enabled")
    .eq("company_id", cid)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (sErr) return null;

  const mapped = (stores ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    isPrimary: (s as { is_primary?: boolean }).is_primary === true,
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

  const primary = mapped.find((s) => s.isPrimary) ?? mapped[0] ?? null;

  if (isSuperAdmin) {
    return {
      companyId: cid,
      companyName,
      businessTypeSlug,
      companyLogoUrl,
      storeId: primary?.id ?? null,
      stores: mapped,
      isSuperAdmin: true,
      permissionKeys: [...PERMISSIONS_ALL],
      roleSlug: "super_admin",
      warehouseFeatureEnabled: cr.warehouse_feature_enabled !== false,
      purchasesFeatureEnabled: cr.purchases_feature_enabled !== false,
      transfersFeatureEnabled: cr.transfers_feature_enabled === true,
      storeQuotaIncreaseEnabled: cr.store_quota_increase_enabled !== false,
      aiPredictionsEnabled: cr.ai_predictions_enabled === true,
      warehouseKpiShowPurchaseValue: cr.warehouse_kpi_show_purchase_value !== false,
      warehouseKpiShowSaleValue: cr.warehouse_kpi_show_sale_value !== false,
      accountingModuleEnabled: cr.accounting_module_enabled === true,
      hrModuleEnabled: cr.hr_module_enabled === true,
      expiryModuleEnabled: cr.expiry_module_enabled === true,
      partsModuleEnabled: cr.parts_module_enabled === true,
      restockModuleEnabled: cr.restock_module_enabled !== false,
      productLocationsEnabled: cr.product_locations_enabled === true,
      productAliasesEnabled: cr.product_aliases_enabled === true,
      landedCostEnabled: cr.landed_cost_enabled === true,
      customExpensesEnabled: cr.custom_expenses_enabled === true,
      dualCashierEnabled: cr.dual_cashier_enabled === true,
      quickSupplyEnabled: cr.quick_supply_enabled === true,
      onlineStoreEnabled: cr.online_store_enabled === true,
      // Flag évalué côté client (bouton uniquement) ; non requis pour les gardes de route serveur.
      promoAdGenerationEnabled: false,
    };
  }

  let permissionKeys: string[] = [];
  let roleSlug: string | null = null;
  try {
    const { data: keys, error: kErr } = await supabase.rpc("get_my_permission_keys", {
      p_company_id: cid,
    });
    if (kErr) throw kErr;
    permissionKeys = Array.isArray(keys) ? keys.map((k) => String(k)) : [];
    const { data: slug, error: sErr2 } = await supabase.rpc("get_my_role_slug", {
      p_company_id: cid,
    });
    if (sErr2) throw sErr2;
    roleSlug = slug != null ? String(slug) : null;
  } catch {
    permissionKeys = [];
    roleSlug = null;
  }

  return {
    companyId: cid,
    companyName,
    businessTypeSlug,
    companyLogoUrl,
    storeId: primary?.id ?? null,
    stores: mapped,
    isSuperAdmin: false,
    permissionKeys,
    roleSlug,
    warehouseFeatureEnabled: cr.warehouse_feature_enabled !== false,
    purchasesFeatureEnabled: cr.purchases_feature_enabled !== false,
    transfersFeatureEnabled: cr.transfers_feature_enabled === true,
    storeQuotaIncreaseEnabled: cr.store_quota_increase_enabled !== false,
    aiPredictionsEnabled: cr.ai_predictions_enabled === true,
    warehouseKpiShowPurchaseValue: cr.warehouse_kpi_show_purchase_value !== false,
    warehouseKpiShowSaleValue: cr.warehouse_kpi_show_sale_value !== false,
    accountingModuleEnabled: cr.accounting_module_enabled === true,
    hrModuleEnabled: cr.hr_module_enabled === true,
    expiryModuleEnabled: cr.expiry_module_enabled === true,
    partsModuleEnabled: cr.parts_module_enabled === true,
    restockModuleEnabled: cr.restock_module_enabled !== false,
    productLocationsEnabled: cr.product_locations_enabled === true,
    productAliasesEnabled: cr.product_aliases_enabled === true,
    landedCostEnabled: cr.landed_cost_enabled === true,
    customExpensesEnabled: cr.custom_expenses_enabled === true,
    dualCashierEnabled: cr.dual_cashier_enabled === true,
    quickSupplyEnabled: cr.quick_supply_enabled === true,
    onlineStoreEnabled: cr.online_store_enabled === true,
    // Flag évalué côté client (bouton uniquement) ; non requis pour les gardes de route serveur.
    promoAdGenerationEnabled: false,
  };
}

/**
 * Vrai si l’utilisateur peut accéder au chemin pour au moins une entreprise active
 * (évite un refus erroné quand l’entreprise active côté client diffère de la première en base).
 */
export async function userCanAccessPathnameOnServer(
  supabase: SupabaseClient,
  userId: string,
  pathname: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.is_super_admin === true) return true;

  const { data: roles, error: rErr } = await supabase
    .from("user_company_roles")
    .select("company_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (rErr) return true;

  const companyIds: string[] = [];
  const seen = new Set<string>();
  for (const r of roles ?? []) {
    const cid = (r as { company_id?: string }).company_id;
    if (cid && !seen.has(cid)) {
      seen.add(cid);
      companyIds.push(cid);
    }
  }
  if (companyIds.length === 0) return true;

  for (const companyId of companyIds) {
    try {
      const ctx = await fetchAppContextForCompany(supabase, userId, companyId, false);
      const h = buildAccessHelpers(ctx);
      if (h && canAccessPathname(pathname, h, ctx?.businessTypeSlug)) return true;
    } catch {
      /* entreprise suivante */
    }
  }
  return false;
}
