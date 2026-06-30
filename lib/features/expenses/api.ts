"use client";

import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseFormInput } from "./types";

const FIELDS =
  "id, company_id, store_id, category, label, amount, payment_method, payee, reference, expense_date, notes, created_at, updated_at";

function normalize(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    store_id: row.store_id != null ? String(row.store_id) : null,
    category: String(row.category ?? "autre"),
    label: row.label != null ? String(row.label) : null,
    amount: Math.max(0, Number(row.amount ?? 0)),
    payment_method: String(row.payment_method ?? "cash"),
    payee: row.payee != null ? String(row.payee) : null,
    reference: row.reference != null ? String(row.reference) : null,
    expense_date: String(row.expense_date),
    notes: row.notes != null ? String(row.notes) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Liste des dépenses d'une entreprise sur une plage de dates (incluse). */
export async function listExpenses(
  companyId: string,
  fromDate: string,
  toDate: string,
): Promise<Expense[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(FIELDS)
    .eq("company_id", companyId)
    .gte("expense_date", fromDate)
    .lte("expense_date", toDate)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalize);
}

function toPayload(companyId: string, input: ExpenseFormInput) {
  return {
    company_id: companyId,
    store_id: input.storeId || null,
    category: input.category.trim() || "autre",
    label: input.label.trim() || null,
    amount: Math.max(0, Math.round(input.amount * 100) / 100),
    payment_method: input.paymentMethod.trim() || "cash",
    payee: input.payee.trim() || null,
    reference: input.reference.trim() || null,
    expense_date: input.expenseDate,
    notes: input.notes.trim() || null,
  };
}

export async function createExpense(
  companyId: string,
  input: ExpenseFormInput,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("expenses").insert(toPayload(companyId, input));
  if (error) throw error;
}

export async function updateExpense(
  id: string,
  companyId: string,
  input: ExpenseFormInput,
): Promise<void> {
  const supabase = createClient();
  const { company_id: _omit, ...patch } = toPayload(companyId, input);
  void _omit;
  const { error } = await supabase.from("expenses").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
