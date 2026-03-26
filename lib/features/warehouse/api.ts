"use client";

import { createClient } from "@/lib/supabase/client";
import { firstProductImageUrlFromNestedRows } from "@/lib/features/products/product-images";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  WarehouseDispatchInvoiceDetails,
  WarehouseDispatchInvoiceSummary,
  WarehouseDispatchLineInput,
  WarehouseMovement,
  WarehouseStockLine,
} from "./types";

const invSelect =
  "company_id, product_id, quantity, avg_unit_cost, stock_min_warehouse, updated_at, product:products(id, name, sku, unit, purchase_price, sale_price, stock_min, product_images(id, url, position))";

const movSelect =
  "id, company_id, product_id, movement_kind, quantity, unit_cost, packaging_type, packs_quantity, reference_type, reference_id, notes, created_at, product:products(id, name, sku)";

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") return parseInt(v, 10) || 0;
  return 0;
}

function toFloat(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") return parseFloat(v.replace(",", ".")) || 0;
  return 0;
}

function mapStockLine(row: Record<string, unknown>): WarehouseStockLine {
  const prodRaw = row.product;
  const product = Array.isArray(prodRaw)
    ? (prodRaw[0] as Record<string, unknown> | undefined)
    : (prodRaw as Record<string, unknown> | null);
  const p = product ?? {};
  return {
    productId: String(row.product_id ?? p.id ?? ""),
    imageUrl: firstProductImageUrlFromNestedRows(p.product_images),
    quantity: toInt(row.quantity),
    productName: String(p.name ?? "—"),
    sku: p.sku != null ? String(p.sku) : null,
    unit: String(p.unit ?? "pce"),
    avgUnitCost: row.avg_unit_cost != null ? toFloat(row.avg_unit_cost) : null,
    purchasePrice: toFloat(p.purchase_price),
    salePrice: toFloat(p.sale_price),
    stockMin: toInt(p.stock_min),
    stockMinWarehouse: toInt(row.stock_min_warehouse),
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
  };
}

function mapMovement(row: Record<string, unknown>): WarehouseMovement {
  const prodRaw = row.product;
  const product = Array.isArray(prodRaw)
    ? (prodRaw[0] as Record<string, unknown> | undefined)
    : (prodRaw as Record<string, unknown> | null);
  const p = product ?? {};
  return {
    id: String(row.id),
    productId: String(row.product_id),
    movementKind: String(row.movement_kind ?? "entry"),
    quantity: toInt(row.quantity),
    unitCost: row.unit_cost != null ? toFloat(row.unit_cost) : null,
    packagingType: String(row.packaging_type ?? "unite"),
    packsQuantity: toFloat(row.packs_quantity) || 1,
    referenceType: String(row.reference_type ?? "manual"),
    referenceId: row.reference_id != null ? String(row.reference_id) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
    productName: p.name != null ? String(p.name) : null,
    productSku: p.sku != null ? String(p.sku) : null,
  };
}

export async function listWarehouseInventory(companyId: string): Promise<WarehouseStockLine[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("warehouse_inventory")
    .select(invSelect)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? [])
    .map((r) => mapStockLine(r as Record<string, unknown>))
    .filter((l) => l.productId.length > 0);
}

export async function listWarehouseMovements(
  companyId: string,
  limit = 200,
): Promise<WarehouseMovement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("warehouse_movements")
    .select(movSelect)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((r) => mapMovement(r as Record<string, unknown>));
}

export async function warehouseRegisterManualEntry(params: {
  companyId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  packagingType: string;
  packsQuantity: number;
  notes: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_register_manual_entry", {
    p_company_id: params.companyId,
    p_product_id: params.productId,
    p_quantity: params.quantity,
    p_unit_cost: params.unitCost,
    p_packaging_type: params.packagingType,
    p_packs_quantity: params.packsQuantity,
    p_notes: params.notes,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseSetStockMinWarehouse(params: {
  companyId: string;
  productId: string;
  minValue: number;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_set_stock_min_warehouse", {
    p_company_id: params.companyId,
    p_product_id: params.productId,
    p_min: params.minValue,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseRegisterAdjustment(params: {
  companyId: string;
  productId: string;
  delta: number;
  unitCost: number | null;
  reason: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_register_adjustment", {
    p_company_id: params.companyId,
    p_product_id: params.productId,
    p_delta: params.delta,
    p_unit_cost: params.unitCost,
    p_reason: params.reason,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseRegisterExitForSale(params: {
  companyId: string;
  saleId: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_register_exit_for_sale", {
    p_company_id: params.companyId,
    p_sale_id: params.saleId,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseCreateDispatchInvoice(params: {
  companyId: string;
  customerId: string;
  notes: string | null;
  lines: WarehouseDispatchLineInput[];
}): Promise<{ id: string; documentNumber: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("warehouse_create_dispatch_invoice", {
    p_company_id: params.companyId,
    p_customer_id: params.customerId,
    p_notes: params.notes,
    p_lines: params.lines.map((l) => ({
      product_id: l.productId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
    })),
  });
  if (error) throw mapSupabaseError(error);
  const raw = data as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") {
    throw new Error("Réponse serveur inattendue.");
  }
  const id = raw.id != null ? String(raw.id) : null;
  const documentNumber = raw.document_number != null ? String(raw.document_number) : null;
  if (!id || !documentNumber) {
    throw new Error("Réponse serveur incomplète.");
  }
  return { id, documentNumber };
}

export async function listWarehouseDispatchInvoices(
  companyId: string,
  limit = 120,
): Promise<WarehouseDispatchInvoiceSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("warehouse_dispatch_invoices")
    .select(
      "id, company_id, customer_id, document_number, notes, created_at, customer:customers(name)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const custRaw = row.customer;
    const customer = Array.isArray(custRaw)
      ? (custRaw[0] as { name?: string } | undefined)
      : (custRaw as { name?: string } | null);
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      customerId: row.customer_id != null ? String(row.customer_id) : null,
      customerName: customer?.name != null ? String(customer.name) : null,
      documentNumber: String(row.document_number ?? "—"),
      notes: row.notes != null ? String(row.notes) : null,
      createdAt: String(row.created_at ?? ""),
    };
  });
}

export async function getWarehouseDispatchInvoiceDetails(
  invoiceId: string,
): Promise<WarehouseDispatchInvoiceDetails> {
  const supabase = createClient();
  const { data: invRaw, error: invErr } = await supabase
    .from("warehouse_dispatch_invoices")
    .select(
      "id, company_id, customer_id, document_number, notes, created_at, customer:customers(name, phone)",
    )
    .eq("id", invoiceId)
    .single();
  if (invErr) throw mapSupabaseError(invErr);
  const inv = invRaw as Record<string, unknown>;
  const custRaw = inv.customer;
  const customer = Array.isArray(custRaw)
    ? (custRaw[0] as { name?: string; phone?: string } | undefined)
    : (custRaw as { name?: string; phone?: string } | null);

  const { data: linesRaw, error: linesErr } = await supabase
    .from("warehouse_dispatch_items")
    .select("product_id, quantity, unit_price, product:products(name, sku, unit)")
    .eq("invoice_id", invoiceId);
  if (linesErr) throw mapSupabaseError(linesErr);

  const lines = (linesRaw ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const prodRaw = row.product;
    const product = Array.isArray(prodRaw)
      ? (prodRaw[0] as Record<string, unknown> | undefined)
      : (prodRaw as Record<string, unknown> | null);
    const p = product ?? {};
    return {
      productId: String(row.product_id ?? ""),
      productName: String(p.name ?? "—"),
      productSku: p.sku != null ? String(p.sku) : null,
      productUnit: String(p.unit ?? "pce"),
      quantity: toInt(row.quantity),
      unitPrice: toFloat(row.unit_price),
    };
  });

  return {
    id: String(inv.id),
    companyId: String(inv.company_id),
    customerId: inv.customer_id != null ? String(inv.customer_id) : null,
    customerName: customer?.name != null ? String(customer.name) : null,
    customerPhone: customer?.phone != null ? String(customer.phone) : null,
    documentNumber: String(inv.document_number ?? "—"),
    notes: inv.notes != null ? String(inv.notes) : null,
    createdAt: String(inv.created_at ?? ""),
    lines,
  };
}

export async function voidWarehouseDispatchInvoice(params: {
  companyId: string;
  invoiceId: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_void_dispatch_invoice", {
    p_company_id: params.companyId,
    p_invoice_id: params.invoiceId,
  });
  if (error) throw mapSupabaseError(error);
}
