import { completePendingRegistration } from "@/lib/auth/complete-pending-registration";
import { ROUTES } from "@/lib/config/routes";
import { getAppBaseUrl } from "@/lib/email/app-url";
import { sendOnboardingEmails } from "@/lib/email/onboarding-emails";
import { isResendConfigured } from "@/lib/email/resend";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function redirectTo(path: string, query?: Record<string, string>) {
  const base = getAppBaseUrl();
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const nextPath = searchParams.get("next");
  const authError = searchParams.get("error_description") ?? searchParams.get("error");

  const resetNext =
    nextPath === ROUTES.resetPassword ||
    nextPath === "/reset-password" ||
    nextPath?.endsWith("/reset-password");

  if (authError) {
    return redirectTo(resetNext ? ROUTES.forgotPassword : ROUTES.login, {
      auth_error: authError.slice(0, 200),
    });
  }

  if (!code) {
    /**
     * Lien de réinitialisation Supabase par défaut (`{{ .ConfirmationURL }}`) : la
     * demande partant du serveur, il n'y a pas de PKCE, donc pas de `?code=`. Les
     * jetons arrivent dans le **fragment** (`#access_token=…`) que le serveur ne
     * voit jamais. Une redirection dont la cible n'a pas de fragment conserve celui
     * de l'URL d'origine (RFC 7231 §7.1.2) : on renvoie donc vers l'écran client,
     * seul capable de le lire.
     */
    if (resetNext) {
      return redirectTo(ROUTES.resetPassword);
    }
    return redirectTo(ROUTES.login, { auth_error: "missing_code" });
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    if (resetNext) {
      // Le code n'a pas pu être échangé ici (vérificateur PKCE absent de ces cookies) :
      // l'écran de réinitialisation sait retenter avec le code, on le lui passe.
      return redirectTo(ROUTES.resetPassword, { code });
    }
    return redirectTo(ROUTES.login, { auth_error: "exchange_failed" });
  }

  if (resetNext) {
    return redirectTo(ROUTES.resetPassword);
  }

  try {
    const result = await completePendingRegistration(supabase);
    if (result.completed && result.companyId && isResendConfigured()) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await sendOnboardingEmails({
        companyId: result.companyId,
        userEmail: user?.email ?? null,
        userName:
          user?.user_metadata && typeof user.user_metadata === "object" && "full_name" in user.user_metadata
            ? String((user.user_metadata as { full_name?: string }).full_name ?? "")
            : null,
      });
    }
  } catch (e) {
    console.error("[auth/callback] complete registration:", e);
    return redirectTo(ROUTES.login, { auth_error: "complete_registration_failed" });
  }

  return redirectTo(ROUTES.dashboard);
}
