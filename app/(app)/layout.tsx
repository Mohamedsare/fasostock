import { AppShell } from "@/components/layout/app-shell";
import { AppRouteGuard } from "@/components/permissions/app-route-guard";
import { ServerRouteGuard } from "@/components/permissions/server-route-guard";
import { SessionKeeper } from "@/components/auth/session-keeper";
import { hasSupabaseConfig } from "@/lib/env";
import { resolveServerSession } from "@/lib/auth/server-session";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!hasSupabaseConfig()) redirect("/setup");

  const supabase = await createClient();
  const session = await resolveServerSession(supabase);

  /**
   * On ne renvoie au login que si l'on est **sûr** qu'il n'y a plus de session. Quand la
   * vérification échoue (réseau coupé, Supabase lent), on affiche quand même l'app :
   * `AppRouteGuard` se rétablit tout seul dès que la connexion revient, au lieu d'éjecter
   * un commerçant en pleine vente.
   */
  if (session.status === "signed-out") redirect("/login");
  const user = session.status === "signed-in" ? session.user : null;

  return (
    <ServerRouteGuard>
      <SessionKeeper />
      <AppShell userEmail={user?.email}>
        <AppRouteGuard>{children}</AppRouteGuard>
      </AppShell>
    </ServerRouteGuard>
  );
}
