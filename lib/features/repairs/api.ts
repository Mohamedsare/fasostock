"use client";

import { businessRpcError } from "@/lib/errors/business-rpc-error";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import type {
  RepairOrder,
  RepairOrderInput,
  RepairOrderLine,
  RepairOrderLineDraft,
  RepairStatus,
} from "./types";

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function intOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const ORDER_SELECT =
  "id, company_id, store_id, order_number, customer_id, customer_name, customer_phone, " +
  "vehicle_plate, vehicle_make, vehicle_model, vehicle_year, vehicle_mileage, " +
  "reported_issue, diagnosis, status, assigned_to, received_at, promised_at, delivered_at, " +
  "sale_id, notes, created_by, created_at, " +
  "repair_order_lines(id, repair_order_id, kind, product_id, label, quantity, unit_price, position)";

function mapLine(row: Row): RepairOrderLine {
  return {
    id: String(row.id),
    repairOrderId: String(row.repair_order_id ?? ""),
    kind: row.kind === "labor" ? "labor" : "part",
    productId: row.product_id == null ? null : String(row.product_id),
    label: String(row.label ?? ""),
    quantity: Math.max(1, Math.trunc(num(row.quantity))),
    unitPrice: num(row.unit_price),
    position: Math.trunc(num(row.position)),
  };
}

function mapOrder(row: Row): RepairOrder {
  const rawLines = Array.isArray(row.repair_order_lines) ? (row.repair_order_lines as Row[]) : [];
  return {
    id: String(row.id),
    companyId: String(row.company_id ?? ""),
    storeId: String(row.store_id ?? ""),
    orderNumber: String(row.order_number ?? ""),
    customerId: row.customer_id == null ? null : String(row.customer_id),
    customerName: str(row.customer_name),
    customerPhone: str(row.customer_phone),
    vehiclePlate: str(row.vehicle_plate),
    vehicleMake: str(row.vehicle_make),
    vehicleModel: str(row.vehicle_model),
    vehicleYear: str(row.vehicle_year),
    vehicleMileage: intOrNull(row.vehicle_mileage),
    reportedIssue: str(row.reported_issue),
    diagnosis: str(row.diagnosis),
    status: (String(row.status ?? "reception") as RepairStatus) ?? "reception",
    assignedTo: row.assigned_to == null ? null : String(row.assigned_to),
    receivedAt: String(row.received_at ?? ""),
    promisedAt: row.promised_at == null ? null : String(row.promised_at),
    deliveredAt: row.delivered_at == null ? null : String(row.delivered_at),
    saleId: row.sale_id == null ? null : String(row.sale_id),
    notes: str(row.notes),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at ?? ""),
    lines: rawLines.map(mapLine).sort((a, b) => a.position - b.position),
  };
}

/**
 * Ordres de réparation d'une boutique, du plus récent au plus ancien.
 * Paginé : un garage actif dépasse vite 1000 passages (règle PostgREST).
 */
export async function listRepairOrders(params: {
  companyId: string;
  storeId: string | null;
}): Promise<RepairOrder[]> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase
      .from("repair_orders")
      .select(ORDER_SELECT)
      .eq("company_id", params.companyId);
    if (params.storeId) q = q.eq("store_id", params.storeId);
    return q
      .order("received_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
  });
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(mapOrder);
}

function orderColumns(input: RepairOrderInput) {
  return {
    customer_id: input.customerId,
    customer_name: str(input.customerName),
    customer_phone: str(input.customerPhone),
    vehicle_plate: str(input.vehiclePlate)?.toUpperCase() ?? null,
    vehicle_make: str(input.vehicleMake),
    vehicle_model: str(input.vehicleModel),
    vehicle_year: str(input.vehicleYear),
    vehicle_mileage: intOrNull(input.vehicleMileage),
    reported_issue: str(input.reportedIssue),
    diagnosis: str(input.diagnosis),
    status: input.status,
    assigned_to: input.assignedTo,
    promised_at: input.promisedAt,
    notes: str(input.notes),
  };
}

export async function createRepairOrder(params: {
  companyId: string;
  storeId: string;
  input: RepairOrderInput;
  lines: RepairOrderLineDraft[];
}): Promise<string> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("repair_orders")
    .insert({
      company_id: params.companyId,
      store_id: params.storeId,
      created_by: userRes.user?.id ?? null,
      ...orderColumns(params.input),
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = String((data as { id: string }).id);
  await replaceRepairOrderLines({
    companyId: params.companyId,
    repairOrderId: id,
    lines: params.lines,
  });
  return id;
}

export async function updateRepairOrder(params: {
  repairOrderId: string;
  companyId: string;
  input: RepairOrderInput;
  lines: RepairOrderLineDraft[];
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("repair_orders")
    .update(orderColumns(params.input))
    .eq("id", params.repairOrderId);
  if (error) throw error;
  await replaceRepairOrderLines({
    companyId: params.companyId,
    repairOrderId: params.repairOrderId,
    lines: params.lines,
  });
}

/**
 * Remplace les lignes d'un OR (suppression + réinsertion).
 * Un ordre en compte quelques-unes : le remplacement complet évite toute la
 * mécanique de réconciliation ligne à ligne, pour un coût négligeable.
 */
async function replaceRepairOrderLines(params: {
  companyId: string;
  repairOrderId: string;
  lines: RepairOrderLineDraft[];
}): Promise<void> {
  const supabase = createClient();
  const { error: delErr } = await supabase
    .from("repair_order_lines")
    .delete()
    .eq("repair_order_id", params.repairOrderId);
  if (delErr) throw delErr;

  const rows = params.lines
    .filter((l) => l.label.trim().length > 0 && l.quantity > 0)
    .map((l, index) => ({
      company_id: params.companyId,
      repair_order_id: params.repairOrderId,
      kind: l.kind,
      product_id: l.kind === "part" ? l.productId : l.productId,
      label: l.label.trim(),
      quantity: Math.max(1, Math.trunc(l.quantity)),
      unit_price: Math.max(0, l.unitPrice),
      position: index,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("repair_order_lines").insert(rows);
  if (error) throw error;
}

/** Fait avancer (ou reculer) un ordre dans le flux atelier. */
export async function setRepairOrderStatus(params: {
  repairOrderId: string;
  status: RepairStatus;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { status: params.status };
  if (params.status === "delivered") patch.delivered_at = new Date().toISOString();
  const { error } = await supabase
    .from("repair_orders")
    .update(patch)
    .eq("id", params.repairOrderId);
  if (error) throw error;
}

export async function deleteRepairOrder(repairOrderId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("repair_orders").delete().eq("id", repairOrderId);
  if (error) throw error;
}

/**
 * Facture l'ordre : crée une vente réelle (CA, marge, crédit, rapports),
 * déstocke les pièces et marque l'OR livré. Sans règlement, la facture part
 * entièrement à crédit — exactement comme une vente en caisse.
 */
export async function billRepairOrder(params: {
  repairOrderId: string;
  payments: Array<{
    method: "cash" | "mobile_money" | "card" | "other";
    amount: number;
    reference?: string | null;
  }>;
  discount?: number;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("bill_repair_order", {
    p_repair_order_id: params.repairOrderId,
    p_payments: params.payments
      .filter((p) => p.amount > 0)
      .map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
    p_discount: Math.max(0, params.discount ?? 0),
  });
  if (error) {
    throw businessRpcError(
      error,
      "La facturation de la réparation n'a pas pu être enregistrée.",
    );
  }
  return String(data ?? "");
}
