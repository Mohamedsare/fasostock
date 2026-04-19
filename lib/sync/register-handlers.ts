import type { SupabaseClient } from "@supabase/supabase-js";
import { registerOutboxHandler } from "@/lib/sync/sync-manager";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function requireUserId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Non authentifié");
  return user.id;
}

/**
 * Enregistre les handlers kind → Supabase (même logique que les API features et SyncServiceV2 côté Flutter).
 * Appelé au montage client (SyncProvider).
 */
export function registerOutboxHandlers(): void {
  registerOutboxHandler("product_create", async (supabase, payload) => {
    const { error } = await supabase.from("products").insert(payload);
    if (error) throw error;
  });
  registerOutboxHandler("product_update", async (supabase, payload) => {
    const id = String(payload.id ?? "");
    const patch = (payload.patch ?? {}) as Record<string, unknown>;
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) throw error;
  });
  registerOutboxHandler("product_set_active", async (supabase, payload) => {
    const { error } = await supabase
      .from("products")
      .update({ is_active: Boolean(payload.isActive) })
      .eq("id", String(payload.id ?? ""));
    if (error) throw error;
  });
  registerOutboxHandler("product_soft_delete", async (supabase, payload) => {
    const { error } = await supabase
      .from("products")
      .update({
        deleted_at: String(payload.now ?? new Date().toISOString()),
        is_active: false,
      })
      .eq("id", String(payload.id ?? ""));
    if (error) throw error;
  });
  registerOutboxHandler("category_create", async (supabase, payload) => {
    const { error } = await supabase.from("categories").insert(payload);
    if (error) throw error;
  });
  registerOutboxHandler("category_update", async (supabase, payload) => {
    const { error } = await supabase
      .from("categories")
      .update({ name: String(payload.name ?? "").trim() })
      .eq("id", String(payload.id ?? ""));
    if (error) throw error;
  });
  registerOutboxHandler("category_delete", async (supabase, payload) => {
    const { error } = await supabase.from("categories").delete().eq("id", String(payload.id ?? ""));
    if (error) throw error;
  });
  registerOutboxHandler("brand_create", async (supabase, payload) => {
    const { error } = await supabase.from("brands").insert(payload);
    if (error) throw error;
  });
  registerOutboxHandler("brand_update", async (supabase, payload) => {
    const { error } = await supabase
      .from("brands")
      .update({ name: String(payload.name ?? "").trim() })
      .eq("id", String(payload.id ?? ""));
    if (error) throw error;
  });
  registerOutboxHandler("brand_delete", async (supabase, payload) => {
    const { error } = await supabase.from("brands").delete().eq("id", String(payload.id ?? ""));
    if (error) throw error;
  });
  registerOutboxHandler("sale_cancel", async (supabase, payload) => {
    const { error } = await supabase.rpc("cancel_sale_restore_stock", {
      p_sale_id: String(payload.saleId ?? ""),
    });
    if (error) throw error;
  });

  registerOutboxHandler("customer_create", async (supabase, payload) => {
    const { error } = await supabase.from("customers").insert(payload);
    if (error) throw error;
  });
  registerOutboxHandler("customer_update", async (supabase, payload) => {
    const id = String(payload.id ?? "");
    const patch = (payload.patch ?? {}) as Record<string, unknown>;
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    if (error) throw error;
  });
  registerOutboxHandler("customer_delete", async (supabase, payload) => {
    const { error } = await supabase.from("customers").delete().eq("id", String(payload.id ?? ""));
    if (error) throw error;
  });

  registerOutboxHandler("supplier_create", async (supabase, payload) => {
    const { error } = await supabase.from("suppliers").insert(payload);
    if (error) throw error;
  });
  registerOutboxHandler("supplier_update", async (supabase, payload) => {
    const id = String(payload.id ?? "");
    const patch = (payload.patch ?? {}) as Record<string, unknown>;
    const { error } = await supabase.from("suppliers").update(patch).eq("id", id);
    if (error) throw error;
  });
  registerOutboxHandler("supplier_delete", async (supabase, payload) => {
    const { error } = await supabase.from("suppliers").delete().eq("id", String(payload.id ?? ""));
    if (error) throw error;
  });

  registerOutboxHandler("inventory_adjust_atomic", async (supabase, payload) => {
    const uid = await requireUserId(supabase);
    const { error } = await supabase.rpc("inventory_adjust_atomic", {
      p_store_id: String(payload.storeId ?? ""),
      p_product_id: String(payload.productId ?? ""),
      p_delta: Math.trunc(toNum(payload.delta)),
      p_reason: String(payload.reason ?? ""),
      p_created_by: uid,
    });
    if (error) throw error;
  });

  registerOutboxHandler("purchase_create_draft", async (supabase, payload) => {
    const p = payload as Record<string, unknown>;
    const companyId = String(p.companyId ?? "");
    const storeId = String(p.storeId ?? "");
    const supplierId = String(p.supplierId ?? "");
    const referenceFinal = String(p.reference ?? "");
    const total = toNum(p.total);
    const items = (p.items ?? []) as Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
    }>;
    const payments = (p.payments ?? null) as Array<{ method: string; amount: number }> | null;

    const uid = await requireUserId(supabase);

    const { data: pRow, error: pErr } = await supabase
      .from("purchases")
      .insert({
        company_id: companyId,
        store_id: storeId,
        supplier_id: supplierId,
        reference: referenceFinal,
        status: "draft",
        total,
        created_by: uid,
      })
      .select("id")
      .single();
    if (pErr) throw pErr;
    const purchaseId = String((pRow as { id: string }).id);

    if (items.length > 0) {
      const { error: iErr } = await supabase.from("purchase_items").insert(
        items.map((it) => ({
          purchase_id: purchaseId,
          product_id: it.productId,
          quantity: Math.trunc(it.quantity),
          unit_price: toNum(it.unitPrice),
          total: Math.trunc(it.quantity) * toNum(it.unitPrice),
        })),
      );
      if (iErr) throw iErr;
    }

    const pays = payments?.filter((x) => x.amount > 0) ?? [];
    if (pays.length > 0) {
      const paidAt = new Date().toISOString();
      const { error: payErr } = await supabase.from("purchase_payments").insert(
        pays.map((x) => ({
          purchase_id: purchaseId,
          amount: x.amount,
          method: x.method,
          paid_at: paidAt,
        })),
      );
      if (payErr) throw payErr;
    }
  });

  registerOutboxHandler("purchase_confirm_with_stock", async (supabase, payload) => {
    const uid = await requireUserId(supabase);
    const { error } = await supabase.rpc("confirm_purchase_with_stock", {
      p_purchase_id: String(payload.purchaseId ?? ""),
      p_created_by: uid,
    });
    if (error) throw error;
  });

  registerOutboxHandler("purchase_cancel", async (supabase, payload) => {
    const purchaseId = String(payload.purchaseId ?? "");
    const { data: row, error: selErr } = await supabase
      .from("purchases")
      .select("status")
      .eq("id", purchaseId)
      .single();
    if (selErr) throw selErr;
    if (String((row as { status?: string }).status) !== "draft") {
      throw new Error("Seuls les brouillons peuvent être annulés");
    }
    const { error } = await supabase.from("purchases").update({ status: "cancelled" }).eq("id", purchaseId);
    if (error) throw error;
  });

  registerOutboxHandler("pos_sale_create", async (supabase, payload) => {
    const uid = await requireUserId(supabase);
    const p = payload as Record<string, unknown>;
    const items = (p.items ?? []) as Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
    }>;
    const payments = (p.payments ?? []) as Array<{
      method: string;
      amount: number;
      reference?: string | null;
    }>;
    const clientRequestId = String(p.p_client_request_id ?? crypto.randomUUID());

    const { notifyCompanyOwnersPush } = await import(
      "@/lib/features/push/company-owners-push-client"
    );

    const { error } = await supabase.rpc("create_sale_with_stock", {
      p_company_id: String(p.companyId ?? ""),
      p_store_id: String(p.storeId ?? ""),
      p_customer_id: (p.customerId as string | null) ?? null,
      p_created_by: uid,
      p_items: items.map((i) => ({
        product_id: i.productId,
        quantity: Math.trunc(i.quantity),
        unit_price: i.unitPrice,
        discount: 0,
      })),
      p_payments: payments.map((x) => ({
        method: x.method,
        amount: x.amount,
        reference: x.reference ?? null,
      })),
      p_discount: toNum(p.discount),
      p_sale_mode: String(p.saleMode ?? "quick_pos"),
      p_document_type: String(p.documentType ?? "thermal_receipt"),
      p_client_request_id: clientRequestId,
    });
    if (error) throw error;

    await notifyCompanyOwnersPush({
      companyIds: [String(p.companyId ?? "")],
      title: "Nouvelle vente",
      body: "Une vente créée hors ligne a été synchronisée.",
      url: "/sales",
    });

    const storeId = String(p.storeId ?? "");
    const companyId = String(p.companyId ?? "");
    if (storeId && companyId) {
      const stockoutNames: string[] = [];
      for (const it of items) {
        const { data: inv, error: invErr } = await supabase
          .from("store_inventory")
          .select("quantity, product:products(name)")
          .eq("store_id", storeId)
          .eq("product_id", it.productId)
          .maybeSingle();
        if (invErr || !inv) continue;
        const qty = Number((inv as { quantity?: unknown }).quantity ?? 0);
        if (qty <= 0) {
          const pr = (inv as { product?: { name?: string } | { name?: string }[] }).product;
          const nm = Array.isArray(pr) ? pr[0]?.name : pr?.name;
          stockoutNames.push(String(nm ?? "Produit").trim() || "Produit");
        }
      }
      if (stockoutNames.length > 0) {
        await notifyCompanyOwnersPush({
          companyIds: [companyId],
          title: "Rupture de stock",
          body:
            stockoutNames.length === 1
              ? `${stockoutNames[0]} est en rupture dans cette boutique.`
              : `Ruptures : ${stockoutNames.join(", ")}.`,
          url: "/inventory",
        });
      }
    }
  });
}
