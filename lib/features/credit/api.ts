"use client";

import { createClient } from "@/lib/supabase/client";
import type { SaleItem } from "@/lib/features/sales/types";
import type { CreditSaleRow } from "./types";

const creditListSelect =
  "id, company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, created_at, updated_at, sale_mode, document_type, credit_due_at, credit_internal_note, store:stores(id, name), customer:customers(id, name, phone), sale_payments(id, method, amount, reference, created_at)";

function fallbackCreatorLabel(userId: string): string {
  if (userId.length >= 8) return `Utilisateur ${userId.slice(0, 8)}…`;
  return "Utilisateur";
}

async function fetchCreatorLabels(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(userIds)].filter((id) => id && id.length > 0);
  for (const id of uniq) {
    map.set(id, fallbackCreatorLabel(id));
  }
  if (uniq.length === 0) return map;

  const chunkSize = 120;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const r = row as { id: string; full_name: string | null };
      const fn = r.full_name?.trim();
      map.set(r.id, fn && fn.length > 0 ? fn : fallbackCreatorLabel(r.id));
    }
  }
  return map;
}

function normalizeCreditRow(row: Record<string, unknown>): CreditSaleRow {
  const storeRaw = row.store;
  const customerRaw = row.customer;
  const store = Array.isArray(storeRaw)
    ? (storeRaw[0] as { id: string; name: string } | undefined) ?? null
    : ((storeRaw as { id: string; name: string } | null) ?? null);
  const customer = Array.isArray(customerRaw)
    ? (customerRaw[0] as { id: string; name: string; phone: string | null } | undefined) ?? null
    : ((customerRaw as { id: string; name: string; phone: string | null } | null) ?? null);
  const payments = (row.sale_payments as CreditSaleRow["sale_payments"]) ?? [];
  return {
    ...(row as unknown as SaleItem),
    credit_due_at: (row.credit_due_at as string | null | undefined) ?? null,
    credit_internal_note: (row.credit_internal_note as string | null | undefined) ?? null,
    store,
    customer,
    sale_payments: payments.map((p) => ({
      ...p,
      created_at: p.created_at ?? "",
    })),
  };
}

/**
 * Ventes complétées avec client — pour analyse crédit (reste = total − encaissements réels ;
 * les lignes `sale_payments.method = 'other'` = solde à crédit POS, ne réduisent pas le reste).
 * La page Crédit n’affiche que les dossiers avec reste > 0 (soldées exclues de la liste).
 * Requiert les colonnes `credit_due_at` / `credit_internal_note` (migration `00082_…`).
 */
export async function listCreditSales(params: {
  companyId: string;
  storeId: string | null;
  from: string;
  to: string;
}): Promise<CreditSaleRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("sales")
    .select(creditListSelect)
    .eq("company_id", params.companyId)
    .eq("status", "completed")
    .not("customer_id", "is", null)
    .order("created_at", { ascending: false });
  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (params.from) q = q.gte("created_at", params.from);
  if (params.to) q = q.lte("created_at", `${params.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) throw error;
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(normalizeCreditRow);

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

export async function appendSalePayment(params: {
  saleId: string;
  method: "cash" | "mobile_money" | "card" | "transfer";
  amount: number;
  reference?: string | null;
}): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("Enregistrement du paiement nécessite une connexion internet.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("append_sale_payment", {
    p_sale_id: params.saleId,
    p_method: params.method,
    p_amount: params.amount,
    p_reference: params.reference ?? null,
  });
  if (error) throw error;
}

export async function updateSaleCreditMeta(params: {
  saleId: string;
  creditDueAt: string | null;
  creditInternalNote: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sales")
    .update({
      credit_due_at: params.creditDueAt,
      credit_internal_note: params.creditInternalNote?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.saleId);
  if (error) throw error;
}

const creditDetailSelect =
  "id, company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, created_at, updated_at, sale_mode, document_type, credit_due_at, credit_internal_note, store:stores(id, name), customer:customers(id, name, phone, address), sale_items(id, product_id, quantity, unit_price, discount, total, product:products(id,name,sku,unit)),sale_payments(id, method, amount, reference, created_at)";

export async function fetchCreditSaleDetail(saleId: string): Promise<
  | (CreditSaleRow & {
      sale_items: Array<{
        id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        discount: number;
        total: number;
        product?: { id: string; name: string; sku: string | null; unit: string } | null;
      }>;
    })
  | null
> {
  const supabase = createClient();
  const { data, error } = await supabase.from("sales").select(creditDetailSelect).eq("id", saleId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const saleItems = row.sale_items;
  const rowWithoutItems = { ...row };
  delete rowWithoutItems.sale_items;
  const base = normalizeCreditRow(rowWithoutItems);
  return {
    ...base,
    sale_items:
      (saleItems as Array<{
        id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        discount: number;
        total: number;
        product?: { id: string; name: string; sku: string | null; unit: string } | null;
      }>) ?? [],
  };
}
