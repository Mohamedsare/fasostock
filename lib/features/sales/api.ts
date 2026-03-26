"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { createClient } from "@/lib/supabase/client";
import type { SaleItem, SaleStatus } from "./types";

const saleSelect =
  "id, company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, created_at, updated_at, sale_mode, document_type, store:stores(id, name), customer:customers(id, name, phone)";

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
    .select(saleSelect)
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false });
  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (params.status) q = q.eq("status", params.status);
  if (params.from) q = q.gte("created_at", params.from);
  if (params.to) q = q.lte("created_at", `${params.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
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
}

export async function cancelSale(saleId: string): Promise<void> {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("sale_cancel", { saleId });
    return;
  }
  const { error } = await supabase.rpc("cancel_sale_restore_stock", {
    p_sale_id: saleId,
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
      }>;
    })
  | null
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales")
    .select(
      `${saleSelect},sale_items(id, product_id, quantity, unit_price, discount, total, product:products(id,name,sku,unit)),sale_payments(id, method, amount, reference)`,
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
    }>) ?? [],
  };
}
