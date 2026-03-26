"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  CreateTransferLineInput,
  StockTransferDetail,
  StockTransferItemRow,
  StockTransferListItem,
  TransferStatus,
} from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseStatus(v: unknown): TransferStatus {
  const s = String(v ?? "draft");
  if (
    s === "draft" ||
    s === "pending" ||
    s === "approved" ||
    s === "shipped" ||
    s === "received" ||
    s === "rejected" ||
    s === "cancelled"
  ) {
    return s;
  }
  return "draft";
}

const transferListSelect =
  "id, company_id, from_store_id, to_store_id, from_warehouse, status, requested_by, approved_by, shipped_at, received_at, received_by, created_at, updated_at";

function mapListRow(row: Record<string, unknown>): StockTransferListItem {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    fromStoreId: row.from_store_id != null ? String(row.from_store_id) : null,
    toStoreId: String(row.to_store_id),
    fromWarehouse: row.from_warehouse === true,
    status: parseStatus(row.status),
    requestedBy: String(row.requested_by ?? ""),
    approvedBy: row.approved_by != null ? String(row.approved_by) : null,
    shippedAt: row.shipped_at != null ? String(row.shipped_at) : null,
    receivedAt: row.received_at != null ? String(row.received_at) : null,
    receivedBy: row.received_by != null ? String(row.received_by) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listStockTransfers(params: {
  companyId: string;
  status?: TransferStatus | null;
  fromStoreId?: string | null;
  toStoreId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  /**
   * Uniquement transferts boutique → boutique (exclut dépôt magasin → boutique).
   * Les lignes où origine = destination sont encore filtrées côté UI si besoin.
   */
  boutiqueToBoutiqueOnly?: boolean;
  /** Dépôt central → boutique (`WarehousePage` Flutter, onglet Transfert). */
  fromWarehouseOnly?: boolean;
}): Promise<StockTransferListItem[]> {
  const supabase = createClient();
  let q = supabase
    .from("stock_transfers")
    .select(transferListSelect)
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false });
  if (params.fromWarehouseOnly) {
    q = q.eq("from_warehouse", true);
  }
  if (params.boutiqueToBoutiqueOnly) {
    q = q.eq("from_warehouse", false).not("from_store_id", "is", null);
  }
  if (params.status) q = q.eq("status", params.status);
  if (params.fromStoreId) q = q.eq("from_store_id", params.fromStoreId);
  if (params.toStoreId) q = q.eq("to_store_id", params.toStoreId);
  if (params.fromDate) q = q.gte("created_at", params.fromDate);
  if (params.toDate) q = q.lte("created_at", `${params.toDate}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((r) => mapListRow(r as Record<string, unknown>));
}

async function fetchTransferItems(transferId: string): Promise<StockTransferItemRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_transfer_items")
    .select(
      "id, transfer_id, product_id, quantity_requested, quantity_shipped, quantity_received, product:products(name)",
    )
    .eq("transfer_id", transferId);
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const prod = row.product as { name?: string } | { name?: string }[] | null | undefined;
    const name = Array.isArray(prod) ? prod[0]?.name : prod?.name;
    return {
      id: String(row.id),
      transferId: String(row.transfer_id),
      productId: String(row.product_id),
      quantityRequested: toNum(row.quantity_requested),
      quantityShipped: toNum(row.quantity_shipped),
      quantityReceived: toNum(row.quantity_received),
      productName: name != null ? String(name) : null,
    };
  });
}

export async function getStockTransferDetail(id: string): Promise<StockTransferDetail> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(transferListSelect)
    .eq("id", id)
    .single();
  if (error) throw mapSupabaseError(error);
  const base = mapListRow(data as Record<string, unknown>);
  const items = await fetchTransferItems(id);
  return { ...base, items };
}

export async function createStockTransfer(input: {
  companyId: string;
  fromWarehouse: boolean;
  fromStoreId: string | null;
  toStoreId: string;
  items: CreateTransferLineInput[];
}): Promise<StockTransferDetail> {
  if (!input.fromWarehouse && (!input.fromStoreId || !input.fromStoreId.trim())) {
    throw new Error("Choisissez la boutique d’origine.");
  }
  if (!input.fromWarehouse && input.fromStoreId === input.toStoreId) {
    throw new Error("L’origine et la destination doivent être différentes.");
  }
  const lines = input.items.filter((i) => i.productId && i.quantityRequested > 0);
  if (lines.length === 0) {
    throw new Error("Ajoutez au moins une ligne avec une quantité > 0.");
  }

  const supabase = createClient();
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) throw mapSupabaseError(uErr);
  if (!user) throw new Error("Session expirée.");

  const row: Record<string, unknown> = {
    company_id: input.companyId,
    from_store_id: input.fromWarehouse ? null : input.fromStoreId,
    to_store_id: input.toStoreId,
    from_warehouse: input.fromWarehouse,
    status: "draft",
    requested_by: user.id,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("stock_transfers")
    .insert(row)
    .select(transferListSelect)
    .single();
  if (insErr) throw mapSupabaseError(insErr);
  const transfer = mapListRow(inserted as Record<string, unknown>);

  const { error: itemsErr } = await supabase.from("stock_transfer_items").insert(
    lines.map((i) => ({
      transfer_id: transfer.id,
      product_id: i.productId,
      quantity_requested: i.quantityRequested,
    })),
  );
  if (itemsErr) throw mapSupabaseError(itemsErr);

  return getStockTransferDetail(transfer.id);
}

/**
 * Passe un transfert `pending` → `approved` (droits `transfers.approve` côté UI).
 * Requis avant expédition si le flux métier impose une validation.
 */
export async function approveStockTransfer(transferId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) throw mapSupabaseError(uErr);
  if (!user) throw new Error("Session expirée.");
  const { data, error } = await supabase
    .from("stock_transfers")
    .update({ status: "approved", approved_by: user.id })
    .eq("id", transferId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) {
    throw new Error(
      "Impossible d’approuver : transfert introuvable, déjà approuvé ou statut différent de « en attente ».",
    );
  }
}

export async function shipStockTransfer(transferId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) throw mapSupabaseError(uErr);
  if (!user) throw new Error("Session expirée.");
  const { error } = await supabase.rpc("ship_transfer", {
    p_transfer_id: transferId,
    p_user_id: user.id,
  });
  if (error) throw mapSupabaseError(error);
}

export async function receiveStockTransfer(transferId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) throw mapSupabaseError(uErr);
  if (!user) throw new Error("Session expirée.");
  const { error } = await supabase.rpc("receive_transfer", {
    p_transfer_id: transferId,
    p_user_id: user.id,
  });
  if (error) throw mapSupabaseError(error);
}

export async function cancelStockTransfer(transferId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stock_transfers")
    .update({ status: "cancelled" })
    .eq("id", transferId);
  if (error) throw mapSupabaseError(error);
}

export async function deleteStockTransfer(transferId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("stock_transfers").delete().eq("id", transferId);
  if (error) throw mapSupabaseError(error);
}
