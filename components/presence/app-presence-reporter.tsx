"use client";

import { useAppPresenceReport } from "@/lib/hooks/use-app-presence-report";

/** Composant sans rendu — diffuse la présence vers le canal super-admin Maps. */
export function AppPresenceReporter() {
  useAppPresenceReport();
  return null;
}
