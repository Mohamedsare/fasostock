import { headers } from "next/headers";
import type { ReactNode } from "react";

import { NoAccessScreen } from "@/components/permissions/no-access-screen";
import { userCanAccessPathnameOnServer } from "@/lib/server/fetch-app-context";
import { createClient } from "@/lib/supabase/server";

/**
 * Garde serveur (complète la garde client) : refuse le rendu si le chemin
 * n’est autorisé pour aucune entreprise active de l’utilisateur.
 */
export async function ServerRouteGuard({ children }: { children: ReactNode }) {
  try {
    const pathname = (await headers()).get("x-pathname")?.trim() ?? "";
    if (!pathname || pathname === "/") {
      return <>{children}</>;
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return <>{children}</>;
    }

    const allowed = await userCanAccessPathnameOnServer(supabase, user.id, pathname);
    if (!allowed) {
      return <NoAccessScreen />;
    }

    return <>{children}</>;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ServerRouteGuard]", e);
    }
    /* Ne pas bloquer l’app si la garde serveur échoue (réseau, RPC, etc.). */
    return <>{children}</>;
  }
}
