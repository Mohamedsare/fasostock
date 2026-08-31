"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { MdArrowBack, MdLockPerson } from "react-icons/md";

import {
  NAV_ITEMS,
  RESTAURANT_NAV_ITEMS,
  type NavItem,
} from "@/lib/config/navigation";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { cn } from "@/lib/utils/cn";

/**
 * Au-delà, la carte devient un second menu : on garde les premières entrées,
 * qui sont déjà rangées par ordre d'importance dans `NAV_ITEMS`.
 */
const MAX_SHORTCUTS = 8;

type RestrictedAccessScreenProps = {
  /** Destination du bouton Retour quand il n'y a pas d'historique. */
  fallbackHref?: string;
};

/**
 * Écran « accès refusé ». Volontairement SANS texte : le gros cadenas en filigrane
 * dit déjà que la porte est fermée, et l'employé n'a pas à lire une explication —
 * il a besoin de repartir vers son travail. On ne montre donc que les pages qui lui
 * SONT ouvertes (les mêmes que son menu latéral), d'un clic.
 */
export function RestrictedAccessScreen({
  fallbackHref,
}: RestrictedAccessScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, filterNavItems } = usePermissions();

  const shortcuts = useMemo<NavItem[]>(() => {
    const base =
      data?.businessTypeSlug === "restaurant-fast-food"
        ? RESTAURANT_NAV_ITEMS
        : NAV_ITEMS;
    const allowed = filterNavItems(
      base.filter((i) => i.kind !== "section" && i.showInSidebar !== false),
    );
    return allowed
      .filter(
        (i) => i.href !== pathname && !pathname.startsWith(`${i.href}/`),
      )
      .slice(0, MAX_SHORTCUTS);
  }, [data?.businessTypeSlug, filterNavItems, pathname]);

  const hasShortcuts = shortcuts.length > 0;
  const backHref = fallbackHref ?? shortcuts[0]?.href ?? "/";

  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-black/[0.08] bg-fs-card p-6 shadow-sm dark:border-white/[0.08]">
        {/* Cadenas en filigrane : le seul « message » de la carte. */}
        <MdLockPerson
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2",
            "text-red-600/[0.09] dark:text-red-500/[0.13]",
          )}
          aria-hidden
        />

        <div className="relative">
          {hasShortcuts ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {shortcuts.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    className={cn(
                      "group flex min-h-12 items-center gap-3 rounded-xl border border-black/[0.07] bg-fs-card/85 px-3 py-2.5 backdrop-blur-[2px]",
                      "text-left text-[13px] font-semibold leading-tight text-fs-text",
                      "transition-[background-color,transform,box-shadow] duration-200 ease-out",
                      "hover:bg-fs-surface-container hover:shadow-[0_2px_10px_rgba(0,0,0,0.07)] active:scale-[0.99]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
                      "dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
                    )}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={item.iconBg ? { background: item.iconBg } : undefined}
                      aria-hidden
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          item.iconBg
                            ? "text-white"
                            : "text-black dark:text-neutral-100",
                        )}
                        strokeWidth={2}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            /* Rien à proposer : le cadenas parle tout seul, on lui laisse la place. */
            <div className="h-40" aria-hidden />
          )}

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                } else {
                  router.push(backHref);
                }
              }}
              aria-label="Retour"
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold",
                hasShortcuts
                  ? "border border-black/[0.1] bg-fs-card text-neutral-800 shadow-sm hover:bg-fs-surface-container dark:border-white/10 dark:text-neutral-200"
                  : "bg-fs-accent text-white",
              )}
            >
              <MdArrowBack className="h-4 w-4" aria-hidden />
              Retour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
