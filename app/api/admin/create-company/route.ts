import { isValidBusinessTypeSlug } from "@/lib/config/business-types";
import { requireAuthUser, requireSuperAdmin } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  companyName?: string;
  companySlug?: string | null;
  ownerEmail?: string;
  ownerPassword?: string;
  ownerFullName?: string;
  firstStoreName?: string;
  firstStorePhone?: string;
  businessTypeSlug?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Création d'un compte entreprise par le super admin, à remettre à un client.
 * L'email du propriétaire est confirmé automatiquement (email_confirm=true) : le
 * client peut se connecter immédiatement sans lien de validation.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  const sa = await requireSuperAdmin(supabase);
  if (!sa.ok) return sa.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const companyName = String(body.companyName ?? "").trim();
  const companySlug = String(body.companySlug ?? "").trim();
  const ownerEmail = String(body.ownerEmail ?? "").trim().toLowerCase();
  const ownerPassword = String(body.ownerPassword ?? "");
  const ownerFullName = String(body.ownerFullName ?? "").trim();
  const firstStoreName = String(body.firstStoreName ?? "").trim();
  const firstStorePhone = String(body.firstStorePhone ?? "").trim();
  const businessTypeSlug = body.businessTypeSlug ? String(body.businessTypeSlug).trim() : null;

  if (!companyName || !ownerEmail || !firstStoreName) {
    return NextResponse.json(
      { error: "Nom de l'entreprise, email du propriétaire et nom de la boutique sont requis." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(ownerEmail)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }
  if (ownerPassword.length < 6) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 6 caractères." },
      { status: 400 },
    );
  }
  if (businessTypeSlug && !isValidBusinessTypeSlug(businessTypeSlug)) {
    return NextResponse.json({ error: "Type d'activité invalide." }, { status: 400 });
  }

  const svc = createServiceRoleClient();

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: ownerFullName ? { full_name: ownerFullName } : undefined,
  });
  if (createErr || !created?.user) {
    const code = (createErr as { code?: string } | null)?.code;
    const already =
      code === "email_exists" || (createErr?.message ?? "").toLowerCase().includes("already");
    return NextResponse.json(
      { error: already ? "Un compte existe déjà avec cet email." : createErr?.message ?? "Création du compte échouée." },
      { status: 400 },
    );
  }

  const ownerId = created.user.id;

  // RPC via la session super admin (is_super_admin() lit auth.uid()).
  const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_create_company_with_owner", {
    p_owner_id: ownerId,
    p_owner_full_name: ownerFullName || null,
    p_company_name: companyName,
    p_company_slug: companySlug || null,
    p_store_name: firstStoreName,
    p_store_phone: firstStorePhone || null,
    p_business_type_slug: businessTypeSlug,
  });

  if (rpcErr) {
    // Rollback du compte auth pour ne pas laisser d'utilisateur orphelin.
    await svc.auth.admin.deleteUser(ownerId).catch(() => {});
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const map = (rpcData ?? null) as Record<string, unknown> | null;
  return NextResponse.json({
    ok: true,
    userId: ownerId,
    email: ownerEmail,
    companyId: map?.company_id != null ? String(map.company_id) : null,
    storeId: map?.store_id != null ? String(map.store_id) : null,
  });
}
