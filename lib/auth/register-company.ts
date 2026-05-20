import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthRedirectUrl } from "@/lib/auth/auth-redirect-url";
import {
  isRegisterEmailAlreadyUsedError,
  RegisterEmailAlreadyUsedError,
} from "@/lib/auth/register-errors";
import { defaultSlugFromCompanyName } from "./slug";

export type RegisterCompanyInput = {
  companyName: string;
  companySlug: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFullName: string;
  firstStoreName: string;
  firstStorePhone: string;
  /** Slug aligné `business-types.ts` — persisté en `companies.business_type_slug`. */
  businessTypeSlug?: string | null;
};

export type RegisterCompanyResult = {
  userId: string;
  companyId?: string;
  storeId?: string;
  /** Compte auth créé ; l’utilisateur doit confirmer son email avant création entreprise. */
  needsEmailConfirmation: boolean;
};

/** Pas de session JWT → email à confirmer ou attente (Supabase « Confirm email »). */
function signupNeedsEmailConfirmation(session: unknown): boolean {
  return session == null;
}

function isUnauthorizedDataError(error: { code?: string; status?: number; message?: string }): boolean {
  const code = String(error.code ?? "");
  const status = error.status;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    status === 401 ||
    code === "42501" ||
    code === "PGRST301" ||
    msg.includes("row-level security") ||
    msg.includes("jwt") ||
    msg.includes("not authenticated")
  );
}

/** Aligné sur `AuthService.registerCompany` (Flutter). */
export async function registerCompany(
  supabase: SupabaseClient,
  input: RegisterCompanyInput,
): Promise<RegisterCompanyResult> {
  const companySlug =
    input.companySlug.trim() ||
    defaultSlugFromCompanyName(input.companyName.trim());

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: input.ownerEmail.trim(),
    password: input.ownerPassword,
    options: {
      emailRedirectTo: getAuthRedirectUrl("/auth/callback"),
      data: {
        full_name: input.ownerFullName.trim(),
        pending_registration: {
          companyName: input.companyName.trim(),
          companySlug,
          firstStoreName: input.firstStoreName.trim(),
          firstStorePhone: input.firstStorePhone.trim(),
          businessTypeSlug: input.businessTypeSlug ?? null,
        },
      },
    },
  });

  if (signUpError) {
    if (isRegisterEmailAlreadyUsedError(signUpError)) {
      throw new RegisterEmailAlreadyUsedError();
    }
    throw signUpError;
  }
  const user = authData.user;
  if (!user) throw new Error("Inscription échouée.");

  // Supabase + « Confirm email » : email déjà pris → user sans identité (anti-énumération).
  const identities = user.identities ?? [];
  if (identities.length === 0) {
    throw new RegisterEmailAlreadyUsedError();
  }

  if (signupNeedsEmailConfirmation(authData.session)) {
    return { userId: user.id, needsEmailConfirmation: true };
  }

  await supabase.auth.refreshSession();

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: input.ownerFullName.trim(),
    is_super_admin: false,
    is_active: true,
  });
  if (profileError) {
    if (isUnauthorizedDataError(profileError)) {
      return { userId: user.id, needsEmailConfirmation: true };
    }
    throw profileError;
  }

  const phone = input.firstStorePhone.trim();
  const businessSlug =
    input.businessTypeSlug != null && String(input.businessTypeSlug).trim() !== ""
      ? String(input.businessTypeSlug).trim()
      : null;
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "create_company_with_owner",
    {
      p_company_name: input.companyName.trim(),
      p_company_slug: companySlug,
      p_store_name: input.firstStoreName.trim(),
      p_store_code: null,
      p_store_phone: phone.length > 0 ? phone : null,
      p_business_type_slug: businessSlug,
    },
  );

  if (rpcError) {
    if (isUnauthorizedDataError(rpcError)) {
      return { userId: user.id, needsEmailConfirmation: true };
    }
    throw rpcError;
  }
  if (rpcData == null || typeof rpcData !== "object") {
    throw new Error("Création entreprise échouée.");
  }
  const map = rpcData as Record<string, unknown>;
  const companyId = map.company_id as string;
  const storeId = map.store_id as string;
  if (!companyId || !storeId) throw new Error("Création entreprise échouée.");

  await supabase.auth.updateUser({
    data: { pending_registration: null },
  });

  return {
    userId: user.id,
    companyId,
    storeId,
    needsEmailConfirmation: false,
  };
}
