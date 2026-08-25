import { NextResponse } from "next/server";
import { htmlToPdfBufferA4ResilientWithPageNumbers } from "@/lib/server/pdf/html-to-pdf";
import {
  renderInventorySessionHtml,
  type InventorySessionPdfRow,
} from "@/lib/server/pdf/inventory-session-html";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser, userBelongsToCompany } from "@/lib/server/api-auth";
import { remoteImageToDataUrl } from "@/lib/server/pdf/remote-image-data-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Un inventaire = une ligne par produit du catalogue. Au-delà, le PDF n'est plus
 * une pièce qu'on relit : on garde le résumé et les écarts, et on le dit en clair.
 */
const MAX_DETAIL_ROWS = 4000;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseRows(raw: unknown): InventorySessionPdfRow[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return {
      productName: String(r.productName ?? "Produit"),
      expectedQty: num(r.expectedQty),
      countedQty: r.countedQty == null ? null : num(r.countedQty),
      unitPurchasePrice: num(r.unitPurchasePrice),
    };
  });
}

function parseStatus(v: unknown): "open" | "closed" | "cancelled" {
  return v === "closed" || v === "cancelled" ? v : "open";
}

/**
 * Rapport d'inventaire A4 (boutique ou dépôt).
 *
 * Les lignes viennent du client : elles reproduisent exactement la session qu'il a
 * sous les yeux, nom de produit corrigé en cours de comptage compris, et portent
 * déjà les dates au fuseau de l'entreprise. Le serveur authentifie, vérifie
 * l'appartenance à l'entreprise, puis rend — il ne relit ni ne recalcule rien.
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

    const rows = parseRows(json.rows);
    // Le détail complet saute avant les écarts : c'est la partie qu'on peut perdre
    // sans perdre le sens du document.
    const includeAllLines = json.includeAllLines !== false && rows.length <= MAX_DETAIL_ROWS;

    // Un logo indisponible ne doit pas empêcher le rapport de sortir : la fonction
    // refait le contrôle d'origine et renvoie `null`, on imprime alors sans logo.
    const companyLogoUrl = json.companyLogoUrl == null ? null : String(json.companyLogoUrl);
    const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

    const html = renderInventorySessionHtml({
      companyName: String(json.companyName ?? ""),
      companyLogoSrc: await remoteImageToDataUrl(companyLogoUrl, supabasePublicUrl),
      scopeName: String(json.scopeName ?? ""),
      scopeKind: String(json.scopeKind ?? "Boutique"),
      sessionTitle: String(json.sessionTitle ?? "Inventaire"),
      statusLabel: String(json.statusLabel ?? ""),
      status: parseStatus(json.status),
      startedLabel: String(json.startedLabel ?? ""),
      closedLabel: json.closedLabel == null ? null : String(json.closedLabel),
      generatedLabel: String(json.generatedLabel ?? ""),
      currencyCode: String(json.currencyCode ?? ""),
      countedByLabel: json.countedByLabel == null ? null : String(json.countedByLabel),
      includeAllLines,
      rows,
    });

    const buf = await htmlToPdfBufferA4ResilientWithPageNumbers(html);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="rapport-inventaire.pdf"',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
