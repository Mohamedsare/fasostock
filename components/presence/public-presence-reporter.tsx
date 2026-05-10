"use client";

import { useLandingPresenceReport } from "@/lib/hooks/use-landing-presence-report";

/** Visiteurs pages publiques (landing, login, …) → même canal Presence que l’app. */
export function PublicPresenceReporter() {
  useLandingPresenceReport();
  return null;
}
