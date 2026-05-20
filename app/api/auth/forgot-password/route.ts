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

  let svc;
  try {
    svc = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "Envoi impossible pour le moment. Réessayez plus tard." },
      { status: 503 },
    );
  }

  const rate = await consumePasswordResetAttempt(svc, email);
  if (!rate) {
    return NextResponse.json(
      { error: "Protection anti-abus indisponible. Réessayez plus tard." },
      { status: 503 },
    );
  }

  if (!rate.allowed) {
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
      return NextResponse.json(
        { error: "Envoi impossible. Réessayez dans quelques instants." },
        { status: 502 },
      );
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
    remainingAttempts: rate.remainingAttempts,
  });
}
