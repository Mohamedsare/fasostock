"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Propriétaire : ouvre ou ferme la page « Conditionnements » pour l'entreprise
 * (`companies.packagings_page_enabled`, migration 00203).
 *
 * Fermer la page ne supprime rien : les conditionnements enregistrés restent en base,
 * la caisse continue de les proposer et la fiche produit garde sa section. Seule
 * l'entrée de menu — et l'accès à l'adresse — disparaît.
 */
export async function setPackagingsPageEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_packagings_page_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw error;
}
