import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type SubscribeBody = {
  email?: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  let body: SubscribeBody | null = null;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const email = String(body?.email ?? "").trim();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }

  const emailLower = email.toLowerCase();
  const supabase = await createClient();
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

