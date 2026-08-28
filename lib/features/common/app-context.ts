"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { PERMISSIONS_ALL } from "@/lib/constants/permissions";
import {
  createOptimisticColumn,
  isUndefinedColumnError,
} from "@/lib/features/common/optimistic-column";
import { isDefiniteAuthRejection } from "@/lib/auth/auth-failure";
import type { AppContextData } from "@/lib/features/permissions/access";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { getCurrentSupportSession } from "@/lib/features/support/api";
import { fetchMyHiddenPages } from "@/lib/features/settings/employee-hidden-pages";
import {
  ACTIVE_STORE_STORAGE_KEY,
  ALL_STORES_VALUE,
} from "@/lib/features/stores/active-store";
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

  /*
   * Contention sur le verrou d'authentification du SDK — et NON un refus du serveur.
   *
   * `@supabase/auth-js` sérialise ses accès au jeton derrière un verrou
   * `navigator.locks`. Quand un appel le garde trop longtemps (réseau lent), un autre
   * le lui vole et la victime reçoit un `NavigatorLockAcquireTimeoutError` :
   * « Lock "lock:sb-…-auth-token" was released because another request stole it ».
   *
   * Ce message ne contient aucun des marqueurs réseau ci-dessous. Sans ce test, il
   * était donc classé « erreur définitive » : `resolveCurrentUser` renvoyait `null`,
   * et `null` signifie pour l'app « le serveur a explicitement refusé le jeton » —
   * d'où l'écran « Votre session a expiré » en pleine vente, alors que la session est
   * parfaitement valide. C'est la panne la plus coûteuse du produit : le caissier perd
   * son panier en cours. Cf. `app_error_logs`, 30 occurrences côté web sur deux mois,
   * déclenchées depuis des requêtes React Query concurrentes (`pos-user-id`,
   * `sales-cost`…).
   *
   * `isAcquireTimeout` est le drapeau que le SDK documente pour ce cas ; le nom de
   * classe et le libellé servent de filets si l'erreur a transité par une sérialisation.
   */
  if ((err as { isAcquireTimeout?: boolean } | null)?.isAcquireTimeout === true) return true;
  if (
    name === "NavigatorLockAcquireTimeoutError" ||
    name === "ProcessLockAcquireTimeoutError" ||
    name === "LockAcquireTimeoutError"
  ) {
    return true;
  }

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
    msg.includes("timeout") ||
    msg.includes("another request stole it") ||
    msg.includes("lockmanager")
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
    /*
     * DÉFAUT INVERSÉ (voir `lib/auth/auth-failure.ts`). On ne déclare la session
     * perdue que sur un refus positivement identifié par Supabase. Auparavant c'est
     * l'inverse qui se produisait : toute erreur non reconnue comme réseau renvoyait
     * `null`, donc « Votre session a expiré », donc un panier perdu — pour un simple
     * verrou volé à l'intérieur du SDK.
     */
    if (error) {
      if (isDefiniteAuthRejection(error)) return null;
      throw new SessionUnavailableError();
    }
    return data.user ?? null;
  } catch (e) {
    if (e instanceof SessionUnavailableError) throw e;
    if (isDefiniteAuthRejection(e)) return null;
    throw new SessionUnavailableError();
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

/**
 * La boutique enregistrée n'est retenue que si elle fait toujours partie des
 * boutiques de l'utilisateur : une réaffectation par le propriétaire le ramène
 * ainsi automatiquement sur une boutique valide, sans écran vide.
 */
function pickActiveStoreId(
  stores: { id: string; name: string; isPrimary?: boolean }[],
): string | null {
  if (stores.length === 0) return null;
  if (typeof window === "undefined") return defaultStoreIdFromList(stores);
  try {
    const v = localStorage.getItem(ACTIVE_STORE_STORAGE_KEY);
    if (v === ALL_STORES_VALUE) return null;
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

/**
 * Colonnes `companies` arrivées avec une migration récente.
 *
 * Le code part souvent en production avant que la migration ne soit jouée. Or CETTE
 * lecture-ci n'est pas une lecture parmi d'autres : sans elle, il n'y a pas de contexte,
 * donc pas de menu, pas de droits, pas d'application — un écran mort pour tous les
 * clients, pas seulement pour ceux qui utiliseraient la nouveauté.
 *
 * On demande donc la colonne de façon optimiste, et à la première erreur « colonne
 * inconnue » on rejoue la requête sans elle. Le module concerné se comporte alors comme
 * désactivé — exactement l'état d'avant la migration. Même parade que
 * `activity_attributes` dans `products/api.ts` (migration 00189).
 *
 * Le constat expire au lieu de valoir pour toute la session : une caisse garde son onglet
 * ouvert du matin au soir, et un refus passager de PostgREST le jour du déploiement lui
 * cachait sinon le module jusqu'à ce que quelqu'un pense à recharger la page.
 */
const quickSupplyColumn = createOptimisticColumn();
/** Idem pour la migration 00201 (module « Devis & Factures »). */
const saleDocumentsColumn = createOptimisticColumn();
/** Idem pour la migration 00203 (page « Conditionnements »). */
const packagingsPageColumn = createOptimisticColumn();

const COMPANY_SELECT_BASE =
  "id, name, logo_url, business_type_slug, warehouse_feature_enabled, purchases_feature_enabled, transfers_feature_enabled, store_quota_increase_enabled, ai_predictions_enabled, warehouse_kpi_show_purchase_value, warehouse_kpi_show_sale_value, accounting_module_enabled, hr_module_enabled, expiry_module_enabled, parts_module_enabled, restock_module_enabled, product_locations_enabled, product_aliases_enabled, landed_cost_enabled, custom_expenses_enabled, dual_cashier_enabled, online_store_enabled";

/**
 * Chaque colonne récente est suivie SÉPARÉMENT : les migrations n'arrivent pas
 * ensemble, et une base à jour du module Approvisionnement mais pas encore des Devis
 * ne doit pas perdre le premier en découvrant l'absence du second.
 */
function companySelectColumns(opts: {
  withQuickSupply: boolean;
  withSaleDocuments: boolean;
  withPackagingsPage: boolean;
}): string {
  const extra = [
    opts.withQuickSupply ? "quick_supply_enabled" : null,
    opts.withSaleDocuments ? "sale_documents_enabled" : null,
    opts.withPackagingsPage ? "packagings_page_enabled" : null,
  ].filter(Boolean);
  return extra.length > 0 ? `${COMPANY_SELECT_BASE}, ${extra.join(", ")}` : COMPANY_SELECT_BASE;
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

  /**
   * Mode dépannage : une intervention ouverte impose l'entreprise du client comme
   * entreprise active, même si le super admin n'y a aucun rôle. La base l'autorisait
   * déjà (policies `is_super_admin() OR …`) ; ici on ne fait que l'exposer, borné
   * dans le temps et tracé côté client.
   */
  const supportSession = isSuperAdmin ? await getCurrentSupportSession() : null;

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
  if (orderedCompanyIds.length === 0 && !supportSession) {
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
      transfersFeatureEnabled: false,
      storeQuotaIncreaseEnabled: true,
      aiPredictionsEnabled: false,
      warehouseKpiShowPurchaseValue: true,
      warehouseKpiShowSaleValue: true,
      accountingModuleEnabled: false,
      hrModuleEnabled: false,
      expiryModuleEnabled: false,
      partsModuleEnabled: false,
      restockModuleEnabled: true,
      productLocationsEnabled: false,
      productAliasesEnabled: false,
      landedCostEnabled: false,
      customExpensesEnabled: false,
      dualCashierEnabled: false,
      quickSupplyEnabled: false,
      saleDocumentsEnabled: false,
      packagingsPageEnabled: false,
      onlineStoreEnabled: false,
      promoAdGenerationEnabled,
    };
  }

  // En dépannage, l'entreprise du client prime sur la préférence locale du super admin.
  const primaryCompanyId = supportSession
    ? supportSession.companyId
    : pickActiveCompanyId(orderedCompanyIds);
  const runCompanyQuery = (opts: {
    withQuickSupply: boolean;
    withSaleDocuments: boolean;
    withPackagingsPage: boolean;
  }) =>
    supabase
      .from("companies")
      .select(companySelectColumns(opts))
      .eq("id", primaryCompanyId)
      .maybeSingle();

  // Décisions lues UNE fois : ce sont elles, et non l'état courant des compteurs, qui
  // autorisent les seconds essais — garantissant qu'il n'y en aura jamais plus d'un
  // par colonne.
  let askedQuickSupply = quickSupplyColumn.available();
  let askedSaleDocuments = saleDocumentsColumn.available();
  let askedPackagingsPage = packagingsPageColumn.available();
  let { data: companyRaw, error: cErr } = await runCompanyQuery({
    withQuickSupply: askedQuickSupply,
    withSaleDocuments: askedSaleDocuments,
    withPackagingsPage: askedPackagingsPage,
  });
  // Migration 00193 / 00201 pas encore appliquée : on retire la colonne manquante et on
  // rejoue, plutôt que de laisser l'application entière sans contexte.
  if (cErr && askedQuickSupply && isUndefinedColumnError(cErr, "quick_supply_enabled")) {
    quickSupplyColumn.markMissing();
    askedQuickSupply = false;
    ({ data: companyRaw, error: cErr } = await runCompanyQuery({
      withQuickSupply: false,
      withSaleDocuments: askedSaleDocuments,
      withPackagingsPage: askedPackagingsPage,
    }));
  }
  if (cErr && askedSaleDocuments && isUndefinedColumnError(cErr, "sale_documents_enabled")) {
    saleDocumentsColumn.markMissing();
    askedSaleDocuments = false;
    ({ data: companyRaw, error: cErr } = await runCompanyQuery({
      withQuickSupply: askedQuickSupply,
      withSaleDocuments: false,
      withPackagingsPage: askedPackagingsPage,
    }));
  }
  if (cErr && askedPackagingsPage && isUndefinedColumnError(cErr, "packagings_page_enabled")) {
    packagingsPageColumn.markMissing();
    askedPackagingsPage = false;
    ({ data: companyRaw, error: cErr } = await runCompanyQuery({
      withQuickSupply: askedQuickSupply,
      withSaleDocuments: askedSaleDocuments,
      withPackagingsPage: false,
    }));
  }
  if (cErr) throw mapSupabaseError(cErr);
  // `select()` construit dynamiquement (colonne optionnelle) → PostgREST ne peut plus
  // inférer la forme de la ligne : on repasse par `unknown`, comme `listProducts`.
  const companyRow = (companyRaw ?? null) as unknown as Record<string, unknown> | null;
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
      transfersFeatureEnabled: false,
      storeQuotaIncreaseEnabled: true,
      aiPredictionsEnabled: false,
      warehouseKpiShowPurchaseValue: true,
      warehouseKpiShowSaleValue: true,
      accountingModuleEnabled: false,
      hrModuleEnabled: false,
      expiryModuleEnabled: false,
      partsModuleEnabled: false,
      restockModuleEnabled: true,
      productLocationsEnabled: false,
      productAliasesEnabled: false,
      landedCostEnabled: false,
      customExpensesEnabled: false,
      dualCashierEnabled: false,
      quickSupplyEnabled: false,
      saleDocumentsEnabled: false,
      packagingsPageEnabled: false,
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
    product_aliases_enabled?: boolean | null;
    landed_cost_enabled?: boolean | null;
    custom_expenses_enabled?: boolean | null;
    dual_cashier_enabled?: boolean | null;
    quick_supply_enabled?: boolean | null;
    sale_documents_enabled?: boolean | null;
    packagings_page_enabled?: boolean | null;
    online_store_enabled?: boolean | null;
  };
  const warehouseFeatureEnabled = cr.warehouse_feature_enabled !== false;
  const purchasesFeatureEnabled = cr.purchases_feature_enabled !== false;
  // Additif : Transferts et Prédictions IA restent fermés tant que le super admin
  // ne les a pas ouverts pour l'entreprise (défaut base = false, migration 00176).
  const transfersFeatureEnabled = cr.transfers_feature_enabled === true;
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
  // Autres noms de produits : additif, activé par le propriétaire dans Paramètres.
  const productAliasesEnabled = cr.product_aliases_enabled === true;
  // Prix de revient : additif, activé par le propriétaire dans Paramètres.
  const landedCostEnabled = cr.landed_cost_enabled === true;
  // Dépenses personnalisées : additif, activé par le propriétaire dans Paramètres.
  const customExpensesEnabled = cr.custom_expenses_enabled === true;
  // Caisse à deux : additif, activée par le propriétaire dans Paramètres.
  const dualCashierEnabled = cr.dual_cashier_enabled === true;
  // Approvisionnement express : additif, activé par le propriétaire dans Paramètres.
  const quickSupplyEnabled = cr.quick_supply_enabled === true;
  // Devis & Factures : additif, activé par le propriétaire dans Paramètres.
  const saleDocumentsEnabled = cr.sale_documents_enabled === true;
  // Page Conditionnements : additive, ouverte par le propriétaire dans Paramètres.
  const packagingsPageEnabled = cr.packagings_page_enabled === true;
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
      productAliasesEnabled,
      landedCostEnabled,
      customExpensesEnabled,
      dualCashierEnabled,
      quickSupplyEnabled,
      saleDocumentsEnabled,
      packagingsPageEnabled,
      onlineStoreEnabled,
      promoAdGenerationEnabled,
      supportSession: supportSession
        ? {
            id: supportSession.id,
            companyId: supportSession.companyId,
            companyName: supportSession.companyName || companyName,
            reason: supportSession.reason,
            expiresAt: supportSession.expiresAt,
          }
        : null,
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

  /*
   * Pages que le propriétaire a retirées du menu de CET employé. Lecture tolérante par
   * construction (`fetchMyHiddenPages` ne lève jamais) : si le réglage n'existe pas ou
   * ne se lit pas, rien n'est masqué et le menu reste celui d'avant.
   */
  const hiddenPages = await fetchMyHiddenPages(companyId, user.id);

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
    productAliasesEnabled,
    landedCostEnabled,
    customExpensesEnabled,
    dualCashierEnabled,
    quickSupplyEnabled,
    saleDocumentsEnabled,
    packagingsPageEnabled,
    onlineStoreEnabled,
    promoAdGenerationEnabled,
    hiddenPages,
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
