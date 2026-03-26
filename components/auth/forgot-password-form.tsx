"use client";

import { AuthCard, AuthPageShell, authInputClass } from "@/components/auth/auth-page-shell";
import { authErrorToMessage } from "@/lib/auth/auth-errors";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { ROUTES } from "@/lib/config/routes";
import { createClient } from "@/lib/supabase/client";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const emailOk = (v: string) =>
  /^[\w.-]+@[\w.-]+\.\w+$/.test(v.trim());

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!emailOk(email)) {
      setError("Email invalide");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: err } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo:
            origin.length > 0 ? `${origin}/reset-password` : undefined,
        },
      );
      if (err) {
        setError(authErrorToMessage(err));
        return;
      }
      setSent(true);
    } catch (e) {
      reportHandledClientError(e, { source: "auth:forgot-password" });
      setError("Envoi impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthPageShell
        title="Demande envoyée"
        subtitle="Si un compte existe pour cet email, un lien de réinitialisation a été envoyé."
      >
        <AuthCard className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-fs-accent/10">
            <Mail
              className="h-7 w-7 text-fs-accent"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
          <p className="text-sm leading-relaxed text-neutral-600">
            Vérifiez votre boîte de réception (et les spams).
          </p>
          <Link
            href={ROUTES.login}
            className="fs-touch-target mt-8 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-fs-accent to-[#d94f1a] py-3.5 text-base font-semibold text-white shadow-[0_4px_14px_-2px_rgba(232,93,44,0.45)]"
          >
            Retour à la connexion
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      backHref={ROUTES.login}
      backLabel="Retour à la connexion"
      title="Mot de passe oublié"
      subtitle="Entrez votre email pour recevoir un lien de réinitialisation."
    >
      <AuthCard>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error ? (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-800">
              Email *
            </span>
            <input
              className={authInputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="vous@exemple.com"
            />
          </label>

          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={loading}
              className="fs-touch-target flex flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-fs-accent to-[#d94f1a] py-3.5 text-base font-semibold text-white shadow-[0_4px_14px_-2px_rgba(232,93,44,0.45)] disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Envoyer le lien"
              )}
            </button>
            <Link
              href={ROUTES.login}
              className="fs-touch-target flex items-center justify-center py-3 text-center text-sm font-semibold text-fs-accent underline-offset-4 hover:underline sm:px-4"
            >
              Annuler
            </Link>
          </div>
        </form>
      </AuthCard>
    </AuthPageShell>
  );
}
