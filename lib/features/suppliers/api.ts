"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { createClient } from "@/lib/supabase/client";
import type { Supplier, SupplierFormInput } from "./types";

const FIELDS =
  "id, company_id, name, contact, phone, email, address, notes, created_at, updated_at";

export async function listSuppliers(companyId: string): Promise<Supplier[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(FIELDS)
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Supplier[];
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

