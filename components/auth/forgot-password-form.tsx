"use client";

import { authSimpleFieldClass } from "@/components/auth/auth-page-shell";
import { authErrorToMessage } from "@/lib/auth/auth-errors";
import { ROUTES } from "@/lib/config/routes";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const emailOk = (v: string) =>
  /^[\w.-]+@[\w.-]+\.\w+$/.test(v.trim());

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const hasEnv =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0;

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
      <div className="w-full">
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:p-6">
          <div className="flex flex-col items-center text-center">
            <Image
              src="/logo2.png"
              alt=""
              width={72}
              height={72}
              className="h-14 w-14 object-contain sm:h-16 sm:w-16"
              priority
            />
          <p className="mt-2 text-[2rem] font-extrabold leading-none tracking-tight sm:text-[2.2rem]">
            <span className="text-[#111827]">Faso</span>
            <span className="text-[#f97316]">Stock</span>
          </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.65rem]">
              Demande envoyée
            </h1>
            <p className="mt-1 text-sm text-neutral-600 sm:text-[15px]">
              Si un compte existe pour cet email, un lien de réinitialisation a
              été envoyé.
            </p>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-fs-accent/10">
              <Mail
                className="h-7 w-7 text-fs-accent"
                strokeWidth={1.75}
                aria-hidden
              />
            </div>
            <p className="text-center text-sm leading-relaxed text-neutral-600">
              Vérifiez votre boîte de réception (et les spams).
            </p>
            <Link
              href={ROUTES.login}
              className="fs-touch-target mt-6 flex w-full items-center justify-center rounded-lg bg-fs-accent py-3 text-base font-semibold text-white transition-opacity hover:opacity-[0.96]"
            >
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:p-6">
        <div className="mb-3 text-center">
          <Link
            href={ROUTES.login}
            className="text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
          >
            ← Retour à la connexion
          </Link>
        </div>

        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo2.png"
            alt=""
            width={72}
            height={72}
            className="h-14 w-14 object-contain sm:h-16 sm:w-16"
            priority
          />
          <p className="mt-2 text-[2rem] font-extrabold leading-none tracking-tight sm:text-[2.2rem]">
            <span className="text-[#111827]">Faso</span>
            <span className="text-[#f97316]">Stock</span>
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.65rem]">
            Mot de passe oublié
          </h1>
          <p className="mt-1 text-sm text-neutral-600 sm:text-[15px]">
            Entrez votre email pour recevoir un lien de réinitialisation.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2.5">
          {!hasEnv ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              Config Supabase manquante. Ajoutez{" "}
              <code className="rounded bg-white/80 px-1">.env.local</code> puis
              redémarrez le serveur.
            </div>
          ) : null}

          {error ? (
            <div
              className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-950"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <p>{error}</p>
            </div>
          ) : null}

          <label htmlFor="forgot-email" className="sr-only">
            Email
          </label>
          <input
            id="forgot-email"
            className={authSimpleFieldClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="Email"
          />

          <button
            type="submit"
            disabled={loading}
            className="fs-touch-target mt-1 flex w-full items-center justify-center rounded-lg bg-fs-accent py-3 text-base font-semibold text-white transition-opacity hover:opacity-[0.96] disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Envoyer le lien"
            )}
          </button>

          <div className="mt-2 text-center text-sm font-semibold text-fs-accent">
            <Link
              href={ROUTES.login}
              className="underline-offset-4 hover:underline"
            >
              Annuler
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
