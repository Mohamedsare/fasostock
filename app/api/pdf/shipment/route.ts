import { NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/server/api-auth";
import { resolveServerTimeZone } from "@/lib/server/company-timezone";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";
import { renderShipmentHtml, type ShipmentPdfData } from "@/lib/server/pdf/shipment-html";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_LABELS: Record<string, string> = {
  preparing: "Préparé",
  shipped: "Expédié",
  delivered: "Livré",
  cancelled: "Annulé",
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
 * Bordereau d'expédition A4.
 *
 * Le navigateur n'envoie que l'identifiant : l'expédition est relue avec la session de
 * l'appelant, donc sous sa propre RLS (`shipments_select`, migration 00213). Le
 * bordereau ne peut donc afficher ni un colis d'une autre entreprise, ni des frais que
 * la base ne reconnaît pas — même en fabriquant la requête à la main.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as { shipmentId?: unknown; currencyCode?: unknown };
    const shipmentId = String(json.shipmentId ?? "").trim();
    if (!UUID_RE.test(shipmentId)) {
      return NextResponse.json({ error: "Expédition invalide." }, { status: 400 });
    }
    const askedCurrency = String(json.currencyCode ?? "").trim();
    const currencyLabel = /^[A-Za-z]{3}$/.test(askedCurrency)
      ? askedCurrency.toUpperCase()
      : "FCFA";

    const { data: row, error } = await supabase
      .from("shipments")
      .select(
        "id, company_id, store_id, sale_id, shipment_number, recipient_name, recipient_phone, destination, carrier, carrier_phone, tracking_ref, package_count, package_note, goods_amount, shipping_cost, shipping_paid_by, shipping_reimbursed, status, expected_at, note, created_at",
      )
      .eq("id", shipmentId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    if (!row) {
      return NextResponse.json({ error: "Expédition introuvable." }, { status: 404 });
    }
    const s = row as Record<string, unknown>;

    const [{ data: store }, { data: company }, { data: sale }] = await Promise.all([
      supabase
        .from("stores")
        .select("name, address, phone")
        .eq("id", String(s.store_id))
        .maybeSingle(),
      supabase
        .from("companies")
        .select("name, logo_url")
        .eq("id", String(s.company_id))
        .maybeSingle(),
      s.sale_id
        ? supabase
            .from("sales")
            .select("sale_number")
            .eq("id", String(s.sale_id))
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const tz = await resolveServerTimeZone(supabase);
    const st = (store ?? null) as Record<string, unknown> | null;
    const co = (company ?? null) as Record<string, unknown> | null;
    const sa = (sale ?? null) as Record<string, unknown> | null;

    // Logo embarqué en data URL : le rendu ne dépend plus d'un téléchargement réseau.
    const companyLogoSrc = await remoteImageToDataUrl(
      co?.logo_url == null ? null : String(co.logo_url),
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    );

    const status = String(s.status ?? "preparing");
    const data: ShipmentPdfData = {
      companyName: String(co?.name ?? ""),
      companyLogoSrc,
      storeName: String(st?.name ?? ""),
      storeAddress: st?.address == null ? null : String(st.address),
      storePhone: st?.phone == null ? null : String(st.phone),

      shipmentNumber: String(s.shipment_number ?? ""),
      createdLabel: frDateTime(s.created_at == null ? null : String(s.created_at), tz),
      statusLabel: STATUS_LABELS[status] ?? "Préparé",
      cancelled: status === "cancelled",

      recipientName: String(s.recipient_name ?? ""),
      recipientPhone: s.recipient_phone == null ? null : String(s.recipient_phone),
      destination: String(s.destination ?? ""),

      carrier: s.carrier == null ? null : String(s.carrier),
      carrierPhone: s.carrier_phone == null ? null : String(s.carrier_phone),
      trackingRef: s.tracking_ref == null ? null : String(s.tracking_ref),
      packageCount: Math.max(1, Number(s.package_count ?? 1)),
      packageNote: s.package_note == null ? null : String(s.package_note),
      expectedLabel: frDate(s.expected_at == null ? null : String(s.expected_at), tz),

      saleNumber: sa?.sale_number == null ? null : String(sa.sale_number),
      currencyLabel,
      goodsAmount: Number(s.goods_amount ?? 0),

      shippingCost: Number(s.shipping_cost ?? 0),
      shippingPaidByCompany: String(s.shipping_paid_by ?? "company") !== "customer",
      shippingReimbursed: Number(s.shipping_reimbursed ?? 0),

      note: s.note == null ? null : String(s.note),
    };

    const html = renderShipmentHtml(data);
    const buf = await htmlToPdfBufferA4ResilientWithPageNumbers(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bordereau-${data.shipmentNumber || "expedition"}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
