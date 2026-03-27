"use client";

import { OfflineStrip } from "@/components/offline/offline-strip";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MoreSheet } from "@/components/layout/more-sheet";
import { ROUTES } from "@/lib/config/routes";
import { OwnerNotificationsBell } from "@/components/layout/owner-notifications-bell";
import { NAV_ITEMS } from "@/lib/config/navigation";
import { getPageTitle } from "@/lib/config/page-title";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { useDesktopNav } from "@/lib/hooks/use-media-query";
import { signOutAndRedirect } from "@/lib/auth/sign-out-client";
import { cn } from "@/lib/utils/cn";
import {
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftOpen,
  Package,
  ShoppingCart,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

const BOTTOM_PATHS = [ROUTES.dashboard, ROUTES.products, ROUTES.sales];

const MOBILE_ICONS: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard,
  "/products": Package,
  "/sales": ShoppingCart,
};

/** Libellés courts (une ligne) pour l’onglet bar — comme les apps natives. */
const MOBILE_LABELS: Record<string, string> = {
  [ROUTES.dashboard]: "Accueil",
  [ROUTES.products]: "Produits",
  [ROUTES.sales]: "Vente",
};

type AppShellProps = {
  children: ReactNode;
  userEmail?: string | null;
};

export function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const ctx = useAppContext();
  const { filterNavItems } = usePermissions();
  const isDesktop = useDesktopNav();
  // Route POS (Flutter-like: écran "figé", scroll interne sur zones prévues).
  const isPosRoute = /^\/stores\/[^/]+\/pos(-quick)?\/?$/.test(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  );

  const data = ctx.data;
  const isOwner = data?.roleSlug === "owner";

  useEffect(() => {
    if (data?.isSuperAdmin) router.replace("/admin");
  }, [data?.isSuperAdmin, router]);

  useEffect(() => {
    const saved = localStorage.getItem("fs_sidebar_collapsed");
    setSidebarCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem("fs_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    const t = setInterval(() => {
      setClock(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /** POS : empêcher le scroll du document (Flutter = écran figé, scroll interne uniquement). */
  useEffect(() => {
    if (!isPosRoute) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, [isPosRoute]);

  const sidebarItems = useMemo(
    () => NAV_ITEMS.filter((i) => i.showInSidebar !== false),
    [],
  );

  const visibleNav = useMemo(
    () => filterNavItems(sidebarItems),
    [filterNavItems, sidebarItems],
  );

  const primaryMobile = useMemo(() => {
    if (visibleNav.length === 0) return [];
    const hasDash = visibleNav.some((i) => i.href === ROUTES.dashboard);
    if (hasDash) {
      return BOTTOM_PATHS.map((h) => visibleNav.find((n) => n.href === h)).filter(
        Boolean,
      ) as typeof NAV_ITEMS;
    }
    return visibleNav.slice(0, 3);
  }, [visibleNav]);

  const moreSheetItems = useMemo(() => {
    const bottomSet = new Set<string>(BOTTOM_PATHS);
    return visibleNav.filter((i) => !bottomSet.has(i.href));
  }, [visibleNav]);

  const pageTitle = getPageTitle(pathname);

  function isActive(href: string): boolean {
    if (href === "/dashboard") {
      return pathname === href || pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (ctx.isLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-fs-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        <p className="mt-4 max-w-sm px-4 text-center text-xs text-neutral-500">
          Chargement du compte… Si cela dure, vérifiez la connexion ou réessayez.
        </p>
      </div>
    );
  }

  if (ctx.isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fs-surface px-4 text-center">
        <p className="max-w-md text-sm text-red-800">
          {(ctx.error as Error)?.message ??
            "Impossible de charger votre session. Vérifiez la connexion ou les clés Supabase."}
        </p>
        <button
          type="button"
          onClick={() => void ctx.refetch()}
          className="rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (data?.isSuperAdmin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-fs-surface text-fs-text">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        <p className="text-sm text-neutral-500">Redirection…</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-fs-surface text-fs-text",
        /* Bureau (et POS) : hauteur viewport + pas de scroll sur body — sidebar fixe, scroll dans main */
        (isDesktop || isPosRoute) && "h-dvh max-h-dvh overflow-hidden",
        isPosRoute && "overscroll-none",
      )}
    >
      <OfflineStrip />
      <div
        className={cn(
          "flex min-h-0 flex-1",
          (isDesktop || isPosRoute) && "overflow-hidden",
        )}
      >
        {isDesktop ? (
          <AppSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
            items={visibleNav}
            userEmail={userEmail}
            isActive={isActive}
          />
        ) : null}

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            (isDesktop || isPosRoute) && "overflow-hidden",
          )}
        >
          {isDesktop ? (
            <header className="sticky top-0 z-40 flex h-[58px] shrink-0 items-center border-b border-black/[0.06] bg-fs-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-fs-card/80">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="rounded-lg p-2 text-neutral-700 hover:bg-fs-surface-container"
                aria-label={sidebarCollapsed ? "Ouvrir le menu" : "Réduire le menu"}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-6 w-6" aria-hidden />
                ) : (
                  <Menu className="h-6 w-6" aria-hidden />
                )}
              </button>
              <div className="mx-auto inline-flex items-center gap-2 rounded-lg border border-black/[0.08] bg-fs-surface-container px-3 py-1.5">
                <Clock3 className="h-4 w-4 text-[var(--fs-accent)]" aria-hidden />
                <p className="text-sm font-semibold tabular-nums text-fs-text">{clock}</p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && data?.companyId ? (
                  <OwnerNotificationsBell
                    companyId={data.companyId}
                    storeId={data.storeId ?? null}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => void signOutAndRedirect(router, { queryClient })}
                  className="rounded-lg p-2 text-neutral-700 hover:bg-fs-surface-container"
                  aria-label="Déconnexion"
                >
                  <LogOut className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </header>
          ) : (
            <header
              className={cn(
                "sticky top-0 z-40 flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] bg-fs-card",
                "px-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <Link
                  href="/dashboard"
                  className="min-w-0 shrink text-base font-bold tracking-tight text-fs-text"
                >
                  Faso<span className="text-[var(--fs-accent)]">Stock</span>
                </Link>
                {!isPosRoute && primaryMobile.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    className={cn(
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      "text-neutral-500 transition-colors active:bg-black/[0.06] dark:text-neutral-400 dark:active:bg-white/[0.08]",
                    )}
                    aria-label="Menu et autres sections"
                    aria-expanded={moreOpen}
                    aria-haspopup="dialog"
                  >
                    <Menu
                      className="size-[17px]"
                      strokeWidth={1.35}
                      aria-hidden
                    />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void signOutAndRedirect(router, { queryClient })}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  "text-neutral-500 transition-colors active:bg-black/[0.06] dark:text-neutral-400 dark:active:bg-white/[0.08]",
                )}
                aria-label="Déconnexion"
              >
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </header>
          )}

          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              !isPosRoute &&
                (!isDesktop &&
                  "pb-[calc(0.5rem+3.25rem+max(0.5rem,var(--fs-safe-bottom)))]"),
              isPosRoute && "overflow-hidden",
              isDesktop && !isPosRoute && "overflow-y-auto",
            )}
          >
            {children}
          </main>

          {!isDesktop && !isPosRoute && primaryMobile.length > 0 ? (
            <>
              <nav
                className={cn(
                  "fixed bottom-0 left-0 right-0 z-50 border-t border-black/10 bg-fs-card/95 pb-[max(0.5rem,var(--fs-safe-bottom))] pt-2",
                  "shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-fs-card/88",
                  "dark:border-white/10 dark:shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.45)]",
                )}
                aria-label="Navigation principale"
              >
                <div className="mx-auto grid min-h-[52px] w-full max-w-lg grid-cols-4 items-stretch gap-0 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
                  {primaryMobile.map((item) => {
                    const Icon = MOBILE_ICONS[item.href] ?? item.icon;
                    const active = isActive(item.href);
                    const label = MOBILE_LABELS[item.href] ?? item.label;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-[52px] min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl px-1.5 transition-[color,background-color] duration-150",
                          "active:bg-black/[0.05] dark:active:bg-white/[0.07]",
                          active
                            ? "bg-[color-mix(in_srgb,var(--fs-accent)_11%,transparent)] text-fs-accent"
                            : "text-neutral-500 dark:text-neutral-400",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-6 shrink-0",
                            active ? "stroke-[2.5]" : "stroke-[2]",
                          )}
                          aria-hidden
                        />
                        <span className="w-full truncate text-center text-[11px] font-semibold leading-none tracking-tight">
                          {label}
                        </span>
                      </Link>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    className={cn(
                      "flex min-h-[52px] min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl px-1.5 transition-[color,background-color] duration-150",
                      "text-neutral-500 active:bg-black/[0.05] dark:text-neutral-400 dark:active:bg-white/[0.07]",
                    )}
                    aria-label="Autres sections"
                  >
                    <MoreHorizontal className="size-6 shrink-0 stroke-[2]" aria-hidden />
                    <span className="w-full truncate text-center text-[11px] font-semibold leading-none tracking-tight">
                      Plus
                    </span>
                  </button>
                </div>
              </nav>
              <MoreSheet
                open={moreOpen}
                onClose={() => setMoreOpen(false)}
                items={moreSheetItems}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
