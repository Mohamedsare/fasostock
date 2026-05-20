"use client";

import { LoadingExperience } from "@/components/loading/loading-experience";

/**
 * Session / contexte app : carte de chargement au-dessus du shell.
 */
export function AppShellLoadingOverlay() {
  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/[0.04] p-4 backdrop-blur-[2px] dark:bg-black/35">
      <LoadingExperience
        variant="overlay"
        message="Chargement de votre espace…"
        submessage="Synchronisation du compte. Si l'attente se prolonge, vérifiez votre connexion."
        showTips={false}
      />
    </div>
  );
}
