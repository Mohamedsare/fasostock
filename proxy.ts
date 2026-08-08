import { NextResponse, type NextRequest } from "next/server";
import { isPublicApiRoute } from "@/lib/auth/public-api-routes";
import { updateSession } from "@/lib/supabase/update-session";

/**
 * Filet de sécurité : ce proxy s'exécute devant **toute** requête non statique, donc une
 * exception non rattrapée ici ne casse pas une page — elle renvoie 500 sur l'intégralité
 * du site, landing comprise.
 *
 * Le repli dépend de la cible :
 * — page : on laisse passer sans rafraîchir la session. Les écrans ont leurs propres
 *   gardes, et le pire cas devient « il faut se reconnecter », pas « site hors service » ;
 * — route API protégée : on refuse. Laisser passer transformerait une panne du proxy en
 *   contournement d'authentification.
 */
function recover(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/") && !isPublicApiRoute(pathname)) {
    return NextResponse.json(
      { error: "Service temporairement indisponible." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[proxy] updateSession a échoué", e);
    }
    return recover(request);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
