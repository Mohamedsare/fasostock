"use client";

import { urlBase64ToUint8Array } from "@/lib/features/push/encoding";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/features/push/public-key";
import {
  deletePushSubscriptionByEndpoint,
  upsertPushSubscriptionRow,
} from "@/lib/features/push/subscription-db";

export { isWebPushConfigured };

/**
 * Les trois API doivent être présentes ensemble : iOS < 16.4 expose `Notification`
 * sans `PushManager`, et un contexte non sécurisé n'a pas de `serviceWorker`.
 * Sans ce triplet, proposer le bouton « Activer » ne mènerait qu'à une erreur.
 */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** État de la permission navigateur, sans jamais la demander. */
export function currentNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isWebPushSupported()) return "unsupported";
  return Notification.permission;
}

async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!isWebPushSupported()) {
    throw new Error("Ce navigateur ne gère pas les notifications push.");
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

/**
 * Abonne l'appareil courant. **Toujours appelé depuis un clic utilisateur** :
 * `Notification.requestPermission()` déclenché au chargement se solde par un refus
 * définitif sur Chrome, et l'utilisateur ne peut plus rien activer ensuite.
 */
export async function subscribeCurrentUserToWebPush(): Promise<void> {
  const vapid = getVapidPublicKey();
  if (!vapid) throw new Error("Clé VAPID publique absente (NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
  if (!isWebPushSupported()) {
    throw new Error(
      "Ce navigateur ne gère pas les notifications push. Sur iPhone, ajoutez d’abord FasoStock à l’écran d’accueil.",
    );
  }
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

/** Abonnement Push de cet appareil, s'il existe déjà (aucune demande de permission). */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported() || Notification.permission !== "granted") return null;
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    reg = await navigator.serviceWorker.ready;
  }
  return reg.pushManager.getSubscription();
}
