"use client";

import { AccountLockedScreen } from "@/components/auth/account-locked-screen";
import { authSimpleFieldClass } from "@/components/auth/auth-page-shell";
import { authErrorToMessage } from "@/lib/auth/auth-errors";
import {
  getLoginLockStatus,
  recordFailedLogin,
  resetLoginAttempts,
} from "@/lib/auth/lock-status";
import { ROUTES } from "@/lib/config/routes";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

function loginRuntimeErrorToMessage(err: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Connexion internet indisponible. Vérifiez votre réseau puis réessayez.";
  }
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (msg.includes("failed to fetch")) {
      return "Impossible de joindre le serveur d'authentification. Vérifiez la connexion ou réessayez dans un instant.";
    }
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("network") || msg.includes("fetch")) {
      return "Problème réseau pendant la connexion. Réessayez dans quelques secondes.";
    }
    if (msg.includes("abort")) {
      return "La requête a expiré. Réessayez.";
    }
  }
  return "Connexion impossible pour le moment. Réessayez.";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Connexion…");
  const [isLocked, setIsLocked] = useState(false);
  const [lockedEmail, setLockedEmail] = useState("");

  const hasEnv =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0;

  async function checkLockAndSubmit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim();
    if (!em) return;
    setError(null);
    setRemainingAttempts(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const status = await getLoginLockStatus(supabase, em);
      if (status?.locked) {
        setIsLocked(true);
        setLockedEmail(em);
        setLoading(false);
        return;
      }
      await submitLogin(em);
    } catch (lockErr) {
      reportHandledClientError(lockErr, {
        source: "auth:lock-check-fallback",
        extra: { note: "Connexion tentée après échec du contrôle de verrouillage." },
      });
      await submitLogin(em);
    }
  }

  async function submitLogin(emailTrim: string) {
    setError(null);
    setRemainingAttempts(null);
    setLoading(true);
    setLoadingLabel("Connexion…");
    const supabase = createClient();
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: emailTrim,
        password,
      });

      if (signErr) {
        await recordFailedLogin(supabase, emailTrim);
        const status = await getLoginLockStatus(supabase, emailTrim);
        const failed = status?.failedAttempts ?? 0;
        const remaining = Math.max(0, Math.min(5, 5 - failed));

        if (status?.locked) {
          setIsLocked(true);
          setLockedEmail(emailTrim);
          setError(
            "Compte bloqué après 5 tentatives. Contactez le support pour être débloqué.",
          );
          setLoading(false);
          return;
        }

        setError(
          `${authErrorToMessage(signErr)} (${remaining} tentative${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""})`,
        );
        setRemainingAttempts(remaining);
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError("Connexion échouée. Réessayez.");
        setLoading(false);
        return;
      }

      await resetLoginAttempts(supabase);
      await new Promise((r) => setTimeout(r, 400));
      setLoadingLabel("Préparation de votre espace…");
      router.refresh();
      router.push(ROUTES.dashboard);
    } catch (err) {
      reportHandledClientError(err, { source: "auth:login-submit" });
      setError(loginRuntimeErrorToMessage(err));
      setLoading(false);
    }
  }

  if (isLocked) {
    return (
      <AccountLockedScreen
        lockedEmail={lockedEmail}
        onBackToLogin={() => {
          setIsLocked(false);
          setLockedEmail("");
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:p-6">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo1.png"
            alt=""
            width={72}
            height={72}
            className="h-14 w-14 object-contain sm:h-16 sm:w-16"
            priority
          />
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.65rem]">
            FasoStock
          </h1>
          <p className="mt-1 text-sm text-neutral-600 sm:text-[15px]">
            Connexion à votre espace
          </p>
        </div>

        <div className="mt-5">
          {registered ? (
            <div
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              role="status"
            >
              Compte créé. Connectez-vous.
            </div>
          ) : null}

          {!hasEnv ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              Config Supabase manquante. Ajoutez{" "}
              <code className="rounded bg-white/80 px-1">.env.local</code> puis
              redémarrez le serveur.
            </div>
          ) : null}

          {remainingAttempts != null && remainingAttempts < 5 ? (
            <p className="mb-3 text-center text-sm font-medium text-fs-accent">
              Tentatives restantes : {remainingAttempts}
            </p>
          ) : null}

          <form onSubmit={checkLockAndSubmit}>
            {error ? (
              <div
                className="mb-4 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-950"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <p>{error}</p>
              </div>
            ) : null}

            <label htmlFor="login-email" className="sr-only">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authSimpleFieldClass}
              placeholder="Email"
            />

            <label htmlFor="login-password" className="sr-only">
              Mot de passe
            </label>
            <input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(authSimpleFieldClass, "mt-3")}
              placeholder="Mot de passe"
            />

            <button
              type="submit"
              disabled={loading}
              className="fs-touch-target mt-4 flex w-full items-center justify-center rounded-lg bg-fs-accent py-3 text-base font-semibold text-white transition-opacity hover:opacity-[0.96] disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Se connecter"
              )}
            </button>

            {loading ? (
              <p className="mt-2 text-center text-xs text-neutral-500">
                {loadingLabel}
              </p>
            ) : null}
          </form>

          <div className="mt-4 flex flex-row flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-sm font-semibold text-fs-accent sm:gap-x-8">
            <Link
              href="/forgot-password"
              className="fs-touch-target py-1 underline-offset-4 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
            <Link
              href="/register"
              className="fs-touch-target py-1 underline-offset-4 hover:underline"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
