"use client";

import { UserFriendlyError } from "@/lib/errors/app-error-mapper";
import { createClient } from "@/lib/supabase/client";
import type {
  ProgressiveCancellationResult,
  ProgressiveConversionResult,
  ProgressiveLedgerEntry,
  ProgressiveLedgerKind,
  ProgressiveMovementResult,
  ProgressivePaymentMethod,
  ProgressivePlan,
  ProgressivePlanInput,
  ProgressivePlanStatus,
} from "./types";

/**
 * Les RPC de ce module lèvent des messages métier explicites (« remboursez d'abord
 * le solde… »). Le mapper d'erreurs générique les remplacerait par un texte passe-partout :
 * on les repackage en `UserFriendlyError` pour que l'utilisateur lise la vraie raison.
 */
function rpcError(error: { message?: string } | null, fallback: string): Error {
  const msg = String(error?.message ?? "").trim();
  return new UserFriendlyError(msg.length > 0 ? msg : fallback);
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length > 0 ? s : null;
}

function mapPlan(row: Record<string, unknown>): ProgressivePlan {
  return {
    id: String(row.id),
    planNumber: String(row.plan_number ?? ""),
    storeId: String(row.store_id ?? ""),
    customerId: str(row.customer_id),
    clientName: String(row.client_name ?? ""),
    clientPhone: str(row.client_phone),
    clientIdType: str(row.client_id_type),
    clientIdNumber: str(row.client_id_number),
    clientAddress: str(row.client_address),
    targetProductId: str(row.target_product_id),
    targetProductName: str(row.target_product_name),
    targetProductPrice: row.target_product_price != null ? num(row.target_product_price) : null,
    targetAmount: row.target_amount != null ? num(row.target_amount) : null,
    status: (String(row.status ?? "open") as ProgressivePlanStatus),
    convertedSaleId: str(row.converted_sale_id),
    convertedSaleNumber: str(row.converted_sale_number),
    convertedAt: str(row.converted_at),
    notes: str(row.notes),
    createdAt: String(row.created_at ?? ""),
    depositCount: Math.max(0, Math.trunc(num(row.deposit_count))),
    totalDeposited: num(row.total_deposited),
    totalRefunded: num(row.total_refunded),
    totalSettled: num(row.total_settled),
    balance: num(row.balance),
    firstDepositAt: str(row.first_deposit_at),
    lastDepositAt: str(row.last_deposit_at),
  };
}

/**
 * Dossiers d'achat progressif d'une entreprise (option : une seule boutique).
 *
 * Garde-fou RLS identique aux autres écrans : sans session valide la requête
 * renverrait 0 ligne SANS erreur — on lève plutôt une erreur pour que TanStack
 * conserve les données précédentes et réessaie.
 */
export async function listProgressivePlans(params: {
  companyId: string;
  storeId: string | null;
}): Promise<ProgressivePlan[]> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session non prête — nouvelle tentative en cours.");

  const { data, error } = await supabase.rpc("progressive_plans_list", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
  });
  if (error) throw rpcError(error, "Chargement des dossiers impossible.");
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapPlan);
}

/** Relevé complet d'un dossier (versements, remboursements, consommation). */
export async function listProgressiveLedger(
  planId: string,
): Promise<ProgressiveLedgerEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("progressive_ledger_list", {
    p_plan_id: planId,
  });
  if (error) throw rpcError(error, "Chargement du relevé impossible.");
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    kind: String(row.kind ?? "deposit") as ProgressiveLedgerKind,
    amount: num(row.amount),
    method: (str(row.method) as ProgressivePaymentMethod | null) ?? null,
    reference: str(row.reference),
    note: str(row.note),
    receiptNumber: str(row.receipt_number),
    saleId: str(row.sale_id),
    createdAt: String(row.created_at ?? ""),
    createdByName: str(row.created_by_name),
  }));
}

/** Création (id absent) ou modification d'un dossier. Retourne l'id du dossier. */
export async function saveProgressivePlan(input: ProgressivePlanInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("progressive_plan_save", {
    p_id: input.id ?? null,
    p_company_id: input.companyId,
    p_store_id: input.storeId,
    p_client_name: input.clientName,
    p_client_phone: input.clientPhone ?? null,
    p_client_id_type: input.clientIdType ?? null,
    p_client_id_number: input.clientIdNumber ?? null,
    p_client_address: input.clientAddress ?? null,
    p_target_product_id: input.targetProductId ?? null,
    p_target_amount: input.targetAmount ?? null,
    p_notes: input.notes ?? null,
    p_customer_id: input.customerId ?? null,
  });
  if (error) throw rpcError(error, "Enregistrement du dossier impossible.");
  return String(data ?? "");
}

function mapMovement(data: unknown): ProgressiveMovementResult {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    ledgerId: String(row?.ledger_id ?? ""),
    receiptNumber: String(row?.receipt_number ?? ""),
    balance: num(row?.balance),
  };
}

/** Enregistre une avance du client et retourne le numéro de ticket à imprimer. */
export async function addProgressiveDeposit(params: {
  planId: string;
  amount: number;
  method: ProgressivePaymentMethod;
  reference?: string | null;
  note?: string | null;
}): Promise<ProgressiveMovementResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("progressive_deposit_add", {
    p_plan_id: params.planId,
    p_amount: params.amount,
    p_method: params.method,
    p_reference: params.reference ?? null,
    p_note: params.note ?? null,
  });
  if (error) throw rpcError(error, "Versement impossible.");
  return mapMovement(data);
}

/** Rend de l'argent au client (reliquat ou abandon du projet) + ticket. */
export async function addProgressiveRefund(params: {
  planId: string;
  amount: number;
  method: ProgressivePaymentMethod;
  reference?: string | null;
  note?: string | null;
}): Promise<ProgressiveMovementResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("progressive_refund_add", {
    p_plan_id: params.planId,
    p_amount: params.amount,
    p_method: params.method,
    p_reference: params.reference ?? null,
    p_note: params.note ?? null,
  });
  if (error) throw rpcError(error, "Remboursement impossible.");
  return mapMovement(data);
}

/**
 * Annule un dossier. L'épargne restante est TOUJOURS remboursée au client dans la
 * même opération : le ticket de remboursement à lui remettre est renvoyé ici.
 */
export async function cancelProgressivePlan(params: {
  planId: string;
  method?: ProgressivePaymentMethod;
  reason?: string | null;
}): Promise<ProgressiveCancellationResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("progressive_plan_cancel", {
    p_plan_id: params.planId,
    p_method: params.method ?? "cash",
    p_reason: params.reason ?? null,
  });
  if (error) throw rpcError(error, "Annulation impossible.");
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    refundLedgerId: str(row?.refund_ledger_id),
    refundReceiptNumber: str(row?.refund_receipt_number),
    refundedAmount: num(row?.refunded_amount),
  };
}

/**
 * Suppression définitive (propriétaire). Refusée tant que le client a de l'épargne
 * non remboursée, ou si une vente est née du dossier.
 */
export async function deleteProgressivePlan(planId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("progressive_plan_delete", { p_plan_id: planId });
  if (error) throw rpcError(error, "Suppression impossible.");
}

/**
 * Le client prend son article : crée la vente réelle (déstockage + règlements ventilés),
 * consomme l'épargne et clôture le dossier — en une seule transaction serveur.
 */
export async function convertProgressivePlan(params: {
  planId: string;
  productId: string;
  quantity?: number;
  unitPrice?: number | null;
}): Promise<ProgressiveConversionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("progressive_plan_convert", {
    p_plan_id: params.planId,
    p_product_id: params.productId,
    p_quantity: Math.max(1, Math.trunc(params.quantity ?? 1)),
    p_unit_price: params.unitPrice ?? null,
    p_client_request_id: crypto.randomUUID(),
  });
  if (error) throw rpcError(error, "Conversion impossible.");
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    saleId: String(row?.sale_id ?? ""),
    saleNumber: String(row?.sale_number ?? ""),
    total: num(row?.total),
    residual: num(row?.residual),
  };
}

/**
 * Complète la fiche engin de la vente issue d'une conversion (montant en lettres,
 * châssis, moteur…). Best-effort : la vente existe déjà, elle reste modifiable
 * depuis la page Vente Engins si cette écriture échoue.
 */
export async function completeConvertedEngineDetails(params: {
  saleId: string;
  amountInWords: string;
  brand?: string | null;
  model?: string | null;
  chassis?: string | null;
  motor?: string | null;
  color?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { amount_in_words: params.amountInWords };
  if (params.brand?.trim()) patch.engine_brand = params.brand.trim();
  if (params.model?.trim()) patch.engine_model = params.model.trim();
  if (params.chassis?.trim()) patch.engine_chassis = params.chassis.trim();
  if (params.motor?.trim()) patch.engine_motor = params.motor.trim();
  if (params.color?.trim()) patch.engine_color = params.color.trim();
  const { error } = await supabase
    .from("engine_sale_details")
    .update(patch)
    .eq("sale_id", params.saleId);
  if (error) throw error;
}
