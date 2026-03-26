"use client";

import { cn } from "@/lib/utils/cn";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Champs formulaires auth — focus doux, cohérent sur toutes les pages. */
export const authInputClass = cn(
  "w-full rounded-xl border border-black/[0.08] bg-white/95 px-4 py-3.5 text-base text-fs-text shadow-sm outline-none transition-all",
  "placeholder:text-neutral-400",
  "focus:border-fs-accent focus:bg-white focus:shadow-[0_0_0_3px_rgba(232,93,44,0.18)]",
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
          className="mb-5 inline-flex items-center gap-2 rounded-lg py-1 text-sm font-semibold text-fs-accent transition-opacity hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          {backLabel}
        </Link>
      ) : null}

      <div className="text-center">
        <div className="mx-auto mb-6 flex justify-center sm:mb-7">
          <div className="relative">
            <div
              className="absolute -inset-3 rounded-[1.35rem] bg-gradient-to-br from-fs-accent/20 via-orange-200/30 to-transparent opacity-90 blur-xl"
              aria-hidden
            />
            <div className="relative rounded-2xl bg-white p-3 shadow-[0_16px_48px_-12px_rgba(232,93,44,0.35),0_4px_16px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05]">
              <Image
                src="/fasostocklogo.png"
                alt="FasoStock"
                width={112}
                height={112}
                className="h-[84px] w-[84px] object-contain sm:h-[100px] sm:w-[100px]"
                priority
              />
            </div>
          </div>
        </div>

        {title ? (
          <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-fs-text sm:text-3xl">
            {title}
          </h1>
        ) : null}
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
        "rounded-[1.25rem] border border-white/80 bg-white/90 p-5 shadow-[0_20px_50px_-12px_rgba(232,93,44,0.14),0_4px_20px_rgba(0,0,0,0.05)] backdrop-blur-md sm:p-7",
        className,
      )}
    >
      {children}
    </div>
  );
}
