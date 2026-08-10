"use client";

import { UserFriendlyError } from "@/lib/errors/app-error-mapper";
import { createClient } from "@/lib/supabase/client";
import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";
import type { EngineUnit, EngineUnitDraft, EngineUnitStatus } from "./types";
import { normalizeEngineUnitDrafts } from "./types";

const ENGINE_UNIT_SELECT =
  "id, company_id, product_id, store_id, chassis_number, engine_number, color, status, sale_id, sold_at, notes";

function mapRow(row: Record<string, unknown>): EngineUnit {
  const status = String(row.status ?? "in_stock");
  return {
    id: String(row.id),
    companyId: String(row.company_id ?? ""),
    productId: String(row.product_id ?? ""),
    storeId: row.store_id != null ? String(row.store_id) : null,
    chassisNumber: String(row.chassis_number ?? ""),
    engineNumber: row.engine_number != null ? String(row.engine_number) : null,
    color: row.color != null ? String(row.color) : null,
    status: (status === "sold" ? "sold" : "in_stock") as EngineUnitStatus,
    saleId: row.sale_id != null ? String(row.sale_id) : null,
    soldAt: row.sold_at != null ? String(row.sold_at) : null,
    notes: row.notes != null ? String(row.notes) : null,
  };
}

/**
 * Le châssis est unique dans l'entreprise : la base refuse le doublon. Sans traduction,
 * l'utilisateur lit « duplicate key value violates unique constraint » — on lui dit
 * plutôt quel engin est déjà enregistré et ce qu'il peut faire.
 */
function rethrowChassisConflict(err: unknown, chassis?: string): never {
  const code = (err as { code?: string } | null)?.code ?? "";
  const msg = formatUnknownErrorMessage(err).toLowerCase();
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("engine_units_chassis_unique")) {
    throw new UserFriendlyError(
      chassis
        ? `Le châssis ${chassis} est déjà enregistré sur un autre engin. Vérifiez le numéro : deux motos ne peuvent pas porter le même.`
        : "Ce numéro de châssis est déjà enregistré sur un autre engin. Vérifiez le numéro : deux motos ne peuvent pas porter le même.",
    );
  }
  throw err;
}

/** Tous les engins d'un produit (en stock ET vendus) — fiche produit. */
export async function listEngineUnits(productId: string): Promise<EngineUnit[]> {
  if (!productId) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("engine_units")
    .select(ENGINE_UNIT_SELECT)
    .eq("product_id", productId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
}

/**
 * Les engins encore en cour pour ce produit — c'est la liste que le vendeur voit
 * au moment de choisir la moto qu'il facture.
 *
 * `storeId` filtre sur la boutique quand l'engin y a été rattaché ; les engins saisis
 * sans boutique (entreprise mono-boutique, saisie en vue « toutes boutiques ») restent
 * proposés — mieux vaut une liste complète qu'un engin invisible en cour.
 */
export async function listAvailableEngineUnits(
  productId: string,
  storeId: string | null,
): Promise<EngineUnit[]> {
  if (!productId) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("engine_units")
    .select(ENGINE_UNIT_SELECT)
    .eq("product_id", productId)
    .eq("status", "in_stock")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
  if (!storeId) return rows;
  return rows.filter((u) => u.storeId == null || u.storeId === storeId);
}

/**
 * Aligne les engins d'un produit sur ce que montre le formulaire.
 *
 * - `removedIds` : lignes retirées → suppression (les engins VENDUS ne sont jamais
 *   proposés à la suppression côté écran : ils sont sur une facture).
 * - `drafts` : état final voulu. Ligne avec `id` → mise à jour ; sans `id` → insertion.
 *
 * Nécessite une connexion (comme les images et les conditionnements produit).
 */
export async function saveEngineUnits(
  companyId: string,
  productId: string,
  storeId: string | null,
  drafts: EngineUnitDraft[],
  removedIds: string[],
): Promise<void> {
  const supabase = createClient();
  const clean = normalizeEngineUnitDrafts(drafts);

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("engine_units")
      .delete()
      .in("id", removedIds)
      // Un engin déjà facturé ne se supprime pas : il documente la vente.
      .eq("status", "in_stock");
    if (error) throw error;
  }

  for (const d of clean.filter((x) => x.id)) {
    const { error } = await supabase
      .from("engine_units")
      .update({
        chassis_number: d.chassisNumber,
        engine_number: d.engineNumber || null,
        color: d.color || null,
      })
      .eq("id", d.id as string);
    if (error) rethrowChassisConflict(error, d.chassisNumber);
  }

  const toInsert = clean.filter((x) => !x.id);
  if (toInsert.length > 0) {
    const { error } = await supabase.from("engine_units").insert(
      toInsert.map((d) => ({
        company_id: companyId,
        product_id: productId,
        store_id: storeId,
        chassis_number: d.chassisNumber,
        engine_number: d.engineNumber || null,
        color: d.color || null,
      })),
    );
    if (error) rethrowChassisConflict(error);
  }
}

/**
 * Sort un engin du stock au profit d'une vente. Idempotent côté base : rejouer la
 * même vente (file d'attente hors ligne) ne change rien, et un engin déjà vendu à
 * une autre vente est refusé.
 */
export async function markEngineUnitSold(
  unitId: string,
  saleId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("engine_unit_mark_sold", {
    p_unit_id: unitId,
    p_sale_id: saleId,
  });
  if (error) throw error;
}
