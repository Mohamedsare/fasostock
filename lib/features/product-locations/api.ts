"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  LocationLevel,
  LocationNode,
  LocationScheme,
  LocationSchemeStatus,
  LocationSearchHit,
  ProductLocation,
} from "./types";

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function toNullableStr(v: unknown): string | null {
  const s = toStr(v).trim();
  return s === "" ? null : s;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `levels` arrive en JSON : on ne garde que des entrées nommées, dans l'ordre. */
function parseLevels(raw: unknown): LocationLevel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({ name: toStr((l as { name?: unknown } | null)?.name).trim() }))
    .filter((l) => l.name !== "");
}

/** Modèle d'organisation de la boutique — `null` tant qu'elle n'en a pas choisi. */
export async function fetchLocationScheme(
  storeId: string,
): Promise<LocationScheme | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("store_location_schemes")
    .select("id, store_id, name, template_slug, levels, status, activated_at")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: toStr(row.id),
    storeId: toStr(row.store_id),
    name: toStr(row.name) || "Plan de rangement",
    templateSlug: toNullableStr(row.template_slug),
    levels: parseLevels(row.levels),
    status: toStr(row.status) === "active" ? "active" : "draft",
    activatedAt: toNullableStr(row.activated_at),
  };
}

export async function saveLocationScheme(params: {
  storeId: string;
  name: string;
  templateSlug: string | null;
  levels: LocationLevel[];
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("store_location_scheme_save", {
    p_store_id: params.storeId,
    p_name: params.name,
    p_template_slug: params.templateSlug,
    p_levels: params.levels.map((l) => ({ name: l.name.trim() })),
  });
  if (error) throw mapSupabaseError(error);
  return toStr(data);
}

/** Met le plan en service, ou le rouvre à l'édition (sans rien supprimer). */
export async function setLocationSchemeStatus(
  storeId: string,
  status: LocationSchemeStatus,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("store_location_scheme_set_status", {
    p_store_id: storeId,
    p_status: status,
  });
  if (error) throw mapSupabaseError(error);
}

export async function fetchLocationTree(storeId: string): Promise<LocationNode[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("store_locations_tree", {
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: toStr(r.id),
    parentId: toNullableStr(r.parent_id),
    depth: toNum(r.depth),
    name: toStr(r.name),
    code: toNullableStr(r.code),
    sortOrder: toNum(r.sort_order),
    pathLabel: toStr(r.path_label),
    directProductCount: toNum(r.direct_product_count),
    totalProductCount: toNum(r.total_product_count),
  }));
}

export async function saveLocation(params: {
  id: string | null;
  storeId: string;
  parentId: string | null;
  name: string;
  code: string | null;
  sortOrder: number;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("store_location_save", {
    p_id: params.id,
    p_store_id: params.storeId,
    p_parent_id: params.parentId,
    p_name: params.name,
    p_code: params.code,
    p_sort_order: params.sortOrder,
  });
  if (error) throw mapSupabaseError(error);
  return toStr(data);
}

/**
 * Supprime un emplacement. Sans `force`, le serveur refuse s'il contient des
 * sous-emplacements ou des produits — l'appelant affiche alors la confirmation.
 * Renvoie le nombre de produits redevenus « sans emplacement ».
 */
export async function deleteLocation(
  id: string,
  force = false,
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("store_location_delete", {
    p_id: id,
    p_force: force,
  });
  if (error) throw mapSupabaseError(error);
  return toNum(data);
}

/** Range un produit (`locationId` null = le retirer de son emplacement). */
export async function setProductLocation(params: {
  storeId: string;
  productId: string;
  locationId: string | null;
  detail: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("product_location_set", {
    p_store_id: params.storeId,
    p_product_id: params.productId,
    p_location_id: params.locationId,
    p_detail: params.detail,
  });
  if (error) throw mapSupabaseError(error);
}

/** Range plusieurs produits d'un coup. Renvoie le nombre de produits traités. */
export async function bulkSetProductLocations(params: {
  storeId: string;
  productIds: string[];
  locationId: string | null;
}): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("product_locations_bulk_set", {
    p_store_id: params.storeId,
    p_product_ids: params.productIds,
    p_location_id: params.locationId,
  });
  if (error) throw mapSupabaseError(error);
  return toNum(data);
}

export async function fetchProductLocations(
  storeId: string,
): Promise<ProductLocation[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("product_locations_for_store", {
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    productId: toStr(r.product_id),
    locationId: toStr(r.location_id),
    pathLabel: toStr(r.path_label),
    code: toNullableStr(r.code),
    detail: toNullableStr(r.detail),
  }));
}

/** « C'est où ? » — nom, SKU, code-barres ou emplacement. */
export async function findProductLocations(params: {
  storeId: string;
  query: string;
}): Promise<LocationSearchHit[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("product_locations_find", {
    p_store_id: params.storeId,
    p_query: params.query,
    p_limit: 40,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    productId: toStr(r.product_id),
    productName: toStr(r.product_name),
    sku: toNullableStr(r.sku),
    barcode: toNullableStr(r.barcode),
    locationId: toNullableStr(r.location_id),
    pathLabel: toNullableStr(r.path_label),
    code: toNullableStr(r.code),
    detail: toNullableStr(r.detail),
    quantity: toNum(r.quantity),
    imageUrl: toNullableStr(r.image_url),
  }));
}

/** Réglage entreprise « module Emplacements » — écrit par le propriétaire. */
export async function setProductLocationsEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_product_locations_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw mapSupabaseError(error);
}
