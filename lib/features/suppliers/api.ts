"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { createClient } from "@/lib/supabase/client";
import type {
  Supplier,
  SupplierAccount,
  SupplierAllocation,
  SupplierFormInput,
  SupplierInvoice,
  SupplierInvoiceFormInput,
  SupplierInvoiceSource,
  SupplierInvoiceStatus,
  SupplierPayableStats,
  SupplierPayment,
  SupplierPaymentFormInput,
  SupplierPaymentMethod,
} from "./types";

const FIELDS =
  "id, company_id, name, contact, phone, email, address, notes, code, is_active, city, tax_id, bank_details, category, payment_terms_days, credit_limit, opening_balance, created_at, updated_at";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Jours calendaires entre `dateIso` (YYYY-MM-DD) et aujourd'hui — positif = passé. */
export function daysSince(dateIso: string | null): number {
  if (!dateIso) return 0;
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    name: String(row.name ?? ""),
    contact: str(row.contact),
    phone: str(row.phone),
    email: str(row.email),
    address: str(row.address),
    notes: str(row.notes),
    code: str(row.code),
    is_active: row.is_active !== false,
    city: str(row.city),
    tax_id: str(row.tax_id),
    bank_details: str(row.bank_details),
    category: str(row.category),
    payment_terms_days: Math.trunc(toNum(row.payment_terms_days)),
    credit_limit: toNum(row.credit_limit),
    opening_balance: toNum(row.opening_balance),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

const EMPTY_STATS = (supplierId: string): SupplierPayableStats => ({
  supplierId,
  totalDue: 0,
  totalPaid: 0,
  balance: 0,
  creditAvailable: 0,
  overdueAmount: 0,
  dueSoonAmount: 0,
  openInvoices: 0,
  overdueInvoices: 0,
  oldestDueDate: null,
  nextDueDate: null,
  lastPaymentAt: null,
  lastInvoiceDate: null,
  purchasesCount: 0,
});

export async function listSuppliers(companyId: string): Promise<Supplier[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(FIELDS)
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapSupplier(r as Record<string, unknown>));
}

/**
 * Fournisseurs + situation de dette de chacun, en deux requêtes.
 *
 * C'est la source unique de la page : la liste, le tableau de bord et les
 * relances travaillent tous sur ce même objet, donc les chiffres ne peuvent
 * pas diverger d'un onglet à l'autre.
 */
export async function listSupplierAccounts(companyId: string): Promise<SupplierAccount[]> {
  const supabase = createClient();
  const [suppliers, statsRes] = await Promise.all([
    listSuppliers(companyId),
    supabase.rpc("supplier_payables_overview", { p_company_id: companyId }),
  ]);
  if (statsRes.error) throw statsRes.error;

  const statsById = new Map<string, SupplierPayableStats>();
  for (const raw of (statsRes.data ?? []) as Record<string, unknown>[]) {
    const id = String(raw.supplier_id);
    statsById.set(id, {
      supplierId: id,
      totalDue: toNum(raw.total_due),
      totalPaid: toNum(raw.total_paid),
      balance: toNum(raw.balance),
      creditAvailable: toNum(raw.credit_available),
      overdueAmount: toNum(raw.overdue_amount),
      dueSoonAmount: toNum(raw.due_soon_amount),
      openInvoices: Math.trunc(toNum(raw.open_invoices)),
      overdueInvoices: Math.trunc(toNum(raw.overdue_invoices)),
      oldestDueDate: str(raw.oldest_due_date),
      nextDueDate: str(raw.next_due_date),
      lastPaymentAt: str(raw.last_payment_at),
      lastInvoiceDate: str(raw.last_invoice_date),
      purchasesCount: Math.trunc(toNum(raw.purchases_count)),
    });
  }

  return suppliers.map((s) => {
    const stats = statsById.get(s.id) ?? EMPTY_STATS(s.id);
    const daysLate =
      stats.overdueAmount > 0 ? Math.max(0, daysSince(stats.oldestDueDate)) : 0;
    return {
      ...s,
      stats,
      daysLate,
      overLimit: s.credit_limit > 0 && stats.balance > s.credit_limit,
    };
  });
}

export async function createSupplier(
  companyId: string,
  input: SupplierFormInput,
): Promise<void> {
  const payload = {
    company_id: companyId,
    name: input.name.trim(),
    contact: input.contact?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    code: input.code?.trim() || null,
    city: input.city?.trim() || null,
    tax_id: input.taxId?.trim() || null,
    bank_details: input.bankDetails?.trim() || null,
    category: input.category?.trim() || null,
    is_active: input.isActive ?? true,
    payment_terms_days: Math.max(0, Math.trunc(input.paymentTermsDays ?? 0)),
    credit_limit: Math.max(0, input.creditLimit ?? 0),
    opening_balance: Math.max(0, input.openingBalance ?? 0),
  };

  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("supplier_create", payload);
    return;
  }
  const { error } = await supabase.from("suppliers").insert(payload);
  if (error) throw error;
}

export async function updateSupplier(
  id: string,
  input: SupplierFormInput,
): Promise<void> {
  const patch = {
    name: input.name.trim(),
    contact: input.contact?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    code: input.code?.trim() || null,
    city: input.city?.trim() || null,
    tax_id: input.taxId?.trim() || null,
    bank_details: input.bankDetails?.trim() || null,
    category: input.category?.trim() || null,
    is_active: input.isActive ?? true,
    payment_terms_days: Math.max(0, Math.trunc(input.paymentTermsDays ?? 0)),
    credit_limit: Math.max(0, input.creditLimit ?? 0),
    opening_balance: Math.max(0, input.openingBalance ?? 0),
  };

  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("supplier_update", { id, patch });
    return;
  }
  const { error } = await supabase.from("suppliers").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSupplier(id: string): Promise<void> {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("supplier_delete", { id });
    return;
  }
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) throw error;
}

// ───────────────────────────── Dettes (factures) ─────────────────────────────

const INVOICE_FIELDS =
  "id, company_id, supplier_id, store_id, purchase_id, source, invoice_number, label, invoice_date, due_date, amount, paid_amount, status, notes, created_at, updated_at, supplier:suppliers(name)";

function relatedName(raw: unknown): string {
  if (Array.isArray(raw)) return String((raw[0] as { name?: string } | undefined)?.name ?? "");
  return String((raw as { name?: string } | null)?.name ?? "");
}

function mapInvoice(row: Record<string, unknown>): SupplierInvoice {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    supplierId: String(row.supplier_id),
    supplierName: relatedName(row.supplier),
    storeId: str(row.store_id),
    purchaseId: str(row.purchase_id),
    source: String(row.source ?? "manual") as SupplierInvoiceSource,
    invoiceNumber: str(row.invoice_number),
    label: str(row.label),
    invoiceDate: String(row.invoice_date ?? ""),
    dueDate: String(row.due_date ?? ""),
    amount: toNum(row.amount),
    paidAmount: toNum(row.paid_amount),
    status: String(row.status ?? "open") as SupplierInvoiceStatus,
    notes: str(row.notes),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/**
 * Dettes de l'entreprise. Par défaut on ne remonte que ce qui reste à payer :
 * c'est la question qui compte (« qu'est-ce que je dois ? »). `includeSettled`
 * ajoute l'historique soldé pour le relevé d'un fournisseur.
 */
export async function listSupplierInvoices(params: {
  companyId: string;
  supplierId?: string | null;
  includeSettled?: boolean;
  includeCancelled?: boolean;
}): Promise<SupplierInvoice[]> {
  const supabase = createClient();
  let q = supabase
    .from("supplier_invoices")
    .select(INVOICE_FIELDS)
    .eq("company_id", params.companyId)
    .order("due_date", { ascending: true });

  if (params.supplierId) q = q.eq("supplier_id", params.supplierId);

  const statuses: SupplierInvoiceStatus[] = params.includeSettled
    ? ["open", "partially_paid", "paid"]
    : ["open", "partially_paid"];
  if (params.includeCancelled) statuses.push("cancelled");
  q = q.in("status", statuses);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapInvoice(r as Record<string, unknown>));
}

export async function saveSupplierInvoice(
  companyId: string,
  input: SupplierInvoiceFormInput,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("supplier_invoice_save", {
    p_id: input.id,
    p_company_id: companyId,
    p_supplier_id: input.supplierId,
    p_store_id: input.storeId,
    p_invoice_number: input.invoiceNumber.trim() || null,
    p_label: input.label.trim() || null,
    p_invoice_date: input.invoiceDate,
    p_due_date: input.dueDate,
    p_amount: input.amount,
    p_notes: input.notes.trim() || null,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function cancelSupplierInvoice(id: string, cancel = true): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("supplier_invoice_cancel", {
    p_id: id,
    p_cancel: cancel,
  });
  if (error) throw error;
}

export async function deleteSupplierInvoice(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("supplier_invoice_delete", { p_id: id });
  if (error) throw error;
}

// ─────────────────────────────── Règlements ───────────────────────────────

const PAYMENT_FIELDS =
  "id, company_id, supplier_id, store_id, amount, method, paid_at, reference, notes, source, created_at, supplier:suppliers(name), allocations:supplier_payment_allocations(amount)";

function mapPayment(row: Record<string, unknown>): SupplierPayment {
  const allocs = (row.allocations ?? []) as { amount: unknown }[];
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    supplierId: String(row.supplier_id),
    supplierName: relatedName(row.supplier),
    storeId: str(row.store_id),
    amount: toNum(row.amount),
    allocatedAmount: allocs.reduce((acc, a) => acc + toNum(a.amount), 0),
    method: String(row.method ?? "cash") as SupplierPaymentMethod,
    paidAt: String(row.paid_at ?? ""),
    reference: str(row.reference),
    notes: str(row.notes),
    source: String(row.source ?? "manual") === "purchase" ? "purchase" : "manual",
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listSupplierPayments(params: {
  companyId: string;
  supplierId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}): Promise<SupplierPayment[]> {
  const supabase = createClient();
  let q = supabase
    .from("supplier_payments")
    .select(PAYMENT_FIELDS)
    .eq("company_id", params.companyId)
    .order("paid_at", { ascending: false })
    .limit(params.limit ?? 500);

  if (params.supplierId) q = q.eq("supplier_id", params.supplierId);
  if (params.from) q = q.gte("paid_at", `${params.from}T00:00:00`);
  if (params.to) q = q.lte("paid_at", `${params.to}T23:59:59.999`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapPayment(r as Record<string, unknown>));
}

export async function listSupplierAllocations(
  companyId: string,
  supplierId: string,
): Promise<SupplierAllocation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("supplier_payment_allocations")
    .select("id, payment_id, invoice_id, amount")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      paymentId: String(row.payment_id),
      invoiceId: String(row.invoice_id),
      amount: toNum(row.amount),
    };
  });
}

export async function recordSupplierPayment(
  companyId: string,
  input: SupplierPaymentFormInput,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("record_supplier_payment", {
    p_company_id: companyId,
    p_supplier_id: input.supplierId,
    p_amount: input.amount,
    p_method: input.method,
    p_paid_at: input.paidAt,
    p_reference: input.reference.trim() || null,
    p_notes: input.notes.trim() || null,
    p_store_id: input.storeId,
    p_allocations: input.allocations
      ? input.allocations
          .filter((a) => a.amount > 0)
          .map((a) => ({ invoice_id: a.invoiceId, amount: a.amount }))
      : null,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function deleteSupplierPayment(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_supplier_payment", { p_id: id });
  if (error) throw error;
}

/** Impute l'avance disponible sur les dettes ouvertes ; renvoie le montant appliqué. */
export async function applySupplierCredit(
  companyId: string,
  supplierId: string,
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("supplier_apply_credit", {
    p_company_id: companyId,
    p_supplier_id: supplierId,
  });
  if (error) throw error;
  return toNum(data);
}
