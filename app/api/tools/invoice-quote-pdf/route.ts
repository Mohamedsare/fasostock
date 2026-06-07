import { NextResponse } from "next/server";

import { htmlToPdfBufferA4Resilient } from "@/lib/server/pdf/html-to-pdf";
import { renderInvoiceQuoteHtml } from "@/lib/server/pdf/invoice-quote-html";
import {
  createEmptyDocument,
  normalizeDraft,
  pdfFileName,
  type FdDocument,
} from "@/lib/tools/invoice-quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ------------------------------- Garde-fous ------------------------------- */

const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 Mo (2 images ~1,5 Mo + texte)
const MAX_ITEMS = 200;
const MAX_IMG_CHARS = 3_000_000; // ~2,2 Mo en base64
const LIMITS = { designation: 300, name: 200, details: 2000, notes: 4000, label: 120, short: 60 };

const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);
const safeImage = (src: string | null): string | null =>
  src && /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(src) && src.length <= MAX_IMG_CHARS
    ? src
    : null;

/** Applique des limites strictes après normalisation (anti-abus). */
function capDocument(doc: FdDocument): FdDocument {
  return {
    ...doc,
    number: cut(doc.number, LIMITS.short),
    currency: cut(doc.currency, 8),
    secondaryCurrency: cut(doc.secondaryCurrency, 8),
    senderName: cut(doc.senderName, LIMITS.name),
    senderDetails: cut(doc.senderDetails, LIMITS.details),
    clientName: cut(doc.clientName, LIMITS.name),
    clientDetails: cut(doc.clientDetails, LIMITS.details),
    notes: cut(doc.notes, LIMITS.notes),
    signatureLabel: cut(doc.signatureLabel, LIMITS.label),
    logoDataUrl: safeImage(doc.logoDataUrl),
    signatureDataUrl: safeImage(doc.signatureDataUrl),
    items: doc.items.slice(0, MAX_ITEMS).map((it) => ({
      ...it,
      designation: cut(it.designation, LIMITS.designation),
    })),
  };
}

/* --------------------- Limiteur de débit (best-effort) -------------------- */

const HITS = new Map<string, number[]>();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 15;

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  if (HITS.size > 5000) HITS.clear(); // nettoyage opportuniste
  return recent.length > RL_MAX;
}

/* --------------------------------- Route ---------------------------------- */

export async function POST(req: Request) {
  if (isRateLimited(getClientIp(req))) {
    return NextResponse.json({ error: "Trop de requêtes. Réessayez dans une minute." }, { status: 429 });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Document trop volumineux (images trop lourdes ?)." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const doc = capDocument(normalizeDraft(parsed, createEmptyDocument()));

  try {
    const html = renderInvoiceQuoteHtml(doc);
    const pdf = await htmlToPdfBufferA4Resilient(html);
    const fileName = `${pdfFileName(doc)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json(
      { error: `Génération du PDF impossible. ${message}` },
      { status: 500 },
    );
  }
}
