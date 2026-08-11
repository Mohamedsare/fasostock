"use client";

import { AuthCard, AuthPageShell, authInputClass } from "@/components/auth/auth-page-shell";
import { ROUTES } from "@/lib/config/routes";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

const EXPIRED_LINK_MESSAGE =
  "Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien de réinitialisation.";

/**
 * Paramètres du lien de réinitialisation.
 *
 * Ils peuvent arriver de trois façons selon le gabarit d'email et le flux Supabase :
 * — fragment `#access_token=…&refresh_token=…` (lien par défaut, flux implicite) ;
 * — `?token_hash=…&type=recovery` (gabarit « token hash ») ;
 * — `?code=…` (flux PKCE, demande partie du navigateur).
 * Le fragment n'atteint jamais le serveur : c'est pourquoi tout est lu ici.
 */
type LinkParams = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  otpType: string | null;
  code: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

function readLinkParams(): LinkParams {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  const pick = (key: string) => fragment.get(key) ?? url.searchParams.get(key);

  return {
    accessToken: pick("access_token"),
    refreshToken: pick("refresh_token"),
    tokenHash: pick("token_hash") ?? pick("token"),
    otpType: pick("type"),
    code: url.searchParams.get("code"),
    errorCode: pick("error_code") ?? pick("error") ?? pick("auth_error"),
    errorDescription: pick("error_description"),
  };
}

function hasAnyLinkParam(p: LinkParams): boolean {
  return Boolean(
    p.accessToken || p.tokenHash || p.code || p.errorCode || p.errorDescription,
  );
}

function describeLinkError(p: LinkParams): string {
  const raw = `${p.errorCode ?? ""} ${p.errorDescription ?? ""}`.toLowerCase();
  if (
    raw.includes("expired") ||
    raw.includes("access_denied") ||
    raw.includes("link_expired") ||
    raw.includes("invalid")
  ) {
    return EXPIRED_LINK_MESSAGE;
  }
  return "Ce lien de réinitialisation n’est pas valide. Demandez-en un nouveau.";
}

/** Messages Supabase (anglais) → phrase actionnable en français. */
function describeUpdateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("should be different") || m.includes("same as the old")) {
    return "Choisissez un mot de passe différent de l’ancien.";
  }
  if (m.includes("weak") || m.includes("at least") || m.includes("length")) {
    return "Mot de passe trop simple : au moins 8 caractères, avec des chiffres.";
  }
  if (m.includes("session") || m.includes("jwt") || m.includes("token")) {
    return "Votre lien n’est plus valide. Demandez un nouveau lien de réinitialisation.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Problème réseau. Vérifiez votre connexion puis réessayez.";
  }
  return "Impossible de mettre à jour le mot de passe. Réessayez.";
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = readLinkParams();

    /**
     * Nettoyage immédiat de l'URL : les jetons du fragment ne doivent rester ni dans
     * la barre d'adresse ni dans l'historique. Fait avant de créer le client Supabase,
     * qui refuserait de toute façon un fragment implicite (le client navigateur est en PKCE).
     */
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, "", ROUTES.resetPassword);
    }

    const supabase = createClient();
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setLinkError(null);
        setReady(true);
      }
    });

    async function bootstrapSession() {
      if (params.errorCode || params.errorDescription) {
        setLinkError(describeLinkError(params));
        return;
      }

      // 1. Flux implicite : jetons dans le fragment du lien email.
      if (params.accessToken && params.refreshToken) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: params.accessToken,
          refresh_token: params.refreshToken,
        });
        if (cancelled) return;
        if (sessionErr) {
          setLinkError(EXPIRED_LINK_MESSAGE);
          return;
        }
        setReady(true);
        return;
      }

      // 2. Gabarit « token hash » non encore consommé côté serveur.
      if (params.tokenHash) {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          type: (params.otpType as EmailOtpType) || "recovery",
          token_hash: params.tokenHash,
        });
        if (cancelled) return;
        if (otpErr) {
          setLinkError(EXPIRED_LINK_MESSAGE);
          return;
        }
        setReady(true);
        return;
      }

      // 3. Flux PKCE (demande partie de ce navigateur).
      if (params.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          params.code,
        );
        if (cancelled) return;
        if (exchangeError) {
          setLinkError(EXPIRED_LINK_MESSAGE);
          return;
        }
        setReady(true);
        return;
      }

      // 4. Session déjà posée en cookies (lien consommé par `/auth/confirm`).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setReady(true);
        return;
      }

      // Rien d'exploitable : ne pas laisser tourner un chargement sans fin.
      if (!hasAnyLinkParam(params)) {
        setLinkError(
          "Ouvrez le lien reçu par email pour choisir un nouveau mot de passe.",
        );
      }
    }

    void bootstrapSession().catch((e) => {
      reportHandledClientError(e, { source: "auth:reset-password-bootstrap" });
      if (!cancelled) {
        setLinkError("Impossible de valider le lien. Réessayez depuis l’email.");
      }
    });

    return () => {
      cancelled = true;
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
        setError(describeUpdateError(err.message));
        return;
      }
      /**
       * Déconnexion volontaire : le lien email peut avoir été ouvert sur un appareil
       * partagé (cybercafé, téléphone d'un proche). On termine sur la page de connexion,
       * où le nouveau mot de passe est saisi une première fois — preuve qu'il fonctionne.
       */
      await supabase.auth.signOut();
      router.replace(`${ROUTES.login}?password_updated=1`);
      router.refresh();
    } catch (e) {
      reportHandledClientError(e, { source: "auth:reset-password" });
      setError("Impossible de mettre à jour le mot de passe. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (linkError) {
    return (
      <AuthPageShell title="Lien invalide" subtitle="Ce lien de réinitialisation ne fonctionne plus.">
        <AuthCard className="text-center">
          <p className="text-sm text-neutral-600">{linkError}</p>
          <Link
            href={ROUTES.forgotPassword}
            className="mt-6 inline-block text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
          >
            Demander un nouveau lien
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
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
