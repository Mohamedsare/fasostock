/* FasoStock PWA — installation + contrôle des clients ; pas d’interception fetch
   (évite les conflits avec Next.js / RSC). Étendre avec Workbox si besoin de cache précis. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let title = "FasoStock";
  let body = "";
  let url = "/notifications";
  try {
    if (event.data) {
      const t = event.data.json();
      if (t && typeof t === "object") {
        if (typeof t.title === "string" && t.title.trim()) title = t.title.trim();
        if (typeof t.body === "string") body = t.body;
        if (typeof t.url === "string" && t.url.trim()) url = t.url.trim();
      }
    }
  } catch (_) {
    /* ignore JSON parse */
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body || undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const path = typeof raw === "string" && raw.trim() ? raw.trim() : "/notifications";
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if (c.url === targetUrl && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
