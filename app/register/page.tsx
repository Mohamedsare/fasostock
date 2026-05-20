import { RegisterForm } from "@/components/auth/register-form";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

function RegisterFormFallback() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-10">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-fs-surface-container border-t-fs-accent"
        aria-hidden
      />
      <p className="mt-3 text-sm text-neutral-600">Chargement…</p>
    </div>
  );
}

export default async function RegisterPage() {
  if (!hasSupabaseConfig()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <Suspense fallback={<RegisterFormFallback />}>
      <RegisterForm />
    </Suspense>
  );
}
