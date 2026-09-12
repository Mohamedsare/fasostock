import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { consumePublicRateLimit } from "@/lib/server/public-rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Socle commun des routes `/api/v1` (API publique en lecture, par clé API).
 *
 * L'authentification ne passe PAS par la session : ces routes sont déclarées publiques
 * dans `public-api-routes.ts` et chaque appel présente sa clé. La clé n'est jamais
 * envoyée à la base en clair — seule son empreinte SHA-256 l'est, comparée à
 * `api_keys.key_hash` par les RPC `api_*` (migration 00226).
 */

const API_KEY_FORMAT = /^fs_[0-9a-f]{64}$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function apiJson(body: unknown, status = 200, extra?: Record<string, string>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      // La page d'accueil de l'app pose `same-site` : un site tiers doit pouvoir lire l'API.
      "Cross-Origin-Resource-Policy": "cross-origin",
      ...extra,
    },
  });
}

export function apiError(status: number, code: string, message: string, extra?: Record<string, string>) {
  return apiJson({ error: { code, message } }, status, extra);
}

export function apiPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function isUuid(value: string): boolean {
  return UUID_FORMAT.test(value);
}

/** Clé lue dans `Authorization: Bearer fs_…` ou `X-API-Key: fs_…`. */
function readApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const bearer = /^bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  const raw = bearer || req.headers.get("x-api-key")?.trim() || "";
  return API_KEY_FORMAT.test(raw) ? raw : null;
}

export type ApiCallContext = {
  keyHash: string;
  svc: ReturnType<typeof createServiceRoleClient>;
};

/**
 * Contrôles communs : débit, présence et format de la clé, disponibilité du serveur.
 * Renvoie soit le contexte d'appel, soit la réponse d'erreur à retourner telle quelle.
 */
export async function beginApiCall(
  req: Request,
): Promise<{ ok: true; ctx: ApiCallContext } | { ok: false; response: NextResponse }> {
  const verdict = await consumePublicRateLimit({
    req,
    scope: "api-v1",
    max: 120,
    windowSeconds: 60,
  });
  if (!verdict.allowed) {
    return {
      ok: false,
      response: apiError(429, "rate_limited", "Trop de requêtes. Réessayez dans un instant.", {
        "Retry-After": String(verdict.retryAfterSeconds),
      }),
    };
  }

  const key = readApiKey(req);
  if (!key) {
    return {
      ok: false,
      response: apiError(
        401,
        "missing_api_key",
        "Clé API absente ou mal formée. En-tête attendu : Authorization: Bearer fs_…",
      ),
    };
  }

  let svc: ApiCallContext["svc"];
  try {
    svc = createServiceRoleClient();
  } catch {
    return { ok: false, response: apiError(503, "unavailable", "Service temporairement indisponible.") };
  }

  return { ok: true, ctx: { keyHash: createHash("sha256").update(key).digest("hex"), svc } };
}

/** Traduit le code d'erreur métier renvoyé par une RPC `api_*` en réponse HTTP. */
export function apiRpcErrorResponse(code: string): NextResponse {
  switch (code) {
    case "invalid_key":
      return apiError(401, "invalid_api_key", "Clé API invalide ou révoquée.");
    case "store_forbidden":
      return apiError(403, "store_forbidden", "Cette clé API n'a pas accès à cette boutique.");
    case "store_not_found":
      return apiError(404, "store_not_found", "Boutique introuvable ou désactivée.");
    default:
      return apiError(500, "internal_error", "Erreur inattendue.");
  }
}
