import { LoginForm } from "@/components/auth/login-form";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

function LoginFormFallback() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-fs-surface-container border-t-fs-accent"
        aria-hidden
      />
      <p className="mt-3 text-sm text-neutral-600">Chargement…</p>
    </div>
  );
}

export default async function LoginPage() {
  if (!hasSupabaseConfig()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col justify-center px-4 py-8 sm:px-6 sm:py-10">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
