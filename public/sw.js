/* FasoStock PWA — installation + contrôle des clients ; pas d’interception fetch
   (évite les conflits avec Next.js / RSC). Étendre avec Workbox si besoin de cache précis. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

var DEFAULT_ICON = "/pwa-192.png";
var DEFAULT_URL = "/notifications";

function textOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/* Un `sw.js` installé survit aux déploiements : il doit accepter un payload ancien
   (title/body/url seuls) comme un payload récent, sans jamais lever. */
function readPayload(event) {
  var out = {
    title: "FasoStock",
    body: "",
    icon: DEFAULT_ICON,
    badge: DEFAULT_ICON,
    url: DEFAULT_URL,
    type: null,
    data: {},
  };
  try {
    if (!event.data) return out;
    var t = event.data.json();
    if (!t || typeof t !== "object") return out;
    out.title = textOr(t.title, out.title);
    out.body = typeof t.body === "string" ? t.body : out.body;
    out.icon = textOr(t.icon, out.icon);
    out.badge = textOr(t.badge, out.badge);
    out.url = textOr(t.url, out.url);
    out.type = textOr(t.type, null);
    if (t.data && typeof t.data === "object") out.data = t.data;
  } catch (_) {
    /* payload non JSON (texte brut ou vide) : on notifie quand même. */
  }
  return out;
}

self.addEventListener("push", (event) => {
  var p = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body || undefined,
      icon: p.icon,
      badge: p.badge,
      /* Un `tag` par catégorie : deux alertes de même nature se remplacent au lieu
         d'empiler dix bandeaux identiques sur le téléphone du propriétaire. */
      tag: p.type || undefined,
      data: { url: p.url, type: p.type, payload: p.data },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  var raw = event.notification.data && event.notification.data.url;
  var path = textOr(raw, DEFAULT_URL);
  var targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      var sameOrigin = null;
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        /* Exactement la bonne page déjà ouverte : rien à recharger, on la ramène au premier plan. */
        if (c.url === targetUrl && "focus" in c) return c.focus();
        if (!sameOrigin && c.url.indexOf(self.location.origin) === 0) sameOrigin = c;
      }
      /* Sinon on réutilise une fenêtre existante de l'app plutôt que d'en ouvrir une de plus :
         l'utilisateur retrouve sa session, son panier, ses filtres. */
      if (sameOrigin) {
        if ("navigate" in sameOrigin) {
          return sameOrigin.navigate(targetUrl).then((c) => (c && "focus" in c ? c.focus() : null));
        }
        if ("focus" in sameOrigin) return sameOrigin.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return null;
    }),
  );
});
