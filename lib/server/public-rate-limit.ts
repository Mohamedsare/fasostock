import "server-only";

import { createHash } from "crypto";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Limite de débit pour les routes API publiques (voir migration 00185).
 *
 * Le compteur vit en base : sur une plateforme serverless, chaque instance a sa propre
 * mémoire et disparaît entre deux requêtes, donc un compteur local ne protège de rien.
 */

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** IP publique vue par l'hébergeur. `x-forwarded-for` = « client, proxy1, proxy2… ». */
export function clientIpForRateLimit(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")?.trim();
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

/**
 * L'IP n'est jamais stockée en clair : seule son empreinte l'est. Le poivre rend le
 * rapprochement impossible pour qui obtiendrait la table sans la variable d'environnement
 * — l'espace des adresses IPv4 se parcourt sinon en quelques minutes.
 */
function hashKey(scope: string, raw: string): string {
  const pepper = process.env.PUBLIC_RATE_LIMIT_PEPPER?.trim() || "fs-public-rate-limit";
  return createHash("sha256").update(`${scope}:${raw}:${pepper}`).digest("hex");
}

/**
 * Consomme un jeton pour `scope` + IP appelante.
 *
 * En cas d'indisponibilité (service role non configuré, base injoignable), le
 * comportement dépend de l'environnement :
 * — **production : on refuse** (`allowed: false`). Une protection anti-abus qui
 *   s'efface au premier incident ne protège rien, et c'est précisément pendant un
 *   incident qu'on tient à ne pas saturer davantage ;
 * — **développement : on laisse passer**, pour ne pas exiger une clé service role
 *   sur chaque poste.
 */
export async function consumePublicRateLimit(params: {
  req: Request;
  /** Identifie la route protégée — deux routes ne partagent pas leur quota. */
  scope: string;
  /** Nombre d'appels autorisés par fenêtre. */
  max: number;
  windowSeconds: number;
}): Promise<RateLimitVerdict> {
  const failClosed = process.env.NODE_ENV === "production";
  const unavailable: RateLimitVerdict = failClosed
    ? { allowed: false, retryAfterSeconds: 30 }
    : { allowed: true };

  let svc;
  try {
    svc = createServiceRoleClient();
  } catch {
    return unavailable;
  }

  const key = hashKey(params.scope, clientIpForRateLimit(params.req));

  try {
    const { data, error } = await svc.rpc("public_rate_limit_hit", {
      p_key: key,
      p_max: params.max,
      p_window_seconds: params.windowSeconds,
    });
    if (error) return unavailable;

    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean; retry_after_seconds?: number }
      | null
      | undefined;
    if (row?.allowed === true) return { allowed: true };

    const retry = Number(row?.retry_after_seconds);
    return {
      allowed: false,
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60,
    };
  } catch {
    return unavailable;
  }
}
