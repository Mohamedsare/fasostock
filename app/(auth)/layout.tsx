import type { ReactNode } from "react";

/**
 * Hauteur = viewport ; scroll vertical seulement si le contenu dépasse (erreurs longues, petits écrans).
 * Padding réduit + my-auto pour éviter le scroll inutile sur la page login.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-neutral-100 text-fs-text">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-gutter:stable]">
        <div className="mx-auto my-auto w-full max-w-[min(100%,72rem)] py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
