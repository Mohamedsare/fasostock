/**
 * Texte lisible pour toute valeur d’erreur (évite `[object Object]` en logs / toasts).
 * PostgREST / fetch / rejets Promise renvoient souvent des objets, pas des `Error`.
 */
export function formatUnknownErrorMessage(error: unknown, fallback = ""): string {
  if (error instanceof Error) {
    const m = error.message?.trim();
    /** Souvent causé par `new Error(String(obj))` sur un objet. */
    if (m && m !== "[object Object]") return m;
    if (fallback.trim()) return fallback.trim();
    return error.stack?.split("\n")[0]?.trim() || error.name || "Error";
  }
  if (error == null) return fallback;
  if (typeof error === "string") return error.trim() || fallback;
  if (typeof error === "number" || typeof error === "boolean") return String(error);

  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    if (msg != null && typeof msg === "object") {
      try {
        const nested = JSON.stringify(msg);
        if (nested && nested !== "{}") return nested;
      } catch {
        /* */
      }
    }
    for (const key of ["error", "details", "hint", "code", "statusText"] as const) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    try {
      const s = JSON.stringify(error);
      if (s && s !== "{}") return s;
    } catch {
      /* circular */
    }
  }

  const s = String(error);
  if (s === "[object Object]") {
    return fallback.trim() || "Erreur (détails non disponibles)";
  }
  return s.trim() || fallback;
}

/** Alias historique — certains bundles attendent ce nom. */
export const messageFromUnknown = formatUnknownErrorMessage;
