import { createBrowserClient } from "@supabase/ssr";

import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";

/**
 * fetch avec une nouvelle tentative sur erreur réseau (Wi‑Fi instable, onglet en veille, coupure courte).
 * Réduit les `TypeError: Failed to fetch` lors de `auth.refreshSession` sans changer la logique métier.
 */
function createFetchWithNetworkRetry(): typeof fetch {
  return async (input, init) => {
    try {
      return await fetch(input, init);
    } catch (first) {
      const isNetworkFailure =
        first instanceof TypeError &&
        /failed to fetch|networkerror|load failed|fetch/i.test(
          first.message || String(first),
        );
      if (!isNetworkFailure) throw first;
      await new Promise((r) => setTimeout(r, 450));
      return await fetch(input, init);
    }
  };
}

export function createClient() {
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!urlRaw || !key) {
    throw new Error(
      "Variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes.",
    );
  }
  const url = normalizeSupabaseUrl(urlRaw);
  return createBrowserClient(url, key, {
    global: {
      fetch: createFetchWithNetworkRetry(),
    },
  });
}
