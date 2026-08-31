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
  title?: string;
  message?: string;
  /** Ligne « Droit requis : … » (page Rapports). */
  requiredText?: string | null;
  /** Destination du bouton Retour quand il n'y a pas d'historique. */
  fallbackHref?: string;
};

/**
 * Écran « Accès restreint ». Un employé qui tombe dessus n'a rien à faire d'un
 * simple message : on lui montre les pages qui lui SONT ouvertes (les mêmes que
 * son menu latéral) pour qu'il reparte d'un clic vers son travail.
 */
export function RestrictedAccessScreen({
  title = "Accès restreint",
  message = "Vous n'avez pas accès à cette page.",
  requiredText = null,
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
      <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-fs-card p-6 shadow-sm dark:border-white/[0.08]">
        <div className="flex flex-col items-center text-center">
          <MdLockPerson className="h-14 w-14 text-red-600" aria-hidden />
          <h2 className="mt-3 text-xl font-extrabold text-fs-text">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            {message}
          </p>
          {requiredText ? (
            <p className="mt-3 text-sm font-bold text-neutral-700 dark:text-neutral-300">
              Droit requis : {requiredText}
            </p>
          ) : null}
        </div>

        {hasShortcuts ? (
          <div className="mt-6">
            <p className="text-center text-sm font-semibold text-fs-text">
              Ce que vous pouvez faire
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {shortcuts.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    className={cn(
                      "group flex min-h-12 items-center gap-3 rounded-xl border border-black/[0.07] bg-fs-surface-container/70 px-3 py-2.5",
                      "text-left text-[13px] font-semibold leading-tight text-fs-text",
                      "transition-[background-color,transform,box-shadow] duration-200 ease-out",
                      "hover:bg-fs-surface-container hover:shadow-[0_2px_10px_rgba(0,0,0,0.07)] active:scale-[0.99]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
                      "dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]",
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
          </div>
        ) : (
          <p className="mt-5 text-center text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            Aucune page ne vous est ouverte pour le moment. Demandez au
            propriétaire de vous donner les droits nécessaires.
          </p>
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
  );
}
