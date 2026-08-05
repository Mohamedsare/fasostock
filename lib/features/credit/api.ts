"use client";

import { createClient } from "@/lib/supabase/client";
import { fallbackCreatorLabel, fetchCreatorLabels } from "@/lib/features/users/creator-labels";
import { localDayEndIso, localDayStartIso } from "@/lib/utils/local-day";
import type { SaleItem } from "@/lib/features/sales/types";
import type { CreditSaleRow } from "./types";

const creditListSelect =
  "id, company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, created_at, updated_at, sale_mode, document_type, credit_due_at, credit_internal_note, store:stores(id, name), customer:customers(id, name, phone), sale_payments(id, method, amount, reference, created_at)";

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
 * La page Crédit liste par défaut les dossiers ouverts ; le filtre « Soldés » affiche l’historique des dossiers soldés.
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
  if (params.from) q = q.gte("created_at", localDayStartIso(params.from));
  if (params.to) q = q.lte("created_at", localDayEndIso(params.to));
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

export type CreditRepaymentRow = {
  paymentId: string;
  saleId: string;
  saleNumber: string;
  storeId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  amount: number;
  method: string;
  reference: string | null;
  /** Instant du remboursement (ISO). */
  paidAt: string;
  saleCreatedAt: string;
  /** Vente créée AVANT la période consultée (ancien crédit) vs crédit né dans la période. */
  isOldCredit: boolean;
};

/** Taille de page PostgREST : au-delà, la réponse est tronquée silencieusement. */
const PAGE_SIZE = 1000;

/**
 * Remboursements de crédit RÉELS encaissés sur une période (par DATE DE PAIEMENT).
 * = paiements `method ≠ 'other'` effectués APRÈS la création de la vente (> 10 s : exclut le
 * paiement encaissé au moment de la vente — acompte inséré dans la même transaction, écart ≈ 0 —
 * qui n'est pas un remboursement de crédit mais apparaît dans le KPI « Déjà encaissé »).
 * Inclut les remboursements d'anciens crédits ET ceux pris & remboursés dans la période.
 */
export async function listCreditRepaymentsForRange(params: {
  companyId: string;
  storeId: string | null;
  from: string;
  to: string;
}): Promise<CreditRepaymentRow[]> {
  const supabase = createClient();
  const startIso = localDayStartIso(params.from);
  const endIso = localDayEndIso(params.to);

  const rows: Array<Record<string, unknown>> = [];
  for (let page = 0; ; page += 1) {
    let q = supabase
      .from("sale_payments")
      .select(
        "id, amount, method, reference, created_at, sale:sales!inner(id, sale_number, company_id, store_id, status, created_at, customer:customers(id, name, phone))",
      )
      .neq("method", "other")
      .eq("sale.company_id", params.companyId)
      .eq("sale.status", "completed")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (params.storeId) q = q.eq("sale.store_id", params.storeId);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const out: CreditRepaymentRow[] = [];
  for (const raw of rows) {
    const saleRaw = raw.sale;
    const sale = (Array.isArray(saleRaw) ? saleRaw[0] : saleRaw) as
      | {
          id?: string;
          sale_number?: string;
          company_id?: string;
          store_id?: string | null;
          status?: string;
          created_at?: string;
          customer?: unknown;
        }
      | undefined;
    if (!sale?.id) continue;
    if (sale.company_id !== params.companyId) continue;
    if (sale.status !== "completed") continue;
    if (params.storeId && sale.store_id !== params.storeId) continue;

    const paidAt = String(raw.created_at ?? "");
    const saleCreatedAt = String(sale.created_at ?? "");
    const gap = Date.parse(paidAt) - Date.parse(saleCreatedAt);
    if (!(Number.isFinite(gap) && gap > 10_000)) continue;

    const custRaw = sale.customer;
    const cust = (Array.isArray(custRaw) ? custRaw[0] : custRaw) as
      | { name?: string; phone?: string | null }
      | null
      | undefined;

    out.push({
      paymentId: String(raw.id ?? ""),
      saleId: sale.id,
      saleNumber: String(sale.sale_number ?? ""),
      storeId: (sale.store_id ?? null) as string | null,
      customerName: cust?.name ?? null,
      customerPhone: cust?.phone ?? null,
      amount: Number(raw.amount ?? 0),
      method: String(raw.method ?? ""),
      reference: (raw.reference as string | null) ?? null,
      paidAt,
      saleCreatedAt,
      isOldCredit: saleCreatedAt < startIso,
    });
  }
  return out;
}

export type CreditGrantedRow = {
  saleId: string;
  saleNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
  saleTotal: number;
  /** Montant mis à crédit à la vente (Σ lignes `method = 'other'`) = dette créée ce jour. */
  creditGranted: number;
  /** Encaissé immédiatement à la vente (total − crédit accordé). */
  paidAtSale: number;
};

/**
 * Crédits ACCORDÉS sur une période : ventes complétées créées dans la période dont une partie a
 * été mise à crédit (ligne `sale_payments.method = 'other'`). `creditGranted` = dette née alors.
 */
export async function listCreditsGrantedForRange(params: {
  companyId: string;
  storeId: string | null;
  from: string;
  to: string;
}): Promise<CreditGrantedRow[]> {
  const supabase = createClient();
  const rows: Array<Record<string, unknown>> = [];
  for (let page = 0; ; page += 1) {
    let q = supabase
      .from("sales")
      .select(
        "id, sale_number, created_at, total, store_id, status, company_id, customer:customers(id, name, phone), sale_payments(method, amount)",
      )
      .eq("company_id", params.companyId)
      .eq("status", "completed")
      .gte("created_at", localDayStartIso(params.from))
      .lte("created_at", localDayEndIso(params.to))
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (params.storeId) q = q.eq("store_id", params.storeId);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const out: CreditGrantedRow[] = [];
  for (const raw of rows) {
    const pays = (raw.sale_payments as Array<{ method?: string; amount?: number }> | null) ?? [];
    const creditGranted = pays
      .filter((p) => p.method === "other")
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    if (creditGranted <= 0.005) continue;
    const custRaw = raw.customer;
    const cust = (Array.isArray(custRaw) ? custRaw[0] : custRaw) as
      | { name?: string; phone?: string | null }
      | null
      | undefined;
    const total = Number(raw.total ?? 0);
    out.push({
      saleId: String(raw.id ?? ""),
      saleNumber: String(raw.sale_number ?? ""),
      customerName: cust?.name ?? null,
      customerPhone: cust?.phone ?? null,
      createdAt: String(raw.created_at ?? ""),
      saleTotal: total,
      creditGranted,
      paidAtSale: Math.max(0, total - creditGranted),
    });
  }
  return out;
}

export type AppendSalePaymentResult = {
  paymentId: string;
  createdAtIso: string;
};

export async function appendSalePayment(params: {
  saleId: string;
  method: "cash" | "mobile_money" | "card" | "transfer";
  amount: number;
  reference?: string | null;
}): Promise<AppendSalePaymentResult> {
  if (!navigator.onLine) {
    throw new Error("Enregistrement du paiement nécessite une connexion internet.");
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc("append_sale_payment", {
    p_sale_id: params.saleId,
    p_method: params.method,
    p_amount: params.amount,
    p_reference: params.reference ?? null,
  });
  if (error) throw error;
  const raw = data as Record<string, unknown> | null | undefined;
  const paymentId = raw != null ? String(raw.payment_id ?? "").trim() : "";
  const createdAtIso = raw != null ? String(raw.created_at ?? "").trim() : "";
  if (!paymentId || !createdAtIso) {
    throw new Error("Réponse serveur invalide après encaissement.");
  }
  return { paymentId, createdAtIso };
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
  "id, company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, created_at, updated_at, sale_mode, document_type, credit_due_at, credit_internal_note, store:stores(id, name), customer:customers(id, name, phone, address), sale_items(id, sale_id, product_id, quantity, unit_price, discount, total, product:products(id,name,sku,unit)),sale_payments(id, method, amount, reference, created_at)";

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
