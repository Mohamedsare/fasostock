import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isPublicApiRoute } from "@/lib/auth/public-api-routes";
import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";

function requestHeadersWithPathname(request: NextRequest): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return requestHeaders;
}

/**
 * Plafond sur l'appel d'auth : ce proxy s'exécute devant **chaque** requête. Un appel
 * Supabase qui pend (incident réseau, projet en pause) bloquerait sinon la requête
 * jusqu'au délai de l'hébergeur, en gardant un slot de concurrence occupé — quelques
 * requêtes suffisent alors à figer tout le site. Généreux : le trajet serveur → Supabase
 * se compte normalement en dizaines de millisecondes.
 */
const AUTH_TIMEOUT_MS = 8000;

type AuthProbe = { available: boolean; user: boolean };

/**
 * Détermine s'il y a une session, **sans jamais lever**.
 *
 * `available: false` = on n'a pas pu savoir (Supabase injoignable / trop lent), ce qui
 * est différent de « pas connecté » : l'appelant doit répondre « service indisponible »
 * plutôt que « non authentifié », sinon un incident Supabase déconnecterait les clients.
 */
async function probeUser(
  getUser: () => Promise<{ data: { user: unknown } | null }>,
): Promise<AuthProbe> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("auth-timeout")), AUTH_TIMEOUT_MS);
    });
    const result = await Promise.race([getUser(), timeout]);
    return { available: true, user: Boolean(result?.data?.user) };
  } catch {
    return { available: false, user: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Rafraîchit la session Supabase (cookies) — invoqué depuis `proxy.ts` à chaque requête matchée. */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeadersWithPathname(request),
    },
  });

  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const pathname = request.nextUrl.pathname;
  const guardsApiRoute =
    pathname.startsWith("/api/") && !isPublicApiRoute(pathname);

  if (!urlRaw || !key) {
    return supabaseResponse;
  }
  const url = normalizeSupabaseUrl(urlRaw);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request: {
            headers: requestHeadersWithPathname(request),
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const auth = await probeUser(() => supabase.auth.getUser());

  if (guardsApiRoute) {
    if (!auth.available) {
      // 503 et pas 401 : un incident Supabase ne doit pas être interprété comme une
      // session expirée par le client (qui déconnecterait l'utilisateur pour rien).
      return NextResponse.json(
        { error: "Service d’authentification temporairement indisponible." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    if (!auth.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
  }

  return supabaseResponse;
}
