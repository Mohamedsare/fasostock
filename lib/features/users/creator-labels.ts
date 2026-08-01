"use client";

import type { createClient } from "@/lib/supabase/client";

/**
 * « Qui a fait quoi » : traduit un `created_by` (UUID auth) en nom affichable.
 *
 * Pas d'embed PostgREST : il n'existe pas de FK `*.created_by → profiles.id`,
 * l'embed échouerait (« Could not find a relationship … »). On résout donc les
 * noms en une requête groupée sur `profiles`.
 *
 * Le repli montre un identifiant tronqué plutôt qu'un vide : un compte peut
 * avoir été retiré de l'entreprise (RLS : profil illisible) alors que son
 * historique, lui, doit rester lisible.
 */
export function fallbackCreatorLabel(userId: string): string {
  if (userId.length >= 8) return `Utilisateur ${userId.slice(0, 8)}…`;
  return "Utilisateur";
}

export async function fetchCreatorLabels(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(userIds)].filter((id) => id && id.length > 0);
  for (const id of uniq) map.set(id, fallbackCreatorLabel(id));
  if (uniq.length === 0) return map;

  const chunkSize = 120;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const r = row as { id: string; full_name: string | null };
      const fn = r.full_name?.trim();
      map.set(r.id, fn && fn.length > 0 ? fn : fallbackCreatorLabel(r.id));
    }
  }
  return map;
}
