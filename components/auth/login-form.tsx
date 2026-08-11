"use client";

import { AccountLockedScreen } from "@/components/auth/account-locked-screen";
import { authSimpleFieldClass } from "@/components/auth/auth-page-shell";
import { getAuthRedirectUrl } from "@/lib/auth/auth-redirect-url";
import { authErrorToMessage } from "@/lib/auth/auth-errors";
import { completePendingRegistration } from "@/lib/auth/complete-pending-registration";
import {
  getLoginLockStatus,
  recordFailedLogin,
  resetLoginAttempts,
} from "@/lib/auth/lock-status";
import { ROUTES } from "@/lib/config/routes";
import { fireAndForgetCompanyOwnersPush } from "@/lib/features/push/company-owners-push-client";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { AlertCircle, ArrowLeft, Check, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";

/** Email mémorisé si — et seulement si — l'utilisateur coche la case.
 *  Le mot de passe n'est JAMAIS enregistré. */
const REMEMBER_EMAIL_KEY = "fs.login.remembered_email";

function readRememberedEmail(): string | null {
  try {
    const v = window.localStorage.getItem(REMEMBER_EMAIL_KEY)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

function writeRememberedEmail(email: string | null) {
  try {
    if (email) window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    else window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
  } catch {
    /* mode privé / stockage indisponible : on ignore */
  }
}

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
  const confirmEmail = searchParams.get("confirm_email") === "1";
  const passwordUpdated = searchParams.get("password_updated") === "1";
  const authCallbackError = searchParams.get("auth_error");

  const [email, setEmail] = useState(() => searchParams.get("email")?.trim() ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendOk, setResendOk] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Connexion…");
  const [isLocked, setIsLocked] = useState(false);
  const [lockedEmail, setLockedEmail] = useState("");
  // Décoché par défaut : rien n'est retenu tant que l'utilisateur ne le demande pas.
  const [rememberEmail, setRememberEmail] = useState(false);

  // Pré-remplissage uniquement si l'utilisateur l'a explicitement demandé
  // lors d'une connexion précédente (email seul, jamais le mot de passe).
  useEffect(() => {
    const saved = readRememberedEmail();
    if (!saved) return;
    setRememberEmail(true);
    setEmail((current) => (current ? current : saved));
  }, []);

  function blockPasswordCopy(e: ClipboardEvent<HTMLInputElement> | DragEvent<HTMLInputElement>) {
    e.preventDefault();
  }

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
            "Compte bloqué après 5 tentatives. Réessayez dans une trentaine de minutes, ou contactez le support pour un déblocage immédiat.",
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
      writeRememberedEmail(rememberEmail ? emailTrim : null);

      try {
        const pendingDone = await completePendingRegistration(supabase);
        if (pendingDone.completed && pendingDone.companyId) {
          try {
            await fetch("/api/auth/onboarding-emails", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ companyId: pendingDone.companyId }),
            });
          } catch {
            /* non bloquant */
          }
        }
      } catch (pendingErr) {
        reportHandledClientError(pendingErr, { source: "auth:complete-pending-registration" });
        setError("Connexion réussie mais finalisation du compte impossible. Contactez le support.");
        setLoading(false);
        return;
      }

      try {
        const { data: companyIds } = await supabase.rpc("staff_login_notify_company_owners");
        const ids = (Array.isArray(companyIds) ? companyIds : []).filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        if (ids.length > 0) {
          fireAndForgetCompanyOwnersPush({
            companyIds: ids,
            title: "Connexion équipe",
            body: "Un collaborateur s’est connecté à FasoStock.",
            url: "/users",
          });
        }
      } catch {
        /* RPC optionnelle si migration pas encore appliquée */
      }
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

  async function resendConfirmationEmail() {
    const em = email.trim();
    if (!em) {
      setError("Indiquez votre email pour renvoyer le lien de confirmation.");
      return;
    }
    setResendLoading(true);
    setResendOk(false);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email: em,
        options: { emailRedirectTo: getAuthRedirectUrl("/auth/callback") },
      });
      if (err) {
        setError(authErrorToMessage(err));
        return;
      }
      setResendOk(true);
    } catch (e) {
      reportHandledClientError(e, { source: "auth:resend-confirmation" });
      setError("Impossible de renvoyer l’email. Réessayez.");
    } finally {
      setResendLoading(false);
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
    <div className="mx-auto w-full max-w-md">
      <Link
        href="/"
        aria-label="Retour à l’accueil"
        title="Retour à l’accueil"
        className="group mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200/80 bg-white text-neutral-700 shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-x-0.5 hover:border-fs-accent/40 hover:bg-fs-accent/6 hover:text-fs-accent hover:shadow-[0_8px_22px_-8px_rgba(249,115,22,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fs-accent/50 focus-visible:ring-offset-2 active:scale-95"
      >
        <ArrowLeft className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
      </Link>
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:p-6">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/fs.png"
            alt=""
            width={72}
            height={72}
            className="h-20 w-20 object-contain sm:h-24 sm:w-24"
            priority
          />
          <h1 className="mt-2 text-[2rem] font-extrabold leading-none tracking-tight sm:text-[2.2rem]">
            <span className="text-[#111827]">Faso</span>
            <span className="text-[#f97316]">Stock</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-600 sm:text-[15px]">
            Connexion à votre espace
          </p>
        </div>

        <div className="mt-5">
          {passwordUpdated ? (
            <div
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              role="status"
            >
              Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.
            </div>
          ) : null}

          {confirmEmail ? (
            <div
              className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
              role="status"
            >
              <p>
                Un email de confirmation a été envoyé à votre adresse. Cliquez sur le lien pour
                activer votre compte — sans cela, la connexion sera refusée.
              </p>
              <button
                type="button"
                disabled={resendLoading}
                onClick={() => void resendConfirmationEmail()}
                className="mt-2 text-sm font-semibold text-fs-accent underline-offset-4 hover:underline disabled:opacity-60"
              >
                {resendLoading ? "Envoi…" : "Renvoyer l’email de confirmation"}
              </button>
              {resendOk ? (
                <p className="mt-2 text-xs text-emerald-800">Email renvoyé. Vérifiez vos spams.</p>
              ) : null}
            </div>
          ) : null}

          {authCallbackError ? (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950"
              role="alert"
            >
              Lien de confirmation invalide ou expiré. Reconnectez-vous ou renvoyez un email de
              confirmation.
            </div>
          ) : null}

          {registered && !confirmEmail ? (
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

          <form onSubmit={checkLockAndSubmit} autoComplete="off">
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
              // Pas d'auto-remplissage navigateur : c'est la case « Se souvenir
              // de mon email » qui décide, et elle est décochée par défaut.
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(authSimpleFieldClass, "fs-auth-field")}
              placeholder="Email"
            />

            <label htmlFor="login-password" className="sr-only">
              Mot de passe
            </label>
            <input
              id="login-password"
              type="password"
              name="password"
              // « new-password » empêche le remplissage automatique du mot de
              // passe : personne ne doit pouvoir se connecter à votre place.
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onCopy={blockPasswordCopy}
              onCut={blockPasswordCopy}
              onDragStart={blockPasswordCopy}
              onDrop={blockPasswordCopy}
              onContextMenu={(e) => e.preventDefault()}
              spellCheck={false}
              className={cn(authSimpleFieldClass, "fs-auth-field fs-no-copy mt-3")}
              placeholder="Mot de passe"
            />

            <label
              htmlFor="login-remember"
              className="group mt-3 flex cursor-pointer select-none items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 transition-all duration-200 hover:border-fs-accent/40 hover:bg-fs-accent/4 has-checked:border-fs-accent/50 has-checked:bg-fs-accent/6 has-focus-visible:ring-2 has-focus-visible:ring-fs-accent/35"
            >
              <input
                id="login-remember"
                type="checkbox"
                name="remember"
                className="peer sr-only"
                checked={rememberEmail}
                onChange={(e) => {
                  const next = e.target.checked;
                  setRememberEmail(next);
                  if (!next) writeRememberedEmail(null);
                }}
              />
              <span
                aria-hidden
                className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-neutral-300 bg-white transition-all duration-200 peer-checked:border-fs-accent peer-checked:bg-fs-accent peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100"
              >
                <Check className="h-3.5 w-3.5 scale-50 text-white opacity-0 transition-all duration-200" strokeWidth={3.5} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-neutral-800">
                  Se souvenir de mon email
                </span>
                <span className="mt-0.5 flex items-start gap-1.5 text-xs leading-snug text-neutral-500">
                  <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  Le mot de passe n’est jamais enregistré : il faudra toujours le saisir.
                </span>
              </span>
            </label>

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
              href={ROUTES.registerSelectActivity}
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
