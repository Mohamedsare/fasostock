import { cn } from "@/lib/utils/cn";

/** Barre supérieure : mêmes bordures / flou que la sidebar (`AppSidebar`). */
export const shellTopBarClass = cn(
  "border-b border-black/[0.06] bg-fs-card/95 backdrop-blur supports-backdrop-filter:bg-fs-card/80",
  "dark:border-white/[0.08]",
);

/** Boutons icône (menu, déconnexion, etc.) — alignés sur les tuiles de la sidebar. */
export const shellToolbarIconButtonClass = cn(
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
  "text-neutral-600 transition-[color,background-color,transform] duration-200 ease-out",
  "hover:bg-black/[0.035] hover:text-neutral-900",
  "active:scale-[0.99] dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-fs-text",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
);

/** Pilule horloge (header bureau). */
export const shellClockPillClass = cn(
  "inline-flex items-center gap-2 rounded-2xl border border-black/[0.07] bg-fs-surface-container/90 px-3.5 py-2",
  "shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.1] dark:bg-white/[0.05]",
  "dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
);

/** Onglet mobile actif — même logique que les entrées actives de la sidebar. */
export const shellMobileTabActiveClass = cn(
  "bg-[color-mix(in_srgb,var(--fs-accent)_13%,transparent)] text-[var(--fs-accent)]",
  "shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.45)]",
  "dark:shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]",
);

export const shellMobileTabInactiveClass = cn(
  "text-neutral-500 dark:text-neutral-400",
);

/** Barre d’onglets mobile : bordure et fond comme le shell. */
export const shellBottomNavBarClass = cn(
  "border-t border-black/[0.06] bg-fs-card/95 pb-[max(0.5rem,var(--fs-safe-bottom))] pt-2",
  "shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.08)] backdrop-blur-xl supports-backdrop-filter:bg-fs-card/88",
  "dark:border-white/[0.08] dark:shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.45)]",
);
