"use client";

import { createClient } from "@/lib/supabase/client";
import { adjustStockAtomic } from "@/lib/features/inventory/api";
import { listBrands, listCategories } from "./api";
import type { CsvProductRow } from "./csv";

type RowPayload = {
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  stockMin: number;
  stockEntrant: number;
  description: string;
  isActive: boolean;
  categoryId: string | null;
  brandId: string | null;
};

const BATCH = 50;

/** Import aligné sur `ProductsRepository.importFromCsv` (Flutter). */
export async function importProductsFromCsv(
  companyId: string,
  rows: CsvProductRow[],
  opts: {
    storeId: string | null;
    onProgress?: (current: number, total: number) => void;
  },
): Promise<{ created: number; errors: string[] }> {
  if (!navigator.onLine) {
    throw new Error(
      "Pas de connexion. Connectez-vous pour importer des produits.",
    );
  }

  const supabase = createClient();
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!user) throw new Error("Non authentifié");

  const [existingCats, existingBrands] = await Promise.all([
    listCategories(companyId),
    listBrands(companyId),
  ]);
  const catMap = new Map(
    existingCats.map((c) => [c.name.toLowerCase(), c.id] as const),
  );
  const brandMap = new Map(
    existingBrands.map((b) => [b.name.toLowerCase(), b.id] as const),
  );

  const errors: string[] = [];
  const valid: RowPayload[] = [];
  const totalInput = rows.length;
  opts.onProgress?.(0, totalInput);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const name = r.name.trim();
    if (name === "") continue;
    const catName = (r.category ?? "").trim();
    const brandName = (r.brand ?? "").trim();

    if (catName !== "" && !catMap.has(catName.toLowerCase())) {
      try {
        const { data, error } = await supabase
          .from("categories")
          .insert({ company_id: companyId, name: catName })
          .select("id")
          .single();
        if (error) throw error;
        catMap.set(catName.toLowerCase(), data.id as string);
      } catch (e) {
        errors.push(`Ligne ${i + 2} (catégorie): ${String(e)}`);
        continue;
      }
    }

    if (brandName !== "" && !brandMap.has(brandName.toLowerCase())) {
      try {
        const { data, error } = await supabase
          .from("brands")
          .insert({ company_id: companyId, name: brandName })
          .select("id")
          .single();
        if (error) throw error;
        brandMap.set(brandName.toLowerCase(), data.id as string);
      } catch (e) {
        errors.push(`Ligne ${i + 2} (marque): ${String(e)}`);
        continue;
      }
    }

    valid.push({
      name,
      sku: (r.sku ?? "").trim(),
      barcode: (r.barcode ?? "").trim(),
      unit: (r.unit ?? "pce").trim() || "pce",
      purchasePrice: r.purchasePrice,
      salePrice: r.salePrice,
      stockMin: r.stockMin,
      stockEntrant: r.stockEntrant,
      description: (r.description ?? "").trim(),
      isActive: r.isActive,
      categoryId:
        catName === "" ? null : (catMap.get(catName.toLowerCase()) ?? null),
      brandId:
        brandName === "" ? null : (brandMap.get(brandName.toLowerCase()) ?? null),
    });
  }

  let created = 0;
  const storeId = opts.storeId;

  for (let start = 0; start < valid.length; start += BATCH) {
    const chunk = valid.slice(start, start + BATCH);
    const payloads = chunk.map((p) => ({
      company_id: companyId,
      name: p.name,
      sku: p.sku === "" ? null : p.sku,
      barcode: p.barcode === "" ? null : p.barcode,
      unit: p.unit === "" ? "pce" : p.unit,
      purchase_price: p.purchasePrice,
      sale_price: p.salePrice,
      stock_min: p.stockMin,
      description: p.description === "" ? null : p.description,
      is_active: p.isActive,
      category_id: p.categoryId,
      brand_id: p.brandId,
    }));

    try {
      const { data, error } = await supabase
        .from("products")
        .insert(payloads)
        .select("id");
      if (error) throw error;
      const ids = (data ?? []).map((row) => String((row as { id: string }).id));
      if (
        storeId !== null &&
        ids.length === chunk.length
      ) {
        for (let j = 0; j < chunk.length; j++) {
          const ent = chunk[j]!.stockEntrant;
          if (ent > 0) {
            await adjustStockAtomic({
              storeId,
              productId: ids[j]!,
              delta: ent,
              reason: "Stock entrant (import)",
            });
          }
        }
      }
      created += chunk.length;
      opts.onProgress?.(created, totalInput);
    } catch (e) {
      if (chunk.length === 1) {
        errors.push(`Ligne ${start + 2}: ${String(e)}`);
      } else {
        errors.push(
          `Lignes ${start + 2} à ${start + chunk.length + 1}: ${String(e)}`,
        );
      }
    }
  }

  return { created, errors };
}
