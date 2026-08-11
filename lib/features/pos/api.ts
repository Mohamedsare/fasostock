"use client";

import { resolveSaleAuthor } from "@/lib/auth/sale-author";
import { enqueueOutbox } from "@/lib/db/dexie-db";
import { isNetworkErrorPublic } from "@/lib/errors/app-error-mapper";
import {
  OFFLINE_SALE_ID_PREFIX,
  OFFLINE_SALE_NUMBER_LABEL,
} from "@/lib/offline/constants";
import {
  notifyCompanyOwnersPush,
  reportPushOutcome,
} from "@/lib/features/push/company-owners-push-client";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { fetchByChunks } from "@/lib/supabase/fetch-by-chunks";
import { listCategories, listProducts, listStoreInventory } from "@/lib/features/products/api";
import { listCustomers } from "@/lib/features/customers/api";
import { listStores } from "@/lib/features/stores/api";
import type { Customer } from "@/lib/features/customers/types";
import type { ProductCategory, ProductItem } from "@/lib/features/products/types";
import type { Store } from "@/lib/features/stores/types";

export type PosData = {
  store: Store | null;
  products: ProductItem[];
  categories: ProductCategory[];
  customers: Customer[];
  /** Objet simple (et non `Map`) : traverse la persistance IndexedDB du cache — voir `listStoreInventory`. */
  stockByProductId: Record<string, number>;
};

export async function fetchPosData(params: {
  companyId: string;
  storeId: string;
  withCustomers: boolean;
}): Promise<PosData> {
  const [stores, products, categories, stockByProductId, customers] = await Promise.all([
    listStores(params.companyId),
    listProducts(params.companyId),
    listCategories(params.companyId),
    listStoreInventory(params.storeId),
    params.withCustomers ? listCustomers(params.companyId) : Promise.resolve([]),
  ]);
  const store = stores.find((s) => s.id === params.storeId) ?? null;
  return { store, products, categories, customers, stockByProductId };
}

/**
 * Classement « meilleures ventes » d'une boutique sur `sinceDays` jours (ventes complétées).
 * Sert à remonter en tête de grille POS (« en vedette ») les produits les plus vendus ;
 * le reste du catalogue conserve son ordre. Aligné sur le calcul du Tableau de bord
 * (status = completed, agrégation `sale_items`, fetch par chunks pour éviter les URL trop longues).
 */
export async function fetchStoreBestSellerQty(params: {
  companyId: string;
  storeId: string;
  sinceDays: number;
}): Promise<Map<string, number>> {
  const supabase = createClient();
  const since = new Date();
  since.setDate(since.getDate() - params.sinceDays);

  const { data: sales, error: sErr } = await fetchAllPages((from, to) =>
    supabase
      .from("sales")
      .select("id")
      .eq("company_id", params.companyId)
      .eq("store_id", params.storeId)
      .eq("status", "completed")
      .gte("created_at", since.toISOString())
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (sErr) throw sErr;
  const saleIds = (sales ?? []).map((r) => (r as { id: string }).id);
  if (saleIds.length === 0) return new Map();

  const rows = await fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select("product_id, quantity")
      .in("sale_id", chunk)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{ product_id?: string; quantity?: number }>;
  });

  const qtyByProduct = new Map<string, number>();
  for (const m of rows) {
    if (!m.product_id) continue;
    qtyByProduct.set(
      m.product_id,
      (qtyByProduct.get(m.product_id) ?? 0) + Number(m.quantity ?? 0),
    );
  }
  return qtyByProduct;
}

export async function createPosSale(params: {
  companyId: string;
  storeId: string;
  customerId: string | null;
  /**
   * `discount` par ligne (optionnel, défaut 0) : remise absorbant l'arrondi d'un
   * conditionnement pour que `quantité × prix_unitaire − discount` = prix exact
   * du conditionnement. Le RPC soustrait cette remise par ligne.
   */
  items: Array<{ productId: string; quantity: number; unitPrice: number; discount?: number }>;
  discount: number;
  payments: Array<{ method: "cash" | "mobile_money" | "card" | "other"; amount: number; reference?: string | null }>;
  saleMode: "quick_pos" | "invoice_pos";
  documentType: "thermal_receipt" | "a4_invoice";
  /** Pharmacie : n° d'ordonnance (optionnel) — écrit après création (non bloquant). */
  prescriptionNumber?: string | null;
  /**
   * Vente à crédit : échéance choisie en caisse (ISO). Écrite après création
   * (`sales.credit_due_at`) ; sans elle la page Crédit applique J+30 par défaut.
   */
  creditDueAt?: string | null;
}): Promise<{ saleId: string; saleNumber: string }> {
  const supabase = createClient();
  // Tolère l'absence de réseau : `getUser()` seul faisait échouer la vente hors ligne
  // avant même d'atteindre la mise en file (voir `resolveSaleAuthor`).
  const author = await resolveSaleAuthor(supabase);
  if (!author.ok) throw author.error;

  const clientRequestId = crypto.randomUUID();

  /** Met la vente en file locale — elle partira dès que le réseau revient. */
  const queueSale = async (): Promise<{ saleId: string; saleNumber: string }> => {
    await enqueueOutbox("pos_sale_create", {
      companyId: params.companyId,
      storeId: params.storeId,
      customerId: params.customerId,
      items: params.items,
      discount: params.discount,
      payments: params.payments,
      saleMode: params.saleMode,
      documentType: params.documentType,
      prescriptionNumber: params.prescriptionNumber ?? null,
      creditDueAt: params.creditDueAt ?? null,
      p_client_request_id: clientRequestId,
    });
    return {
      saleId: `${OFFLINE_SALE_ID_PREFIX}${clientRequestId}`,
      saleNumber: OFFLINE_SALE_NUMBER_LABEL,
    };
  };

  // Identité non confirmée = serveur injoignable : inutile de tenter la vente en direct.
  if (!navigator.onLine || !author.verified) return queueSale();

  let saleId: unknown;
  try {
    const { data, error } = await supabase.rpc("create_sale_with_stock", {
      p_company_id: params.companyId,
      p_store_id: params.storeId,
      p_customer_id: params.customerId,
      p_created_by: author.userId,
      p_items: params.items.map((i) => ({
        product_id: i.productId,
        quantity: Math.trunc(i.quantity),
        unit_price: i.unitPrice,
        discount: Math.max(0, Math.round(i.discount ?? 0)),
      })),
      p_payments: params.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference ?? null,
      })),
      p_discount: params.discount,
      p_sale_mode: params.saleMode,
      p_document_type: params.documentType,
      p_client_request_id: clientRequestId,
    });
    if (error) throw error;
    saleId = data;
  } catch (e) {
    /*
     * `navigator.onLine` ne dit que « une carte réseau est active » : il reste `true`
     * avec 2 barres de 4G qui ne laissent rien passer — le cas courant ici. Sans ce
     * repli, la requête expirait et la vente était **perdue**, alors que la
     * marchandise était déjà sortie et l'argent encaissé.
     *
     * Rejouer est sans risque : `p_client_request_id` est inchangé, et
     * `create_sale_with_stock` renvoie la vente déjà créée si la requête avait en
     * fait abouti (table `sale_sync_idempotency`) — ni doublon, ni double déstockage.
     *
     * Seules les pannes réseau basculent en file. Un refus métier (« stock
     * insuffisant ») doit rester affiché au caissier : la marchandise est encore là,
     * il peut corriger tout de suite.
     */
    if (isNetworkErrorPublic(e)) return queueSale();
    throw e;
  }

  const id = String(saleId ?? "");
  if (!id) throw new Error("Vente non creee.");

  // Pharmacie : n° d'ordonnance — écrit après coup (policy `sales_update`), best-effort.
  const presc = params.prescriptionNumber?.trim();
  if (presc) {
    const { error: pErr } = await supabase
      .from("sales")
      .update({ prescription_number: presc })
      .eq("id", id);
    if (pErr) {
      // Non bloquant : la vente est déjà validée, on n'échoue pas la dispensation.
      console.error("Échec écriture n° ordonnance:", pErr);
    }
  }

  // Vente à crédit : échéance saisie en caisse — best-effort (la créance existe déjà).
  const dueAt = params.creditDueAt?.trim();
  if (dueAt) {
    const { error: dErr } = await supabase
      .from("sales")
      .update({ credit_due_at: dueAt })
      .eq("id", id);
    if (dErr) console.error("Échec écriture échéance crédit:", dErr);
  }

  const { data: saleRow, error: sErr } = await supabase
    .from("sales")
    .select("sale_number")
    .eq("id", id)
    .maybeSingle();
  if (sErr) throw sErr;

  const saleNumber = String((saleRow as { sale_number?: string } | null)?.sale_number ?? id);
  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total = Math.max(0, subtotal - params.discount);
  const pushSale = await notifyCompanyOwnersPush({
    companyIds: [params.companyId],
    title: "Nouvelle vente",
    body: `${saleNumber} · total ${total.toLocaleString("fr-FR")} FCFA`,
    url: "/sales",
  });
  // La vente est enregistrée : le push ne doit jamais inquiéter le vendeur.
  void reportPushOutcome(pushSale);

  const stockoutNames: string[] = [];
  for (const it of params.items) {
    const { data: inv, error: invErr } = await supabase
      .from("store_inventory")
      .select("quantity, product:products(name)")
      .eq("store_id", params.storeId)
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
      companyIds: [params.companyId],
      title: "Rupture de stock",
      body:
        stockoutNames.length === 1
          ? `${stockoutNames[0]} est en rupture dans cette boutique.`
          : `Ruptures : ${stockoutNames.join(", ")}.`,
      url: "/inventory",
    });
  }

  return {
    saleId: id,
    saleNumber,
  };
}

/** RPC `update_completed_sale_with_stock` — aligné `SalesRepository.updateCompleted` (Flutter). */
export async function updateCompletedPosSale(params: {
  saleId: string;
  customerId: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
  }>;
  discount: number;
  payments: Array<{
    method: "cash" | "mobile_money" | "card" | "other";
    amount: number;
    reference?: string | null;
  }>;
  saleMode: "quick_pos" | "invoice_pos";
  documentType: "thermal_receipt" | "a4_invoice";
}): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("La modification nécessite une connexion internet.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("update_completed_sale_with_stock", {
    p_sale_id: params.saleId,
    p_customer_id: params.customerId,
    p_items: params.items.map((i) => ({
      product_id: i.productId,
      quantity: Math.trunc(i.quantity),
      unit_price: i.unitPrice,
      discount: i.discount,
    })),
    p_payments: params.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference ?? null,
    })),
    p_discount: params.discount,
    p_sale_mode: params.saleMode,
    p_document_type: params.documentType,
  });
  if (error) throw error;
}
