import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { htmlToPdfBufferA4 } from "@/lib/server/pdf/html-to-pdf";
import { renderSubscriptionInvoiceHtml } from "@/lib/server/pdf/subscription-invoice-html";
import { createClient } from "@/lib/supabase/server";
import { isAllowedPdfEmbedImageUrl, requireAuthUser } from "@/lib/server/api-auth";
import { subscriptionPaymentLabel } from "@/lib/features/subscription/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function toDataUrlFromHttp(
  url: string,
  supabaseUrl: string | undefined,
): Promise<string | null> {
  if (!isAllowedPdfEmbedImageUrl(url, supabaseUrl)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/png";
    const ab = await res.arrayBuffer();
    if (ab.byteLength > 2_000_000) return null;
    return `data:${ct};base64,${Buffer.from(ab).toString("base64")}`;
  } catch {
    return null;
  }
}

function ymd(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10).replace(/-/g, "");
  } catch {
    return "00000000";
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as { requestId?: unknown };
    const requestId = typeof json.requestId === "string" ? json.requestId.trim() : "";
    if (!requestId) {
      return NextResponse.json({ error: "requestId requis" }, { status: 400 });
    }

    // RLS : l'utilisateur ne voit que les demandes de son entreprise.
    const { data: reqRow, error: reqErr } = await supabase
      .from("subscription_requests")
      .select(
        "company_id, billing_interval, amount_cents, currency, first_name, last_name, phone, city, payment_method, transaction_id, status, reviewed_at, granted_period_start, granted_period_end, plan:subscription_plans(name)",
      )
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 400 });
    if (!reqRow) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

    const r = reqRow as Record<string, unknown>;
    if (String(r.status) !== "approved") {
      return NextResponse.json(
        { error: "La facture sera disponible après validation du paiement." },
        { status: 400 },
      );
    }

    const companyId = String(r.company_id ?? "");
    const { data: company } = await supabase
      .from("companies")
      .select("name, logo_url")
      .eq("id", companyId)
      .maybeSingle();
    const companyName = String((company as { name?: string } | null)?.name ?? "Entreprise");
    const companyLogoUrl = (company as { logo_url?: string } | null)?.logo_url ?? null;

    const planRaw = r.plan;
    const planObj = Array.isArray(planRaw)
      ? (planRaw[0] as Record<string, unknown> | undefined)
      : (planRaw as Record<string, unknown> | undefined);
    const planName = String(planObj?.name ?? "Pro");

    const billingInterval = String(r.billing_interval) === "year" ? "year" : "month";
    const amountCents = Number(r.amount_cents ?? 0);
    const currency = String(r.currency ?? "XOF");
    const issuedAtIso = String(r.reviewed_at ?? new Date().toISOString());
    const invoiceNumber = `FS-ABO-${ymd(issuedAtIso)}-${requestId.slice(0, 6).toUpperCase()}`;

    const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const companyLogoSrc = companyLogoUrl
      ? await toDataUrlFromHttp(companyLogoUrl, supabasePublicUrl).catch(() => null)
      : null;

    const qrPayload = `FASOSTOCK|ABONNEMENT|${invoiceNumber}|${companyName}|${Math.round(amountCents)} ${currency}|REF:${requestId}`;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#FFFFFF" },
    });

    const html = renderSubscriptionInvoiceHtml({
      invoiceNumber,
      issuedAtIso,
      companyName,
      companyLogoSrc,
      clientName: `${String(r.first_name ?? "")} ${String(r.last_name ?? "")}`.trim(),
      clientPhone: String(r.phone ?? ""),
      clientCity: r.city != null ? String(r.city) : null,
      planName,
      billingInterval,
      periodStartIso: r.granted_period_start != null ? String(r.granted_period_start) : null,
      periodEndIso: r.granted_period_end != null ? String(r.granted_period_end) : null,
      amountCents,
      currency,
      paymentMethodLabel: subscriptionPaymentLabel(String(r.payment_method ?? "")),
      transactionId: r.transaction_id != null ? String(r.transaction_id) : null,
      qrDataUrl,
    });

    const buf = await htmlToPdfBufferA4(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="facture-${invoiceNumber}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
