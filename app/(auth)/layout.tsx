import type { ReactNode } from "react";

/**
 * Hauteur = viewport ; zone interne scrollable uniquement si le contenu dépasse
 * (jamais de coupe : pas de overflow-y-hidden sur le contenu).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#f6f3ee] text-fs-text">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-25%,rgba(232,93,44,0.16),transparent_52%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-20 h-[420px] w-[420px] rounded-full bg-fs-accent/9 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-32 bottom-0 h-[320px] w-[320px] rounded-full bg-amber-200/25 blur-3xl"
        aria-hidden
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-gutter:stable]">
        <div className="mx-auto flex w-full flex-1 flex-col items-center justify-center px-4 py-8 sm:py-10">
          {children}
        </div>
      </div>
    </div>
  );
}
