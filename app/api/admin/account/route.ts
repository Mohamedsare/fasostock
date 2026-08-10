import { requireSuperAdmin } from "@/lib/server/api-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  currentPassword?: string;
  newEmail?: string | null;
  newPassword?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Le super admin change son propre email et/ou son mot de passe.
 * Le mot de passe actuel est exigé et vérifié côté serveur (anti-détournement de
 * session). Le nouvel email est confirmé automatiquement : pas de lien à cliquer.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const sa = await requireSuperAdmin(supabase);
  if (!sa.ok) return sa.response;

  const currentEmail = String(user.email ?? "").trim().toLowerCase();
  if (!currentEmail) {
    return NextResponse.json(
      { error: "Ce compte n'a pas d'email : changement impossible." },
      { status: 400 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const currentPassword = String(body.currentPassword ?? "");
  const newEmail = String(body.newEmail ?? "").trim().toLowerCase();
  const newPassword = String(body.newPassword ?? "");

  if (!currentPassword) {
    return NextResponse.json({ error: "Mot de passe actuel requis." }, { status: 400 });
  }

  const wantsEmail = newEmail.length > 0 && newEmail !== currentEmail;
  const wantsPassword = newPassword.length > 0;
  if (!wantsEmail && !wantsPassword) {
    return NextResponse.json(
      { error: "Indiquez un nouvel email ou un nouveau mot de passe." },
      { status: 400 },
    );
  }
  if (newEmail.length > 0 && !EMAIL_RE.test(newEmail)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }
  if (wantsPassword && newPassword.length < 8) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
      { status: 400 },
    );
  }
  if (wantsPassword && newPassword === currentPassword) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit être différent de l'actuel." },
      { status: 400 },
    );
  }

  // Vérification du mot de passe actuel sur un client éphémère : la session du
  // navigateur n'est pas touchée (déconnexion locale uniquement).
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!urlRaw || !anonKey) {
    return NextResponse.json(
      { error: "Configuration Supabase incomplète côté serveur." },
      { status: 500 },
    );
  }
  const checker = createSupabaseClient(normalizeSupabaseUrl(urlRaw), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await checker.auth.signInWithPassword({
    email: currentEmail,
    password: currentPassword,
  });
  if (signErr) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 });
  }
  await checker.auth.signOut({ scope: "local" }).catch(() => {});

  const svc = createServiceRoleClient();

  const payload: { email?: string; email_confirm?: boolean; password?: string } = {};
  if (wantsEmail) {
    payload.email = newEmail;
    payload.email_confirm = true;
  }
  if (wantsPassword) payload.password = newPassword;

  const { error: updErr } = await svc.auth.admin.updateUserById(user.id, payload);
  if (updErr) {
    const code = (updErr as { code?: string }).code;
    const already =
      code === "email_exists" || (updErr.message ?? "").toLowerCase().includes("already");
    return NextResponse.json(
      { error: already ? "Un compte existe déjà avec cet email." : updErr.message },
      { status: 400 },
    );
  }

  await svc
    .from("audit_logs")
    .insert({
      user_id: user.id,
      action: "super_admin_account_update",
      entity_type: "auth_user",
      entity_id: user.id,
      old_data: { email: currentEmail },
      new_data: {
        email: wantsEmail ? newEmail : currentEmail,
        email_changed: wantsEmail,
        password_changed: wantsPassword,
      },
    })
    .then(
      () => undefined,
      () => undefined,
    );

  return NextResponse.json({
    ok: true,
    email: wantsEmail ? newEmail : currentEmail,
    emailChanged: wantsEmail,
    passwordChanged: wantsPassword,
  });
}
