"use client";

import { AuthCard, AuthPageShell, authInputClass } from "@/components/auth/auth-page-shell";
import { ROUTES } from "@/lib/config/routes";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Minimum 8 caractères");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message);
        return;
      }
      router.push(ROUTES.login);
      router.refresh();
    } catch (e) {
      reportHandledClientError(e, { source: "auth:reset-password" });
      setError("Impossible de mettre à jour le mot de passe.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <AuthPageShell
        title="Vérification du lien"
        subtitle="Patientez pendant que nous validons votre session sécurisée."
      >
        <AuthCard className="text-center">
          <div
            className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
          <p className="mt-5 text-sm text-neutral-600">
            Si rien ne se passe, ouvrez le lien depuis l’email sur cet appareil.
          </p>
          <Link
            href={ROUTES.login}
            className="mt-6 inline-block text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
          >
            Retour à la connexion
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe sécurisé pour votre compte."
    >
      <AuthCard>
        <form onSubmit={onSubmit} className="space-y-4">
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
              Nouveau mot de passe *
            </span>
            <input
              className={authInputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-800">
              Confirmer *
            </span>
            <input
              className={authInputClass}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="fs-touch-target w-full rounded-xl bg-gradient-to-b from-fs-accent to-[#d94f1a] py-3.5 text-base font-semibold text-white shadow-[0_4px_14px_-2px_rgba(232,93,44,0.45)] disabled:opacity-60"
          >
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </AuthCard>
    </AuthPageShell>
  );
}
