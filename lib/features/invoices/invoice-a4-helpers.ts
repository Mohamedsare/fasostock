import { formatCurrencyFlutter } from "@/lib/utils/currency";

/**
 * Supprime les points de code non-BMP (emoji, idéogrammes) — fontkit plante souvent au-delà du BMP.
 */
function stripNonBmp(s: string): string {
  const out: string[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0xffff) continue;
    out.push(ch);
  }
  return out.join("");
}

/** Ligatures hors Latin-1 (U+0153) → ASCII pour polices « latin » subset (woff2). */
function foldLigaturesForLatinSubset(s: string): string {
  return s
    .replace(/\u0153/g, "oe")
    .replace(/\u0152/g, "OE")
    .replace(/\u00e6/g, "ae")
    .replace(/\u00c6/g, "AE");
}

/**
 * Ne garde que des glyphes couverts par les polices Noto subset (`/public/fonts/*.woff2`) :
 * ASCII imprimable, tab/saut de ligne, Latin-1 (U+00A0–U+00FF). Le reste → espace.
 * Évite les erreurs fontkit `_addGlyph` / DataView hors limites.
 */
function stripToAsciiAndLatin1(s: string): string {
  const out: string[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0xffff) continue;
    if (cp >= 0x20 && cp <= 0x7e) {
      out.push(ch);
      continue;
    }
    if (cp >= 0xa0 && cp <= 0xff) {
      out.push(ch);
      continue;
    }
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      out.push(ch);
      continue;
    }
    out.push(" ");
  }
  return out.join("").replace(/\s{2,}/g, " ");
}

/**
 * Copie exacte de `InvoiceA4PdfService._sanitizeForPdf` (Flutter) — pour rendu HTML/Puppeteer
 * identique au PDF mobile (pas de trim final, pas de restriction Latin-1).
 */
export function sanitizeForPdfLikeFlutter(s: string): string {
  if (!s.length) return s;
  return s
    .replace(/\uFFFD/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-");
}

/** Aligné sur `InvoiceA4PdfService` Flutter — nettoyage texte PDF. */
export function sanitizeForPdf(s: string): string {
  if (!s.length) return s;
  let t = foldLigaturesForLatinSubset(s)
    .replace(/\uFFFD/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"');
  t = stripNonBmp(t);
  t = stripToAsciiAndLatin1(t);
  return t.trim();
}

export function stripTelPrefix(s: string): string {
  if (!s.length) return s;
  return s.trim().replace(/^Tel\s*:\s*/i, "").trim();
}

export function hexToRgb(hex: string | null | undefined): { r: number; g: number; b: number } {
  if (!hex?.length) return { r: 37, g: 99, b: 235 };
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    return { r, g, b };
  }
  return { r: 37, g: 99, b: 235 };
}

export function formatQuantity(qty: number): string {
  const q = Math.trunc(qty);
  if (q >= 0 && q <= 9) return String(q).padStart(2, "0");
  return String(q);
}

export function isElofTemplate(invoiceTemplate: string | null | undefined): boolean {
  const t = (invoiceTemplate ?? "").trim().toLowerCase();
  return t === "elof";
}

/**
 * Montants facture A4 : alignés sur `format_currency.dart` / `InvoiceA4PdfService`
 * (symbol FCFA, pas le code devise ISO dans le PDF Flutter).
 */
export function formatCurrencyInvoice(value: number, _currencyCode?: string): string {
  return formatCurrencyFlutter(value);
}
