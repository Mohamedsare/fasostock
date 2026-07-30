"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  CompatiblePart,
  EquivalenceKind,
  EquivalenceOverviewRow,
  PartModel,
  PartModelInput,
  ProductEquivalent,
  VariantGroup,
  VariantGroupInput,
  VariantMember,
} from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function toNullableStr(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

const EQUIVALENCE_KINDS: readonly EquivalenceKind[] = [
  "origine",
  "generique",
  "adaptable",
  "equivalent",
];

function toEquivalenceKind(v: unknown): EquivalenceKind {
  const s = toStr(v);
  return (EQUIVALENCE_KINDS as readonly string[]).includes(s)
    ? (s as EquivalenceKind)
    : "equivalent";
}

// ─────────────────────────────────────────────────────────────────────────────
// Modèles
// ─────────────────────────────────────────────────────────────────────────────

export async function listPartModels(companyId: string): Promise<PartModel[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("part_models_list", {
    p_company_id: companyId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: toStr(r.id),
    name: toStr(r.name),
    maker: toNullableStr(r.maker),
    years: toNullableStr(r.years),
    note: toNullableStr(r.note),
    productCount: toNum(r.product_count),
    createdAt: r.created_at != null ? String(r.created_at) : null,
  }));
}

export async function savePartModel(
  companyId: string,
  input: PartModelInput,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("part_model_save", {
    p_id: input.id ?? null,
    p_company_id: companyId,
    p_name: input.name,
    p_maker: input.maker,
    p_years: input.years,
    p_note: input.note,
  });
  if (error) throw mapSupabaseError(error);
  return toStr(data);
}

export async function deletePartModel(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("part_model_delete", { p_id: id });
  if (error) throw mapSupabaseError(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibilités
// ─────────────────────────────────────────────────────────────────────────────

/**
 * « Quelles pièces vont sur ce modèle ? »
 * `modelId` prioritaire ; sinon `query` cherche dans le nom / la marque du modèle.
 * Sans l'un ni l'autre, aucun appel réseau — la RPC ne renverrait rien de toute façon.
 */
export async function searchCompatibleParts(params: {
  companyId: string;
  storeId: string | null;
  modelId: string | null;
  query: string;
}): Promise<CompatiblePart[]> {
  const q = params.query.trim();
  if (!params.modelId && q === "") return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("parts_search_compatible", {
    p_company_id: params.companyId,
    p_model_id: params.modelId,
    p_query: q || null,
    p_store_id: params.storeId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    productId: toStr(r.product_id),
    productName: toStr(r.product_name),
    sku: toNullableStr(r.sku),
    barcode: toNullableStr(r.barcode),
    unit: toStr(r.unit) || "pce",
    salePrice: toNum(r.sale_price),
    stock: toNum(r.stock),
    modelId: toStr(r.model_id),
    modelName: toStr(r.model_name),
    modelMaker: toNullableStr(r.model_maker),
    isActive: r.is_active !== false,
  }));
}

/** Modèles déjà déclarés compatibles avec un produit (préremplissage du dialogue). */
export async function listProductPartModels(
  productId: string,
): Promise<{ modelId: string; modelName: string; modelMaker: string | null }[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("product_part_models_list", {
    p_product_id: productId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    modelId: toStr(r.model_id),
    modelName: toStr(r.model_name),
    modelMaker: toNullableStr(r.model_maker),
  }));
}

/** Remplace la liste complète des modèles compatibles d'un produit. */
export async function setProductPartModels(
  productId: string,
  modelIds: string[],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("product_part_models_set", {
    p_product_id: productId,
    p_model_ids: modelIds,
  });
  if (error) throw mapSupabaseError(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Équivalences
// ─────────────────────────────────────────────────────────────────────────────

export async function listEquivalencesOverview(
  companyId: string,
  storeId: string | null,
): Promise<EquivalenceOverviewRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("product_equivalences_overview", {
    p_company_id: companyId,
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    productId: toStr(r.product_id),
    productName: toStr(r.product_name),
    sku: toNullableStr(r.sku),
    stock: toNum(r.stock),
    equivalentCount: toNum(r.equivalent_count),
    inStockAlternatives: toNum(r.in_stock_alternatives),
  }));
}

export async function listProductEquivalents(
  productId: string,
  storeId: string | null,
): Promise<ProductEquivalent[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("product_equivalences_for", {
    p_product_id: productId,
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    equivalentId: toStr(r.equivalent_id),
    productName: toStr(r.product_name),
    sku: toNullableStr(r.sku),
    barcode: toNullableStr(r.barcode),
    unit: toStr(r.unit) || "pce",
    salePrice: toNum(r.sale_price),
    stock: toNum(r.stock),
    kind: toEquivalenceKind(r.kind),
    note: toNullableStr(r.note),
    isActive: r.is_active !== false,
  }));
}

/**
 * Remplace la liste d'équivalences d'un produit. La RPC écrit le lien dans les DEUX
 * sens : la fiche d'en face montre aussi le remplaçant, sans double saisie.
 */
export async function setProductEquivalents(
  productId: string,
  items: { id: string; kind: EquivalenceKind; note: string }[],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("product_equivalences_set", {
    p_product_id: productId,
    p_items: items.map((i) => ({ id: i.id, kind: i.kind, note: i.note })),
  });
  if (error) throw mapSupabaseError(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Variantes
// ─────────────────────────────────────────────────────────────────────────────

function parseAttributes(raw: unknown): Record<string, string> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const value = v == null ? "" : String(v).trim();
    if (value !== "") out[k] = value;
  }
  return out;
}

export async function listVariantGroups(
  companyId: string,
  storeId: string | null,
): Promise<VariantGroup[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("variant_groups_list", {
    p_company_id: companyId,
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const rawMembers = Array.isArray(r.members) ? (r.members as unknown[]) : [];
    const members: VariantMember[] = rawMembers.map((m) => {
      const row = (m ?? {}) as Record<string, unknown>;
      return {
        productId: toStr(row.product_id),
        name: toStr(row.name),
        sku: toNullableStr(row.sku),
        barcode: toNullableStr(row.barcode),
        salePrice: toNum(row.sale_price),
        stock: toNum(row.stock),
        isActive: row.is_active !== false,
        attributes: parseAttributes(row.attributes),
      };
    });
    members.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return {
      id: toStr(r.id),
      name: toStr(r.name),
      attributeNames: Array.isArray(r.attribute_names)
        ? (r.attribute_names as unknown[]).map((x) => String(x))
        : [],
      note: toNullableStr(r.note),
      totalStock: toNum(r.total_stock),
      members,
    };
  });
}

export async function saveVariantGroup(
  companyId: string,
  input: VariantGroupInput,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("variant_group_save", {
    p_id: input.id ?? null,
    p_company_id: companyId,
    p_name: input.name,
    p_attribute_names: input.attributeNames,
    p_note: input.note,
  });
  if (error) throw mapSupabaseError(error);
  return toStr(data);
}

export async function deleteVariantGroup(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("variant_group_delete", { p_id: id });
  if (error) throw mapSupabaseError(error);
}

/** Fixe la composition de la famille. Les produits retirés sont détachés, jamais supprimés. */
export async function setVariantGroupMembers(
  groupId: string,
  items: { productId: string; attributes: Record<string, string> }[],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("variant_group_set_members", {
    p_group_id: groupId,
    p_items: items.map((i) => ({
      product_id: i.productId,
      attributes: i.attributes,
    })),
  });
  if (error) throw mapSupabaseError(error);
}
