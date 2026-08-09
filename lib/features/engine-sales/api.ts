"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSaleAuthor } from "@/lib/auth/sale-author";
import { enqueueOutbox } from "@/lib/db/dexie-db";
import { isNetworkErrorPublic } from "@/lib/errors/app-error-mapper";
import {
  OFFLINE_SALE_ID_PREFIX,
  OFFLINE_SALE_NUMBER_LABEL,
} from "@/lib/offline/constants";
import { createClient } from "@/lib/supabase/client";
import { notifyCompanyOwnersPush } from "@/lib/features/push/company-owners-push-client";
import { purgeCancelledSaleAsOwner } from "@/lib/features/sales/api";
import { amountToFrenchWordsCFA } from "@/lib/utils/number-to-french-words";
import type {
  CreateEngineSaleInput,
  CreateEngineSaleResult,
  EngineCondition,
  EnginePaymentStatus,
  EngineSaleDetail,
  EngineSalePaymentLine,
  EngineWheels,
  UpdateEngineSaleDetailsInput,
} from "./types";

function nn(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length > 0 ? v : null;
}

export type EngineSaleListItem = {
  saleId: string;
  saleNumber: string;
  createdAt: string;
  total: number;
  status: string;
  storeId: string;
  clientName: string | null;
  clientPhone: string | null;
  engineDesignation: string | null;
  engineBrand: string | null;
  engineModel: string | null;
  engineChassis: string | null;
  verificationToken: string | null;
  /** Somme des règlements enregistrés. */
  amountPaid: number;
  /** Reste à payer (jamais négatif). */
  remaining: number;
  /** Statut de règlement dérivé (voir `enginePaymentStatus`). */
  paymentStatus: EnginePaymentStatus;
};

/** Dérive le statut de règlement à partir du total et du montant déjà payé. */
export function enginePaymentStatus(total: number, amountPaid: number): EnginePaymentStatus {
  if (amountPaid <= 0) return "unpaid";
  // Tolérance d'arrondi (paiements en FCFA — entiers, mais on reste défensif).
  if (amountPaid >= total - 0.5) return "paid";
  return "partial";
}

function sumPayments(raw: unknown): number {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.reduce((s, p) => s + Number((p as { amount?: unknown })?.amount ?? 0), 0);
}

/** Liste des ventes d'engins d'une entreprise (option : filtrer par boutique). */
export async function listEngineSales(params: {
  companyId: string;
  storeId: string | null;
}): Promise<EngineSaleListItem[]> {
  const supabase = createClient();
  // Garde-fou RLS : sans session valide, la requête ne renvoie PAS une erreur mais 0 ligne
  // (l'utilisateur anonyme ne voit rien). Cela arrive pendant un rafraîchissement de jeton
  // déclenché par une invalidation globale (SyncProvider) → l'historique se viderait « par
  // moment ». On lève plutôt une erreur : TanStack conserve alors les données précédentes
  // (jamais écrasées par une fausse liste vide) et réessaie automatiquement.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session non prête — nouvelle tentative en cours.");

  let q = supabase
    .from("sales")
    .select(
      "id, sale_number, created_at, total, status, store_id, sale_payments(amount), engine_sale_details(client_name, client_phone1, engine_designation, engine_brand, engine_model, engine_chassis, verification_token)",
    )
    .eq("company_id", params.companyId)
    .eq("sale_kind", "engine")
    .order("created_at", { ascending: false })
    .limit(500);
  if (params.storeId) q = q.eq("store_id", params.storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const d = r.engine_sale_details as
      | Record<string, string | null>
      | Record<string, string | null>[]
      | null;
    const det = Array.isArray(d) ? d[0] : d;
    const total = Number(r.total ?? 0);
    const status = String(r.status ?? "");
    // Une vente annulée n'a plus de reste dû (le règlement suit l'annulation métier).
    const amountPaid = status === "cancelled" ? 0 : sumPayments(r.sale_payments);
    return {
      saleId: String(r.id),
      saleNumber: String(r.sale_number ?? r.id),
      createdAt: String(r.created_at ?? ""),
      total,
      status,
      storeId: String(r.store_id ?? ""),
      clientName: det?.client_name ?? null,
      clientPhone: det?.client_phone1 ?? null,
      engineDesignation: det?.engine_designation ?? null,
      engineBrand: det?.engine_brand ?? null,
      engineModel: det?.engine_model ?? null,
      engineChassis: det?.engine_chassis ?? null,
      verificationToken: det?.verification_token ?? null,
      amountPaid,
      remaining: Math.max(0, total - amountPaid),
      paymentStatus: enginePaymentStatus(total, amountPaid),
    };
  });
}

/**
 * Rattache (ou crée) une fiche client pour une vente d'engin à crédit, afin que la
 * dette apparaisse et se gère dans la page **Crédit** (comme une vente standard à crédit).
 * Dédoublonnage par **téléphone exact** ; sinon création d'une nouvelle fiche.
 * Retourne l'id client, ou `null` si impossible.
 */
async function resolveEngineCustomerId(
  supabase: SupabaseClient,
  companyId: string,
  client: CreateEngineSaleInput["client"],
): Promise<string | null> {
  const phone = (client.phone1 ?? "").trim();
  if (phone) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .eq("phone", phone)
      .limit(1);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id?: string }>;
    if (rows.length > 0 && rows[0]?.id) return String(rows[0].id);
  }
  const { data: created, error: cErr } = await supabase
    .from("customers")
    .insert({
      company_id: companyId,
      name: nn(client.name) ?? "Client engin",
      type: "individual",
      phone: phone || null,
      email: nn(client.email),
      address: nn(client.address),
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  return (created as { id?: string }).id ?? null;
}

/**
 * Écrit une vente d'engin dans Supabase (réutilise `create_sale_with_stock` : stock +
 * paiements comme le POS), marque `sale_kind='engine'`, puis écrit `engine_sale_details`.
 *
 * **Idempotent** : le RPC déduplique via `p_client_request_id`, et l'écriture des détails
 * passe par un upsert `ignoreDuplicates` sur la PK `sale_id`. Une ré-exécution (retry outbox
 * après une sync partielle) ne crée donc jamais de doublon. Partagé entre le chemin en ligne
 * et le handler outbox `engine_sale_create` (création hors ligne).
 */
export async function persistEngineSale(
  supabase: SupabaseClient,
  params: CreateEngineSaleInput,
  createdBy: string,
  clientRequestId: string,
): Promise<CreateEngineSaleResult> {
  const qty = Math.max(1, Math.trunc(params.quantity));
  const unitPrice = Math.max(0, params.unitPrice);
  const total = qty * unitPrice;

  // 1. Vente + stock via le RPC existant (une seule ligne : l'engin).
  const { data: saleIdRaw, error } = await supabase.rpc("create_sale_with_stock", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_customer_id: null,
    p_created_by: createdBy,
    p_items: [
      {
        product_id: params.productId,
        quantity: qty,
        unit_price: unitPrice,
        discount: 0,
      },
    ],
    p_payments: params.payments
      .filter((p) => p.amount > 0)
      .map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
    p_discount: 0,
    p_sale_mode: "invoice_pos",
    p_document_type: "a4_invoice",
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  const saleId = String(saleIdRaw ?? "");
  if (!saleId) throw new Error("Vente non créée.");

  // 2. Marquer la vente comme vente d'engin.
  const { error: kindErr } = await supabase
    .from("sales")
    .update({ sale_kind: "engine" })
    .eq("id", saleId);
  if (kindErr) throw kindErr;

  // 3. Détails engin/client (upsert idempotent). verification_token généré par la DB.
  const { error: detErr } = await supabase.from("engine_sale_details").upsert(
    {
      sale_id: saleId,
      company_id: params.companyId,
      client_name: nn(params.client.name),
      client_civility: nn(params.client.civility),
      client_profession: nn(params.client.profession),
      client_full_identity: nn(params.client.fullIdentity),
      client_id_type: nn(params.client.idType),
      client_id_number: nn(params.client.idNumber),
      client_address: nn(params.client.address),
      client_address_extra: nn(params.client.addressExtra),
      client_phone1: nn(params.client.phone1),
      client_phone2: nn(params.client.phone2),
      client_email: nn(params.client.email),
      engine_wheels: params.engine.wheels,
      engine_brand: nn(params.engine.brand),
      engine_model: nn(params.engine.model),
      engine_designation: nn(params.engine.designation),
      engine_chassis: nn(params.engine.chassis),
      engine_motor: nn(params.engine.motor),
      engine_color: nn(params.engine.color),
      engine_condition: params.engine.condition,
      amount_in_words: amountToFrenchWordsCFA(total),
      warranty: params.warranty.enabled,
      warranty_duration: nn(params.warranty.duration),
      warranty_km_limit: nn(params.warranty.kmLimit),
      warranty_covered: nn(params.warranty.covered),
      warranty_conditions: nn(params.warranty.conditions),
      acc_helmet: params.accessories.helmet,
      acc_toolkit: params.accessories.toolkit,
      acc_manual: params.accessories.manual,
      acc_keys: params.accessories.keys,
      acc_vest: params.accessories.vest,
      acc_other: nn(params.accessories.other),
      observations: nn(params.observations),
      internal_reference: nn(params.internalReference),
    },
    { onConflict: "sale_id", ignoreDuplicates: true },
  );
  if (detErr) throw detErr;

  // 3.b Dette engin → rattacher une fiche client pour un suivi dans la page Crédit.
  //     Uniquement s'il reste un solde dû. Idempotent : on ne (re)lie que si la vente
  //     n'a pas déjà un client → aucun doublon même au rejouage de la file outbox.
  const amountPaid = params.payments
    .filter((p) => p.amount > 0)
    .reduce((s, p) => s + p.amount, 0);
  if (total - amountPaid > 0.0001) {
    const { data: meta } = await supabase
      .from("sales")
      .select("customer_id")
      .eq("id", saleId)
      .maybeSingle();
    const linked = (meta as { customer_id?: string | null } | null)?.customer_id ?? null;
    if (!linked) {
      const customerId = await resolveEngineCustomerId(supabase, params.companyId, params.client);
      if (customerId) {
        const { error: linkErr } = await supabase
          .from("sales")
          .update({ customer_id: customerId })
          .eq("id", saleId);
        if (linkErr) throw linkErr;
      }
    }
  }

  // 4. Token de vérification + numéro de vente (lecture après écriture : robuste aux retries).
  const { data: detailRow } = await supabase
    .from("engine_sale_details")
    .select("verification_token")
    .eq("sale_id", saleId)
    .maybeSingle();
  const verificationToken = String(
    (detailRow as { verification_token?: string } | null)?.verification_token ?? "",
  );

  const { data: saleRow } = await supabase
    .from("sales")
    .select("sale_number")
    .eq("id", saleId)
    .maybeSingle();
  const saleNumber = String((saleRow as { sale_number?: string } | null)?.sale_number ?? saleId);

  return { saleId, saleNumber, verificationToken };
}

/**
 * Crée une vente d'engin.
 *
 * - **En ligne** : écrit immédiatement (via `persistEngineSale`) et notifie les propriétaires.
 * - **Hors ligne** : met la vente en file d'attente (outbox `engine_sale_create`, handler
 *   `lib/sync/register-handlers.ts`), synchronisée automatiquement au retour du réseau —
 *   exactement comme le POS (`pos_sale_create`). Retourne alors un `saleId` `offline:*`
 *   (l'appelant saute la facture PDF, disponible après synchronisation).
 */
export async function createEngineSale(
  params: CreateEngineSaleInput,
): Promise<CreateEngineSaleResult> {
  const supabase = createClient();
  // Tolère l'absence de réseau : `getUser()` seul faisait échouer la vente hors ligne
  // avant même d'atteindre la mise en file (voir `resolveSaleAuthor`).
  const author = await resolveSaleAuthor(supabase);
  if (!author.ok) throw author.error;

  const clientRequestId = crypto.randomUUID();

  /** Met la vente en file locale — elle partira dès que le réseau revient. */
  const queueSale = async (): Promise<CreateEngineSaleResult> => {
    await enqueueOutbox("engine_sale_create", {
      params,
      // Peut être absent si le jeton local a expiré pendant la coupure : le handler
      // redemande alors l'utilisateur au serveur au moment de l'envoi.
      createdBy: author.userId ?? "",
      clientRequestId,
    });
    return {
      saleId: `${OFFLINE_SALE_ID_PREFIX}${clientRequestId}`,
      saleNumber: OFFLINE_SALE_NUMBER_LABEL,
      verificationToken: "",
    };
  };

  // Identité non confirmée = serveur injoignable : inutile de tenter la vente en direct.
  if ((typeof navigator !== "undefined" && !navigator.onLine) || !author.verified) {
    return queueSale();
  }

  let result: CreateEngineSaleResult;
  try {
    result = await persistEngineSale(supabase, params, author.userId, clientRequestId);
  } catch (e) {
    /*
     * Même raison qu'au POS : `navigator.onLine` reste `true` sur un réseau qui ne
     * laisse rien passer. Sans ce repli, un engin vendu et payé disparaissait.
     * Le `clientRequestId` est conservé, donc rejouer ne duplique pas la vente.
     * Un refus métier, lui, doit rester visible immédiatement.
     */
    if (isNetworkErrorPublic(e)) return queueSale();
    throw e;
  }

  const total = Math.max(1, Math.trunc(params.quantity)) * Math.max(0, params.unitPrice);
  // Notification propriétaires (best-effort, non bloquant).
  void notifyCompanyOwnersPush({
    companyIds: [params.companyId],
    title: "Nouvelle vente d'engin",
    body: `${result.saleNumber} · ${total.toLocaleString("fr-FR")} FCFA`,
    url: "/engins",
  });

  return result;
}

/** Détail complet d'une vente d'engin (vue + pré-remplissage de l'édition). */
export async function getEngineSaleDetail(saleId: string): Promise<EngineSaleDetail | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("engine_sale_details")
    .select(
      "*, sale:sales(sale_number, status, created_at, store_id, total, sale_payments(id, method, amount, reference, created_at))",
    )
    .eq("sale_id", saleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as Record<string, unknown>;
  type SaleRaw = {
    sale_number?: string;
    status?: string;
    created_at?: string;
    store_id?: string;
    total?: number;
    sale_payments?: Array<{
      id?: string;
      method?: string;
      amount?: number;
      reference?: string | null;
      created_at?: string;
    }> | null;
  };
  const saleRaw = d.sale as SaleRaw | SaleRaw[] | null;
  const sale = Array.isArray(saleRaw) ? saleRaw[0] : saleRaw;
  const payments: EngineSalePaymentLine[] = (sale?.sale_payments ?? [])
    .map((p) => ({
      id: String(p.id ?? crypto.randomUUID()),
      method: String(p.method ?? ""),
      amount: Number(p.amount ?? 0),
      reference: p.reference ?? null,
      createdAt: String(p.created_at ?? ""),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    saleId,
    saleNumber: String(sale?.sale_number ?? saleId),
    status: String(sale?.status ?? ""),
    createdAt: String(sale?.created_at ?? ""),
    storeId: String(sale?.store_id ?? ""),
    total: Number(sale?.total ?? 0),
    client: {
      name: (d.client_name as string) ?? "",
      civility: (d.client_civility as string) ?? null,
      profession: (d.client_profession as string) ?? null,
      fullIdentity: (d.client_full_identity as string) ?? null,
      idType: (d.client_id_type as string) ?? null,
      idNumber: (d.client_id_number as string) ?? null,
      address: (d.client_address as string) ?? null,
      addressExtra: (d.client_address_extra as string) ?? null,
      phone1: (d.client_phone1 as string) ?? null,
      phone2: (d.client_phone2 as string) ?? null,
      email: (d.client_email as string) ?? null,
    },
    engine: {
      wheels: (d.engine_wheels as EngineWheels | null) ?? null,
      brand: (d.engine_brand as string) ?? null,
      model: (d.engine_model as string) ?? null,
      designation: (d.engine_designation as string) ?? null,
      chassis: (d.engine_chassis as string) ?? null,
      motor: (d.engine_motor as string) ?? null,
      color: (d.engine_color as string) ?? null,
      condition: (d.engine_condition as EngineCondition | null) ?? null,
    },
    warranty: {
      enabled: d.warranty === true,
      duration: (d.warranty_duration as string) ?? null,
      kmLimit: (d.warranty_km_limit as string) ?? null,
      covered: (d.warranty_covered as string) ?? null,
      conditions: (d.warranty_conditions as string) ?? null,
    },
    accessories: {
      helmet: d.acc_helmet === true,
      toolkit: d.acc_toolkit === true,
      manual: d.acc_manual === true,
      keys: d.acc_keys === true,
      vest: d.acc_vest === true,
      other: (d.acc_other as string) ?? null,
    },
    amountInWords: (d.amount_in_words as string) ?? null,
    observations: (d.observations as string) ?? null,
    internalReference: (d.internal_reference as string) ?? null,
    verificationToken: (d.verification_token as string) ?? null,
    payments,
  };
}

/** Met à jour les infos descriptives (client/engin/garantie/accessoires) — pas le montant/stock. */
export async function updateEngineSaleDetails(
  saleId: string,
  patch: UpdateEngineSaleDetailsInput,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("engine_sale_details")
    .update({
      client_name: nn(patch.client.name),
      client_civility: nn(patch.client.civility),
      client_profession: nn(patch.client.profession),
      client_full_identity: nn(patch.client.fullIdentity),
      client_id_type: nn(patch.client.idType),
      client_id_number: nn(patch.client.idNumber),
      client_address: nn(patch.client.address),
      client_address_extra: nn(patch.client.addressExtra),
      client_phone1: nn(patch.client.phone1),
      client_phone2: nn(patch.client.phone2),
      client_email: nn(patch.client.email),
      engine_wheels: patch.engine.wheels,
      engine_brand: nn(patch.engine.brand),
      engine_model: nn(patch.engine.model),
      engine_designation: nn(patch.engine.designation),
      engine_chassis: nn(patch.engine.chassis),
      engine_motor: nn(patch.engine.motor),
      engine_color: nn(patch.engine.color),
      engine_condition: patch.engine.condition,
      warranty: patch.warranty.enabled,
      warranty_duration: nn(patch.warranty.duration),
      warranty_km_limit: nn(patch.warranty.kmLimit),
      warranty_covered: nn(patch.warranty.covered),
      warranty_conditions: nn(patch.warranty.conditions),
      acc_helmet: patch.accessories.helmet,
      acc_toolkit: patch.accessories.toolkit,
      acc_manual: patch.accessories.manual,
      acc_keys: patch.accessories.keys,
      acc_vest: patch.accessories.vest,
      acc_other: nn(patch.accessories.other),
      observations: nn(patch.observations),
      internal_reference: nn(patch.internalReference),
    })
    .eq("sale_id", saleId);
  if (error) throw error;
}

/** Supprime définitivement une vente d'engin ANNULÉE (propriétaire). Cascade sur les détails. */
export async function deleteEngineSale(params: {
  companyId: string;
  saleNumber: string;
}): Promise<void> {
  await purgeCancelledSaleAsOwner(params);
}
