"use client";

import { createClient } from "@/lib/supabase/client";
import {
  MOBILE_MONEY_PROVIDERS,
  type MobileMoneyProvider,
} from "@/lib/features/payments/payment-display";

const KEY = "quick_pos_payments";

/**
 * Réglage entreprise « Encaissement en caisse rapide »
 * (`company_settings.quick_pos_payments`, JSONB — aucune migration : la table est
 * un magasin clé/valeur générique).
 *
 * Trois besoins d'un même comptoir, réunis sous un seul interrupteur maître
 * **désactivé par défaut** : tant qu'il est coupé, la caisse rapide est exactement
 * celle d'avant (trois opérateurs proposés, pas de paiement mixte, client affiché).
 *
 * - `providers` : beaucoup de boutiques n'encaissent qu'avec **un seul** opérateur
 *   (Orange Money). Lui montrer Moov et Wave à chaque vente, c'est une erreur de
 *   saisie qui attend son heure — et un historique faux.
 * - `splitEnabled` : le client règle une partie en espèces, le reste en mobile money.
 *   Sans ça, le caissier devait mentir sur le moyen de paiement.
 * - `hideCustomer` : au comptoir à fort débit, personne n'enregistre le client ; le
 *   sélecteur ne fait que ralentir et encombrer le panier.
 */
export type QuickPosPaymentsSettings = {
  /** Interrupteur maître : `false` ⇒ comportement d'origine, les autres champs sont ignorés. */
  enabled: boolean;
  /** Opérateurs mobile money proposés en caisse rapide (jamais vide). */
  providers: MobileMoneyProvider[];
  /** Autorise une vente réglée en espèces **et** en mobile money. */
  splitEnabled: boolean;
  /** Masque le sélecteur de client sur les ventes comptant (le crédit l'exige toujours). */
  hideCustomer: boolean;
};

const ALL_PROVIDERS: MobileMoneyProvider[] = MOBILE_MONEY_PROVIDERS.map((p) => p.id);

export const QUICK_POS_PAYMENTS_DEFAULT: QuickPosPaymentsSettings = {
  enabled: false,
  providers: ALL_PROVIDERS,
  splitEnabled: false,
  hideCustomer: false,
};

/** Cache session (évite un flash « trois opérateurs » à l'ouverture de la caisse). */
const cache = new Map<string, QuickPosPaymentsSettings>();

export function peekQuickPosPayments(
  companyId: string,
): QuickPosPaymentsSettings | undefined {
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

function parseProviders(raw: unknown): MobileMoneyProvider[] {
  if (!Array.isArray(raw)) return ALL_PROVIDERS;
  const kept = ALL_PROVIDERS.filter((id) => raw.includes(id));
  // Une liste vide couperait tout encaissement mobile money : on retombe sur les trois.
  return kept.length > 0 ? kept : ALL_PROVIDERS;
}

function parseSettings(raw: unknown): QuickPosPaymentsSettings {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return QUICK_POS_PAYMENTS_DEFAULT;
  }
  const o = raw as Record<string, unknown>;
  return {
    enabled: parseBool(o.enabled),
    providers: parseProviders(o.providers),
    splitEnabled: parseBool(o.splitEnabled),
    hideCustomer: parseBool(o.hideCustomer),
  };
}

export async function fetchQuickPosPayments(
  companyId: string,
): Promise<QuickPosPaymentsSettings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value?: unknown } | null;
  const result = row == null ? QUICK_POS_PAYMENTS_DEFAULT : parseSettings(row.value);
  cache.set(companyId, result);
  return result;
}

/** Propriétaire : enregistre le réglage complet (l'écran envoie toujours l'objet entier). */
export async function setQuickPosPayments(
  companyId: string,
  settings: QuickPosPaymentsSettings,
): Promise<void> {
  const value: QuickPosPaymentsSettings = {
    enabled: settings.enabled,
    providers: parseProviders(settings.providers),
    splitEnabled: settings.splitEnabled,
    hideCustomer: settings.hideCustomer,
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

/**
 * Opérateurs réellement proposés au caissier : la restriction ne s'applique que si
 * le propriétaire a activé l'interrupteur maître.
 */
export function effectiveQuickPosProviders(
  settings: QuickPosPaymentsSettings | null | undefined,
): MobileMoneyProvider[] {
  if (!settings?.enabled) return ALL_PROVIDERS;
  return parseProviders(settings.providers);
}
