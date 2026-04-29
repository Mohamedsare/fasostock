import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createHash } from "crypto";

type SubscribeBody = {
  email?: string;
  website?: string;
  elapsedMs?: number;
  turnstileToken?: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")?.trim();
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function hashKey(raw: string): string {
  const pepper = process.env.NEWSLETTER_RATE_LIMIT_PEPPER?.trim() || "fs-newsletter";
  return createHash("sha256").update(`${raw}:${pepper}`).digest("hex");
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token.trim()) return false;
  const body = new URLSearchParams({
    secret,
    response: token.trim(),
    remoteip: ip,
  });
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: SubscribeBody | null = null;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const email = String(body?.email ?? "").trim();
  const website = String(body?.website ?? "").trim();
  const elapsedMs = Number(body?.elapsedMs ?? 0);
  const turnstileToken = String(body?.turnstileToken ?? "");

  // Honeypot anti-bot.
  if (website.length > 0) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  // Human-like minimum fill time.
  if (!Number.isFinite(elapsedMs) || elapsedMs < 1200) {
    return NextResponse.json({ error: "Soumission trop rapide." }, { status: 429 });
  }

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }

  const emailLower = email.toLowerCase();
  const ip = getClientIp(req);
  const ipHash = hashKey(ip);
  const supabase = await createClient();

  // Optional Turnstile enforcement when TURNSTILE_SECRET_KEY exists.
  const captchaOk = await verifyTurnstile(turnstileToken, ip);
  if (!captchaOk) {
    return NextResponse.json({ error: "Vérification anti-bot échouée." }, { status: 400 });
  }

  // Sliding window rate limit: 6 attempts / 15 minutes per IP.
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 6;
  const { data: rlRow } = await supabase
    .from("newsletter_rate_limits")
    .select("key, attempts, window_started_at, blocked_until")
    .eq("key", ipHash)
    .maybeSingle();
  const row = (rlRow ?? null) as {
    key?: string;
    attempts?: number;
    window_started_at?: string;
    blocked_until?: string | null;
  } | null;
  const blockedUntil = row?.blocked_until ? new Date(row.blocked_until).getTime() : 0;
  if (blockedUntil > now) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  }
  const windowStart = row?.window_started_at ? new Date(row.window_started_at).getTime() : now;
  const inWindow = now - windowStart < windowMs;
  const attempts = inWindow ? Number(row?.attempts ?? 0) + 1 : 1;
  const nextBlockedUntil = attempts > maxAttempts ? new Date(now + windowMs).toISOString() : null;
  const nextWindowStart = inWindow ? new Date(windowStart).toISOString() : new Date(now).toISOString();
  const { error: rlErr } = await supabase.from("newsletter_rate_limits").upsert(
    {
      key: ipHash,
      attempts,
      window_started_at: nextWindowStart,
      blocked_until: nextBlockedUntil,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "key" },
  );
  if (rlErr) {
    return NextResponse.json({ error: "Protection anti-abus indisponible." }, { status: 503 });
  }
  if (attempts > maxAttempts) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  }

  const { error } = await supabase.from("newsletter_subscribers").insert({
    email,
    email_lower: emailLower,
    source: "landing_footer",
  });

  if (!error) {
    return NextResponse.json({ ok: true });
  }

  // Déjà inscrit: on reste idempotent côté UX.
  if ((error as { code?: string }).code === "23505") {
    return NextResponse.json({ ok: true, alreadySubscribed: true });
  }

  return NextResponse.json({ error: error.message || "Erreur lors de l'inscription." }, { status: 500 });
}

