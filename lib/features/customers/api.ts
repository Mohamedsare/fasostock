"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { createClient } from "@/lib/supabase/client";
import type { Customer, CustomerFormInput } from "./types";

const FIELDS =
  "id, company_id, name, type, phone, email, address, notes, created_at, updated_at";

export async function listCustomers(companyId: string): Promise<Customer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(FIELDS)
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Customer[];
}

/** Retourne l’`id` du client créé (en ligne) ; `null` si file d’attente hors ligne. */
export async function createCustomer(
  companyId: string,
  input: CustomerFormInput,
): Promise<string | null> {
  const payload = {
    company_id: companyId,
    name: input.name.trim(),
    type: input.type,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("customer_create", payload);
    return null;
  }
  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id?: string } | null)?.id ?? null;
}

export async function updateCustomer(
  id: string,
  input: CustomerFormInput,
): Promise<void> {
  const patch = {
    name: input.name.trim(),
    type: input.type,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("customer_update", { id, patch });
    return;
  }
  const { error } = await supabase.from("customers").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<void> {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("customer_delete", { id });
    return;
  }
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

