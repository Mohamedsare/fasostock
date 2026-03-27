import { createClient } from "@/lib/supabase/client";

/**
 * Copie locale (sans import `@/lib/utils/format-unknown-error`) pour éviter cycles / résolution
 * Turbopack où `formatUnknownErrorMessage` pouvait être résolu en `messageFromUnknown` incorrect.
 */
function formatErrorForRemoteLog(error: unknown, fallback = ""): string {
  if (error instanceof Error) {
    const m = error.message?.trim();
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

/**
 * Remontée des erreurs du navigateur (FasoStock web) vers `log_app_error`.
 * `client_kind: web` permet de les distinguer des apps Flutter côté super-admin.
 *
 * Désactiver : `NEXT_PUBLIC_CLIENT_ERROR_LOGS=0` (ex. tests locaux bruyants).
 */
const DEDUPE_MS = 5000;
let lastSentAt = 0;
let lastFingerprint = "";

export function isClientErrorLoggingEnabled(): boolean {
  if (typeof process === "undefined") return true;
  return process.env.NEXT_PUBLIC_CLIENT_ERROR_LOGS !== "0";
}

/** Erreurs attendues / non actionnables côté super-admin (bruit). */
export function shouldSkipRemoteErrorLog(error: unknown): boolean {
  if (error == null) return true;
  const name = error instanceof Error ? error.name : "";
  const msg = formatErrorForRemoteLog(error);
  const combined = `${name} ${msg}`.toLowerCase();
  if (name === "AbortError" || combined.includes("aborterror")) return true;
  if (combined.includes("user aborted")) return true;
  if (combined.includes("cancelled") || combined.includes("canceled")) return true;
  if (combined.includes("load failed") && combined.includes("fetch")) return true;
  /** Session absente / désync — état attendu, écran dédié dans `AppRouteGuard`. */
  if (combined.includes("session utilisateur absente")) return true;
  return false;
}

/** Clé de déduplication sans `source` : évite les doublons toast + react-mutation pour la même erreur. */
function dedupeKey(message: string, stack: string | undefined): string {
  const firstLine = stack
    ? stack
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? ""
    : "";
  return `${message}|${firstLine}`;
}

function scrub(s: string, max = 4000): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export type CaptureWebAppErrorOptions = {
  stack?: string | null;
  source?: string;
  level?: string;
  /** Fusionné dans `p_context` (JSON), ex. queryKey, route. */
  extra?: Record<string, unknown> | null;
};

export async function captureWebAppError(
  error: unknown,
  options?: CaptureWebAppErrorOptions,
): Promise<void> {
  if (!isClientErrorLoggingEnabled()) return;
  if (shouldSkipRemoteErrorLog(error)) return;

  const message = scrub(formatErrorForRemoteLog(error), 4000);
  if (!message.trim()) return;

  const stackStr = options?.stack != null ? scrub(String(options.stack), 16000) : null;
  const source = options?.source ?? "app_web";
  const level = options?.level ?? "error";
  const fp = dedupeKey(message, stackStr ?? undefined);
  const now = Date.now();
  if (fp === lastFingerprint && now - lastSentAt < DEDUPE_MS) return;
  lastFingerprint = fp;
  lastSentAt = now;

  const errType =
    error instanceof Error ? error.name : typeof error === "object" && error != null
      ? (error as object).constructor?.name ?? "Error"
      : typeof error;

  const baseContext: Record<string, unknown> = {
    client_kind: "web",
    href:
      typeof window !== "undefined" && window.location?.href
        ? String(window.location.href).slice(0, 500)
        : null,
    user_agent:
      typeof navigator !== "undefined" && navigator.userAgent
        ? navigator.userAgent.slice(0, 500)
        : null,
  };
  if (options?.extra && Object.keys(options.extra).length > 0) {
    baseContext.extra = options.extra;
  }

  const isDev =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";

  if (isDev) {
    // Visibilité locale : la remonte Supabase peut échouer (RLS, hors ligne).
    console.error("[FasoStock] captureWebAppError", {
      source,
      level,
      message: message.slice(0, 500),
      errType,
    });
  }

  try {
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc("log_app_error", {
      p_source: source,
      p_level: level,
      p_message: message,
      p_stack_trace: stackStr,
      p_error_type: errType,
      p_platform: "web",
      p_context: baseContext,
    });
    if (rpcErr && isDev) {
      console.warn("[FasoStock] log_app_error RPC failed", rpcErr.message);
    }
  } catch (e) {
    if (isDev) {
      console.warn("[FasoStock] log_app_error threw", e);
    }
    /* ne jamais casser l’app */
  }
}

/**
 * Erreurs gérées (toast, catch) : même pipeline que les erreurs globales, avec source explicite.
 */
export function reportHandledClientError(
  error: unknown,
  meta: { source: string; extra?: Record<string, unknown> | null },
): void {
  void captureWebAppError(error, {
    source: meta.source,
    stack: error instanceof Error ? error.stack : undefined,
    extra: meta.extra ?? undefined,
  });
}
