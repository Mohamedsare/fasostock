"use client";

/**
 * État de chargement session au-dessus du squelette du shell : centré, lisible, accessible.
 */
export function AppShellLoadingOverlay() {
  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/[0.035] p-4 dark:bg-black/30">
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex w-full max-w-[min(100%,20rem)] flex-col items-center gap-5 rounded-2xl border border-black/6 bg-fs-card/95 px-7 py-8 text-center shadow-[0_8px_40px_-12px_rgb(0_0_0/0.18)] backdrop-blur-md dark:border-white/10 dark:bg-fs-card/95 dark:shadow-[0_12px_48px_-8px_rgb(0_0_0/0.55)]"
      >
        <div
          className="fs-app-shell-loading-spinner h-11 w-11 shrink-0 animate-spin rounded-full border-[3px] border-fs-accent border-t-transparent"
          aria-hidden
        />
        <div className="space-y-2">
          <p className="text-[15px] font-semibold leading-snug tracking-tight text-fs-text">
            Chargement de votre espace…
          </p>
          <p className="text-xs leading-relaxed text-fs-on-surface-variant">
            Synchronisation du compte. Si l’attente se prolonge, vérifiez votre connexion
            ou actualisez la page.
          </p>
        </div>
      </div>
    </div>
  );
}
