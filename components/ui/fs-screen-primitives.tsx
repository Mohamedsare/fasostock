"use client";

import { toFriendlyError } from "@/lib/utils/friendly-error";
import { cn } from "@/lib/utils/cn";
import { MdErrorOutline, MdRefresh } from "react-icons/md";
import type { ComponentType, ReactNode } from "react";

/** Padding réduit au maximum pour maximiser la surface de contenu : 8px mobile → 12px sm → 16px large. Bas mobile : léger — le main du shell réserve déjà la bottom nav. */
export function FsPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-2 pt-2 sm:px-3 sm:pt-3 min-[900px]:px-4",
        "max-[1023px]:pb-3 min-[1024px]:pb-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Titres d’écran — alignés sur Flutter mobile AppBar + headlineSmall :
 * mobile ~14px semibold, desktop plus grand.
 */
export function FsScreenHeader({
  title,
  subtitle,
  className,
  titleClassName,
  subtitleClassName,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  /** Ex. dashboard large : `headlineSmall` Flutter (`min-[900px]:text-2xl`). */
  titleClassName?: string;
  subtitleClassName?: string;
}) {
  return (
    <header className={cn("mb-2 sm:mb-3", className)}>
      <h1
        className={cn(
          "text-sm font-semibold tracking-tight text-fs-text sm:text-xl sm:font-bold sm:tracking-tight",
          titleClassName,
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={cn(
            "mt-1 text-xs leading-relaxed text-neutral-600 sm:text-sm",
            subtitleClassName,
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

/** Carte type `Card` Flutter — élévation 0, bordure légère, rayon 12 mobile / 16 desktop. */
export function FsCard({
  children,
  className,
  padding = "p-2.5 sm:p-3",
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-black/[0.06] bg-fs-card shadow-sm sm:rounded-xl",
        padding,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Chip onglet type `_TabChip` / FilterChip Flutter. */
export function FsFilterChip({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  /** Material `Icons.*` équivalents (ex. react-icons/md), taille ~18px comme FilterChip Flutter. */
  icon: ComponentType<{ className?: string }>;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:py-1.5 sm:text-sm",
        selected
          ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)] font-semibold text-fs-accent"
          : "border-black/[0.08] bg-fs-card text-neutral-800",
      )}
    >
      <Icon
        className={cn("h-[18px] w-[18px] shrink-0", selected ? "text-fs-accent" : "text-neutral-500")}
        aria-hidden
      />
      {label}
    </button>
  );
}

/** Libellé de section « Filtres » / « Vue & période » (labelLarge Flutter). */
export function FsSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-wide text-neutral-500 sm:text-xs",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Champ rempli type InputDecoration Flutter (surfaceContainer, rayon 10). */
export function fsInputClass(extra?: string) {
  // Ne pas utiliser `sm:px-3` ici : il réapplique le padding horizontal au breakpoint `sm`
  // et écrase un `pl-*` passé dans `extra` (icône loupe à gauche → chevauchement du placeholder).
  return cn(
    "w-full rounded-[10px] border border-black/[0.06] bg-fs-surface-container px-3 py-2.5 text-xs text-fs-text outline-none placeholder:text-neutral-400 focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20 sm:py-3 sm:text-sm",
    extra,
  );
}

/** État erreur TanStack Query — mobile first, bouton tactile « Réessayer ». */
export function FsQueryErrorPanel({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry: () => void;
  /** Ex. `mt-3` pour espacer sous les filtres. */
  className?: string;
}) {
  // Jamais de jargon serveur à l'écran (« statement timeout », codes SQL…) : on
  // affiche ce qui s'est passé + quoi faire, le message d'origine reste replié
  // pour le support.
  const f = toFriendlyError(error, "Impossible de charger les données");
  const showTechnical = f.technical.trim() && f.technical.trim() !== f.title;
  return (
    <FsCard className={cn(className)} padding="p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-600 dark:bg-amber-400/12 dark:text-amber-400"
          aria-hidden
        >
          <MdErrorOutline className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-fs-text">{f.title}</p>
          {f.hint ? (
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">{f.hint}</p>
          ) : null}
          {showTechnical ? (
            <details className="group mt-3">
              <summary className="fs-touch-target inline-flex cursor-pointer list-none items-center text-xs font-semibold text-neutral-500 hover:text-neutral-700">
                Détails techniques
              </summary>
              <p className="mt-1.5 wrap-break-word rounded-lg bg-fs-surface-container/70 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-neutral-600 dark:bg-white/4">
                {f.technical}
              </p>
            </details>
          ) : null}
        </div>
      </div>
      {f.retryable ? (
        <button
          type="button"
          onClick={onRetry}
          className="fs-touch-target mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-fs-accent py-3 text-sm font-semibold text-white sm:w-auto sm:px-6"
        >
          <MdRefresh className="h-4 w-4" aria-hidden />
          Réessayer
        </button>
      ) : null}
    </FsCard>
  );
}

/** Barre filtres / actions — sticky en haut sur mobile (reste visible au scroll), flux normal sur desktop. */
export function FsStickyMobileActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-2 border-b border-black/[0.06] bg-fs-surface/95 px-2 py-2 backdrop-blur-sm min-[900px]:static min-[900px]:z-0 min-[900px]:mx-0 min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:p-0 min-[900px]:backdrop-blur-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Bouton principal orange POS (Flutter FAB #F97316). */
export function FsFab({
  children,
  onClick,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "fixed bottom-[calc(4.75rem+var(--fs-safe-bottom)+0.5rem)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#f97316] text-white shadow-lg shadow-black/15 transition-transform active:scale-95 min-[900px]:hidden",
        className,
      )}
    >
      {children}
    </button>
  );
}
