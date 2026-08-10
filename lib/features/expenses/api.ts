"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import { fetchCreatorLabels } from "@/lib/features/users/creator-labels";
import type { CustomExpenseCategory, Expense, ExpenseFormInput } from "./types";

const FIELDS =
  "id, company_id, store_id, category, category_id, label, amount, payment_method, payee, reference, expense_date, notes, created_by, created_at, updated_at";

function normalize(
  row: Record<string, unknown>,
  authorByUser: Map<string, string>,
): Expense {
  const createdBy = row.created_by != null ? String(row.created_by) : null;
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    store_id: row.store_id != null ? String(row.store_id) : null,
    category: String(row.category ?? "autre"),
    category_id: row.category_id != null ? String(row.category_id) : null,
    label: row.label != null ? String(row.label) : null,
    amount: Math.max(0, Number(row.amount ?? 0)),
    payment_method: String(row.payment_method ?? "cash"),
    payee: row.payee != null ? String(row.payee) : null,
    reference: row.reference != null ? String(row.reference) : null,
    expense_date: String(row.expense_date),
    notes: row.notes != null ? String(row.notes) : null,
    created_by: createdBy,
    created_by_label: createdBy ? (authorByUser.get(createdBy) ?? null) : null,
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
  if (error) throw mapSupabaseError(error);

  // « Qui a enregistré quoi » : une seule requête `profiles` pour toute la liste.
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const authorIds = rows
    .map((r) => (r.created_by != null ? String(r.created_by) : null))
    .filter((id): id is string => Boolean(id));
  const authorByUser = await fetchCreatorLabels(supabase, authorIds);
  return rows.map((r) => normalize(r, authorByUser));
}

function toPayload(companyId: string, input: ExpenseFormInput) {
  return {
    company_id: companyId,
    store_id: input.storeId || null,
    // Un poste personnalisé n'a pas d'équivalent SYSCOHADA connu d'avance : la
    // catégorie standard retombe sur « autre » (compte 605), le poste vit dans
    // `category_id`. Voir la migration 00182.
    category: input.categoryId ? "autre" : input.category.trim() || "autre",
    category_id: input.categoryId || null,
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
  if (error) throw mapSupabaseError(error);
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
  if (error) throw mapSupabaseError(error);
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// « Personnaliser mes dépenses » — les postes de l'entreprise
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_FIELDS = "id, company_id, name, position, is_active";

function normalizeCategory(row: Record<string, unknown>): CustomExpenseCategory {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name ?? "").trim(),
    position: Number(row.position ?? 0),
    isActive: row.is_active !== false,
  };
}

/**
 * Postes de dépense de l'entreprise. `includeArchived` sert à l'affichage de
 * l'historique : un poste retiré doit rester lisible sur les dépenses passées.
 */
export async function listExpenseCategories(
  companyId: string,
  options?: { includeArchived?: boolean },
): Promise<CustomExpenseCategory[]> {
  const supabase = createClient();
  let q = supabase
    .from("expense_categories")
    .select(CATEGORY_FIELDS)
    .eq("company_id", companyId);
  if (!options?.includeArchived) q = q.eq("is_active", true);
  const { data, error } = await q
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeCategory);
}

export async function createExpenseCategory(params: {
  companyId: string;
  name: string;
  position: number;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("expense_categories").insert({
    company_id: params.companyId,
    name: params.name.trim(),
    position: params.position,
  });
  if (error) throw mapSupabaseError(error);
}

export async function renameExpenseCategory(
  id: string,
  name: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/**
 * Retirer un poste = l'archiver. Les dépenses qui le portent gardent leur poste et
 * restent lisibles ; il disparaît seulement du formulaire de saisie.
 */
export async function setExpenseCategoryActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Réglage entreprise « Personnaliser mes dépenses » — écrit par le propriétaire. */
export async function setCustomExpensesEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_custom_expenses_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw mapSupabaseError(error);
}
