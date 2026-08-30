import { NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/server/api-auth";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import {
  renderPartnerOfftakeHtml,
  type PartnerOfftakePdfData,
} from "@/lib/server/pdf/partner-offtake-html";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";
import { resolveServerTimeZone } from "@/lib/server/company-timezone";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile money",
  card: "Carte",
  transfer: "Virement",
  other: "Autre",
};

function frDateTime(iso: string | null, tz: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Date SQL (`2026-09-12`) → « 12/09/2026 ». */
function frDate(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Bon d'enlèvement A4.
 *
 * Le navigateur n'envoie que l'identifiant : lignes, montants et règlements sont relus
 * en base avec la session de l'appelant, donc sous sa propre RLS
 * (`partner_offtakes_select`, migration 00211). Un bon imprimé ne peut pas afficher un
 * total que la base ne reconnaît pas, ni un enlèvement d'une autre entreprise — même en
 * fabriquant la requête à la main.
 *
 * La devise, elle, vient de l'écran : le rendu serveur est partagé entre requêtes et
 * n'a aucune devise ambiante.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as { offtakeId?: unknown; currencyCode?: unknown };
    const offtakeId = String(json.offtakeId ?? "").trim();
    if (!UUID_RE.test(offtakeId)) {
      return NextResponse.json({ error: "Enlèvement invalide." }, { status: 400 });
    }
    const askedCurrency = String(json.currencyCode ?? "").trim();
    const currencyLabel = /^[A-Za-z]{3}$/.test(askedCurrency)
      ? askedCurrency.toUpperCase()
      : "FCFA";

    const { data: head, error: hErr } = await supabase
      .from("partner_offtakes")
      .select(
        "id, company_id, store_id, offtake_number, partner_name, partner_phone, note, total_amount, amount_paid, due_at, cancelled_at, created_at",
      )
      .eq("id", offtakeId)
      .maybeSingle();
    if (hErr) return NextResponse.json({ error: hErr.message }, { status: 403 });
    if (!head) {
      return NextResponse.json({ error: "Enlèvement introuvable." }, { status: 404 });
    }
    const o = head as Record<string, unknown>;

    const [{ data: items }, { data: payments }, { data: store }, { data: company }] =
      await Promise.all([
        supabase
          .from("partner_offtake_items")
          .select("label, unit, quantity, unit_price, position")
          .eq("offtake_id", offtakeId)
          .order("position", { ascending: true }),
        supabase
          .from("partner_offtake_payments")
          .select("amount, method, created_at")
          .eq("offtake_id", offtakeId)
          .order("created_at", { ascending: true }),
        supabase
          .from("stores")
          .select("name, address, phone")
          .eq("id", String(o.store_id))
          .maybeSingle(),
        supabase
          .from("companies")
          .select("name, logo_url")
          .eq("id", String(o.company_id))
          .maybeSingle(),
      ]);

    const tz = await resolveServerTimeZone(supabase);
    const st = (store ?? null) as Record<string, unknown> | null;
    const co = (company ?? null) as Record<string, unknown> | null;

    // Logo embarqué en data URL : le rendu ne dépend plus d'un téléchargement réseau
    // pendant l'impression — une image lente ferait expirer tout le document.
    const companyLogoSrc = await remoteImageToDataUrl(
      co?.logo_url == null ? null : String(co.logo_url),
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    );

    const data: PartnerOfftakePdfData = {
      companyName: String(co?.name ?? ""),
      companyLogoSrc,
      storeName: String(st?.name ?? ""),
      storeAddress: st?.address == null ? null : String(st.address),
      storePhone: st?.phone == null ? null : String(st.phone),

      offtakeNumber: String(o.offtake_number ?? ""),
      createdLabel: frDateTime(o.created_at == null ? null : String(o.created_at), tz),
      partnerName: String(o.partner_name ?? ""),
      partnerPhone: o.partner_phone == null ? null : String(o.partner_phone),
      note: o.note == null ? null : String(o.note),
      dueLabel: frDate(o.due_at == null ? null : String(o.due_at), tz),
      cancelled: o.cancelled_at != null,

      currencyLabel,
      totalAmount: Number(o.total_amount ?? 0),
      amountPaid: Number(o.amount_paid ?? 0),

      lines: ((items ?? []) as Array<Record<string, unknown>>).map((it) => ({
        label: String(it.label ?? ""),
        unit: it.unit == null ? null : String(it.unit),
        quantity: Number(it.quantity ?? 0),
        unitPrice: Number(it.unit_price ?? 0),
      })),

      payments: ((payments ?? []) as Array<Record<string, unknown>>).map((p) => ({
        dateLabel: frDateTime(p.created_at == null ? null : String(p.created_at), tz),
        methodLabel: METHOD_LABELS[String(p.method ?? "cash")] ?? "Autre",
        amount: Number(p.amount ?? 0),
      })),
    };

    const html = renderPartnerOfftakeHtml(data);
    const buf = await htmlToPdfBufferA4ResilientWithPageNumbers(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bon-enlevement-${data.offtakeNumber || "document"}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
