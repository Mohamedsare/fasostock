"use client";

import { useSyncExternalStore } from "react";
import { Expand, Shrink } from "lucide-react";
import { shellToolbarIconButtonClass } from "@/components/layout/shell-chrome";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/**
 * S'abonne aux changements de plein écran (y compris la sortie par Échap ou F11,
 * qui ne passent pas par notre bouton). `fullscreenerror` est écouté aussi : sans
 * lui, un refus du navigateur laisserait l'icône dans le mauvais état.
 */
function subscribe(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("fullscreenerror", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("fullscreenerror", onChange);
  };
}

/**
 * Plein écran (bureau) — gagne la hauteur de la barre d'onglets et de la barre
 * d'adresse, précieuse sur les longues listes (stock, ventes, emplacements).
 *
 * `useSyncExternalStore` plutôt qu'un `useState` + effet : l'état vit dans le
 * document, pas dans React, et le rendu serveur part de « pas en plein écran »
 * sans provoquer d'écart d'hydratation.
 */
export function FullscreenToggleButton({ className }: { className?: string }) {
  const isFullscreen = useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement != null,
    () => false,
  );
  const supported = useSyncExternalStore(
    subscribe,
    () => document.fullscreenEnabled === true,
    () => false,
  );

  // Navigateur sans API plein écran (ou bloquée par une politique) : pas de bouton mort.
  if (!supported) return null;

  async function toggle() {
    try {
      if (document.fullscreenElement != null) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Refus du navigateur (geste utilisateur non reconnu, iframe sans autorisation…).
      toast.error("Le plein écran a été refusé par le navigateur. Essayez la touche F11.");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={cn(shellToolbarIconButtonClass, className)}
      aria-label={isFullscreen ? "Quitter le plein écran" : "Passer en plein écran"}
      aria-pressed={isFullscreen}
      title={isFullscreen ? "Quitter le plein écran (Échap)" : "Plein écran (F11)"}
    >
      {isFullscreen ? (
        <Shrink className="h-5 w-5" aria-hidden />
      ) : (
        <Expand className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
