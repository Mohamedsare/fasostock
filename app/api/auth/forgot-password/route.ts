import { getAuthRedirectUrl } from "@/lib/auth/auth-redirect-url";
import {
  consumePasswordResetAttempt,
  formatPasswordResetBlockedMessage,
} from "@/lib/auth/password-reset-rate-limit";
import { ROUTES } from "@/lib/config/routes";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = { email?: string };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Supabase limite lui-même les envois (60 s entre deux demandes pour un même email, plus
 * un quota horaire par projet). Ses messages arrivent en anglais : on les traduit en
 * consigne actionnable plutôt que de renvoyer « Envoi impossible » sur un simple délai.
 */
function describeSendError(message: string): { error: string; status: number } {
  const m = message.toLowerCase();

  const seconds = m.match(/after (\d+) seconds?/)?.[1];
  if (seconds || m.includes("only request this after")) {
    const n = Number(seconds ?? 60);
    return {
      error: `Un lien vient déjà d’être demandé. Patientez ${n} seconde${n > 1 ? "s" : ""} avant de réessayer, et vérifiez vos spams.`,
      status: 429,
    };
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return {
      error:
        "Trop d’emails envoyés pour le moment. Réessayez dans une heure ou contactez le support.",
      status: 429,
    };
  }
  return {
    error: "Envoi impossible. Réessayez dans quelques instants.",
    status: 502,
  };
}

function createAnonAuthClient() {
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!urlRaw || !key) {
    throw new Error("Config Supabase manquante.");
  }
  return createClient(normalizeSupabaseUrl(urlRaw), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }

  /**
   * L'anti-abus (5 demandes / 24 h) est une protection *secondaire* : Supabase applique
   * déjà ses propres limites sur `/recover`. On ne bloque donc jamais la récupération de
   * mot de passe parce que ce compteur est indisponible — c'est ce qui a rendu la
   * fonctionnalité totalement inutilisable quand la table `password_reset_rate_limits`
   * manquait en base (migration 00187). En cas de souci on trace et on laisse passer.
   */
  let rate = null;
  try {
    rate = await consumePasswordResetAttempt(createServiceRoleClient(), email);
  } catch (e) {
    console.error("[forgot-password] anti-abus indisponible:", e);
  }
  if (!rate) {
    console.error(
      "[forgot-password] anti-abus non appliqué (compteur injoignable) — envoi effectué quand même.",
    );
  }

  if (rate && !rate.allowed) {
    const message = rate.blockedUntil
      ? formatPasswordResetBlockedMessage(rate.blockedUntil)
      : "Trop de demandes de réinitialisation. Réessayez plus tard.";
    return NextResponse.json(
      {
        error: message,
        blockedUntil: rate.blockedUntil,
      },
      { status: 429 },
    );
  }

  try {
    const auth = createAnonAuthClient();
    const { error: sendErr } = await auth.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl(
        `/auth/callback?next=${encodeURIComponent(ROUTES.resetPassword)}`,
      ),
    });
    if (sendErr) {
      console.error("[forgot-password] resetPasswordForEmail:", sendErr.message);
      const { error, status } = describeSendError(sendErr.message);
      return NextResponse.json({ error }, { status });
    }
  } catch (e) {
    console.error("[forgot-password] send:", e);
    return NextResponse.json(
      { error: "Envoi impossible. Réessayez dans quelques instants." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    // `null` quand le compteur est injoignable : l'écran n'annonce alors aucun quota
    // plutôt que d'afficher un chiffre faux.
    remainingAttempts: rate?.remainingAttempts ?? null,
  });
}
