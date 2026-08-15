"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * « Masquer des pages dans le menu d'un employé ».
 *
 * Le menu d'un caissier tient sur un écran de cinq pouces : chaque entrée inutile
 * éloigne celles qui servent. Le propriétaire peut donc retirer de SON menu les pages
 * qui ne le concernent pas — aujourd'hui Aide et Notifications, les deux seules qui
 * étaient visibles par tout le monde sans droit associé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS UNE PERMISSION
 * ─────────────────────────────────────────────────────────────────────────────
 * Une permission « voir la page Aide » devrait être accordée à tous les rôles par une
 * migration. Or le code part en production avant que la migration ne soit jouée : dans
 * cet intervalle, la clé n'existe pour PERSONNE et les deux pages disparaîtraient du
 * menu de tous les utilisateurs, propriétaire compris. Un réglage d'affichage n'a pas
 * le droit de casser quoi que ce soit.
 *
 * On le range donc dans `company_settings`, table présente depuis la première
 * migration : valeur absente, illisible ou corrompue ⇒ **rien n'est masqué**, c'est-à-dire
 * exactement le comportement d'avant. Le défaut de ce mécanisme est de ne rien faire.
 *
 * Ce n'est pas non plus une frontière de sécurité, et il ne faut pas le lire comme
 * telle : le contenu de l'aide n'est pas confidentiel, et les notifications sont déjà
 * bornées à leur destinataire par la RLS. Masquer Aide n'éteint aucune notification
 * push ; cela retire une entrée de menu.
 */

const KEY = "employee_hidden_pages";

/** Pages masquables. Volontairement court : on ne masque que ce qui n'a aucun droit. */
export const HIDEABLE_PAGES = ["help", "notifications"] as const;
export type HideablePage = (typeof HIDEABLE_PAGES)[number];

export const HIDEABLE_PAGE_LABELS: Record<HideablePage, string> = {
  help: "Aide",
  notifications: "Notifications",
};

/** `{ [userId]: ["help", "notifications"] }` — seuls les employés concernés y figurent. */
export type HiddenPagesByUser = Record<string, HideablePage[]>;

function isHideable(v: unknown): v is HideablePage {
  return typeof v === "string" && (HIDEABLE_PAGES as readonly string[]).includes(v);
}

/**
 * Normalise ce qui sort de la base. Le JSON a pu être écrit par une version plus
 * récente de l'application (page inconnue) ou touché à la main : on garde ce qu'on
 * comprend et on ignore le reste, plutôt que de tout jeter.
 */
function parseValue(raw: unknown): HiddenPagesByUser {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: HiddenPagesByUser = {};
  for (const [userId, pages] of Object.entries(raw as Record<string, unknown>)) {
    if (!userId || !Array.isArray(pages)) continue;
    const kept = pages.filter(isHideable);
    if (kept.length > 0) out[userId] = [...new Set(kept)];
  }
  return out;
}

/**
 * Lecture pour toute l'entreprise (page Employés).
 *
 * Ne lève jamais : une erreur de lecture doit se traduire par « rien de masqué », pas
 * par un écran en erreur. Le pire cas est un menu un peu plus fourni que voulu.
 */
export async function fetchHiddenEmployeePages(
  companyId: string,
): Promise<HiddenPagesByUser> {
  if (!companyId) return {};
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", KEY)
      .maybeSingle();
    if (error) return {};
    return parseValue((data as { value?: unknown } | null)?.value);
  } catch {
    return {};
  }
}

/** Les pages masquées à UN utilisateur (celles que son propre menu doit ignorer). */
export async function fetchMyHiddenPages(
  companyId: string,
  userId: string,
): Promise<HideablePage[]> {
  if (!companyId || !userId) return [];
  const all = await fetchHiddenEmployeePages(companyId);
  return all[userId] ?? [];
}

/**
 * Propriétaire : fixe la liste des pages masquées à un employé.
 *
 * Lecture-modification-écriture de l'objet entier : deux propriétaires qui régleraient
 * deux employés à la même seconde pourraient s'écraser. Le cas est théorique (un seul
 * patron, réglage fait une fois), et le prix d'une table dédiée — donc d'une migration,
 * donc du risque que ce fichier existe précisément pour éviter — ne le vaut pas.
 */
export async function setEmployeeHiddenPages(params: {
  companyId: string;
  userId: string;
  pages: HideablePage[];
}): Promise<void> {
  const supabase = createClient();
  const current = await fetchHiddenEmployeePages(params.companyId);

  const next: HiddenPagesByUser = { ...current };
  const kept = [...new Set(params.pages.filter(isHideable))];
  if (kept.length > 0) next[params.userId] = kept;
  else delete next[params.userId];

  const { data: existing, error: selErr } = await supabase
    .from("company_settings")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing != null) {
    const { error } = await supabase
      .from("company_settings")
      .update({ value: next })
      .eq("company_id", params.companyId)
      .eq("key", KEY);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("company_settings")
      .insert({ company_id: params.companyId, key: KEY, value: next });
    if (error) throw error;
  }
}
