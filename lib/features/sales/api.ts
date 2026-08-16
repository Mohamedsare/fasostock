"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { notifyCompanyOwnersPush } from "@/lib/features/push/company-owners-push-client";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { fetchByChunks } from "@/lib/supabase/fetch-by-chunks";
import { fallbackCreatorLabel, fetchCreatorLabels } from "@/lib/features/users/creator-labels";
import { localDayEndIso, localDayStartIso } from "@/lib/utils/local-day";
import { UserFriendlyError } from "@/lib/errors/app-error-mapper";
import { businessRpcError } from "@/lib/errors/business-rpc-error";
import {
  effectiveUnitCost,
  saleItemCostColumnAvailable,
  withSaleItemCost,
} from "@/lib/features/quick-supply/sale-item-cost";
import type { SaleDeliveryState, SaleItem, SaleStatus } from "./types";
import type { SaleCostAggregate } from "./sale-profit";

/**
 * Deux chaînes ENTIÈRES, choisies à l'exécution. `supabase-js` type le résultat en
 * analysant le littéral passé à `.select()` : une chaîne décidée à l'exécution lui
 * échappe, d'où les conversions explicites `as unknown as` sur les lignes rendues.
 * Le client n'étant pas typé par un schéma généré, on ne perd aucune vérification réelle.
 */
const saleSelectLegacy =
  "id, company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, created_at, updated_at, sale_mode, document_type, prescription_number, credit_due_at, store:stores(id, name), customer:customers(id, name, phone)";
/** Idem + suivi de retrait (colonnes ajoutées par la migration 00188). */
const saleSelectWithDelivery =
  "id, company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, created_at, updated_at, sale_mode, document_type, prescription_number, credit_due_at, delivery_state, delivery_due_at, delivery_note, delivery_marked_at, delivered_at, store:stores(id, name), customer:customers(id, name, phone)";

/**
 * Vrai tant qu'on n'a pas constaté que la base ignore les colonnes de retrait.
 *
 * L'historique des ventes est l'écran le plus utilisé de l'application : il ne doit PAS
 * tomber parce qu'une migration annexe n'est pas encore passée en production. On demande
 * donc les colonnes, et si la base répond qu'elle ne les connaît pas, on la croit une
 * fois pour toutes (pour la durée de l'onglet) et on continue sans elles.
 */
let deliveryColumnsAvailable = true;

function saleSelect(): string {
  return deliveryColumnsAvailable ? saleSelectWithDelivery : saleSelectLegacy;
}

/** 42703 / PGRST204 : migration 00188 pas encore appliquée sur cette base. */
function isMissingDeliveryColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = String(e?.message ?? "").toLowerCase();
  return (
    (e?.code === "42703" || e?.code === "PGRST204" || msg.includes("does not exist")) &&
    msg.includes("delivery_")
  );
}

/** Les jointures PostgREST reviennent parfois en tableau d'un élément. */
function normalizeSaleRow(row: Record<string, unknown>): SaleItem {
  const storeRaw = row.store;
  const customerRaw = row.customer;
  const store = Array.isArray(storeRaw)
    ? (storeRaw[0] as { id: string; name: string } | undefined) ?? null
    : ((storeRaw as { id: string; name: string } | null) ?? null);
  const customer = Array.isArray(customerRaw)
    ? (customerRaw[0] as { id: string; name: string; phone: string | null } | undefined) ?? null
    : ((customerRaw as { id: string; name: string; phone: string | null } | null) ?? null);
  return {
    ...(row as unknown as SaleItem),
    store,
    customer,
  };
}

export async function listSales(params: {
  companyId: string;
  storeId: string | null;
  status: SaleStatus | null;
  from: string;
  to: string;
}): Promise<SaleItem[]> {
  const supabase = createClient();
  // Paginé : la synthèse de période (« montants = facturé ») est calculée sur ces lignes.
  // Tronquée à 1000, elle sous-évaluait le chiffre d'affaires d'une boutique active sans
  // rien afficher d'anormal — l'écran restait crédible, les chiffres étaient faux.
  const run = () =>
    fetchAllPages((from, to) => {
      let q = supabase
        .from("sales")
        // `sale_payments` : nécessaire à la colonne Acompte / au statut de règlement de la liste.
        .select(`${saleSelect()},sale_payments(id, method, amount, reference, created_at)`)
        .eq("company_id", params.companyId)
        // Les ventes d'engins ont leur propre page (module Vente Engins).
        .eq("sale_kind", "standard")
        .order("created_at", { ascending: false })
        // Deux ventes peuvent partager la même milliseconde (import, caisse rapide).
        .order("id", { ascending: true });
      if (params.storeId) q = q.eq("store_id", params.storeId);
      if (params.status) q = q.eq("status", params.status);
      if (params.from) q = q.gte("created_at", localDayStartIso(params.from));
      if (params.to) q = q.lte("created_at", localDayEndIso(params.to));
      return q.range(from, to);
    });

  let { data, error } = await run();
  // Migration 00188 absente : on réessaie sans les colonnes de retrait plutôt que de
  // laisser l'historique des ventes en erreur.
  if (error && isMissingDeliveryColumn(error)) {
    deliveryColumnsAvailable = false;
    ({ data, error } = await run());
  }
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
    normalizeSaleRow,
  );

  const creatorIds = rows.map((r) => r.created_by).filter(Boolean) as string[];
  let labelByUser: Map<string, string>;
  try {
    labelByUser = await fetchCreatorLabels(supabase, creatorIds);
  } catch {
    labelByUser = new Map();
    for (const id of new Set(creatorIds)) {
      labelByUser.set(id, fallbackCreatorLabel(id));
    }
  }

  return rows.map((r) => ({
    ...r,
    created_by_label: labelByUser.get(r.created_by) ?? fallbackCreatorLabel(r.created_by),
  }));
}

/**
 * Ventes payées dont la marchandise attend encore en boutique.
 *
 * Volontairement **hors période** : ce qui traîne depuis trois semaines est précisément
 * ce que le commerçant doit voir, et le filtre « aujourd'hui » de la page le cacherait.
 * L'index partiel `idx_sales_delivery_pending` (00188) ne couvre que ces lignes-là — la
 * requête reste donc légère même sur un historique de dizaines de milliers de ventes.
 *
 * Une base non migrée (colonne absente) renvoie une erreur PostgREST : on rend une liste
 * vide plutôt que de casser l'écran des ventes pour une fonctionnalité annexe.
 */
export async function listAwaitingPickupSales(params: {
  companyId: string;
  storeId: string | null;
}): Promise<SaleItem[]> {
  if (!deliveryColumnsAvailable) return [];
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase
      .from("sales")
      .select(`${saleSelect()},sale_payments(id, method, amount, reference, created_at)`)
      .eq("company_id", params.companyId)
      .eq("sale_kind", "standard")
      .eq("status", "completed")
      .eq("delivery_state", "pending")
      // Le plus ancien d'abord : c'est celui qui pose problème.
      .order("delivery_marked_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true });
    if (params.storeId) q = q.eq("store_id", params.storeId);
    return q.range(from, to);
  });
  if (error) {
    if (isMissingDeliveryColumn(error)) {
      deliveryColumnsAvailable = false;
      return [];
    }
    throw error;
  }
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
    normalizeSaleRow,
  );

  const creatorIds = rows.map((r) => r.created_by).filter(Boolean) as string[];
  let labelByUser: Map<string, string>;
  try {
    labelByUser = await fetchCreatorLabels(supabase, creatorIds);
  } catch {
    labelByUser = new Map();
  }
  return rows.map((r) => ({
    ...r,
    created_by_label: labelByUser.get(r.created_by) ?? fallbackCreatorLabel(r.created_by),
  }));
}

/** Un article vendu qui attend encore dans la boutique. */
export type AwaitingPickupItem = {
  productId: string;
  productName: string;
  quantity: number;
  /** Nombre de ventes concernées — « 3 sacs pour 2 clients ». */
  saleCount: number;
};

/**
 * Ce qui est vendu mais physiquement encore là, **par produit**, pour une boutique.
 *
 * Sert au garde-fou du comptage d'inventaire : la personne qui compte voit 12 sacs et le
 * logiciel en annonce 9. Sans cette liste, elle « corrige » à 12 — et remet en vente trois
 * sacs qui appartiennent déjà à un client. Le vrai risque n'est pas l'écart : c'est la
 * correction faite de bonne foi par quelqu'un qui n'était pas au courant.
 */
export async function listAwaitingPickupItems(
  storeId: string,
): Promise<AwaitingPickupItem[]> {
  if (!deliveryColumnsAvailable || !storeId) return [];
  const supabase = createClient();

  const { data: saleRows, error: salesErr } = await fetchAllPages((from, to) =>
    supabase
      .from("sales")
      .select("id")
      .eq("store_id", storeId)
      .eq("sale_kind", "standard")
      .eq("status", "completed")
      .eq("delivery_state", "pending")
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (salesErr) {
    if (isMissingDeliveryColumn(salesErr)) {
      deliveryColumnsAvailable = false;
      return [];
    }
    throw salesErr;
  }
  const saleIds = ((saleRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (saleIds.length === 0) return [];

  const rows = await fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, product:products(id, name)")
      .in("sale_id", chunk)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<Record<string, unknown>>;
  });

  const byProduct = new Map<string, AwaitingPickupItem & { sales: Set<string> }>();
  for (const raw of rows) {
    const productRaw = raw.product;
    const product = (Array.isArray(productRaw) ? productRaw[0] : productRaw) as
      | { id?: string; name?: string }
      | null
      | undefined;
    const productId = String(product?.id ?? "");
    if (!productId) continue;
    const cur = byProduct.get(productId) ?? {
      productId,
      productName: String(product?.name ?? "Produit"),
      quantity: 0,
      saleCount: 0,
      sales: new Set<string>(),
    };
    cur.quantity += Number(raw.quantity ?? 0);
    cur.sales.add(String(raw.sale_id ?? ""));
    byProduct.set(productId, cur);
  }

  return [...byProduct.values()]
    .map(({ sales, ...item }) => ({ ...item, saleCount: sales.size }))
    .sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName, "fr"));
}

/**
 * Coût d'achat agrégé des ventes demandées — alimente la colonne « Bénéfice » de
 * l'historique. Volontairement appelé sur les seules ventes **affichées** (une page)
 * pour ne pas alourdir le chargement de la liste.
 *
 * Une vente absente du résultat (aucune ligne lisible) n'est pas inventée : l'écran
 * affiche « — » plutôt qu'un bénéfice égal au chiffre d'affaires.
 *
 * Objet simple et NON une `Map` : ce résultat transite par le cache TanStack persisté
 * (IndexedDB, JSON). Une `Map` y devient `{}` à la relecture et fait planter l'écran —
 * même piège que `listStoreInventory` (voir `RQ_PERSIST_BUSTER`).
 */
export async function fetchSalesCost(
  saleIds: string[],
): Promise<Record<string, SaleCostAggregate>> {
  const out: Record<string, SaleCostAggregate> = {};
  const ids = [...new Set(saleIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const supabase = createClient();
  // Sonde unique par session : la colonne `unit_cost` n'existe qu'après la migration du
  // module Approvisionnement, et la réclamer trop tôt ferait échouer toute la page Ventes.
  await saleItemCostColumnAvailable();
  // `fetchByChunks` traite les deux plafonds : URL d'entrée (lots de 120 ventes) et
  // lignes en sortie (un lot de 120 ventes dépasse 1000 `sale_items` dès ~9 articles
  // par ticket — les lignes perdues gonflaient le bénéfice affiché).
  const rows = await fetchByChunks(ids, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select(withSaleItemCost("sale_id, quantity, total, product:products(purchase_price)"))
      .in("sale_id", chunk)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    // `select()` construit dynamiquement (colonne optionnelle) : PostgREST ne peut plus
    // inférer la forme des lignes, d'où le passage par `unknown`.
    return (data ?? []) as unknown as Array<Record<string, unknown>>;
  });

  for (const raw of rows) {
    const saleId = String(raw.sale_id ?? "");
    if (!saleId) continue;
    const productRaw = raw.product;
    const product = (
      Array.isArray(productRaw) ? productRaw[0] : productRaw
    ) as { purchase_price?: number | null } | null | undefined;
    // Coût du lot d'arrivage si la marchandise en venait, sinon prix catalogue.
    const purchasePrice = effectiveUnitCost(raw.unit_cost, product?.purchase_price);
    const quantity = Number(raw.quantity ?? 0);
    const cur = out[saleId] ?? {
      itemsTotal: 0,
      cost: 0,
      lineCount: 0,
      linesWithoutCost: 0,
    };
    cur.itemsTotal += Number(raw.total ?? 0);
    cur.cost += purchasePrice * quantity;
    cur.lineCount += 1;
    // Prix d'achat à 0 = non renseigné : compté à part pour signaler la surestimation.
    if (!(purchasePrice > 0)) cur.linesWithoutCost += 1;
    out[saleId] = cur;
  }
  return out;
}

export async function cancelSale(saleId: string): Promise<void> {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("sale_cancel", { saleId });
    return;
  }
  const { data: snap, error: snapErr } = await supabase
    .from("sales")
    .select("company_id, sale_number")
    .eq("id", saleId)
    .maybeSingle();
  if (snapErr) throw snapErr;

  const { error } = await supabase.rpc("cancel_sale_restore_stock", {
    p_sale_id: saleId,
  });
  if (error) throw error;

  const row = snap as { company_id?: string; sale_number?: string } | null;
  if (row?.company_id) {
    await notifyCompanyOwnersPush({
      companyIds: [row.company_id],
      title: "Vente annulée",
      body: row.sale_number ? `La vente ${row.sale_number} a été annulée.` : "Une vente a été annulée.",
      url: "/sales",
    });
  }
}

/**
 * Suivi de retrait (migration 00188) : marquer une vente complétée « à retirer »
 * (le client a payé et n'a rien emporté) ou « remise » (il est venu chercher).
 *
 * Ni le statut de la vente ni le stock ne bougent — la vente reste complétée, les
 * articles restent sortis du stock. Voir `sale-delivery.ts`.
 *
 * Pas de file d'attente hors ligne : ce pointage sert à savoir, MAINTENANT et pour tout
 * le monde, ce qui attend derrière le comptoir. Une remise enregistrée sur un téléphone
 * et poussée trois heures plus tard laisserait un collègue redonner la même marchandise.
 */
export async function setSaleDeliveryState(params: {
  saleId: string;
  state: SaleDeliveryState;
  /** Date annoncée par le client (`YYYY-MM-DD`), facultative. */
  dueAt?: string | null;
  note?: string | null;
}): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new UserFriendlyError(
      "Le suivi des retraits a besoin d'une connexion internet : vos collègues doivent voir le changement tout de suite.",
    );
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("sale_set_delivery_state", {
    p_sale_id: params.saleId,
    p_state: params.state,
    p_due_at: params.dueAt || null,
    p_note: params.note?.trim() || null,
  });
  if (error) {
    throw businessRpcError(error, "Impossible de mettre à jour le retrait de cette vente.");
  }
}

/**
 * Propriétaire uniquement (RPC `owner_purge_cancelled_sale`) : efface définitivement une vente
 * déjà **annulée** (ligne retirée de la liste).
 */
export async function purgeCancelledSaleAsOwner(params: {
  companyId: string;
  saleNumber: string;
}): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("La purge nécessite une connexion internet.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("owner_purge_cancelled_sale", {
    p_company_id: params.companyId,
    p_sale_number: params.saleNumber.trim(),
  });
  if (error) throw error;
}

export async function getSaleDetail(saleId: string): Promise<
  | (SaleItem & {
      sale_items: Array<{
        id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        discount: number;
        total: number;
        product?: { id: string; name: string; sku: string | null; unit: string } | null;
      }>;
      sale_payments: Array<{
        id: string;
        method: string;
        amount: number;
        reference: string | null;
        created_at: string;
      }>;
    })
  | null
> {
  const supabase = createClient();
  const run = () =>
    supabase
      .from("sales")
      .select(
        `${saleSelect()},sale_items(id, product_id, quantity, unit_price, discount, total, product:products(id,name,sku,unit)),sale_payments(id, method, amount, reference, created_at)`,
      )
      .eq("id", saleId)
      .maybeSingle();
  let { data, error } = await run();
  if (error && isMissingDeliveryColumn(error)) {
    deliveryColumnsAvailable = false;
    ({ data, error } = await run());
  }
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const storeRaw = row.store;
  const customerRaw = row.customer;
  const store = Array.isArray(storeRaw)
    ? (storeRaw[0] as { id: string; name: string } | undefined) ?? null
    : ((storeRaw as { id: string; name: string } | null) ?? null);
  const customer = Array.isArray(customerRaw)
    ? (customerRaw[0] as { id: string; name: string; phone: string | null } | undefined) ?? null
    : ((customerRaw as { id: string; name: string; phone: string | null } | null) ?? null);
  return {
    ...(row as unknown as SaleItem),
    store,
    customer,
    sale_items: (row.sale_items as Array<{
      id: string;
      product_id: string;
      quantity: number;
      unit_price: number;
      discount: number;
      total: number;
      product?: { id: string; name: string; sku: string | null; unit: string } | null;
    }>) ?? [],
    sale_payments: (row.sale_payments as Array<{
      id: string;
      method: string;
      amount: number;
      reference: string | null;
      created_at: string;
    }>) ?? [],
  };
}
