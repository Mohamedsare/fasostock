"use client";

import { PushActivationCard } from "@/components/push/push-activation-card";

/**
 * Carte Paramètres : activer les notifications navigateur (Web Push + Service Worker).
 * L'état, la permission et l'abonnement sont gérés par `PushActivationCard`, partagée
 * avec la page Notifications — un seul comportement à maintenir.
 */
export function PushNotificationsSettingsCard() {
  return <PushActivationCard className="mt-5" />;
}
