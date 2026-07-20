"use client";

import { createClient } from "@/lib/supabase/client";
import {
  EMPTY_REGISTRATION,
  deriveRegistrationStep,
  type EngineRegistration,
  type EngineRegistrationListItem,
} from "./types";

function nn(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length > 0 ? v : null;
}

function sumPayments(raw: unknown): number {
  const arr = Array.isArray(raw) ? raw : [];
  // Exclut les lignes 'other' (solde « à crédit » POS) — cohérent avec la page Crédit.
  return arr.reduce((s, p) => {
    const r = p as { amount?: unknown; method?: unknown };
    if (String(r.method ?? "") === "other") return s;
    return s + Number(r.amount ?? 0);
  }, 0);
}

function mapRegistration(raw: Record<string, unknown> | null): EngineRegistration {
  if (!raw) return { ...EMPTY_REGISTRATION };
  return {
    cmcAvailable: raw.cmc_available === true,
    cmcNumber: (raw.cmc_number as string | null) ?? null,
    cmcDate: (raw.cmc_date as string | null) ?? null,
    wwNumber: (raw.ww_number as string | null) ?? null,
    wwDate: (raw.ww_date as string | null) ?? null,
    wwDelivered: raw.ww_delivered === true,
    wwDeliveredDate: (raw.ww_delivered_date as string | null) ?? null,
    wwDeliveredBy: (raw.ww_delivered_by as string | null) ?? null,
    wwReceivedBy: (raw.ww_received_by as string | null) ?? null,
    depositDate: (raw.deposit_date as string | null) ?? null,
    depositReference: (raw.deposit_reference as string | null) ?? null,
    recepisseNumber: (raw.recepisse_number as string | null) ?? null,
    recepisseDate: (raw.recepisse_date as string | null) ?? null,
    recepisseDelivered: raw.recepisse_delivered === true,
    recepisseDeliveredDate: (raw.recepisse_delivered_date as string | null) ?? null,
    recepisseDeliveredBy: (raw.recepisse_delivered_by as string | null) ?? null,
    recepisseReceivedBy: (raw.recepisse_received_by as string | null) ?? null,
    carteGriseNumber: (raw.carte_grise_number as string | null) ?? null,
    carteGriseDate: (raw.carte_grise_date as string | null) ?? null,
    carteGriseDelivered: raw.carte_grise_delivered === true,
    carteGriseDeliveredBy: (raw.carte_grise_delivered_by as string | null) ?? null,
    carteGriseReceivedBy: (raw.carte_grise_received_by as string | null) ?? null,
    deliveredToClientDate: (raw.delivered_to_client_date as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
  };
}

/**
 * Liste des dossiers d'immatriculation = ventes d'engins non annulées + paiement + dossier.
 * (Un dossier par vente ; la ligne `engine_registrations` peut ne pas exister encore.)
 */
export async function listEngineRegistrations(params: {
  companyId: string;
  storeId: string | null;
}): Promise<EngineRegistrationListItem[]> {
  const supabase = createClient();
  // Garde-fou RLS : sans session, la requête renverrait 0 ligne SANS erreur (piège RLS) —
  // on lève une erreur pour que TanStack conserve les données précédentes et réessaie.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session non prête — nouvelle tentative en cours.");

  let q = supabase
    .from("sales")
    .select(
      "id, sale_number, created_at, total, status, store_id, sale_payments(method, amount), engine_sale_details(client_name, client_phone1, engine_designation, engine_chassis), engine_registrations(*)",
    )
    .eq("company_id", params.companyId)
    .eq("sale_kind", "engine")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(500);
  if (params.storeId) q = q.eq("store_id", params.storeId);
  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const det = Array.isArray(r.engine_sale_details)
      ? (r.engine_sale_details[0] as Record<string, string | null> | undefined) ?? null
      : (r.engine_sale_details as Record<string, string | null> | null);
    const regRaw = Array.isArray(r.engine_registrations)
      ? (r.engine_registrations[0] as Record<string, unknown> | undefined) ?? null
      : (r.engine_registrations as Record<string, unknown> | null);
    const registration = mapRegistration(regRaw);
    const total = Number(r.total ?? 0);
    const amountPaid = sumPayments(r.sale_payments);
    const remaining = Math.max(0, total - amountPaid);
    const paid = amountPaid >= total - 0.5 && total > 0;
    return {
      saleId: String(r.id),
      saleNumber: String(r.sale_number ?? r.id),
      createdAt: String(r.created_at ?? ""),
      storeId: String(r.store_id ?? ""),
      saleStatus: String(r.status ?? ""),
      clientName: det?.client_name ?? null,
      clientPhone: det?.client_phone1 ?? null,
      engineDesignation: det?.engine_designation ?? null,
      engineChassis: det?.engine_chassis ?? null,
      total,
      amountPaid,
      remaining,
      paid,
      registration,
      step: deriveRegistrationStep(registration, paid),
    };
  });
}

/** Enregistre (upsert) le dossier d'immatriculation d'une vente d'engin. */
export async function upsertEngineRegistration(params: {
  saleId: string;
  companyId: string;
  registration: EngineRegistration;
}): Promise<void> {
  const supabase = createClient();
  const reg = params.registration;
  const { error } = await supabase.from("engine_registrations").upsert(
    {
      sale_id: params.saleId,
      company_id: params.companyId,
      cmc_available: reg.cmcAvailable,
      cmc_number: nn(reg.cmcNumber),
      cmc_date: nn(reg.cmcDate),
      ww_number: nn(reg.wwNumber),
      ww_date: nn(reg.wwDate),
      ww_delivered: reg.wwDelivered,
      ww_delivered_date: nn(reg.wwDeliveredDate),
      ww_delivered_by: nn(reg.wwDeliveredBy),
      ww_received_by: nn(reg.wwReceivedBy),
      deposit_date: nn(reg.depositDate),
      deposit_reference: nn(reg.depositReference),
      recepisse_number: nn(reg.recepisseNumber),
      recepisse_date: nn(reg.recepisseDate),
      recepisse_delivered: reg.recepisseDelivered,
      recepisse_delivered_date: nn(reg.recepisseDeliveredDate),
      recepisse_delivered_by: nn(reg.recepisseDeliveredBy),
      recepisse_received_by: nn(reg.recepisseReceivedBy),
      carte_grise_number: nn(reg.carteGriseNumber),
      carte_grise_date: nn(reg.carteGriseDate),
      carte_grise_delivered: reg.carteGriseDelivered,
      carte_grise_delivered_by: nn(reg.carteGriseDeliveredBy),
      carte_grise_received_by: nn(reg.carteGriseReceivedBy),
      delivered_to_client_date: nn(reg.deliveredToClientDate),
      notes: nn(reg.notes),
    },
    { onConflict: "sale_id" },
  );
  if (error) throw error;
}
