"use client";

import { DEFAULT_CURRENCY_CODE, isSupportedCurrency } from "@/lib/config/currencies";
import { createClient } from "@/lib/supabase/client";
import { setActiveCurrency } from "@/lib/utils/currency";

const KEY = "currency_code";

/** Cache session : évite d'afficher les prix en FCFA une fraction de seconde avant bascule. */
const cache = new Map<string, string>();

export function peekCompanyCurrency(companyId: string): string | undefined {
  return cache.get(companyId);
}

function parseValue(raw: unknown): string {
  const s = typeof raw === "string" ? raw : String(raw ?? "");
  const code = s.trim().toUpperCase();
  // Une devise inconnue (retirée de la liste, écrite à la main) ne doit pas casser
  // l'affichage d'une facture : on retombe sur la devise par défaut.
  return isSupportedCurrency(code) ? code : DEFAULT_CURRENCY_CODE;
}

/**
 * Devise de l'entreprise (`company_settings.currency_code`).
 *
 * Met à jour au passage la devise active du navigateur : tous les montants affichés
 * en découlent, sans qu'aucun appelant de `formatCurrency` n'ait à la connaître.
 */
export async function fetchCompanyCurrency(companyId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value?: unknown } | null;
  const code = row == null ? DEFAULT_CURRENCY_CODE : parseValue(row.value);
  cache.set(companyId, code);
  setActiveCurrency(code);
  return code;
}

/**
 * La devise est-elle encore modifiable par le propriétaire ?
 *
 * Verrouillée dès la première vente : la changer ensuite réinterpréterait tout
 * l'historique sans convertir un seul montant.
 */
export async function fetchCompanyCurrencyLocked(companyId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("company_currency_locked", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return data === true;
}

/**
 * Propriétaire : choisit la devise.
 *
 * Passe par une fonction serveur qui revalide le rôle **et** le verrou — l'écran ne
 * fait que refléter la règle, il ne la garantit pas.
 */
export async function setCompanyCurrency(companyId: string, code: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_company_currency", {
    p_company_id: companyId,
    p_currency: code,
  });
  if (error) throw error;
  cache.set(companyId, code);
  setActiveCurrency(code);
}
