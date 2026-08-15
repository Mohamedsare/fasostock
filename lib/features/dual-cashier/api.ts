"use client";

import { businessRpcError } from "@/lib/errors/business-rpc-error";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { fetchCreatorLabels } from "@/lib/features/users/creator-labels";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  PosHandoff,
  PosHandoffDraftItem,
  PosHandoffItem,
  PosHandoffStatus,
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

const HANDOFF_SELECT =
  "id, company_id, store_id, handoff_number, status, customer_id, subtotal, discount, total, " +
  "note, prescription_number, sale_mode, document_type, created_by, created_at, " +
  "claimed_by, claimed_at, sale_id, paid_by, paid_at, cancelled_by, cancelled_at, cancel_reason, " +
  "pos_handoff_items(id, product_id, label, quantity, unit_price, discount, position)";

function mapItem(row: Row): PosHandoffItem {
  return {
    id: String(row.id),
    productId: String(row.product_id ?? ""),
    label: String(row.label ?? "—"),
    quantity: Math.max(1, Math.trunc(num(row.quantity))),
    unitPrice: num(row.unit_price),
    discount: num(row.discount),
    position: Math.trunc(num(row.position)),
  };
}

function mapHandoff(row: Row): PosHandoff {
  const rawItems = Array.isArray(row.pos_handoff_items) ? (row.pos_handoff_items as Row[]) : [];
  return {
    id: String(row.id),
    companyId: String(row.company_id ?? ""),
    storeId: String(row.store_id ?? ""),
    number: String(row.handoff_number ?? ""),
    status: (String(row.status ?? "pending") as PosHandoffStatus) ?? "pending",
    customerId: row.customer_id == null ? null : String(row.customer_id),
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    total: num(row.total),
    note: str(row.note),
    prescriptionNumber: str(row.prescription_number),
    saleMode: row.sale_mode === "invoice_pos" ? "invoice_pos" : "quick_pos",
    documentType: row.document_type === "a4_invoice" ? "a4_invoice" : "thermal_receipt",
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at ?? ""),
    claimedBy: row.claimed_by == null ? null : String(row.claimed_by),
    claimedAt: row.claimed_at == null ? null : String(row.claimed_at),
    saleId: row.sale_id == null ? null : String(row.sale_id),
    paidBy: row.paid_by == null ? null : String(row.paid_by),
    paidAt: row.paid_at == null ? null : String(row.paid_at),
    cancelledBy: row.cancelled_by == null ? null : String(row.cancelled_by),
    cancelledAt: row.cancelled_at == null ? null : String(row.cancelled_at),
    cancelReason: str(row.cancel_reason),
    items: rawItems.map(mapItem).sort((a, b) => a.position - b.position),
    createdByName: null,
    claimedByName: null,
    paidByName: null,
    cancelledByName: null,
  };
}

/**
 * Résout les noms des personnes du binôme en une requête groupée.
 *
 * Sans ça, la file afficherait des UUID — or « préparé par Awa » est précisément
 * l'information qui permet au caissier de lever la tête et de demander une précision
 * à la bonne personne.
 */
async function withNames(
  supabase: ReturnType<typeof createClient>,
  handoffs: PosHandoff[],
): Promise<PosHandoff[]> {
  const ids: string[] = [];
  for (const h of handoffs) {
    for (const id of [h.createdBy, h.claimedBy, h.paidBy, h.cancelledBy]) {
      if (id) ids.push(id);
    }
  }
  if (ids.length === 0) return handoffs;
  const names = await fetchCreatorLabels(supabase, ids);
  const pick = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  return handoffs.map((h) => ({
    ...h,
    createdByName: pick(h.createdBy),
    claimedByName: pick(h.claimedBy),
    paidByName: pick(h.paidBy),
    cancelledByName: pick(h.cancelledBy),
  }));
}

/**
 * La file d'attente : les bons non encore encaissés d'une boutique.
 *
 * `storeId` nul (vue « toutes boutiques » du propriétaire) = toute l'entreprise. Volume
 * borné par nature — un bon vit quelques minutes — mais paginé quand même : c'est la
 * règle du projet, et une file bloquée un jour de panne peut gonfler.
 */
export async function listPendingHandoffs(params: {
  companyId: string;
  storeId: string | null;
}): Promise<PosHandoff[]> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase
      .from("pos_handoffs")
      .select(HANDOFF_SELECT)
      .eq("company_id", params.companyId)
      .eq("status", "pending");
    if (params.storeId) q = q.eq("store_id", params.storeId);
    return q.order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
  });
  if (error) throw mapSupabaseError(error);
  return withNames(supabase, ((data ?? []) as unknown as Row[]).map(mapHandoff));
}

/**
 * Ce que sont devenus les bons du jour (ou de la période demandée) : encaissés et
 * abandonnés, du plus récent au plus ancien. C'est la page que le propriétaire lit le
 * soir pour comprendre « qui a préparé, qui a encaissé, et ce qui n'a pas abouti ».
 */
export async function listHandoffHistory(params: {
  companyId: string;
  storeId: string | null;
  sinceIso: string;
}): Promise<PosHandoff[]> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase
      .from("pos_handoffs")
      .select(HANDOFF_SELECT)
      .eq("company_id", params.companyId)
      .neq("status", "pending")
      .gte("created_at", params.sinceIso);
    if (params.storeId) q = q.eq("store_id", params.storeId);
    return q.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  });
  if (error) throw mapSupabaseError(error);
  return withNames(supabase, ((data ?? []) as unknown as Row[]).map(mapHandoff));
}

/**
 * Les bons que J'AI envoyés récemment — le suivi affiché dans la caisse du vendeur.
 *
 * Sans lui, envoyer un panier serait un geste sans retour : le vendeur ne saurait pas si
 * son client a payé, si le caissier a refusé, ni pourquoi. Or c'est lui qui a le client
 * en face de lui.
 */
export async function listMyRecentHandoffs(params: {
  companyId: string;
  storeId: string;
  userId: string;
  sinceIso: string;
}): Promise<PosHandoff[]> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("pos_handoffs")
      .select(HANDOFF_SELECT)
      .eq("company_id", params.companyId)
      .eq("store_id", params.storeId)
      .eq("created_by", params.userId)
      .gte("created_at", params.sinceIso)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw mapSupabaseError(error);
  return withNames(supabase, ((data ?? []) as unknown as Row[]).map(mapHandoff));
}

/** Envoie le panier courant à la caisse. Renvoie le numéro à annoncer (« B-42 »). */
export async function createPosHandoff(params: {
  companyId: string;
  storeId: string;
  items: PosHandoffDraftItem[];
  customerId: string | null;
  discount: number;
  note: string | null;
  prescriptionNumber: string | null;
  saleMode: "quick_pos" | "invoice_pos";
  documentType: "thermal_receipt" | "a4_invoice";
  /**
   * Identifiant d'envoi, conservé par l'appelant tant que le panier n'a pas changé.
   *
   * C'est lui qui rend le second appui inoffensif quand la réponse s'est perdue en
   * route : la base retrouve le bon déjà créé au lieu d'en fabriquer un jumeau que le
   * caissier risquerait d'encaisser deux fois.
   */
  clientRequestId?: string | null;
}): Promise<{ handoffId: string; number: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_pos_handoff", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_items: params.items.map((i) => ({
      product_id: i.productId,
      quantity: Math.trunc(i.quantity),
      unit_price: i.unitPrice,
      discount: Math.max(0, Math.round(i.discount)),
    })),
    p_customer_id: params.customerId,
    p_discount: params.discount,
    p_note: params.note,
    p_prescription_number: params.prescriptionNumber,
    p_sale_mode: params.saleMode,
    p_document_type: params.documentType,
    p_client_request_id: params.clientRequestId ?? null,
  });
  if (error) throw businessRpcError(error, "Envoi à la caisse impossible.");

  const handoffId = String(data ?? "");
  if (!handoffId) throw new Error("Bon de caisse non créé.");

  // Le numéro est attribué par la base (séquence) : on le relit pour pouvoir l'annoncer.
  const { data: row } = await supabase
    .from("pos_handoffs")
    .select("handoff_number")
    .eq("id", handoffId)
    .maybeSingle();
  return {
    handoffId,
    number: String((row as { handoff_number?: string } | null)?.handoff_number ?? ""),
  };
}

/** « Je m'en occupe » (ou l'inverse). Indicatif : n'empêche personne de reprendre le bon. */
export async function claimPosHandoff(handoffId: string, claim: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("claim_pos_handoff", {
    p_handoff_id: handoffId,
    p_claim: claim,
  });
  if (error) throw businessRpcError(error, "Impossible de prendre ce bon.");
}

/** Abandonne un bon en attente, avec motif. Aucun stock n'avait bougé : rien à défaire. */
export async function cancelPosHandoff(handoffId: string, reason: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_pos_handoff", {
    p_handoff_id: handoffId,
    p_reason: reason,
  });
  if (error) throw businessRpcError(error, "Annulation impossible.");
}

/**
 * Encaisse le bon : la vente réelle est créée côté base (stock, CA, rapports), le bon
 * est marqué payé. Renvoie l'identifiant de la vente pour imprimer le ticket.
 *
 * Pas de repli hors ligne ici, contrairement à la caisse ordinaire : l'encaissement à
 * deux suppose que les deux appareils voient le même serveur. Sans réseau, le caissier
 * n'aurait de toute façon jamais reçu le bon — le repli n'aurait rien à encaisser.
 */
export async function checkoutPosHandoff(params: {
  handoffId: string;
  payments: Array<{
    method: "cash" | "mobile_money" | "card" | "other";
    amount: number;
    reference?: string | null;
  }>;
  discount: number | null;
  customerId: string | null;
  creditDueAt: string | null;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("checkout_pos_handoff", {
    p_handoff_id: params.handoffId,
    p_payments: params.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference ?? null,
    })),
    p_discount: params.discount,
    p_customer_id: params.customerId,
    p_credit_due_at: params.creditDueAt,
  });
  if (error) throw businessRpcError(error, "Encaissement impossible.");
  const saleId = String(data ?? "");
  if (!saleId) throw new Error("Vente non créée.");
  return saleId;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Tenue de caisse — un seul caissier à la fois par boutique (migration 00192)
 * ─────────────────────────────────────────────────────────────────────────── */

export type PosCheckoutHolder = {
  storeId: string;
  holderId: string;
  /** Résolu depuis `profiles` — « Awa » plutôt qu'un UUID sur le bandeau. */
  holderName: string | null;
  takenAt: string;
  lastSeenAt: string;
  isMine: boolean;
};

/**
 * Au-delà, la caisse est considérée comme abandonnée et se reprend sans autorisation.
 * **Doit rester aligné sur l'intervalle de `pos_checkout_take`** (00192) : c'est la base
 * qui tranche, l'écran ne fait qu'anticiper sa décision pour ne pas proposer un bouton
 * qui échouerait.
 */
export const POS_CHECKOUT_STALE_MS = 3 * 60_000;

/** La caisse est-elle libre en pratique — libre, à nous, ou tenue par un absent ? */
export function isCheckoutAvailable(
  holder: PosCheckoutHolder | null,
  nowMs: number = Date.now(),
): boolean {
  if (!holder) return true;
  if (holder.isMine) return true;
  const seen = new Date(holder.lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return true;
  return nowMs - seen > POS_CHECKOUT_STALE_MS;
}

async function mapHolderRow(
  supabase: ReturnType<typeof createClient>,
  row: Row | null,
  myId: string | null,
): Promise<PosCheckoutHolder | null> {
  if (!row) return null;
  const holderId = String(row.holder_id ?? "");
  if (!holderId) return null;
  const names = await fetchCreatorLabels(supabase, [holderId]);
  return {
    storeId: String(row.store_id ?? ""),
    holderId,
    holderName: names.get(holderId) ?? null,
    takenAt: String(row.taken_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? ""),
    isMine:
      typeof row.is_mine === "boolean" ? row.is_mine : Boolean(myId && holderId === myId),
  };
}

/** Qui tient la caisse de cette boutique, en lecture seule. */
export async function fetchPosCheckoutHolder(
  storeId: string,
  myId: string | null,
): Promise<PosCheckoutHolder | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("store_checkout_holders")
    .select("store_id, holder_id, taken_at, last_seen_at")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  return mapHolderRow(supabase, (data ?? null) as Row | null, myId);
}

/**
 * Prend la caisse — ou la garde, ce qui en fait aussi le signe de vie du détenteur.
 * Échoue tant qu'un collègue actif la tient (sauf `force`, réservé au propriétaire).
 */
export async function takePosCheckout(
  storeId: string,
  force = false,
): Promise<PosCheckoutHolder | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("pos_checkout_take", {
    p_store_id: storeId,
    p_force: force,
  });
  if (error) throw businessRpcError(error, "Impossible de prendre la caisse.");
  return mapHolderRow(supabase, (data ?? null) as Row | null, null);
}

/** Rend la caisse : le collègue peut la prendre sans attendre l'expiration. */
export async function releasePosCheckout(storeId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("pos_checkout_release", { p_store_id: storeId });
  if (error) throw businessRpcError(error, "Impossible de rendre la caisse.");
}

/** Réglage entreprise « Caisse à deux » — écrit par le propriétaire (Paramètres). */
export async function setDualCashierEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_dual_cashier_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw mapSupabaseError(error);
}
