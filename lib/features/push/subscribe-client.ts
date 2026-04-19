"use client";

import { urlBase64ToUint8Array } from "@/lib/features/push/encoding";
import {
  deletePushSubscriptionByEndpoint,
  upsertPushSubscriptionRow,
} from "@/lib/features/push/subscription-db";

function getVapidPublicKey(): string | null {
  const k = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  return k || null;
}

export function isWebPushConfigured(): boolean {
  return Boolean(getVapidPublicKey());
}

async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service Worker non disponible dans cet environnement.");
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export async function subscribeCurrentUserToWebPush(): Promise<void> {
  const vapid = getVapidPublicKey();
  if (!vapid) throw new Error("Clé VAPID publique absente (NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY).");
  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    throw new Error(
      "Notifications bloquées pour ce site. Ouvrez les paramètres du site (icône à gauche de l’URL) et autorisez les notifications.",
    );
  }
  if (permission !== "granted") {
    throw new Error(
      "Autorisation requise : dans la fenêtre du navigateur, choisissez « Autoriser » pour les notifications.",
    );
  }
  const reg = await ensurePushServiceWorker();
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await upsertPushSubscriptionRow(existing);
    return;
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
  });
  await upsertPushSubscriptionRow(sub);
}

export async function unsubscribeCurrentUserFromWebPush(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await deletePushSubscriptionByEndpoint(endpoint).catch(() => {});
  }
}
