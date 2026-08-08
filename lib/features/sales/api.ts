"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { notifyCompanyOwnersPush } from "@/lib/features/push/company-owners-push-client";
import { createClient } from "@/lib/supabase/client";
import { fallbackCreatorLabel, fetchCreatorLabels } from "@/lib/features/users/creator-labels";
import { localDayEndIso, localDayStartIso } from "@/lib/utils/local-day";
import type { SaleItem, SaleStatus } from "./types";
import type { SaleCostAggregate } from "./sale-profit";

const saleSelect =
  "id, company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, created_at, updated_at, sale_mode, document_type, prescription_number, credit_due_at, store:stores(id, name), customer:customers(id, name, phone)";

export async function listSales(params: {
  companyId: string;
  storeId: string | null;
  status: SaleStatus | null;
  from: string;
  to: string;
}): Promise<SaleItem[]> {
  const supabase = createClient();
  let q = supabase
    .from("sales")
    // `sale_payments` : nécessaire à la colonne Acompte / au statut de règlement de la liste.
    .select(`${saleSelect},sale_payments(id, method, amount, reference, created_at)`)
    .eq("company_id", params.companyId)
    // Les ventes d'engins ont leur propre page (module Vente Engins).
    .eq("sale_kind", "standard")
    .order("created_at", { ascending: false });
  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (params.status) q = q.eq("status", params.status);
  if (params.from) q = q.gte("created_at", localDayStartIso(params.from));
  if (params.to) q = q.lte("created_at", localDayEndIso(params.to));
  const { data, error } = await q;
  if (error) throw error;
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const storeRaw = row.store;
    const customerRaw = row.customer;
    const store = Array.isArray(storeRaw)
      ? (storeRaw[0] as { id: string; name: string } | undefined) ?? null
      : ((storeRaw as { id: string; name: string } | null) ?? null);
    const customer = Array.isArray(customerRaw)
      ? (customerRaw[0] as { id: string; name: string; phone: string | null } | undefined) ?? null
      : ((customerRaw as { id: string; name: string; phone: string | null } | null) ?? null);
    return {
      ...(row as unknown as SaleItem),
      store,
      customer,
    };
  });

  const creatorIds = rows.map((r) => r.created_by).filter(Boolean) as string[];
  let labelByUser: Map<string, string>;
  try {
    labelByUser = await fetchCreatorLabels(supabase, creatorIds);
  } catch {
    labelByUser = new Map();
    for (const id of new Set(creatorIds)) {
      labelByUser.set(id, fallbackCreatorLabel(id));
    }
  }

  return rows.map((r) => ({
    ...r,
    created_by_label: labelByUser.get(r.created_by) ?? fallbackCreatorLabel(r.created_by),
  }));
}

/** Taille de lot `in(...)` : au-delà, l'URL PostgREST devient trop longue. */
const COST_CHUNK = 120;

/**
 * Coût d'achat agrégé des ventes demandées — alimente la colonne « Bénéfice » de
 * l'historique. Volontairement appelé sur les seules ventes **affichées** (une page)
 * pour ne pas alourdir le chargement de la liste.
 *
 * Une vente absente du résultat (aucune ligne lisible) n'est pas inventée : l'écran
 * affiche « — » plutôt qu'un bénéfice égal au chiffre d'affaires.
 */
export async function fetchSalesCost(
  saleIds: string[],
): Promise<Map<string, SaleCostAggregate>> {
  const out = new Map<string, SaleCostAggregate>();
  const ids = [...new Set(saleIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const supabase = createClient();
  for (let i = 0; i < ids.length; i += COST_CHUNK) {
    const chunk = ids.slice(i, i + COST_CHUNK);
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, total, product:products(purchase_price)")
      .in("sale_id", chunk);
    if (error) throw error;
    for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
      const saleId = String(raw.sale_id ?? "");
      if (!saleId) continue;
      const productRaw = raw.product;
      const product = (
        Array.isArray(productRaw) ? productRaw[0] : productRaw
      ) as { purchase_price?: number | null } | null | undefined;
      const purchasePrice = Number(product?.purchase_price ?? 0);
      const quantity = Number(raw.quantity ?? 0);
      const cur = out.get(saleId) ?? {
        itemsTotal: 0,
        cost: 0,
        lineCount: 0,
        linesWithoutCost: 0,
      };
      cur.itemsTotal += Number(raw.total ?? 0);
      cur.cost += purchasePrice * quantity;
      cur.lineCount += 1;
      // Prix d'achat à 0 = non renseigné : compté à part pour signaler la surestimation.
      if (!(purchasePrice > 0)) cur.linesWithoutCost += 1;
      out.set(saleId, cur);
    }
  }
  return out;
}

export async function cancelSale(saleId: string): Promise<void> {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("sale_cancel", { saleId });
    return;
  }
  const { data: snap, error: snapErr } = await supabase
    .from("sales")
    .select("company_id, sale_number")
    .eq("id", saleId)
    .maybeSingle();
  if (snapErr) throw snapErr;

  const { error } = await supabase.rpc("cancel_sale_restore_stock", {
    p_sale_id: saleId,
  });
  if (error) throw error;

  const row = snap as { company_id?: string; sale_number?: string } | null;
  if (row?.company_id) {
    await notifyCompanyOwnersPush({
      companyIds: [row.company_id],
      title: "Vente annulée",
      body: row.sale_number ? `La vente ${row.sale_number} a été annulée.` : "Une vente a été annulée.",
      url: "/sales",
    });
  }
}

/**
 * Propriétaire uniquement (RPC `owner_purge_cancelled_sale`) : efface définitivement une vente
 * déjà **annulée** (ligne retirée de la liste).
 */
export async function purgeCancelledSaleAsOwner(params: {
  companyId: string;
  saleNumber: string;
}): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("La purge nécessite une connexion internet.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("owner_purge_cancelled_sale", {
    p_company_id: params.companyId,
    p_sale_number: params.saleNumber.trim(),
  });
  if (error) throw error;
}

export async function getSaleDetail(saleId: string): Promise<
  | (SaleItem & {
      sale_items: Array<{
        id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        discount: number;
        total: number;
        product?: { id: string; name: string; sku: string | null; unit: string } | null;
      }>;
      sale_payments: Array<{
        id: string;
        method: string;
        amount: number;
        reference: string | null;
        created_at: string;
      }>;
    })
  | null
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales")
    .select(
      `${saleSelect},sale_items(id, product_id, quantity, unit_price, discount, total, product:products(id,name,sku,unit)),sale_payments(id, method, amount, reference, created_at)`,
    )
    .eq("id", saleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const storeRaw = row.store;
  const customerRaw = row.customer;
  const store = Array.isArray(storeRaw)
    ? (storeRaw[0] as { id: string; name: string } | undefined) ?? null
    : ((storeRaw as { id: string; name: string } | null) ?? null);
  const customer = Array.isArray(customerRaw)
    ? (customerRaw[0] as { id: string; name: string; phone: string | null } | undefined) ?? null
    : ((customerRaw as { id: string; name: string; phone: string | null } | null) ?? null);
  return {
    ...(row as unknown as SaleItem),
    store,
    customer,
    sale_items: (row.sale_items as Array<{
      id: string;
      product_id: string;
      quantity: number;
      unit_price: number;
      discount: number;
      total: number;
      product?: { id: string; name: string; sku: string | null; unit: string } | null;
    }>) ?? [],
    sale_payments: (row.sale_payments as Array<{
      id: string;
      method: string;
      amount: number;
      reference: string | null;
      created_at: string;
    }>) ?? [],
  };
}
