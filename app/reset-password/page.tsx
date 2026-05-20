import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { hasSupabaseConfig } from "@/lib/env";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (!hasSupabaseConfig()) redirect("/setup");

  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <ResetPasswordForm />
    </div>
  );
}
