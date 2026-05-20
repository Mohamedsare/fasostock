import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePendingRegistration } from "@/lib/auth/pending-registration";

export type CompletePendingRegistrationResult = {
  completed: boolean;
  companyId?: string;
  storeId?: string;
};

/**
 * Finalise l’inscription après confirmation email : profil + entreprise.
 * No-op si l’utilisateur a déjà une entreprise ou pas de données en attente.
 */
export async function completePendingRegistration(
  supabase: SupabaseClient,
): Promise<CompletePendingRegistrationResult> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { completed: false };

  const { count, error: countErr } = await supabase
    .from("user_company_roles")
    .select("company_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) return { completed: false };

  const pending = parsePendingRegistration(user.user_metadata);
  if (!pending) return { completed: false };

  const fullName =
    user.user_metadata &&
    typeof user.user_metadata === "object" &&
    "full_name" in user.user_metadata
      ? String((user.user_metadata as { full_name?: string }).full_name ?? "").trim()
      : "";
  const ownerName = fullName.length >= 2 ? fullName : "Utilisateur";

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: ownerName,
    is_super_admin: false,
    is_active: true,
  });
  if (profileError) throw profileError;

  const phone = pending.firstStorePhone.trim();
  const { data: rpcData, error: rpcError } = await supabase.rpc("create_company_with_owner", {
    p_company_name: pending.companyName,
    p_company_slug: pending.companySlug,
    p_store_name: pending.firstStoreName,
    p_store_code: null,
    p_store_phone: phone.length > 0 ? phone : null,
    p_business_type_slug: pending.businessTypeSlug,
  });
  if (rpcError) throw rpcError;
  if (rpcData == null || typeof rpcData !== "object") {
    throw new Error("Création entreprise échouée.");
  }
  const map = rpcData as Record<string, unknown>;
  const companyId = map.company_id as string;
  const storeId = map.store_id as string;
  if (!companyId || !storeId) throw new Error("Création entreprise échouée.");

  const { full_name: _fn, pending_registration: _pr, ...restMeta } =
    (user.user_metadata as Record<string, unknown>) ?? {};
  await supabase.auth.updateUser({
    data: {
      ...restMeta,
      full_name: ownerName,
      pending_registration: null,
    },
  });

  return { completed: true, companyId, storeId };
}
