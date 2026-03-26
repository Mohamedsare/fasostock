import { registerOutboxHandler } from "@/lib/sync/sync-manager";

/**
 * Enregistrez ici les handlers `kind` → Supabase (équivalent des branches dans `sync_service_v2.dart` Flutter).
 * Appelé une fois au montage client (voir `SyncProvider`).
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
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", String(payload.id ?? ""));
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
}
