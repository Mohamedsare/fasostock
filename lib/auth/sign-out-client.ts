"use client";

import type { QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type RouterLike = {
  refresh: () => void;
  replace: (href: string) => void;
};

/**
 * Déconnexion Supabase + rafraîchissement Next (cookies SSR) + purge du cache client.
 * À utiliser pour tout bouton « Se déconnecter » (shell, menu Plus, etc.).
 */
export async function signOutAndRedirect(
  router: RouterLike,
  options?: { queryClient?: QueryClient; redirectTo?: string },
) {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("[signOut]", error.message);
  }
  options?.queryClient?.clear();
  router.refresh();
  router.replace(options?.redirectTo ?? "/login");
}
