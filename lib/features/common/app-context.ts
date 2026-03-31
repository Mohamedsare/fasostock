"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { PERMISSIONS_ALL } from "@/lib/constants/permissions";
import type { AppContextData } from "@/lib/features/permissions/access";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import { queryKeys } from "@/lib/query/query-keys";

export type { AppContextData };

const FETCH_TIMEOUT_MS = 25_000;

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

  /**
   * D’abord `getSession()` (rapide, lecture locale). Si vide juste après hydratation,
   * on tente `getUser()` avec un court délai max (évite blocage infini connu sur certains navigateurs).
   */
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let user = session?.user ?? null;
  if (!user) {
    try {
      const { data } = await withTimeout(
        supabase.auth.getUser(),
        10_000,
        "Authentification",
      );
      user = data.user ?? null;
    } catch {
      user = null;
    }
  }
  if (!user) return null;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) throw mapSupabaseError(pErr);
  const isSuperAdmin = profile?.is_super_admin === true;

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
    };
  }

  const primaryCompanyId = pickActiveCompanyId(orderedCompanyIds);
  const { data: companyRow, error: cErr } = await supabase
    .from("companies")
    .select("id, name, logo_url, business_type_slug")
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

  if (isSuperAdmin) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name, is_primary")
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true });
    const mapped = (stores ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      isPrimary: (s as { is_primary?: boolean }).is_primary === true,
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
    };
  }

  const { data: stores, error: sErr } = await supabase
    .from("stores")
    .select("id, name, is_primary")
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (sErr) throw mapSupabaseError(sErr);

  const mapped = (stores ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    isPrimary: (s as { is_primary?: boolean }).is_primary === true,
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
    retry: 2,
  });

  useEffect(() => {
    if (!q.isError || !q.error) return;
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
