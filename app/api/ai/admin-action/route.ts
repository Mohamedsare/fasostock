import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  type?: "set_company_active" | "set_company_ai_predictions";
  companyName?: string;
  value?: boolean;
};

async function getSuperAdminClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: isSa, error } = await supabase.rpc("is_super_admin");
  if (error || !isSa) return { ok: false as const, status: 403 };
  return { ok: true as const, supabase };
}

export async function POST(req: Request) {
  const auth = await getSuperAdminClient();
  if (!auth.ok) return NextResponse.json({ error: "Non autorise" }, { status: auth.status });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const type = body.type;
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  if (!type || !companyName || typeof body.value !== "boolean") {
    return NextResponse.json({ error: "Parametres invalides" }, { status: 400 });
  }

  const supabase = auth.supabase;
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, name")
    .ilike("name", companyName)
    .maybeSingle();
  if (companyErr) return NextResponse.json({ error: companyErr.message }, { status: 500 });
  if (!company?.id) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

  if (type === "set_company_active") {
    const { error } = await supabase
      .from("companies")
      .update({ is_active: body.value, updated_at: new Date().toISOString() })
      .eq("id", company.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: `${company.name} ${body.value ? "activee" : "desactivee"}` });
  }

  if (type === "set_company_ai_predictions") {
    const { error } = await supabase
      .from("companies")
      .update({ ai_predictions_enabled: body.value, updated_at: new Date().toISOString() })
      .eq("id", company.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      message: `Predictions IA ${body.value ? "activees" : "desactivees"} pour ${company.name}`,
    });
  }

  return NextResponse.json({ error: "Type action non supporte" }, { status: 400 });
}
