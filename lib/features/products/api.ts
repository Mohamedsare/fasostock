"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { createClient } from "@/lib/supabase/client";
import type {
  ProductBrand,
  ProductCategory,
  ProductFormInput,
  ProductImageRow,
  ProductItem,
} from "./types";

const productSelect =
  "id, company_id, name, sku, barcode, unit, purchase_price, sale_price, stock_min, description, is_active, category_id, brand_id, product_scope, category:categories(id, name), brand:brands(id, name), product_images(id, product_id, url, position)";

export async function listProducts(companyId: string): Promise<ProductItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(productSelect)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const categoryRaw = row.category;
    const brandRaw = row.brand;
    const category = Array.isArray(categoryRaw)
      ? (categoryRaw[0] as { id: string; name: string } | undefined) ?? null
      : ((categoryRaw as { id: string; name: string } | null) ?? null);
    const brand = Array.isArray(brandRaw)
      ? (brandRaw[0] as { id: string; name: string } | undefined) ?? null
      : ((brandRaw as { id: string; name: string } | null) ?? null);

    const imgRaw = row.product_images;
    let product_images: ProductImageRow[] | null = null;
    if (Array.isArray(imgRaw) && imgRaw.length > 0) {
      product_images = [...(imgRaw as ProductImageRow[])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((i) => ({
          id: String(i.id),
          product_id: i.product_id != null ? String(i.product_id) : undefined,
          url: String(i.url),
          position: Number(i.position ?? 0),
        }));
    }

    return {
      ...(row as unknown as ProductItem),
      category,
      brand,
      product_images,
    };
  });
}

export async function listCategories(
  companyId: string,
): Promise<ProductCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, company_id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductCategory[];
}

export async function listBrands(companyId: string): Promise<ProductBrand[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, company_id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductBrand[];
}

export async function listStoreInventory(storeId: string | null) {
  if (!storeId) return new Map<string, number>();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("store_inventory")
    .select("product_id, quantity")
    .eq("store_id", storeId);
  if (error) throw error;
  const m = new Map<string, number>();
  for (const row of data ?? []) {
    m.set(String(row.product_id), Number(row.quantity ?? 0));
  }
  return m;
}

export async function createProduct(
  companyId: string,
  input: ProductFormInput,
): Promise<{ id: string } | undefined> {
  const payload = {
    company_id: companyId,
    name: input.name.trim(),
    sku: input.sku.trim() || null,
    barcode: input.barcode.trim() || null,
    unit: input.unit.trim() || "pce",
    purchase_price: input.purchasePrice,
    sale_price: input.salePrice,
    stock_min: input.stockMin,
    description: input.description.trim() || null,
    is_active: input.isActive,
    category_id: input.categoryId || null,
    brand_id: input.brandId || null,
    product_scope: input.productScope,
  };
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_create", payload);
    return undefined;
  }
  const { data, error } = await supabase.from("products").insert(payload).select("id").single();
  if (error) throw error;
  return { id: String((data as { id: string }).id) };
}

export async function updateProduct(
  id: string,
  input: ProductFormInput,
): Promise<void> {
  const patch = {
    name: input.name.trim(),
    sku: input.sku.trim() || null,
    barcode: input.barcode.trim() || null,
    unit: input.unit.trim() || "pce",
    purchase_price: input.purchasePrice,
    sale_price: input.salePrice,
    stock_min: input.stockMin,
    description: input.description.trim() || null,
    category_id: input.categoryId || null,
    brand_id: input.brandId || null,
    is_active: input.isActive,
    product_scope: input.productScope,
  };
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_update", { id, patch });
    return;
  }
  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setProductActive(id: string, isActive: boolean) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_set_active", { id, isActive });
    return;
  }
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteProduct(id: string) {
  const now = new Date().toISOString();
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_soft_delete", { id, now });
    return;
  }
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: now, is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function createCategory(companyId: string, name: string): Promise<string | null> {
  const supabase = createClient();
  const payload = { company_id: companyId, name: name.trim() };
  if (!navigator.onLine) {
    await enqueueOutbox("category_create", payload);
    return null;
  }
  const { data, error } = await supabase.from("categories").insert(payload).select("id").single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

export async function createBrand(companyId: string, name: string): Promise<string | null> {
  const supabase = createClient();
  const payload = { company_id: companyId, name: name.trim() };
  if (!navigator.onLine) {
    await enqueueOutbox("brand_create", payload);
    return null;
  }
  const { data, error } = await supabase.from("brands").insert(payload).select("id").single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

const PRODUCT_IMAGES_BUCKET = "product-images";

/** Upload image + ligne `product_images` — aligné `ProductsRepository.addImage` (Flutter). */
export async function addProductImage(productId: string, file: File): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("Hors ligne : les images seront disponibles après reconnexion.");
  }
  const supabase = createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() || "jpg" : "jpg";
  const path = `${productId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { data: maxRow, error: maxErr } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const pos =
    maxRow && typeof (maxRow as { position?: unknown }).position === "number"
      ? (maxRow as { position: number }).position + 1
      : 0;

  const { error: insErr } = await supabase
    .from("product_images")
    .insert({ product_id: productId, url: publicUrl, position: pos });
  if (insErr) throw insErr;
}

export async function deleteProductImage(imageId: string): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("Hors ligne : suppression d'image indisponible.");
  }
  const supabase = createClient();
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw error;
}

export async function updateCategory(id: string, name: string) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("category_update", { id, name: name.trim() });
    return;
  }
  const { error } = await supabase
    .from("categories")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("category_delete", { id });
    return;
  }
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function updateBrand(id: string, name: string) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("brand_update", { id, name: name.trim() });
    return;
  }
  const { error } = await supabase
    .from("brands")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteBrand(id: string) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("brand_delete", { id });
    return;
  }
  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) throw error;
}
