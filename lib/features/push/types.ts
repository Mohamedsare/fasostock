/**
 * Contenu d'une notification Push Web — contrat partagé entre l'émetteur serveur
 * (`send-web-push.ts`) et le Service Worker (`public/sw.js`).
 *
 * Toute évolution de cette forme doit rester tolérée par un Service Worker ancien :
 * un navigateur peut garder l'ancien `sw.js` plusieurs heures après un déploiement.
 */
export type WebPushPayload = {
  title: string;
  body?: string | null;
  /** Icône affichée dans la notification système (chemin public ou URL absolue). */
  icon?: string | null;
  /** Petit badge monochrome (Android). */
  badge?: string | null;
  /** Chemin ouvert au clic — relatif à l'app (ex. `/notifications`). */
  url?: string | null;
  /** Catégorie métier (`admin_message`, `sale`, `stock_alert`…) — sert aussi de `tag`. */
  type?: string | null;
  /** Données libres transmises telles quelles au clic. */
  data?: Record<string, unknown> | null;
};

export const DEFAULT_PUSH_ICON = "/pwa-192.png";
export const DEFAULT_PUSH_BADGE = "/pwa-192.png";
export const DEFAULT_PUSH_URL = "/notifications";

/** Forme réellement transmise sur le réseau (jamais de `undefined` dans du JSON). */
export type WebPushWirePayload = {
  title: string;
  body: string;
  icon: string;
  badge: string;
  url: string;
  type: string | null;
  data: Record<string, unknown>;
};

/** Normalise le payload appelant : le Service Worker n'a alors plus rien à deviner. */
export function toWirePayload(payload: WebPushPayload): WebPushWirePayload {
  const url = payload.url?.trim();
  return {
    title: payload.title.trim() || "FasoStock",
    body: payload.body?.trim() ?? "",
    icon: payload.icon?.trim() || DEFAULT_PUSH_ICON,
    badge: payload.badge?.trim() || DEFAULT_PUSH_BADGE,
    url: url || DEFAULT_PUSH_URL,
    type: payload.type?.trim() || null,
    data: payload.data ?? {},
  };
}
