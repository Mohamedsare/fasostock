"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "sale_customer_policy";

/**
 * Réglage entreprise « Vente au nom d'un client »
 * (`company_settings.sale_customer_policy`, JSONB — aucune migration : la table est un
 * magasin clé/valeur générique).
 *
 * Deux règles d'un même comptoir, **désactivées par défaut** toutes les deux. Tant
 * qu'elles le sont, la caisse est exactement celle d'avant : le client reste facultatif
 * (sauf à crédit, où il l'a toujours été) et aucune vente n'est refusée.
 *
 * - `requireCustomer` : le commerçant qui veut savoir QUI a acheté QUOI — relance,
 *   fidélité, garantie, livraison. Sans obligation, la moitié des ventes finit sans
 *   client et le fichier ne vaut plus rien.
 * - `blockOnDebt` : le client qui doit déjà de l'argent repart avec de la marchandise
 *   supplémentaire, et la dette grossit. C'est la première cause d'impayé irrécupérable
 *   au comptoir. Activé, la caisse refuse la nouvelle vente tant que l'ancienne n'est
 *   pas réglée.
 */
export type SaleCustomerPolicy = {
  /** Toute vente doit être rattachée à un client, dans tous les POS. */
  requireCustomer: boolean;
  /** Refuse l'encaissement si le client a une dette en cours. */
  blockOnDebt: boolean;
};

export const SALE_CUSTOMER_POLICY_DEFAULT: SaleCustomerPolicy = {
  requireCustomer: false,
  blockOnDebt: false,
};

/** Cache session (évite un flash « client facultatif » à l'ouverture de la caisse). */
const cache = new Map<string, SaleCustomerPolicy>();

export function peekSaleCustomerPolicy(companyId: string): SaleCustomerPolicy | undefined {
  return cache.get(companyId);
}

function parseBool(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  if (typeof raw === "number") return raw !== 0;
  return false;
}

function parsePolicy(raw: unknown): SaleCustomerPolicy {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return SALE_CUSTOMER_POLICY_DEFAULT;
  }
  const o = raw as Record<string, unknown>;
  return {
    requireCustomer: parseBool(o.requireCustomer),
    blockOnDebt: parseBool(o.blockOnDebt),
  };
}

export async function fetchSaleCustomerPolicy(
  companyId: string,
): Promise<SaleCustomerPolicy> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value?: unknown } | null;
  const result = row == null ? SALE_CUSTOMER_POLICY_DEFAULT : parsePolicy(row.value);
  cache.set(companyId, result);
  return result;
}

/** Propriétaire : enregistre le réglage complet (l'écran envoie toujours l'objet entier). */
export async function setSaleCustomerPolicy(
  companyId: string,
  policy: SaleCustomerPolicy,
): Promise<void> {
  const value: SaleCustomerPolicy = {
    requireCustomer: policy.requireCustomer,
    blockOnDebt: policy.blockOnDebt,
  };
  const supabase = createClient();
  const { data: existing, error: selErr } = await supabase
    .from("company_settings")
    .select("id")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing != null) {
    const { error } = await supabase
      .from("company_settings")
      .update({ value })
      .eq("company_id", companyId)
      .eq("key", KEY);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("company_settings")
      .insert({ company_id: companyId, key: KEY, value });
    if (error) throw error;
  }
  cache.set(companyId, value);
}
