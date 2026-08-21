"use client";

import { createClient } from "@/lib/supabase/client";
import { fallbackCreatorLabel, fetchCreatorLabels } from "@/lib/features/users/creator-labels";
import { firstProductImageUrlFromNestedRows } from "@/lib/features/products/product-images";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  Warehouse,
  WarehouseDispatchInvoiceDetails,
  WarehouseDispatchInvoiceSummary,
  WarehouseDispatchLineHit,
  WarehouseDispatchLineInput,
  WarehouseMovement,
  WarehouseStockLine,
} from "./types";

const invSelect =
  "company_id, product_id, quantity, avg_unit_cost, stock_min_warehouse, updated_at, product:products(id, name, sku, unit, purchase_price, sale_price, stock_min, product_images(id, url, position))";

const movSelect =
  "id, company_id, product_id, movement_kind, quantity, unit_cost, packaging_type, packs_quantity, reference_type, reference_id, notes, created_at, created_by, product:products(id, name, sku)";

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

function mapMovement(
  row: Record<string, unknown>,
  labelByUser: Map<string, string>,
): WarehouseMovement {
  const prodRaw = row.product;
  const product = Array.isArray(prodRaw)
    ? (prodRaw[0] as Record<string, unknown> | undefined)
    : (prodRaw as Record<string, unknown> | null);
  const p = product ?? {};
  const createdBy = row.created_by != null ? String(row.created_by) : null;
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
    createdBy,
    createdByLabel: createdBy
      ? (labelByUser.get(createdBy) ?? fallbackCreatorLabel(createdBy))
      : null,
  };
}

export async function listWarehouses(companyId: string): Promise<Warehouse[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, company_id, name, code, is_primary, is_active, created_at")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      name: String(row.name ?? ""),
      code: (row.code as string | null) ?? null,
      isPrimary: row.is_primary === true,
      isActive: row.is_active !== false,
      createdAt: row.created_at != null ? String(row.created_at) : null,
    };
  });
}

export async function listWarehouseInventory(
  companyId: string,
  warehouseId?: string | null,
): Promise<WarehouseStockLine[]> {
  const supabase = createClient();
  // Paginé : le stock du dépôt central couvre tout le catalogue.
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase.from("warehouse_inventory").select(invSelect);
    if (warehouseId) {
      q = q.eq("warehouse_id", warehouseId);
    } else {
      q = q.eq("company_id", companyId);
    }
    // `warehouse_inventory` n'a pas de colonne `id` : sa clé primaire est le couple
    // (company_id, product_id). C'est donc lui qui rend l'ordre total.
    return q
      .order("updated_at", { ascending: false })
      .order("company_id", { ascending: true })
      .order("product_id", { ascending: true })
      .range(from, to);
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? [])
    .map((r) => mapStockLine(r as Record<string, unknown>))
    .filter((l) => l.productId.length > 0);
}

export async function listWarehouseMovements(
  companyId: string,
  limit = 200,
  warehouseId?: string | null,
  productSearch?: string,
): Promise<WarehouseMovement[]> {
  const supabase = createClient();
  const term = (productSearch ?? "").trim();
  // Recherche par produit : jointure interne pour pouvoir filtrer sur name/sku.
  const select = term
    ? "id, company_id, product_id, movement_kind, quantity, unit_cost, packaging_type, packs_quantity, reference_type, reference_id, notes, created_at, created_by, product:products!inner(id, name, sku)"
    : movSelect;
  let q = supabase.from("warehouse_movements").select(select);
  if (warehouseId) {
    q = q.eq("warehouse_id", warehouseId);
  } else {
    q = q.eq("company_id", companyId);
  }
  if (term) {
    const escaped = term.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.or(`name.ilike.%${escaped}%,sku.ilike.%${escaped}%`, { referencedTable: "product" });
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error);

  // « Qui a fait quoi » : une seule requête `profiles` pour toute la page.
  const rows = (data ?? []) as Record<string, unknown>[];
  const creatorIds = rows
    .map((r) => (r.created_by != null ? String(r.created_by) : null))
    .filter((id): id is string => Boolean(id));
  const labelByUser = await fetchCreatorLabels(supabase, creatorIds);

  return rows.map((r) => mapMovement(r, labelByUser));
}

/**
 * Tous les mouvements d'une journée, pour l'impression du journal du dépôt.
 *
 * Volontairement séparé de `listWarehouseMovements` : celui-ci plafonne à 200 lignes
 * pour alimenter l'écran, ce qui produirait un journal amputé sans le dire. Ici on
 * pagine — un jour d'arrivage dépasse facilement les 1000 lignes de PostgREST.
 *
 * Les bornes arrivent en instants ISO calculés par l'appelant à partir du jour local :
 * `created_at` est un `timestamptz`, et découper la journée côté serveur supposerait
 * un fuseau que la base n'a pas.
 */
export async function listWarehouseMovementsForDay(params: {
  companyId: string;
  warehouseId?: string | null;
  fromIso: string;
  toIso: string;
}): Promise<WarehouseMovement[]> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase.from("warehouse_movements").select(movSelect);
    if (params.warehouseId) {
      q = q.eq("warehouse_id", params.warehouseId);
    } else {
      q = q.eq("company_id", params.companyId);
    }
    return q
      .gte("created_at", params.fromIso)
      .lt("created_at", params.toIso)
      // `id` en second critère : plusieurs écritures partagent la même seconde
      // (une facture dépôt en produit une par ligne), et sans clé départageante
      // une page pourrait répéter une ligne en en perdant une autre.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  });
  if (error) throw mapSupabaseError(error);

  const rows = (data ?? []) as Record<string, unknown>[];
  const creatorIds = rows
    .map((r) => (r.created_by != null ? String(r.created_by) : null))
    .filter((id): id is string => Boolean(id));
  const labelByUser = await fetchCreatorLabels(supabase, creatorIds);
  return rows.map((r) => mapMovement(r, labelByUser));
}

export async function warehouseRegisterManualEntry(params: {
  companyId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  packagingType: string;
  packsQuantity: number;
  notes: string | null;
  warehouseId?: string | null;
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
    p_warehouse_id: params.warehouseId ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseSetStockMinWarehouse(params: {
  companyId: string;
  productId: string;
  minValue: number;
  warehouseId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_set_stock_min_warehouse", {
    p_company_id: params.companyId,
    p_product_id: params.productId,
    p_min: params.minValue,
    p_warehouse_id: params.warehouseId ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseRegisterAdjustment(params: {
  companyId: string;
  productId: string;
  delta: number;
  unitCost: number | null;
  reason: string | null;
  warehouseId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_register_adjustment", {
    p_company_id: params.companyId,
    p_product_id: params.productId,
    p_delta: params.delta,
    p_unit_cost: params.unitCost,
    p_reason: params.reason,
    p_warehouse_id: params.warehouseId ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseRegisterExitForSale(params: {
  companyId: string;
  saleId: string;
  warehouseId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_register_exit_for_sale", {
    p_company_id: params.companyId,
    p_sale_id: params.saleId,
    p_warehouse_id: params.warehouseId ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseCreateDispatchInvoice(params: {
  companyId: string;
  customerId: string;
  notes: string | null;
  lines: WarehouseDispatchLineInput[];
  warehouseId?: string | null;
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
    p_warehouse_id: params.warehouseId ?? null,
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
  warehouseId?: string | null,
): Promise<WarehouseDispatchInvoiceSummary[]> {
  const supabase = createClient();
  let q = supabase
    .from("warehouse_dispatch_invoices")
    .select(
      "id, company_id, customer_id, created_by, document_number, notes, created_at, customer:customers(name), items:warehouse_dispatch_items(quantity, unit_price)",
    );
  if (warehouseId) {
    q = q.eq("warehouse_id", warehouseId);
  } else {
    q = q.eq("company_id", companyId);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapSupabaseError(error);
  const rows = (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const custRaw = row.customer;
    const customer = Array.isArray(custRaw)
      ? (custRaw[0] as { name?: string } | undefined)
      : (custRaw as { name?: string } | null);
    const itemsRaw = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : [];
    const totalAmount = itemsRaw.reduce((sum, item) => {
      const q = toInt(item.quantity);
      const pu = toFloat(item.unit_price);
      return sum + q * pu;
    }, 0);
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      customerId: row.customer_id != null ? String(row.customer_id) : null,
      customerName: customer?.name != null ? String(customer.name) : null,
      createdBy: row.created_by != null ? String(row.created_by) : null,
      createdByLabel: "Utilisateur",
      documentNumber: String(row.document_number ?? "—"),
      totalAmount,
      notes: row.notes != null ? String(row.notes) : null,
      createdAt: String(row.created_at ?? ""),
    };
  });
  const creatorIds = rows.map((r) => r.createdBy).filter(Boolean) as string[];
  let labelByUser = new Map<string, string>();
  try {
    labelByUser = await fetchCreatorLabels(supabase, creatorIds);
  } catch {
    for (const id of creatorIds) labelByUser.set(id, fallbackCreatorLabel(id));
  }
  return rows.map((r) => ({
    ...r,
    createdByLabel: r.createdBy ? (labelByUser.get(r.createdBy) ?? fallbackCreatorLabel(r.createdBy)) : "Utilisateur",
  }));
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

  // Paginé : une facture de sortie de dépôt peut aligner plus de 1000 lignes ; les
  // lignes perdues auraient minoré le total facturé.
  const { data: linesRaw, error: linesErr } = await fetchAllPages((from, to) =>
    supabase
      .from("warehouse_dispatch_items")
      .select("product_id, quantity, unit_price, product:products(name, sku, unit)")
      .eq("invoice_id", invoiceId)
      .order("id", { ascending: true })
      .range(from, to),
  );
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

/**
 * Recherche toutes les lignes de sortie (articles des bons) dont le produit
 * correspond à `query` (nom ou SKU). Scopé au dépôt actif, ou à la société si
 * aucun dépôt n'est sélectionné. Trié du plus récent au plus ancien.
 */
export async function searchWarehouseDispatchLinesByProduct(
  companyId: string,
  query: string,
  warehouseId?: string | null,
  limit = 300,
): Promise<WarehouseDispatchLineHit[]> {
  const term = query.trim();
  if (term.length === 0) return [];
  const escaped = term.replace(/[%_]/g, (m) => `\\${m}`);
  const supabase = createClient();
  let q = supabase
    .from("warehouse_dispatch_items")
    .select(
      "quantity, unit_price, product_id, product:products!inner(name, sku, unit), invoice:warehouse_dispatch_invoices!inner(id, company_id, warehouse_id, document_number, created_at, customer:customers(name))",
    )
    .or(`name.ilike.%${escaped}%,sku.ilike.%${escaped}%`, { referencedTable: "product" });
  if (warehouseId) {
    q = q.eq("invoice.warehouse_id", warehouseId);
  } else {
    q = q.eq("invoice.company_id", companyId);
  }
  const { data, error } = await q.limit(limit);
  if (error) throw mapSupabaseError(error);

  const rows = (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const prodRaw = row.product;
    const product = Array.isArray(prodRaw)
      ? (prodRaw[0] as Record<string, unknown> | undefined)
      : (prodRaw as Record<string, unknown> | null);
    const p = product ?? {};
    const invRaw = row.invoice;
    const invoice = Array.isArray(invRaw)
      ? (invRaw[0] as Record<string, unknown> | undefined)
      : (invRaw as Record<string, unknown> | null);
    const inv = invoice ?? {};
    const custRaw = inv.customer;
    const customer = Array.isArray(custRaw)
      ? (custRaw[0] as { name?: string } | undefined)
      : (custRaw as { name?: string } | null);
    const quantity = toInt(row.quantity);
    const unitPrice = toFloat(row.unit_price);
    return {
      invoiceId: String(inv.id ?? ""),
      documentNumber: String(inv.document_number ?? "—"),
      createdAt: String(inv.created_at ?? ""),
      customerName: customer?.name != null ? String(customer.name) : null,
      productId: String(row.product_id ?? p.id ?? ""),
      productName: String(p.name ?? "—"),
      productSku: p.sku != null ? String(p.sku) : null,
      productUnit: String(p.unit ?? "pce"),
      quantity,
      unitPrice,
      lineTotal: quantity * unitPrice,
    };
  });
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return rows;
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

export async function warehouseAppendDispatchPayment(params: {
  companyId: string;
  invoiceId: string;
  method: "cash" | "mobile_money" | "card";
  amount?: number | null;
  mobileProvider?: "orange_money" | "moov_money" | "wave" | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_append_dispatch_payment", {
    p_company_id: params.companyId,
    p_invoice_id: params.invoiceId,
    p_method: params.method,
    p_amount: params.amount ?? null,
    p_mobile_provider: params.mobileProvider ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function warehouseUpdateDispatchInvoice(params: {
  companyId: string;
  invoiceId: string;
  customerId: string | null;
  notes: string | null;
  lines: WarehouseDispatchLineInput[];
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_update_dispatch_invoice", {
    p_company_id: params.companyId,
    p_invoice_id: params.invoiceId,
    p_customer_id: params.customerId,
    p_notes: params.notes,
    p_lines: params.lines.map((l) => ({
      product_id: l.productId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
    })),
  });
  if (error) throw mapSupabaseError(error);
}
