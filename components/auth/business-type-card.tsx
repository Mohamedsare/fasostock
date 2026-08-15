"use client";

import { cn } from "@/lib/utils/cn";
import type { BusinessTypeOption } from "@/lib/config/business-types";
import { ArrowRight, Check } from "lucide-react";
import type { KeyboardEvent } from "react";

type BusinessTypeCardProps = {
  option: BusinessTypeOption;
  selected: boolean;
  /** Navigation en cours pour cette carte (spinner + verrouillage visuel). */
  pending?: boolean;
  onSelect: () => void;
  /** Navigation clavier gérée par la grille parente (flèches / Home / End). */
  onNavigateKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  /** Roving tabindex : une seule carte est atteignable au Tab. */
  tabIndex?: number;
  /** Identifiant DOM — la grille parente s'en sert pour déplacer le focus. */
  id?: string;
};

export function BusinessTypeCard({
  option,
  selected,
  pending = false,
  onSelect,
  onNavigateKeyDown,
  tabIndex,
  id,
}: BusinessTypeCardProps) {
  const Icon = option.icon;
  const active = selected || pending;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
      return;
    }
    onNavigateKeyDown?.(e);
  }

  return (
    <button
      id={id}
      type="button"
      role="radio"
      aria-checked={active}
      aria-busy={pending || undefined}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border bg-fs-card p-3.5 text-left",
        "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out",
        "outline-none focus-visible:ring-2 focus-visible:ring-fs-accent focus-visible:ring-offset-2",
        "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99]",
        active
          ? "border-fs-accent/55 bg-[color-mix(in_srgb,var(--fs-accent)_8%,var(--fs-card))] shadow-[0_10px_30px_-8px_rgba(232,93,44,0.35)] ring-2 ring-fs-accent/30 dark:bg-[color-mix(in_srgb,var(--fs-accent)_12%,var(--fs-surface-low))]"
          : "border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-fs-accent/40 hover:shadow-[0_12px_28px_-10px_rgba(0,0,0,0.16)] dark:border-white/[0.1] dark:hover:border-fs-accent/30",
      )}
    >
      {/* Halo décoratif révélé au survol — renforce le côté « carte cliquable ». */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-fs-accent/10 blur-2xl transition-opacity duration-300",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />

      <span
        className={cn(
          "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200",
          active
            ? "border-fs-accent/45 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent"
            : "border-black/[0.07] bg-fs-surface-container text-fs-accent/90 group-hover:border-fs-accent/30 group-hover:bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)] dark:border-white/10",
        )}
        aria-hidden
      >
        <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
      </span>

      <span className="relative min-w-0 flex-1 pt-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold leading-snug tracking-tight text-fs-text">
            {option.label}
          </span>
          {option.popular ? (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fs-accent">
              Populaire
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
          {option.description}
        </span>
      </span>

      <span
        className={cn(
          "relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200",
          active
            ? "bg-fs-accent text-white"
            : "text-neutral-400 group-hover:translate-x-0.5 group-hover:text-fs-accent dark:text-neutral-500",
        )}
        aria-hidden
      >
        {pending ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : active ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : (
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        )}
      </span>
    </button>
  );
}
