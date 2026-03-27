"use client";

import { cn } from "@/lib/utils/cn";
import { shellTopBarClass } from "@/components/layout/shell-chrome";

const pulse = "animate-pulse rounded-xl bg-fs-surface-container dark:bg-white/[0.08]";

/**
 * Squelette du shell (sidebar + barre + zone contenu) pour transitions de route
 * et chargement session — évite un flash vide ou un spinner isolé.
 */
export function AppShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-fs-surface text-fs-text">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            "hidden h-full min-h-0 w-[228px] shrink-0 flex-col border-r border-black/[0.06] bg-fs-card dark:border-white/[0.08] lg:flex",
            "shadow-[inset_-1px_0_0_0_rgba(0,0,0,0.03)] dark:shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.04)]",
          )}
          aria-hidden
        >
          <div
            className={cn(
              "flex h-[58px] shrink-0 items-center border-b border-black/[0.06] px-4 dark:border-white/[0.08]",
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn("h-8 w-8 shrink-0 rounded-xl", pulse)} />
              <div className={cn("h-5 w-24 rounded-lg", pulse)} />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-2">
                <div className={cn("h-8 w-8 shrink-0", pulse)} />
                <div className={cn("h-3.5 flex-1 rounded-md", pulse)} />
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header
            className={cn(
              "flex h-[58px] shrink-0 items-center px-3",
              shellTopBarClass,
            )}
          >
            <div className={cn("h-10 w-10 shrink-0 rounded-2xl", pulse)} />
            <div className="mx-auto flex h-10 min-w-0 items-center justify-center lg:flex-1">
              <div className={cn("h-10 w-[140px] max-w-full rounded-2xl", pulse)} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className={cn("h-10 w-10 rounded-2xl", pulse)} />
            </div>
          </header>
          <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className={cn("h-8 w-48 rounded-lg", pulse)} />
            <div className={cn("h-36 w-full rounded-2xl", pulse)} />
            <div className="space-y-2.5">
              <div className={cn("h-3.5 w-full rounded-md", pulse)} />
              <div className={cn("h-3.5 w-[92%] rounded-md", pulse)} />
              <div className={cn("h-3.5 w-[68%] rounded-md", pulse)} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
