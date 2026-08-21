import { NextResponse } from "next/server";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import {
  renderWarehouseMovementsHtml,
  type WarehouseMovementPdfRow,
} from "@/lib/server/pdf/warehouse-movements-html";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Une journée de dépôt, même chargée, tient largement dessous. Au-delà, le document
 * n'est plus une pièce qu'on relit mais un listing — et on le tronque en le disant.
 */
const MAX_ROWS = 3000;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseRows(raw: unknown): { rows: WarehouseMovementPdfRow[]; truncated: boolean } {
  const list = Array.isArray(raw) ? raw : [];
  const truncated = list.length > MAX_ROWS;
  const rows = list.slice(0, MAX_ROWS).map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return {
      time: String(r.time ?? ""),
      productName: String(r.productName ?? "—"),
      sku: r.sku == null ? null : String(r.sku),
      isEntry: r.isEntry === true,
      quantity: num(r.quantity),
      packagingLabel: String(r.packagingLabel ?? ""),
      packsQuantity: num(r.packsQuantity) || 1,
      unitCost: r.unitCost == null ? null : num(r.unitCost),
      reference: String(r.reference ?? ""),
      author: r.author == null ? null : String(r.author),
    };
  });
  return { rows, truncated };
}

/**
 * PDF « Mouvements du dépôt » d'une journée donnée.
 *
 * Les lignes viennent du client : elles reproduisent exactement la journée qu'il a
 * lue à l'écran, filtre de recherche compris, et portent déjà l'heure locale et les
 * libellés traduits. Le serveur authentifie, vérifie l'appartenance à l'entreprise,
 * puis rend — il ne relit ni ne recalcule rien, pour que le papier dise ce que
 * l'utilisateur avait sous les yeux.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const json = (await req.json()) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") throw new Error("Corps JSON invalide");

    const companyId = typeof json.companyId === "string" ? json.companyId.trim() : "";
    if (!companyId) throw new Error("companyId requis");

    const allowed = await userBelongsToCompany(supabase, auth.user.id, companyId);
    if (!allowed) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const { rows, truncated } = parseRows(json.rows);
    const scopeRaw = json.scopeLabel == null ? null : String(json.scopeLabel).trim();
    const scopeLabel = truncated
      ? `${scopeRaw ? `${scopeRaw} — ` : ""}journée tronquée aux ${MAX_ROWS} premiers mouvements`
      : scopeRaw || null;

    // Un logo indisponible ne doit pas empêcher le journal de sortir : la fonction
    // refait le contrôle d'origine et renvoie `null`, on imprime alors sans logo.
    const companyLogoUrl = json.companyLogoUrl == null ? null : String(json.companyLogoUrl);
    const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

    const html = renderWarehouseMovementsHtml({
      companyName: String(json.companyName ?? ""),
      companyLogoSrc: await remoteImageToDataUrl(companyLogoUrl, supabasePublicUrl),
      warehouseName: String(json.warehouseName ?? ""),
      dayLabel: String(json.dayLabel ?? ""),
      generatedLabel: String(json.generatedLabel ?? ""),
      currencyCode: String(json.currencyCode ?? ""),
      scopeLabel,
      rows,
    });

    const buf = await htmlToPdfBufferA4ResilientWithPageNumbers(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="mouvements-depot.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
