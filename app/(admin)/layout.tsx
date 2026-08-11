import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { SessionKeeper } from "@/components/auth/session-keeper";
import { hasSupabaseConfig } from "@/lib/env";
import {
  isTransientBackendFailure,
  resolveServerSession,
} from "@/lib/auth/server-session";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!hasSupabaseConfig()) redirect("/setup");

  const supabase = await createClient();
  const session = await resolveServerSession(supabase);

  /** Voir `app/(app)/layout.tsx` : seule une certitude de déconnexion renvoie au login. */
  if (session.status === "signed-out") redirect("/login");

  if (session.status === "signed-in") {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", session.user.id)
      .maybeSingle();

    /** Une coupure réseau n'est pas un refus : on ne sort de l'admin que sur un « non » certain. */
    if (!isTransientBackendFailure(error) && !profile?.is_super_admin) {
      redirect("/dashboard");
    }
  }

  return (
    <>
      <SessionKeeper />
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </>
  );
}
