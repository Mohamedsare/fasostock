"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "credit_reminders_config";

/**
 * Réglage entreprise « Rappels de crédit » — la FRÉQUENCE et les filtres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DANS `company_settings` ET NON EN COLONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le drapeau d'activation, lui, est bien une colonne (`companies.credit_reminders_enabled`,
 * migration 00209) : c'est lui qui décide de l'existence de la page, donc du menu, donc
 * de la garde de route — et cela doit être connu du contexte applicatif.
 *
 * La configuration est d'une autre nature : plusieurs valeurs, changées souvent, et dont
 * l'absence doit valoir « pas encore réglé » et non « faux ». `company_settings` existe
 * depuis 00001, son écriture est réservée au propriétaire depuis 00207, et une valeur
 * manquante retombe naturellement sur les défauts ci-dessous.
 */
export type CreditRemindersConfig = {
  /**
   * Tous les combien de jours l'application rappelle. 1 = chaque jour.
   *
   * Ce n'est pas un délai technique mais un choix de tempérament commercial : le
   * commerçant qui vend à des habitués ne veut pas y penser tous les matins, celui qui
   * fait beaucoup de crédit si.
   */
  frequencyDays: number;
  /**
   * En dessous de ce montant, on ne rappelle rien. Une dette de 500 F relancée chaque
   * jour coûte plus cher en agacement qu'elle ne rapporte.
   */
  minAmount: number;
  /** N'annoncer que les créances dont l'échéance est passée. */
  overdueOnly: boolean;
  /**
   * Combien de clients au maximum par tour. **0 = tous.**
   *
   * La carte fait défiler les débiteurs toute seule, l'un après l'autre, puis se tait.
   * Le tour complet est donc le comportement attendu : le patron veut savoir OÙ EST SON
   * ARGENT, pas en voir trois échantillons. Le plafond reste là pour celui qui a deux
   * cents ardoises et préfère ne revoir que les plus grosses à chaque connexion.
   */
  maxPerSession: number;
  /**
   * Heure à partir de laquelle le rappel peut apparaître (0–23). Personne ne veut
   * penser à ses créances à 5 h du matin en ouvrant la caisse.
   */
  fromHour: number;
};

export const DEFAULT_CREDIT_REMINDERS_CONFIG: CreditRemindersConfig = {
  frequencyDays: 1,
  minAmount: 0,
  overdueOnly: false,
  // 0 = tour complet. C'est la demande d'origine : passer TOUS les debiteurs en revue
  // a la connexion, puis se taire.
  maxPerSession: 0,
  fromHour: 8,
};

/** Cache session : évite que le rappel clignote à chaque changement de page. */
const cache = new Map<string, CreditRemindersConfig>();

export function peekCreditRemindersConfig(
  companyId: string,
): CreditRemindersConfig | undefined {
  return cache.get(companyId);
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Tolérant par construction : toute valeur absente ou aberrante retombe sur le défaut,
 * champ par champ. Un réglage à moitié écrit (version plus ancienne, saisie
 * interrompue) ne doit jamais éteindre la fonction entière.
 */
export function parseCreditRemindersConfig(raw: unknown): CreditRemindersConfig {
  if (raw == null || typeof raw !== "object") return DEFAULT_CREDIT_REMINDERS_CONFIG;
  const o = raw as Record<string, unknown>;
  return {
    frequencyDays: clampInt(o.frequencyDays, 1, 30, DEFAULT_CREDIT_REMINDERS_CONFIG.frequencyDays),
    minAmount: Math.max(0, Number(o.minAmount) || 0),
    overdueOnly: o.overdueOnly === true,
    // Borne basse a 0 (« tous ») et haute a 50 : au-dela, un tour complet durerait plus
    // longtemps que l'attention qu'on peut lui accorder, et la carte deviendrait le mur
    // qu'on ferme sans lire.
    maxPerSession: clampInt(o.maxPerSession, 0, 50, DEFAULT_CREDIT_REMINDERS_CONFIG.maxPerSession),
    fromHour: clampInt(o.fromHour, 0, 23, DEFAULT_CREDIT_REMINDERS_CONFIG.fromHour),
  };
}

export async function fetchCreditRemindersConfig(
  companyId: string,
): Promise<CreditRemindersConfig> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value?: unknown } | null;
  const parsed = parseCreditRemindersConfig(row?.value);
  cache.set(companyId, parsed);
  return parsed;
}

/** Propriétaire : règle la fréquence et les filtres des rappels. */
export async function setCreditRemindersConfig(
  companyId: string,
  config: CreditRemindersConfig,
): Promise<void> {
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
      .update({ value: config })
      .eq("company_id", companyId)
      .eq("key", KEY);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("company_settings")
      .insert({ company_id: companyId, key: KEY, value: config });
    if (error) throw error;
  }
  cache.set(companyId, config);
}

/** Réglage entreprise « Rappels de crédit » (le drapeau) — écrit par le propriétaire. */
export async function setCreditRemindersEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_credit_reminders_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

/** Libellé lisible d'une fréquence, pour l'écran de réglage et la page Rappels. */
export function frequencyLabel(days: number): string {
  if (days <= 1) return "Chaque jour";
  if (days === 7) return "Une fois par semaine";
  if (days === 14) return "Toutes les deux semaines";
  if (days === 30) return "Une fois par mois";
  return `Tous les ${days} jours`;
}
