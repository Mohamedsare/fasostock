import { isAllowedPdfEmbedImageUrl } from "@/lib/server/api-auth";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000;

/**
 * Convertit une image distante (Supabase Storage) en data URL pour l'embarquer
 * dans le HTML envoyé à Chromium.
 *
 * Pourquoi : une balise `<img src="https://…">` laissée telle quelle oblige le
 * navigateur headless à aller chercher l'image pendant le rendu — un logo lent
 * ou injoignable fait alors expirer `page.setContent(…, { waitUntil: "load" })`
 * et le PDF entier échoue. En inlinant ici, le rendu ne dépend plus du réseau,
 * et un logo indisponible dégrade proprement (document sans logo) au lieu de
 * casser l'impression et le téléchargement.
 *
 * Renvoie `null` si l'URL n'est pas autorisée, si le téléchargement échoue ou
 * si l'image dépasse la taille maximale — l'appelant se contente alors d'omettre
 * l'image.
 */
export async function remoteImageToDataUrl(
  url: string | null | undefined,
  supabasePublicUrl: string | undefined,
  fallbackContentType = "image/png",
): Promise<string | null> {
  const u = url?.trim();
  if (!u) return null;
  // Déjà embarquée (aperçu client) : rien à télécharger.
  if (u.startsWith("data:")) {
    return isAllowedPdfEmbedImageUrl(u, supabasePublicUrl) ? u : null;
  }
  if (!isAllowedPdfEmbedImageUrl(u, supabasePublicUrl)) return null;
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || fallbackContentType;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) return null;
    return `data:${ct};base64,${Buffer.from(ab).toString("base64")}`;
  } catch {
    return null;
  }
}
