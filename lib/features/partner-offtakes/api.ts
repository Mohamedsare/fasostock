"use client";

import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { fetchByChunks } from "@/lib/supabase/fetch-by-chunks";
import { firstProductImageUrlFromNestedRows } from "@/lib/features/products/product-images";
import { fetchStoreCatalog } from "@/lib/features/stores/store-catalog";
import { OFFTAKES_PAGE_SIZE } from "./types";
import type {
  CreatePartnerOfftakeInput,
  OfftakeProduct,
  OfftakeStatus,
  PartnerOfftake,
  PartnerOfftakeLine,
  PartnerOfftakePage,
  PartnerOfftakePayment,
} from "./types";

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Tolérance d'arrondi monnaie, alignée sur `CREDIT_AMOUNT_EPS` de la page Crédit. */
export const OFFTAKE_AMOUNT_EPS = 0.005;

/**
 * Catalogue de saisie : ce qu'un partenaire peut emporter, avec le stock disponible.
 *
 * Volontairement plus maigre que `listProducts` — cette page s'ouvre debout, à côté
 * d'un camion. La photo reste : on reconnaît un carton à son emballage bien plus vite
 * qu'à son libellé, et c'est ce qui départage deux références au nom voisin.
 *
 * Paginé : au-delà de 1000 références, une lecture non paginée serait tronquée EN
 * SILENCE — et l'article introuvable serait sorti « à la main » du stock, sans bon.
 */
export async function fetchOfftakeCatalog(params: {
  companyId: string;
  storeId: string;
}): Promise<OfftakeProduct[]> {
  const supabase = createClient();

  const [{ data: rows, error }, stockByProduct, catalog] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("products")
        .select(
          "id, name, unit, barcode, search_aliases, purchase_price, sale_price, wholesale_price, product_scope, is_active, product_images(url, position)",
        )
        .eq("company_id", params.companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        // Deux produits peuvent porter le même nom : sans cette seconde clé, l'ordre
        // n'est pas total et une page répéterait une ligne en en perdant une autre.
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchStoreInventoryMap(params.storeId),
    fetchStoreCatalog(params.storeId),
  ]);
  if (error) throw error;

  const allowed = catalog == null ? null : new Set(catalog);

  return ((rows ?? []) as Array<Record<string, unknown>>)
    .filter((r) => {
      if (r.is_active === false) return false;
      const scope = String(r.product_scope ?? "both");
      // Un article réservé au dépôt sort par le Magasin, pas par la boutique.
      if (scope !== "both" && scope !== "boutique_only") return false;
      return allowed == null || allowed.has(String(r.id));
    })
    .map((r) => {
      const id = String(r.id);
      const aliasesRaw = r.search_aliases;
      return {
        id,
        name: String(r.name ?? ""),
        unit: String(r.unit ?? "pce"),
        barcode:
          r.barcode != null && String(r.barcode).trim() !== "" ? String(r.barcode) : null,
        searchAliases: Array.isArray(aliasesRaw)
          ? aliasesRaw.map((a) => String(a ?? "").trim()).filter((a) => a.length > 0)
          : [],
        catalogueSalePrice: toNum(r.sale_price),
        catalogueWholesalePrice: toNum(r.wholesale_price),
        cataloguePurchasePrice: toNum(r.purchase_price),
        stock: stockByProduct[id] ?? 0,
        imageUrl: firstProductImageUrlFromNestedRows(r.product_images),
      } satisfies OfftakeProduct;
    });
}

async function fetchStoreInventoryMap(storeId: string): Promise<Record<string, number>> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("store_inventory")
      .select("product_id, quantity")
      .eq("store_id", storeId)
      .order("product_id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;
  const m: Record<string, number> = {};
  for (const row of data ?? []) {
    m[String((row as { product_id: unknown }).product_id)] = toNum(
      (row as { quantity?: unknown }).quantity,
    );
  }
  return m;
}

/**
 * Enregistre l'enlèvement. Tout passe par le RPC : lui seul fait la sortie de stock,
 * les mouvements tracés, le numéro et l'acompte dans une seule transaction — donc
 * « c'est sorti » veut dire que TOUT est sorti.
 */
export async function createPartnerOfftake(
  input: CreatePartnerOfftakeInput,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_partner_offtake", {
    p_company_id: input.companyId,
    p_store_id: input.storeId,
    p_items: input.items.map((it) => ({
      product_id: it.productId,
      quantity: it.quantity,
      // Prix consenti à CE partenaire : la base ne le recopiera dans aucune fiche.
      unit_price: it.unitPrice,
    })),
    p_partner_name: input.partnerName,
    p_partner_phone: input.partnerPhone,
    p_customer_id: input.customerId,
    p_amount_paid: input.amountPaid,
    p_due_at: input.dueAt,
    p_note: input.note,
    p_client_request_id: input.clientRequestId,
  });
  if (error) throw error;
  return String(data);
}

const offtakeSelect =
  "id, offtake_number, store_id, partner_name, partner_phone, customer_id, note, total_amount, amount_paid, due_at, line_count, unit_count, cancelled_at, cancel_reason, created_at, created_by";

/**
 * Les enlèvements d'une boutique (ou de toutes), avec leurs lignes.
 *
 * Les lignes arrivent en une seule requête groupée (`fetchByChunks`) plutôt qu'une par
 * enlèvement : trente bons, c'est trente allers-retours sur une connexion de marché,
 * soit un écran qui met dix secondes à s'afficher.
 */
export async function listPartnerOfftakes(params: {
  companyId: string;
  /** `null` = toutes les boutiques de l'utilisateur. */
  storeId: string | null;
  limit?: number;
  offset?: number;
}): Promise<PartnerOfftakePage> {
  const supabase = createClient();
  const limit = params.limit ?? OFFTAKES_PAGE_SIZE;
  const offset = Math.max(0, params.offset ?? 0);

  /*
   * PAGINATION SERVEUR — `range(offset, offset + limit)` demande UNE LIGNE DE PLUS que
   * la page. Sa présence dit « il y en a encore », sans le `count: exact` qui obligerait
   * PostgreSQL à compter toute la table à chaque page.
   *
   * Le tri porte sur `(created_at DESC, id DESC)` et non sur `created_at` seul : deux
   * bons enregistrés dans la même seconde — ce qui arrive quand on solde une tournée de
   * partenaires — auraient sinon un ordre indéterminé, et une ligne pourrait apparaître
   * sur deux pages pendant qu'une autre n'apparaîtrait sur aucune.
   */
  let q = supabase
    .from("partner_offtakes")
    .select(offtakeSelect)
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (params.storeId) q = q.eq("store_id", params.storeId);

  const { data: rows, error } = await q;
  if (error) throw error;

  const raw = (rows ?? []) as Array<Record<string, unknown>>;
  const hasMore = raw.length > limit;
  const offtakes = raw.slice(0, limit);
  if (offtakes.length === 0) return { rows: [], hasMore: false };

  const ids = offtakes.map((r) => String(r.id));
  const authorIds = [
    ...new Set(
      offtakes.map((r) => (r.created_by ? String(r.created_by) : "")).filter(Boolean),
    ),
  ];
  const storeIds = [...new Set(offtakes.map((r) => String(r.store_id)))];

  const [items, names, storeNames] = await Promise.all([
    fetchByChunks(ids, async (chunk, from, to) => {
      const { data, error: iErr } = await supabase
        .from("partner_offtake_items")
        .select(
          "id, offtake_id, label, unit, quantity, unit_price, unit_cost, catalogue_sale_price, position",
        )
        .in("offtake_id", chunk)
        .order("offtake_id", { ascending: true })
        .order("position", { ascending: true })
        .range(from, to);
      if (iErr) throw iErr;
      return (data ?? []) as Array<Record<string, unknown>>;
    }),
    fetchAuthorNames(authorIds),
    fetchStoreNames(storeIds),
  ]);

  const linesByOfftake = new Map<string, PartnerOfftakeLine[]>();
  for (const it of items) {
    const key = String(it.offtake_id);
    const list = linesByOfftake.get(key) ?? [];
    list.push({
      id: String(it.id),
      label: String(it.label ?? ""),
      unit: it.unit != null ? String(it.unit) : null,
      quantity: toNum(it.quantity),
      unitPrice: toNum(it.unit_price),
      unitCost: it.unit_cost == null ? null : toNum(it.unit_cost),
      catalogueSalePrice:
        it.catalogue_sale_price == null ? null : toNum(it.catalogue_sale_price),
    });
    linesByOfftake.set(key, list);
  }

  const mapped = offtakes.map((r) => {
    const id = String(r.id);
    const createdBy = r.created_by ? String(r.created_by) : null;
    const total = toNum(r.total_amount);
    const paid = toNum(r.amount_paid);
    return {
      id,
      offtakeNumber: String(r.offtake_number ?? ""),
      storeId: String(r.store_id),
      storeName: storeNames.get(String(r.store_id)) ?? null,
      partnerName: String(r.partner_name ?? ""),
      partnerPhone: r.partner_phone ? String(r.partner_phone) : null,
      customerId: r.customer_id ? String(r.customer_id) : null,
      note: r.note ? String(r.note) : null,
      totalAmount: total,
      amountPaid: paid,
      remaining: Math.max(0, total - paid),
      dueAt: r.due_at ? String(r.due_at) : null,
      lineCount: toNum(r.line_count),
      unitCount: toNum(r.unit_count),
      cancelledAt: r.cancelled_at ? String(r.cancelled_at) : null,
      cancelReason: r.cancel_reason ? String(r.cancel_reason) : null,
      createdAt: String(r.created_at),
      createdByName: createdBy ? (names.get(createdBy) ?? null) : null,
      lines: linesByOfftake.get(id) ?? [],
    } satisfies PartnerOfftake;
  });

  return { rows: mapped, hasMore };
}

/** Les règlements d'un enlèvement, du plus récent au plus ancien. */
export async function listOfftakePayments(
  offtakeId: string,
): Promise<PartnerOfftakePayment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("partner_offtake_payments")
    .select("id, amount, method, reference, note, created_at, created_by")
    .eq("offtake_id", offtakeId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const authorIds = [
    ...new Set(rows.map((r) => (r.created_by ? String(r.created_by) : "")).filter(Boolean)),
  ];
  const names = await fetchAuthorNames(authorIds);

  return rows.map((r) => {
    const by = r.created_by ? String(r.created_by) : null;
    return {
      id: String(r.id),
      amount: toNum(r.amount),
      method: String(r.method ?? "cash"),
      reference: r.reference ? String(r.reference) : null,
      note: r.note ? String(r.note) : null,
      createdAt: String(r.created_at),
      createdByName: by ? (names.get(by) ?? null) : null,
    } satisfies PartnerOfftakePayment;
  });
}

/** Encaisse un règlement. Retourne le reste dû, recalculé en base. */
export async function addOfftakePayment(params: {
  offtakeId: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
}): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("add_partner_offtake_payment", {
    p_offtake_id: params.offtakeId,
    p_amount: params.amount,
    p_method: params.method,
    p_reference: params.reference,
    p_note: params.note,
  });
  if (error) throw error;
  return toNum(data);
}

/**
 * Annule un enlèvement (propriétaire uniquement) — et, par défaut, remet la
 * marchandise en stock. Le bon n'est jamais supprimé : il reste lisible, marqué annulé.
 */
export async function cancelPartnerOfftake(params: {
  offtakeId: string;
  restoreStock: boolean;
  reason: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_partner_offtake", {
    p_offtake_id: params.offtakeId,
    p_restore_stock: params.restoreStock,
    p_reason: params.reason,
  });
  if (error) throw error;
}

/** Réglage entreprise « Enlèvements partenaires » — écrit par le propriétaire. */
export async function setPartnerOfftakesEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_partner_offtakes_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

/**
 * État métier d'un enlèvement. Dérivé des montants et de l'échéance, jamais stocké :
 * un statut en base se désynchronise du jour où un règlement est saisi ailleurs.
 */
export function offtakeStatus(o: PartnerOfftake, now = new Date()): OfftakeStatus {
  if (o.cancelledAt) return "cancelled";
  if (o.remaining <= OFFTAKE_AMOUNT_EPS) return "paid";
  if (o.dueAt) {
    // Comparaison sur la DATE seule : un solde promis « pour le 12 » n'est pas en
    // retard à 8 h du matin le 12.
    const due = new Date(`${o.dueAt}T23:59:59`);
    if (Number.isFinite(due.getTime()) && now > due) return "overdue";
  }
  return o.amountPaid > OFFTAKE_AMOUNT_EPS ? "partial" : "unpaid";
}

async function fetchAuthorNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const p of data ?? []) {
    const row = p as { id: string; full_name?: string | null };
    const name = (row.full_name ?? "").trim();
    if (name) m.set(String(row.id), name);
  }
  return m;
}

async function fetchStoreNames(storeIds: string[]): Promise<Map<string, string>> {
  if (storeIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase.from("stores").select("id, name").in("id", storeIds);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const s of data ?? []) {
    const row = s as { id: string; name?: string | null };
    m.set(String(row.id), String(row.name ?? ""));
  }
  return m;
}
