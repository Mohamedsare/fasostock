import { AppShell } from "@/components/layout/app-shell";
import { AppRouteGuard } from "@/components/permissions/app-route-guard";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!hasSupabaseConfig()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell userEmail={user.email}>
      <AppRouteGuard>{children}</AppRouteGuard>
    </AppShell>
  );
}