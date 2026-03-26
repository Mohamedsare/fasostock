/* FasoStock PWA — installation + contrôle des clients ; pas d’interception fetch
   (évite les conflits avec Next.js / RSC). Étendre avec Workbox si besoin de cache précis. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
