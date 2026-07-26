"use client";

import { UserFriendlyError } from "@/lib/errors/app-error-mapper";
import { createClient } from "@/lib/supabase/client";
import type {
  RentalCharge,
  RentalChargeCategory,
  RentalChargeInput,
  RentalFrequency,
  RentalInvoice,
  RentalLease,
  RentalLeaseInput,
  RentalLeaseStatus,
  RentalPayment,
  RentalPaymentKind,
  RentalPaymentMethod,
  RentalPaymentResult,
  RentalProperty,
  RentalPropertyInput,
  RentalPropertyKind,
  RentalStats,
  RentalTenant,
  RentalTenantInput,
  RentalUnit,
  RentalUnitInput,
} from "./types";

/**
 * Les RPC du module lèvent des messages métier explicites (« Ce lot est déjà
 * occupé… »). Le mapper générique les remplacerait par un texte passe-partout :
 * on les repackage pour que l'utilisateur lise la vraie raison.
 */
function rpcError(error: { message?: string } | null, fallback: string): Error {
  const msg = String(error?.message ?? "").trim();
  return new UserFriendlyError(msg.length > 0 ? msg : fallback);
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function intOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length > 0 ? s : null;
}

type Row = Record<string, unknown>;

/**
 * Garde-fou commun : sans session valide, une requête RLS renverrait 0 ligne SANS
 * erreur. On lève plutôt pour que TanStack garde les données précédentes et réessaie.
 */
async function assertSession(): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session non prête — nouvelle tentative en cours.");
}

// ── Baux ────────────────────────────────────────────────────────────────────

function mapLease(row: Row): RentalLease {
  return {
    id: String(row.id),
    leaseNumber: String(row.lease_number ?? ""),
    storeId: String(row.store_id ?? ""),
    propertyId: String(row.property_id ?? ""),
    propertyName: String(row.property_name ?? ""),
    propertyKind: (String(row.property_kind ?? "house") as RentalPropertyKind),
    propertyAddress: str(row.property_address),
    unitId: String(row.unit_id ?? ""),
    unitLabel: String(row.unit_label ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    tenantName: String(row.tenant_name ?? ""),
    tenantPhone: str(row.tenant_phone),
    startDate: String(row.start_date ?? ""),
    endDate: str(row.end_date),
    endedAt: str(row.ended_at),
    endReason: str(row.end_reason),
    rentAmount: num(row.rent_amount),
    depositAmount: num(row.deposit_amount),
    frequency: (String(row.frequency ?? "monthly") as RentalFrequency),
    graceDays: Math.max(0, Math.trunc(num(row.grace_days))),
    status: (String(row.status ?? "active") as RentalLeaseStatus),
    notes: str(row.notes),
    createdAt: String(row.created_at ?? ""),
    totalDue: num(row.total_due),
    totalPaid: num(row.total_paid),
    balance: num(row.balance),
    depositPaid: num(row.deposit_paid),
    invoiceCount: Math.trunc(num(row.invoice_count)),
    unpaidCount: Math.trunc(num(row.unpaid_count)),
    lateCount: Math.trunc(num(row.late_count)),
    nextDueDate: str(row.next_due_date),
    paidThrough: str(row.paid_through),
    lastPaymentAt: str(row.last_payment_at),
  };
}

export async function listRentalLeases(params: {
  companyId: string;
  storeId: string | null;
}): Promise<RentalLease[]> {
  await assertSession();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_leases_list", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
  });
  if (error) throw rpcError(error, "Chargement des baux impossible.");
  return ((data ?? []) as Row[]).map(mapLease);
}

export async function saveRentalLease(input: RentalLeaseInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_lease_save", {
    p_id: input.id ?? null,
    p_company_id: input.companyId,
    p_store_id: input.storeId,
    p_unit_id: input.unitId,
    p_tenant_id: input.tenantId,
    p_start_date: input.startDate,
    p_rent_amount: input.rentAmount,
    p_deposit_amount: input.depositAmount ?? 0,
    p_end_date: input.endDate ?? null,
    p_frequency: input.frequency ?? "monthly",
    p_grace_days: input.graceDays ?? 0,
    p_notes: input.notes ?? null,
  });
  if (error) throw rpcError(error, "Enregistrement du bail impossible.");
  return String(data ?? "");
}

/** Clôture d'un bail (départ du locataire) — le lot redevient disponible. */
export async function endRentalLease(params: {
  leaseId: string;
  endedAt?: string | null;
  reason?: string | null;
  terminated?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rental_lease_end", {
    p_lease_id: params.leaseId,
    p_ended_at: params.endedAt ?? null,
    p_reason: params.reason ?? null,
    p_status: params.terminated ? "terminated" : "ended",
  });
  if (error) throw rpcError(error, "Clôture du bail impossible.");
}

export async function reopenRentalLease(leaseId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rental_lease_reopen", { p_lease_id: leaseId });
  if (error) throw rpcError(error, "Réactivation du bail impossible.");
}

export async function deleteRentalLease(leaseId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rental_lease_delete", { p_lease_id: leaseId });
  if (error) throw rpcError(error, "Suppression du bail impossible.");
}

// ── Échéancier & encaissements ──────────────────────────────────────────────

export async function listRentalSchedule(leaseId: string): Promise<RentalInvoice[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_lease_schedule", {
    p_lease_id: leaseId,
  });
  if (error) throw rpcError(error, "Chargement de l'échéancier impossible.");
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    periodStart: String(row.period_start ?? ""),
    periodEnd: String(row.period_end ?? ""),
    dueDate: String(row.due_date ?? ""),
    amountDue: num(row.amount_due),
    amountPaid: num(row.amount_paid),
    label: str(row.label),
    status: (String(row.status ?? "open") as RentalInvoice["status"]),
  }));
}

export async function listRentalPayments(leaseId: string): Promise<RentalPayment[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_lease_payments", {
    p_lease_id: leaseId,
  });
  if (error) throw rpcError(error, "Chargement des encaissements impossible.");
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    kind: (String(row.kind ?? "rent") as RentalPaymentKind),
    amount: num(row.amount),
    method: (str(row.method) as RentalPaymentMethod | null) ?? null,
    paidAt: String(row.paid_at ?? ""),
    reference: str(row.reference),
    note: str(row.note),
    receiptNumber: str(row.receipt_number),
    createdAt: String(row.created_at ?? ""),
    createdByName: str(row.created_by_name),
  }));
}

/** Encaisse un règlement et retourne le numéro de ticket à imprimer. */
export async function addRentalPayment(params: {
  leaseId: string;
  amount: number;
  method: RentalPaymentMethod;
  kind?: RentalPaymentKind;
  paidAt?: string | null;
  reference?: string | null;
  note?: string | null;
}): Promise<RentalPaymentResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_payment_add", {
    p_lease_id: params.leaseId,
    p_amount: params.amount,
    p_method: params.method,
    p_kind: params.kind ?? "rent",
    p_paid_at: params.paidAt ?? null,
    p_reference: params.reference ?? null,
    p_note: params.note ?? null,
  });
  if (error) throw rpcError(error, "Encaissement impossible.");
  const row = (Array.isArray(data) ? data[0] : data) as Row | null;
  return {
    paymentId: String(row?.payment_id ?? ""),
    receiptNumber: String(row?.receipt_number ?? ""),
    balance: num(row?.balance),
  };
}

export async function deleteRentalPayment(paymentId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rental_payment_delete", {
    p_payment_id: paymentId,
  });
  if (error) throw rpcError(error, "Suppression de l'encaissement impossible.");
}

/**
 * Génère les échéances dues de tous les baux actifs (appelé à l'ouverture de la
 * page et par le bouton « Actualiser »). Retourne le nombre d'échéances créées.
 */
export async function generateRentalInvoices(params: {
  companyId: string;
  storeId: string | null;
}): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_invoices_generate", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_up_to: null,
  });
  if (error) throw rpcError(error, "Mise à jour des échéances impossible.");
  return Math.trunc(num(data));
}

// ── Biens ───────────────────────────────────────────────────────────────────

export async function listRentalProperties(params: {
  companyId: string;
  storeId: string | null;
}): Promise<RentalProperty[]> {
  await assertSession();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_properties_list", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
  });
  if (error) throw rpcError(error, "Chargement des biens impossible.");
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    storeId: String(row.store_id ?? ""),
    name: String(row.name ?? ""),
    kind: (String(row.kind ?? "house") as RentalPropertyKind),
    address: str(row.address),
    city: str(row.city),
    district: str(row.district),
    description: str(row.description),
    notes: str(row.notes),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ""),
    unitsCount: Math.trunc(num(row.units_count)),
    occupiedCount: Math.trunc(num(row.occupied_count)),
    vacantCount: Math.trunc(num(row.vacant_count)),
    monthlyExpected: num(row.monthly_expected),
    monthlyPotential: num(row.monthly_potential),
    outstanding: num(row.outstanding),
    chargesTotal: num(row.charges_total),
  }));
}

export async function saveRentalProperty(input: RentalPropertyInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_property_save", {
    p_id: input.id ?? null,
    p_company_id: input.companyId,
    p_store_id: input.storeId,
    p_name: input.name,
    p_kind: input.kind,
    p_address: input.address ?? null,
    p_city: input.city ?? null,
    p_district: input.district ?? null,
    p_description: input.description ?? null,
    p_notes: input.notes ?? null,
    p_is_active: input.isActive ?? true,
  });
  if (error) throw rpcError(error, "Enregistrement du bien impossible.");
  return String(data ?? "");
}

export async function deleteRentalProperty(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rental_property_delete", { p_id: id });
  if (error) throw rpcError(error, "Suppression du bien impossible.");
}

// ── Lots ────────────────────────────────────────────────────────────────────

export async function listRentalUnits(params: {
  companyId: string;
  storeId: string | null;
}): Promise<RentalUnit[]> {
  await assertSession();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_units_list", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
  });
  if (error) throw rpcError(error, "Chargement des lots impossible.");
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    propertyId: String(row.property_id ?? ""),
    propertyName: String(row.property_name ?? ""),
    label: String(row.label ?? ""),
    floor: str(row.floor),
    rooms: intOrNull(row.rooms),
    bathrooms: intOrNull(row.bathrooms),
    surfaceM2: numOrNull(row.surface_m2),
    baseRent: num(row.base_rent),
    baseDeposit: num(row.base_deposit),
    description: str(row.description),
    isActive: row.is_active !== false,
    activeLeaseId: str(row.active_lease_id),
    tenantName: str(row.tenant_name),
    currentRent: numOrNull(row.current_rent),
  }));
}

export async function saveRentalUnit(input: RentalUnitInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_unit_save", {
    p_id: input.id ?? null,
    p_property_id: input.propertyId,
    p_label: input.label,
    p_base_rent: input.baseRent,
    p_base_deposit: input.baseDeposit ?? 0,
    p_floor: input.floor ?? null,
    p_rooms: input.rooms ?? null,
    p_bathrooms: input.bathrooms ?? null,
    p_surface_m2: input.surfaceM2 ?? null,
    p_description: input.description ?? null,
    p_is_active: input.isActive ?? true,
  });
  if (error) throw rpcError(error, "Enregistrement du lot impossible.");
  return String(data ?? "");
}

export async function deleteRentalUnit(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rental_unit_delete", { p_id: id });
  if (error) throw rpcError(error, "Suppression du lot impossible.");
}

// ── Locataires ──────────────────────────────────────────────────────────────

export async function listRentalTenants(companyId: string): Promise<RentalTenant[]> {
  await assertSession();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_tenants_list", {
    p_company_id: companyId,
  });
  if (error) throw rpcError(error, "Chargement des locataires impossible.");
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name ?? ""),
    phone: str(row.phone),
    phone2: str(row.phone2),
    email: str(row.email),
    idType: str(row.id_type),
    idNumber: str(row.id_number),
    profession: str(row.profession),
    employer: str(row.employer),
    emergencyName: str(row.emergency_name),
    emergencyPhone: str(row.emergency_phone),
    address: str(row.address),
    notes: str(row.notes),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ""),
    activeLeases: Math.trunc(num(row.active_leases)),
    totalBalance: num(row.total_balance),
  }));
}

export async function saveRentalTenant(input: RentalTenantInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_tenant_save", {
    p_id: input.id ?? null,
    p_company_id: input.companyId,
    p_store_id: input.storeId,
    p_full_name: input.fullName,
    p_phone: input.phone ?? null,
    p_phone2: input.phone2 ?? null,
    p_email: input.email ?? null,
    p_id_type: input.idType ?? null,
    p_id_number: input.idNumber ?? null,
    p_profession: input.profession ?? null,
    p_employer: input.employer ?? null,
    p_emergency_name: input.emergencyName ?? null,
    p_emergency_phone: input.emergencyPhone ?? null,
    p_address: input.address ?? null,
    p_notes: input.notes ?? null,
    p_is_active: input.isActive ?? true,
  });
  if (error) throw rpcError(error, "Enregistrement du locataire impossible.");
  return String(data ?? "");
}

export async function deleteRentalTenant(params: {
  id: string;
  storeId: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rental_tenant_delete", {
    p_id: params.id,
    p_store_id: params.storeId,
  });
  if (error) throw rpcError(error, "Suppression du locataire impossible.");
}

// ── Charges ─────────────────────────────────────────────────────────────────

export async function listRentalCharges(params: {
  companyId: string;
  storeId: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<RentalCharge[]> {
  await assertSession();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_charges_list", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
  });
  if (error) throw rpcError(error, "Chargement des charges impossible.");
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    propertyId: String(row.property_id ?? ""),
    propertyName: String(row.property_name ?? ""),
    unitId: str(row.unit_id),
    unitLabel: str(row.unit_label),
    label: String(row.label ?? ""),
    category: (String(row.category ?? "other") as RentalChargeCategory),
    amount: num(row.amount),
    spentOn: String(row.spent_on ?? ""),
    method: (str(row.method) as RentalPaymentMethod | null) ?? null,
    note: str(row.note),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function saveRentalCharge(input: RentalChargeInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_charge_save", {
    p_id: input.id ?? null,
    p_property_id: input.propertyId,
    p_label: input.label,
    p_amount: input.amount,
    p_category: input.category,
    p_spent_on: input.spentOn ?? null,
    p_unit_id: input.unitId ?? null,
    p_method: input.method ?? "cash",
    p_note: input.note ?? null,
  });
  if (error) throw rpcError(error, "Enregistrement de la charge impossible.");
  return String(data ?? "");
}

export async function deleteRentalCharge(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("rental_charge_delete", { p_id: id });
  if (error) throw rpcError(error, "Suppression de la charge impossible.");
}

// ── Indicateurs ─────────────────────────────────────────────────────────────

export async function fetchRentalStats(params: {
  companyId: string;
  storeId: string | null;
  month?: string | null;
}): Promise<RentalStats> {
  await assertSession();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_stats", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_month: params.month ?? null,
  });
  if (error) throw rpcError(error, "Chargement des indicateurs impossible.");
  const row = (Array.isArray(data) ? data[0] : data) as Row | null;
  return {
    monthStart: String(row?.month_start ?? ""),
    propertiesCount: Math.trunc(num(row?.properties_count)),
    unitsCount: Math.trunc(num(row?.units_count)),
    occupiedUnits: Math.trunc(num(row?.occupied_units)),
    vacantUnits: Math.max(0, Math.trunc(num(row?.vacant_units))),
    activeLeases: Math.trunc(num(row?.active_leases)),
    tenantsCount: Math.trunc(num(row?.tenants_count)),
    expectedMonth: num(row?.expected_month),
    collectedMonth: num(row?.collected_month),
    chargesMonth: num(row?.charges_month),
    outstandingTotal: num(row?.outstanding_total),
    lateLeases: Math.trunc(num(row?.late_leases)),
    depositsHeld: num(row?.deposits_held),
    collectedYear: num(row?.collected_year),
  };
}
