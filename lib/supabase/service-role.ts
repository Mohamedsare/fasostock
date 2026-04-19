import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";

/** Client serveur avec la clé service_role — contourne la RLS. À n’utiliser que dans des routes API contrôlées. */
export function createServiceRoleClient(): SupabaseClient {
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!urlRaw || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY et NEXT_PUBLIC_SUPABASE_URL sont requis pour cette opération.",
    );
  }
  const url = normalizeSupabaseUrl(urlRaw);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
