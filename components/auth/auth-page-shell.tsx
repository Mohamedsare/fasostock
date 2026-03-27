"use client";

import { cn } from "@/lib/utils/cn";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Champs formulaires auth — focus doux, padding un peu resserré (login / inscription / MDP). */
export const authInputClass = cn(
  "w-full rounded-xl border border-black/[0.08] bg-white/95 px-3.5 py-2.5 text-[15px] leading-snug text-fs-text shadow-sm outline-none transition-all",
  "placeholder:text-neutral-400",
  "focus:border-fs-accent focus:bg-white focus:shadow-[0_0_0_3px_rgba(232,93,44,0.18)]",
);

/** Style carte simple (login / inscription) — fond gris clair, bordure discrète. */
export const authSimpleFieldClass = cn(
  "w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3.5 py-2.5 text-[15px] text-neutral-900 shadow-none outline-none transition-colors",
  "placeholder:text-neutral-500",
  "focus:border-fs-accent focus:bg-white focus:ring-2 focus:ring-fs-accent/15",
);

type AuthPageShellProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Lien discret au-dessus du logo */
  backHref?: string;
  backLabel?: string;
  maxWidthClass?: string;
  className?: string;
  /** Marge sous le bloc titre (si pas de subtitle) */
  contentClassName?: string;
};

export function AuthPageShell({
  children,
  title,
  subtitle,
  backHref,
  backLabel = "Retour",
  maxWidthClass = "max-w-[440px]",
  className,
  contentClassName,
}: AuthPageShellProps) {
  return (
    <div className={cn("mx-auto w-full px-4 sm:px-5", maxWidthClass, className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="group mb-5 inline-flex w-fit max-w-full items-center gap-1 rounded-xl border border-black/[0.07] bg-white/95 px-3 py-2 text-sm font-medium text-neutral-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-fs-accent/30 hover:bg-white hover:text-fs-accent dark:border-white/12 dark:bg-white/8 dark:text-neutral-200 dark:shadow-none dark:hover:border-fs-accent/35 dark:hover:bg-white/12 dark:hover:text-fs-accent"
        >
          <ChevronLeft
            className="h-[18px] w-[18px] shrink-0 text-neutral-500 transition-transform group-hover:-translate-x-0.5 group-hover:text-fs-accent dark:text-neutral-400"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="leading-tight">{backLabel}</span>
        </Link>
      ) : null}

      <div className="text-center">
        <div className="mx-auto flex flex-col items-center gap-0.5">
          <Image
            src="/logo1.png"
            alt={title ? "" : "FasoStock"}
            width={112}
            height={112}
            className="h-[84px] w-[84px] object-contain sm:h-[100px] sm:w-[100px]"
            priority
          />
          {title ? (
            <h1 className="text-[1.65rem] font-bold leading-none tracking-tight text-fs-text sm:text-3xl">
              {title}
            </h1>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-2.5 text-[15px] leading-relaxed text-neutral-600 sm:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className={cn(title || subtitle ? "mt-8" : "mt-2", contentClassName)}>{children}</div>
    </div>
  );
}

export function AuthCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.25rem] border border-white/80 bg-white/90 p-4 shadow-[0_20px_50px_-12px_rgba(232,93,44,0.14),0_4px_20px_rgba(0,0,0,0.05)] backdrop-blur-md sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
