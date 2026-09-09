"use client";

/**
 * Module Restaurant — la carte : stations, articles, options, fiches techniques.
 *
 * Rien ici n'écrit dans `products`. La table du catalogue est commune à tous les
 * métiers et protégée en écriture depuis 00217 ; un serveur qui retire le poisson de
 * la carte ne doit pas pouvoir toucher un prix au passage.
 */

import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { fetchByChunks } from "@/lib/supabase/fetch-by-chunks";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  MenuCourse,
  MenuItem,
  Modifier,
  ModifierGroup,
  Recipe,
  RecipeItem,
  RestaurantStation,
} from "./types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

/* ─────────────────────────── Stations ─────────────────────────── */

export async function listStations(params: {
  companyId: string;
  storeId?: string | null;
}): Promise<RestaurantStation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("restaurant_stations")
    .select("id, store_id, name, color, position, kds_enabled, is_active")
    .eq("company_id", params.companyId)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw mapSupabaseError(error);

  return (data ?? [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        storeId: row.store_id ? String(row.store_id) : null,
        name: String(row.name ?? ""),
        color: (row.color as string | null) ?? null,
        position: num(row.position),
        kdsEnabled: row.kds_enabled !== false,
        isActive: row.is_active !== false,
      };
    })
    /* Une station sans boutique vaut pour toutes — c'est le cas le plus courant. */
    .filter((s) => !params.storeId || s.storeId === null || s.storeId === params.storeId);
}

export async function createStation(params: {
  companyId: string;
  storeId?: string | null;
  name: string;
  color?: string | null;
  kdsEnabled?: boolean;
  position?: number;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_stations").insert({
    company_id: params.companyId,
    store_id: params.storeId ?? null,
    name: params.name.trim(),
    color: params.color ?? null,
    kds_enabled: params.kdsEnabled ?? true,
    position: params.position ?? 0,
  });
  if (error) throw mapSupabaseError(error);
}

export async function updateStation(params: {
  id: string;
  name?: string;
  color?: string | null;
  kdsEnabled?: boolean;
  position?: number;
  isActive?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.color !== undefined) patch.color = params.color;
  if (params.kdsEnabled !== undefined) patch.kds_enabled = params.kdsEnabled;
  if (params.position !== undefined) patch.position = params.position;
  if (params.isActive !== undefined) patch.is_active = params.isActive;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from("restaurant_stations")
    .update(patch)
    .eq("id", params.id);
  if (error) throw mapSupabaseError(error);
}

export async function deleteStation(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_stations").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/* ─────────────────────────── La carte ─────────────────────────── */

/**
 * La carte complète : les produits du catalogue, enrichis de ce que la fiche
 * restaurant ajoute. Les articles sans fiche restent présents avec les valeurs par
 * défaut — un plat n'a pas besoin d'être « configuré » pour être vendu.
 *
 * `fetchAllPages` est obligatoire : une carte peut dépasser 1000 lignes chez un
 * traiteur, et PostgREST tronque en silence au-delà.
 */
export async function listMenu(params: {
  companyId: string;
  storeId: string | null;
}): Promise<MenuItem[]> {
  const supabase = createClient();

  const { data: productRows, error } = await fetchAllPages((from, to) =>
    supabase
      .from("products")
      .select("id, name, category_id, sale_price, purchase_price, is_active, categories(name)")
      .eq("company_id", params.companyId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw mapSupabaseError(error);

  const products = (productRows ?? []) as Array<Record<string, unknown>>;
  if (products.length === 0) return [];

  const ids = products.map((p) => String(p.id));

  const [menuRows, stations, inventory, groupCounts] = await Promise.all([
    fetchByChunks<Record<string, unknown>>(ids, async (chunk, from, to) => {
      const { data, error: e } = await supabase
        .from("restaurant_menu_items")
        .select(
          "product_id, station_id, course, prep_minutes, is_available, unavailable_reason, unavailable_since, position, is_featured",
        )
        .in("product_id", chunk)
        .order("product_id", { ascending: true })
        .range(from, to);
      if (e) throw mapSupabaseError(e);
      return (data ?? []) as Array<Record<string, unknown>>;
    }),
    listStations({ companyId: params.companyId, storeId: params.storeId }),
    params.storeId
      ? fetchByChunks<Record<string, unknown>>(ids, async (chunk, from, to) => {
          const { data, error: e } = await supabase
            .from("store_inventory")
            .select("product_id, quantity")
            .eq("store_id", params.storeId as string)
            .in("product_id", chunk)
            .order("product_id", { ascending: true })
            .range(from, to);
          if (e) throw mapSupabaseError(e);
          return (data ?? []) as Array<Record<string, unknown>>;
        })
      : Promise.resolve([] as Array<Record<string, unknown>>),
    fetchByChunks<Record<string, unknown>>(ids, async (chunk, from, to) => {
      const { data, error: e } = await supabase
        .from("restaurant_menu_item_groups")
        .select("product_id, id")
        .in("product_id", chunk)
        .order("id", { ascending: true })
        .range(from, to);
      if (e) throw mapSupabaseError(e);
      return (data ?? []) as Array<Record<string, unknown>>;
    }),
  ]);

  const menuByProduct = new Map<string, Record<string, unknown>>();
  for (const m of menuRows) menuByProduct.set(String(m.product_id), m);

  const stationById = new Map(stations.map((s) => [s.id, s]));

  const stockByProduct = new Map<string, number>();
  for (const i of inventory) stockByProduct.set(String(i.product_id), num(i.quantity));

  const groupCountByProduct = new Map<string, number>();
  for (const g of groupCounts) {
    const pid = String(g.product_id);
    groupCountByProduct.set(pid, (groupCountByProduct.get(pid) ?? 0) + 1);
  }

  return products.map((p) => {
    const id = String(p.id);
    const menu = menuByProduct.get(id);
    const stationId = menu?.station_id ? String(menu.station_id) : null;
    const station = stationId ? stationById.get(stationId) : undefined;
    const category = p.categories as { name?: string } | null;

    return {
      productId: id,
      name: String(p.name ?? ""),
      categoryId: p.category_id ? String(p.category_id) : null,
      categoryName: category?.name ?? null,
      salePrice: num(p.sale_price),
      purchasePrice: num(p.purchase_price),
      stock: params.storeId ? (stockByProduct.get(id) ?? 0) : null,

      stationId,
      stationName: station?.name ?? null,
      stationKdsEnabled: station?.kdsEnabled ?? false,
      course: (String(menu?.course ?? "main") as MenuCourse) ?? "main",
      prepMinutes: menu?.prep_minutes != null ? num(menu.prep_minutes) : null,
      isAvailable: menu ? menu.is_available !== false : true,
      unavailableReason: (menu?.unavailable_reason as string | null) ?? null,
      unavailableSince: (menu?.unavailable_since as string | null) ?? null,
      position: num(menu?.position),
      isFeatured: menu?.is_featured === true,
      hasMenuRow: Boolean(menu),
      optionGroupCount: groupCountByProduct.get(id) ?? 0,
    };
  });
}

/** Le geste du service : retirer / remettre un plat, en un doigt. */
export async function setAvailability(params: {
  productId: string;
  available: boolean;
  reason?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_set_availability", {
    p_product_id: params.productId,
    p_available: params.available,
    p_reason: params.reason ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

/** Réglages de carte d'un article (station, service, temps, mise en avant). */
export async function upsertMenuSettings(params: {
  companyId: string;
  productId: string;
  stationId?: string | null;
  course?: MenuCourse;
  prepMinutes?: number | null;
  isFeatured?: boolean;
  position?: number;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {
    product_id: params.productId,
    company_id: params.companyId,
    updated_at: new Date().toISOString(),
  };
  if (params.stationId !== undefined) patch.station_id = params.stationId;
  if (params.course !== undefined) patch.course = params.course;
  if (params.prepMinutes !== undefined) patch.prep_minutes = params.prepMinutes;
  if (params.isFeatured !== undefined) patch.is_featured = params.isFeatured;
  if (params.position !== undefined) patch.position = params.position;

  const { error } = await supabase
    .from("restaurant_menu_items")
    .upsert(patch, { onConflict: "product_id" });
  if (error) throw mapSupabaseError(error);
}

/* ─────────────────────────── Options ─────────────────────────── */

export async function listModifierGroups(companyId: string): Promise<ModifierGroup[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("restaurant_modifier_groups")
    .select("id, name, prompt, min_select, max_select, position, is_active")
    .eq("company_id", companyId)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw mapSupabaseError(error);

  const groups = (data ?? []) as Array<Record<string, unknown>>;
  if (groups.length === 0) return [];

  const { data: modRows, error: mErr } = await supabase
    .from("restaurant_modifiers")
    .select("id, group_id, name, price_delta, linked_product_id, position, is_available")
    .eq("company_id", companyId)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (mErr) throw mapSupabaseError(mErr);

  const byGroup = new Map<string, Modifier[]>();
  for (const r of (modRows ?? []) as Array<Record<string, unknown>>) {
    const gid = String(r.group_id);
    const list = byGroup.get(gid) ?? [];
    list.push({
      id: String(r.id),
      groupId: gid,
      name: String(r.name ?? ""),
      priceDelta: num(r.price_delta),
      linkedProductId: r.linked_product_id ? String(r.linked_product_id) : null,
      position: num(r.position),
      isAvailable: r.is_available !== false,
    });
    byGroup.set(gid, list);
  }

  return groups.map((g) => ({
    id: String(g.id),
    name: String(g.name ?? ""),
    prompt: (g.prompt as string | null) ?? null,
    minSelect: num(g.min_select),
    maxSelect: num(g.max_select, 1),
    position: num(g.position),
    isActive: g.is_active !== false,
    modifiers: byGroup.get(String(g.id)) ?? [],
  }));
}

export async function createModifierGroup(params: {
  companyId: string;
  name: string;
  prompt?: string | null;
  minSelect: number;
  maxSelect: number;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("restaurant_modifier_groups")
    .insert({
      company_id: params.companyId,
      name: params.name.trim(),
      prompt: params.prompt?.trim() || null,
      min_select: Math.max(0, params.minSelect),
      max_select: Math.max(1, params.maxSelect),
    })
    .select("id")
    .single();
  if (error) throw mapSupabaseError(error);
  return String((data as { id: string }).id);
}

export async function updateModifierGroup(params: {
  id: string;
  name?: string;
  prompt?: string | null;
  minSelect?: number;
  maxSelect?: number;
  isActive?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.prompt !== undefined) patch.prompt = params.prompt?.trim() || null;
  if (params.minSelect !== undefined) patch.min_select = Math.max(0, params.minSelect);
  if (params.maxSelect !== undefined) patch.max_select = Math.max(1, params.maxSelect);
  if (params.isActive !== undefined) patch.is_active = params.isActive;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from("restaurant_modifier_groups")
    .update(patch)
    .eq("id", params.id);
  if (error) throw mapSupabaseError(error);
}

export async function deleteModifierGroup(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("restaurant_modifier_groups")
    .delete()
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

export async function createModifier(params: {
  companyId: string;
  groupId: string;
  name: string;
  priceDelta: number;
  linkedProductId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_modifiers").insert({
    company_id: params.companyId,
    group_id: params.groupId,
    name: params.name.trim(),
    price_delta: Math.max(0, params.priceDelta),
    linked_product_id: params.linkedProductId ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function updateModifier(params: {
  id: string;
  name?: string;
  priceDelta?: number;
  isAvailable?: boolean;
  linkedProductId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.priceDelta !== undefined) patch.price_delta = Math.max(0, params.priceDelta);
  if (params.isAvailable !== undefined) patch.is_available = params.isAvailable;
  if (params.linkedProductId !== undefined) patch.linked_product_id = params.linkedProductId;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from("restaurant_modifiers")
    .update(patch)
    .eq("id", params.id);
  if (error) throw mapSupabaseError(error);
}

export async function deleteModifier(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_modifiers").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Les groupes d'options attachés à un article — lus par la caisse à chaque ajout. */
export async function listGroupsForProduct(productId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("restaurant_menu_item_groups")
    .select("group_id")
    .eq("product_id", productId)
    .order("position", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Array<{ group_id: string }>).map((r) => String(r.group_id));
}

/**
 * Remplace d'un bloc les groupes attachés à un article. Un `delete` + `insert` plutôt
 * qu'un diff : la liste fait trois lignes, et un diff aurait été trois fois plus de
 * code pour économiser une requête sur un écran de configuration.
 */
export async function setGroupsForProduct(params: {
  companyId: string;
  productId: string;
  groupIds: string[];
}): Promise<void> {
  const supabase = createClient();
  const { error: dErr } = await supabase
    .from("restaurant_menu_item_groups")
    .delete()
    .eq("product_id", params.productId);
  if (dErr) throw mapSupabaseError(dErr);

  if (params.groupIds.length === 0) return;
  const { error } = await supabase.from("restaurant_menu_item_groups").insert(
    params.groupIds.map((gid, i) => ({
      company_id: params.companyId,
      product_id: params.productId,
      group_id: gid,
      position: i,
    })),
  );
  if (error) throw mapSupabaseError(error);
}

/* ─────────────────────────── Fiches techniques ─────────────────────────── */

/** Les produits qui ont une fiche technique, avec de quoi calculer leur coût. */
export async function listRecipes(companyId: string): Promise<Recipe[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("restaurant_recipes")
    .select("product_id, yield_portions, waste_percent, instructions, products(name, sale_price)")
    .eq("company_id", companyId);
  if (error) throw mapSupabaseError(error);

  const recipes = (data ?? []) as Array<Record<string, unknown>>;
  if (recipes.length === 0) return [];

  const productIds = recipes.map((r) => String(r.product_id));
  const items = await fetchByChunks<Record<string, unknown>>(
    productIds,
    async (chunk, from, to) => {
      const { data: d, error: e } = await supabase
        .from("restaurant_recipe_items")
        .select(
          "id, recipe_product_id, ingredient_id, quantity, unit, units_per_purchase, note, position, products!restaurant_recipe_items_ingredient_id_fkey(name, purchase_price)",
        )
        .in("recipe_product_id", chunk)
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (e) throw mapSupabaseError(e);
      return (d ?? []) as Array<Record<string, unknown>>;
    },
  );

  const byRecipe = new Map<string, RecipeItem[]>();
  for (const r of items) {
    const key = String(r.recipe_product_id);
    const ing = r.products as { name?: string; purchase_price?: unknown } | null;
    const list = byRecipe.get(key) ?? [];
    list.push({
      id: String(r.id),
      ingredientId: String(r.ingredient_id),
      ingredientName: ing?.name ?? "Ingrédient",
      quantity: num(r.quantity),
      unit: String(r.unit ?? "pce"),
      unitsPerPurchase: num(r.units_per_purchase, 1),
      purchasePrice: num(ing?.purchase_price),
      note: (r.note as string | null) ?? null,
      position: num(r.position),
    });
    byRecipe.set(key, list);
  }

  return recipes.map((r) => {
    const product = r.products as { name?: string; sale_price?: unknown } | null;
    return {
      productId: String(r.product_id),
      productName: product?.name ?? "Plat",
      salePrice: num(product?.sale_price),
      yieldPortions: num(r.yield_portions, 1),
      wastePercent: num(r.waste_percent),
      instructions: (r.instructions as string | null) ?? null,
      items: byRecipe.get(String(r.product_id)) ?? [],
    };
  });
}

export async function upsertRecipe(params: {
  companyId: string;
  productId: string;
  yieldPortions: number;
  wastePercent: number;
  instructions?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_recipes").upsert(
    {
      product_id: params.productId,
      company_id: params.companyId,
      yield_portions: Math.max(0.001, params.yieldPortions),
      waste_percent: Math.min(100, Math.max(0, params.wastePercent)),
      instructions: params.instructions?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id" },
  );
  if (error) throw mapSupabaseError(error);
}

export async function deleteRecipe(productId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("restaurant_recipes")
    .delete()
    .eq("product_id", productId);
  if (error) throw mapSupabaseError(error);
}

export async function addRecipeItem(params: {
  companyId: string;
  recipeProductId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  unitsPerPurchase: number;
  note?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_recipe_items").insert({
    company_id: params.companyId,
    recipe_product_id: params.recipeProductId,
    ingredient_id: params.ingredientId,
    quantity: Math.max(0.0001, params.quantity),
    unit: params.unit.trim() || "pce",
    units_per_purchase: Math.max(0.0001, params.unitsPerPurchase),
    note: params.note?.trim() || null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function updateRecipeItem(params: {
  id: string;
  quantity?: number;
  unit?: string;
  unitsPerPurchase?: number;
  note?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (params.quantity !== undefined) patch.quantity = Math.max(0.0001, params.quantity);
  if (params.unit !== undefined) patch.unit = params.unit.trim() || "pce";
  if (params.unitsPerPurchase !== undefined) {
    patch.units_per_purchase = Math.max(0.0001, params.unitsPerPurchase);
  }
  if (params.note !== undefined) patch.note = params.note?.trim() || null;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from("restaurant_recipe_items")
    .update(patch)
    .eq("id", params.id);
  if (error) throw mapSupabaseError(error);
}

export async function deleteRecipeItem(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_recipe_items").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}
