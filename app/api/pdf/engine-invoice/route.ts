import { NextResponse } from "next/server";
import { htmlToPdfBufferA4 } from "@/lib/server/pdf/html-to-pdf";
import { renderEngineInvoiceHtml } from "@/lib/server/pdf/engine-invoice-html";
import type { EngineInvoiceData } from "@/lib/server/pdf/engine-invoice-html";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { getAppBaseUrl } from "@/lib/email/app-url";
import { engineSaleVerifyPath } from "@/lib/config/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function paymentLabel(m: string | null): string | null {
  switch (m) {
    case "cash":
      return "Espèces";
    case "mobile_money":
      return "Mobile money";
    case "card":
      return "Carte";
    case "transfer":
      return "Virement";
    case "other":
      return "Autre";
    default:
      return null;
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const saleId = new URL(req.url).searchParams.get("saleId")?.trim();
    if (!saleId) {
      return NextResponse.json({ error: "saleId requis." }, { status: 400 });
    }

    // Vente
    const { data: sale, error: sErr } = await supabase
      .from("sales")
      .select("id, company_id, store_id, sale_number, total, status, created_at, created_by, sale_kind")
      .eq("id", saleId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sale) return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
    const s = sale as Record<string, unknown>;
    if (String(s.sale_kind) !== "engine") {
      return NextResponse.json({ error: "Ce n'est pas une vente d'engin." }, { status: 400 });
    }
    const companyId = String(s.company_id);

    const allowed = await userBelongsToCompany(supabase, auth.user.id, companyId);
    if (!allowed) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

    // Détails engin, boutique, entreprise, agent, paiements
    const [detRes, storeRes, companyRes, agentRes, payRes, itemsRes] = await Promise.all([
      supabase.from("engine_sale_details").select("*").eq("sale_id", saleId).maybeSingle(),
      supabase
        .from("stores")
        .select(
          "name, address, phone, logo_url, primary_color, activity, slogan, footer_text, invoice_signer_name, engine_invoice_signatory, engine_invoice_extra_phones",
        )
        .eq("id", String(s.store_id))
        .maybeSingle(),
      supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", String(s.created_by)).maybeSingle(),
      supabase.from("sale_payments").select("method, amount").eq("sale_id", saleId),
      supabase.from("sale_items").select("quantity").eq("sale_id", saleId),
    ]);
    const items = (itemsRes.data ?? []) as { quantity: number }[];
    const quantity = items.reduce((acc, it) => acc + Number(it.quantity ?? 0), 0) || 1;

    const d = (detRes.data ?? {}) as Record<string, unknown>;
    const store = (storeRes.data ?? {}) as Record<string, unknown>;
    const company = (companyRes.data ?? {}) as Record<string, unknown>;
    const agent = (agentRes.data ?? {}) as Record<string, unknown>;
    const payments = (payRes.data ?? []) as { method: string; amount: number }[];

    const total = Number(s.total ?? 0);
    const amountPaid = payments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
    const reste = Math.max(0, total - amountPaid);
    const paymentStatus =
      amountPaid <= 0 ? "Impayé" : amountPaid >= total ? "Payé" : "Partiel";
    const firstMethod = payments[0]?.method ?? null;

    const createdAt = new Date(String(s.created_at));
    const dateLabel = createdAt.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeLabel = createdAt.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const dateLongLabel = createdAt.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const storePhone = (store.phone as string | null)?.trim() ?? "";
    const extraPhones = ((store.engine_invoice_extra_phones as string | null) ?? "")
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    const phones = [storePhone, ...extraPhones].filter(Boolean);

    const token = String(d.verification_token ?? "");
    const verifyUrl = token ? `${getAppBaseUrl()}${engineSaleVerifyPath(token)}` : getAppBaseUrl();

    const data: EngineInvoiceData = {
      invoiceNumber: String(s.sale_number ?? saleId),
      dateLabel,
      timeLabel,
      dateLongLabel,
      companyName: String(store.name ?? company.name ?? "Entreprise"),
      subtitle: (store.activity as string | null)?.trim() || null,
      slogan: (store.slogan as string | null)?.trim() || null,
      address: (store.address as string | null)?.trim() || null,
      phones,
      logoUrl: (store.logo_url as string | null)?.trim() || null,
      primaryColor: (store.primary_color as string | null)?.trim() || "#C1272D",
      footerText: (store.footer_text as string | null)?.trim() || null,
      signatory:
        (store.engine_invoice_signatory as string | null)?.trim() ||
        (store.invoice_signer_name as string | null)?.trim() ||
        null,
      agentName: (agent.full_name as string | null)?.trim() || null,
      place: (store.address as string | null)?.trim() || String(store.name ?? "") || null,

      clientName: (d.client_name as string | null) ?? null,
      clientCivility: (d.client_civility as string | null) ?? null,
      clientProfession: (d.client_profession as string | null) ?? null,
      clientFullIdentity: (d.client_full_identity as string | null) ?? null,
      clientIdType: (d.client_id_type as string | null) ?? null,
      clientIdNumber: (d.client_id_number as string | null) ?? null,
      clientAddress: (d.client_address as string | null) ?? null,
      clientAddressExtra: (d.client_address_extra as string | null) ?? null,
      clientPhone1: (d.client_phone1 as string | null) ?? null,
      clientPhone2: (d.client_phone2 as string | null) ?? null,
      clientEmail: (d.client_email as string | null) ?? null,

      engineWheels: d.engine_wheels != null ? Number(d.engine_wheels) : null,
      engineBrand: (d.engine_brand as string | null) ?? null,
      engineModel: (d.engine_model as string | null) ?? null,
      engineDesignation: (d.engine_designation as string | null) ?? null,
      engineChassis: (d.engine_chassis as string | null) ?? null,
      engineMotor: (d.engine_motor as string | null) ?? null,
      engineColor: (d.engine_color as string | null) ?? null,
      engineCondition: (d.engine_condition as string | null) ?? null,
      quantity,

      total,
      amountInWords: (d.amount_in_words as string | null) ?? null,

      paymentMethodLabel: paymentLabel(firstMethod),
      amountPaid,
      reste,
      paymentStatusLabel: paymentStatus,

      warranty: d.warranty === true,
      warrantyDuration: (d.warranty_duration as string | null) ?? null,
      warrantyKmLimit: (d.warranty_km_limit as string | null) ?? null,
      warrantyCovered: (d.warranty_covered as string | null) ?? null,
      warrantyConditions: (d.warranty_conditions as string | null) ?? null,

      accHelmet: d.acc_helmet === true,
      accToolkit: d.acc_toolkit === true,
      accManual: d.acc_manual === true,
      accKeys: d.acc_keys === true,
      accVest: d.acc_vest === true,
      accOther: (d.acc_other as string | null) ?? null,

      observations: (d.observations as string | null) ?? null,
      internalReference: (d.internal_reference as string | null) ?? null,
      verifyUrl,
    };

    const html = await renderEngineInvoiceHtml(data);
    const buf = await htmlToPdfBufferA4(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="facture-engin-${data.invoiceNumber}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
