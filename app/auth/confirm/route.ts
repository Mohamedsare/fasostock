import { ROUTES } from "@/lib/config/routes";
import { getAppBaseUrl } from "@/lib/email/app-url";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Consomme un lien email « token_hash » (gabarit Supabase côté serveur).
 *
 * Pourquoi cette route en plus de `/auth/callback` : le lien par défaut
 * (`{{ .ConfirmationURL }}`) renvoie les jetons dans le **fragment** de l'URL
 * (`#access_token=…`), que le serveur ne reçoit jamais. Avec `token_hash`, la
 * vérification se fait ici et la session est posée directement en cookies —
 * aucun jeton ne transite par l'URL.
 */

const OTP_TYPES: EmailOtpType[] = [
  "recovery",
  "signup",
  "invite",
  "magiclink",
  "email",
  "email_change",
];

/** Empêche une redirection ouverte : uniquement des chemins internes. */
function safeNextPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function redirectTo(path: string, query?: Record<string, string>) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, getAppBaseUrl());
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash") ?? searchParams.get("token");
  const typeRaw = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next"));
  const authError =
    searchParams.get("error_description") ?? searchParams.get("error");

  const type = OTP_TYPES.includes(typeRaw as EmailOtpType)
    ? (typeRaw as EmailOtpType)
    : null;
  const isRecovery = type === "recovery";
  const fallback = isRecovery ? ROUTES.resetPassword : ROUTES.login;

  if (authError) {
    return redirectTo(fallback, { auth_error: authError.slice(0, 200) });
  }

  if (!tokenHash || !type) {
    return redirectTo(ROUTES.login, { auth_error: "missing_token" });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Lien expiré ou déjà utilisé : on renvoie vers l'écran capable de proposer
    // un nouveau lien plutôt que vers une page de connexion muette.
    return redirectTo(fallback, { auth_error: "link_expired" });
  }

  return redirectTo(next ?? (isRecovery ? ROUTES.resetPassword : ROUTES.dashboard));
}
