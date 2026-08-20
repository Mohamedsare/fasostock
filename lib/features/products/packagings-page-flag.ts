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
  if (!error) return;
  /*
   * `PGRST202` = la fonction n'existe pas encore : la migration 00203 n'a pas été
   * appliquée sur cette base. Le message brut de PostgREST ne dirait rien d'utile au
   * propriétaire, qui verrait juste un interrupteur qui refuse de bouger.
   */
  const code = String((error as { code?: string }).code ?? "");
  const message = String((error as { message?: string }).message ?? "").toLowerCase();
  if (code === "PGRST202" || message.includes("could not find the function")) {
    throw new Error(
      "Cette fonction n'est pas encore installée sur votre base : appliquez la migration 00203 (00203_packagings_page_flag.sql) dans Supabase, puis réessayez.",
    );
  }
  throw error;
}
