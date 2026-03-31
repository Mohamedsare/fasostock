"use client";

import { cn } from "@/lib/utils/cn";
import type { BusinessTypeOption } from "@/lib/config/business-types";
import type { KeyboardEvent } from "react";

type BusinessTypeCardProps = {
  option: BusinessTypeOption;
  selected: boolean;
  onSelect: () => void;
};

export function BusinessTypeCard({ option, selected, onSelect }: BusinessTypeCardProps) {
  const Icon = option.icon;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative flex w-full flex-col gap-2 rounded-2xl border bg-fs-card p-4 text-left transition-all duration-200",
        "outline-none focus-visible:ring-2 focus-visible:ring-fs-accent focus-visible:ring-offset-2",
        selected
          ? "border-fs-accent/50 bg-[color-mix(in_srgb,var(--fs-accent)_8%,var(--fs-card))] shadow-[0_8px_28px_-4px_rgba(232,93,44,0.22)] ring-2 ring-fs-accent/35 dark:bg-[color-mix(in_srgb,var(--fs-accent)_12%,var(--fs-surface-low))]"
          : "border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-fs-accent/35 hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.08)] dark:border-white/[0.1] dark:hover:border-fs-accent/30",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors",
            selected
              ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent"
              : "border-black/[0.07] bg-fs-surface-container text-fs-accent/90 group-hover:border-fs-accent/25 dark:border-white/10",
          )}
          aria-hidden
        >
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <span
            className={cn(
              "block text-[15px] font-semibold leading-snug tracking-tight text-fs-text",
              selected && "text-fs-text",
            )}
          >
            {option.label}
          </span>
          {option.description ? (
            <span className="mt-1 block text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
              {option.description}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected
              ? "border-fs-accent bg-fs-accent text-white"
              : "border-neutral-300 bg-transparent dark:border-neutral-600",
          )}
          aria-hidden
        >
          {selected ? (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      </div>
    </button>
  );
}
