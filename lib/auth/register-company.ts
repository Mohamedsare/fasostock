import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultSlugFromCompanyName } from "./slug";

export type RegisterCompanyInput = {
  companyName: string;
  companySlug: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFullName: string;
  firstStoreName: string;
  firstStorePhone: string;
};

/** Aligné sur `AuthService.registerCompany` (Flutter). */
export async function registerCompany(
  supabase: SupabaseClient,
  input: RegisterCompanyInput,
): Promise<{ userId: string; companyId: string; storeId: string }> {
  const companySlug =
    input.companySlug.trim() ||
    defaultSlugFromCompanyName(input.companyName.trim());

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: input.ownerEmail.trim(),
    password: input.ownerPassword,
    options: {
      data: { full_name: input.ownerFullName.trim() },
    },
  });

  if (signUpError) throw signUpError;
  const user = authData.user;
  if (!user) throw new Error("Inscription échouée.");

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: input.ownerFullName.trim(),
    is_super_admin: false,
    is_active: true,
  });
  if (profileError) throw profileError;

  const phone = input.firstStorePhone.trim();
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "create_company_with_owner",
    {
      p_company_name: input.companyName.trim(),
      p_company_slug: companySlug,
      p_store_name: input.firstStoreName.trim(),
      p_store_code: null,
      p_store_phone: phone.length > 0 ? phone : null,
    },
  );

  if (rpcError) throw rpcError;
  if (rpcData == null || typeof rpcData !== "object") {
    throw new Error("Création entreprise échouée.");
  }
  const map = rpcData as Record<string, unknown>;
  const companyId = map.company_id as string;
  const storeId = map.store_id as string;
  if (!companyId || !storeId) throw new Error("Création entreprise échouée.");

  return { userId: user.id, companyId, storeId };
}
