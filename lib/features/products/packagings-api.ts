"use client";

import { createClient } from "@/lib/supabase/client";
import type { ProductPackagingDraft } from "./types";

/**
 * Synchronise les conditionnements d'un produit avec l'état du formulaire.
 *
 * - `removedIds` : lignes existantes retirées → suppression.
 * - `drafts` : état final voulu. Ligne avec `id` → mise à jour ; sans `id` → insertion.
 *
 * Le `position` est ré-attribué selon l'ordre d'affichage (index dans `drafts`).
 * Nécessite une connexion (comme les images produit). Hors ligne, l'appelant doit
 * éviter d'appeler ce helper.
 */
export async function saveProductPackagings(
  companyId: string,
  productId: string,
  drafts: ProductPackagingDraft[],
  removedIds: string[],
): Promise<void> {
  const supabase = createClient();

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("product_packagings")
      .delete()
      .in("id", removedIds);
    if (error) throw error;
  }

  const toUpdate = drafts
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.id);
  const toInsert = drafts
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => !d.id);

  for (const { d, i } of toUpdate) {
    const { error } = await supabase
      .from("product_packagings")
      .update({
        label: d.label.trim(),
        barcode: d.barcode.trim() || null,
        factor: Math.max(1, Math.round(d.factor)),
        price: d.price != null ? Math.max(0, d.price) : null,
        position: i,
      })
      .eq("id", d.id as string);
    if (error) throw error;
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map(({ d, i }) => ({
      company_id: companyId,
      product_id: productId,
      label: d.label.trim(),
      barcode: d.barcode.trim() || null,
      factor: Math.max(1, Math.round(d.factor)),
      price: d.price != null ? Math.max(0, d.price) : null,
      position: i,
    }));
    const { error } = await supabase.from("product_packagings").insert(rows);
    if (error) throw error;
  }
}
