/** Extrait l'identifiant vidéo YouTube depuis les formats d'URL courants. */
export function parseYouTubeId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // ID brut (11 caractères) collé directement.
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    // /embed/ID, /shorts/ID, /live/ID
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "live");
    if (idx >= 0 && parts[idx + 1]) {
      const id = parts[idx + 1];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
  }
  return null;
}

/** URL d'intégration (mode confidentialité renforcée). */
export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}

/** Miniature haute qualité. */
export function youTubeThumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function isValidYouTubeUrl(input: string): boolean {
  return parseYouTubeId(input) != null;
}
