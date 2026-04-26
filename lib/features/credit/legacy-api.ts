"use client";

import { createClient } from "@/lib/supabase/client";
import type { LegacyCreditRow } from "./types";

const legacyCreditSelect =
  "id, company_id, store_id, customer_id, title, principal_amount, due_at, internal_note, created_by, created_at, updated_at, store:stores(id,name), customer:customers(id,name,phone), payments:legacy_customer_credit_payments(id, method, amount, reference, created_at)";

function normalizeLegacyCreditRow(row: Record<string, unknown>): LegacyCreditRow {
  const storeRaw = row.store;
  const customerRaw = row.customer;
  const store = Array.isArray(storeRaw)
    ? (storeRaw[0] as { id: string; name: string } | undefined) ?? null
    : ((storeRaw as { id: string; name: string } | null) ?? null);
  const customer = Array.isArray(customerRaw)
    ? (customerRaw[0] as { id: string; name: string; phone: string | null } | undefined) ?? null
    : ((customerRaw as { id: string; name: string; phone: string | null } | null) ?? null);
  const paymentsRaw = (row.payments as LegacyCreditRow["payments"] | undefined) ?? [];
  return {
    id: String(row.id ?? ""),
    company_id: String(row.company_id ?? ""),
    store_id: String(row.store_id ?? ""),
    customer_id: String(row.customer_id ?? ""),
    title: String(row.title ?? "Crédit libre"),
    principal_amount: Number(row.principal_amount ?? 0),
    due_at: (row.due_at as string | null | undefined) ?? null,
    internal_note: (row.internal_note as string | null | undefined) ?? null,
    created_by: String(row.created_by ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    store,
    customer,
    payments: paymentsRaw.map((p) => ({
      ...p,
      amount: Number(p.amount ?? 0),
      created_at: p.created_at ?? "",
    })),
  };
}

export async function listLegacyCredits(params: {
  companyId: string;
  storeId: string | null;
  from: string;
  to: string;
}): Promise<LegacyCreditRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("legacy_customer_credits")
    .select(legacyCreditSelect)
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false });
  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (params.from) q = q.gte("created_at", params.from);
  if (params.to) q = q.lte("created_at", `${params.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeLegacyCreditRow);
}

export async function createLegacyCredit(params: {
  companyId: string;
  storeId: string;
  customerId: string;
  title: string;
  amount: number;
  dueAt: string | null;
  internalNote?: string | null;
}): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("Création du crédit libre nécessite une connexion internet.");
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc("owner_create_legacy_customer_credit", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_customer_id: params.customerId,
    p_title: params.title,
    p_amount: params.amount,
    p_due_at: params.dueAt,
    p_internal_note: params.internalNote ?? null,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function appendLegacyCreditPayment(params: {
  creditId: string;
  method: "cash" | "mobile_money" | "card" | "transfer";
  amount: number;
  reference?: string | null;
}): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("Enregistrement du paiement nécessite une connexion internet.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("append_legacy_customer_credit_payment", {
    p_credit_id: params.creditId,
    p_method: params.method,
    p_amount: params.amount,
    p_reference: params.reference ?? null,
  });
  if (error) throw error;
}
