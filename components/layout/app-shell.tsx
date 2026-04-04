"use client";

import { OfflineStrip } from "@/components/offline/offline-strip";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MoreSheet } from "@/components/layout/more-sheet";
import {
  shellBottomNavBarClass,
  shellClockPillClass,
  shellMobileTabActiveClass,
  shellMobileTabInactiveClass,
  shellToolbarIconButtonClass,
  shellTopBarClass,
} from "@/components/layout/shell-chrome";
import { ROUTES } from "@/lib/config/routes";
import { OwnerNotificationsBell } from "@/components/layout/owner-notifications-bell";
import { NAV_ITEMS } from "@/lib/config/navigation";
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
  const isPosRoute = /^\/stores\/[^/]+\/(pos(-quick)?|facture-tab)\/?$/.test(
    pathname,
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileBrandLogoErr, setMobileBrandLogoErr] = useState(false);
  /** Heure uniquement côté client — fuseau = celui du navigateur (pays / OS de l’utilisateur). */
  const [clock, setClock] = useState("--:--:--");
  const [clockIso, setClockIso] = useState("");
  const [clockTitle, setClockTitle] = useState("Heure locale");

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
    setMobileBrandLogoErr(false);
  }, [data?.companyLogoUrl]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isDesktop) setMobileNavOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const locale =
        typeof navigator !== "undefined" && navigator.language
          ? navigator.language
          : "fr-FR";
      setClock(
        new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(now),
      );
      setClockIso(now.toISOString());
      setClockTitle(`Heure locale · ${tz}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  /**
   * Pas de scroll sur `html`/`body` : tout le contenu défilable vit dans `<main>` (ou zones POS).
   * Sans ça, une page très longue (ex. Paramètres) recrée la grande barre de scroll navigateur.
   */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (isPosRoute) {
      html.style.overscrollBehavior = "none";
      body.style.overscrollBehavior = "none";
    }
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

  function isActive(href: string): boolean {
    if (href === "/dashboard") {
      return pathname === href || pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (ctx.isLoading) {
    return (
      <div className="relative h-dvh max-h-dvh min-h-dvh overflow-hidden bg-fs-surface">
        <AppShellSkeleton />
        <p className="pointer-events-none absolute bottom-6 left-0 right-0 text-center text-xs text-neutral-500">
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
        /*
         * Hauteur = viewport sur toutes les largeurs (hors POS idem) : le scroll ne doit pas être
         * sur `html`/`body`. Contenu long (ex. Paramètres) défile dans `<main>`.
         * Uniquement `min-[1024px]:` cassait les vues 900–1023px / zoom et réintroduisait le « gros »
         * scrollbar de page.
         */
        "flex h-dvh max-h-dvh min-h-dvh flex-col overflow-hidden bg-fs-surface text-fs-text",
        isPosRoute && "overscroll-none",
      )}
    >
      <OfflineStrip />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {isDesktop ? (
          <AppSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
            items={visibleNav}
            userEmail={userEmail}
            isActive={isActive}
            companyLogoUrl={data?.companyLogoUrl ?? null}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {isDesktop ? (
            <header
              className={cn(
                "sticky top-0 z-40 flex h-[58px] shrink-0 items-center gap-2 px-3",
                shellTopBarClass,
              )}
            >
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className={shellToolbarIconButtonClass}
                aria-label={sidebarCollapsed ? "Ouvrir le menu" : "Réduire le menu"}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" aria-hidden />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden />
                )}
              </button>
              <div className="mx-auto min-w-0">
                <div className={shellClockPillClass} title={clockTitle}>
                  <Clock3 className="h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
                  <time
                    dateTime={clockIso || undefined}
                    className="text-sm font-semibold tabular-nums text-fs-text"
                  >
                    {clock}
                  </time>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                {isOwner && data?.companyId ? (
                  <OwnerNotificationsBell
                    companyId={data.companyId}
                    storeId={data.storeId ?? null}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => void signOutAndRedirect(router, { queryClient })}
                  className={shellToolbarIconButtonClass}
                  aria-label="Déconnexion"
                >
                  <LogOut className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </header>
          ) : (
            <header
              className={cn(
                "sticky top-0 z-40 flex h-[58px] shrink-0 items-center justify-between gap-2",
                shellTopBarClass,
                "px-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Link
                  href="/dashboard"
                  className="flex min-w-0 shrink items-center gap-2 rounded-2xl py-1 pr-2 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center",
                      data?.companyLogoUrl && !mobileBrandLogoErr
                        ? "rounded-none bg-transparent p-0 ring-0"
                        : "rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)]",
                    )}
                    aria-hidden
                  >
                    {data?.companyLogoUrl && !mobileBrandLogoErr ? (
                      <img
                        src={data.companyLogoUrl}
                        alt=""
                        className="h-full w-full object-contain object-center"
                        onError={() => setMobileBrandLogoErr(true)}
                      />
                    ) : (
                      <Package
                        className="h-[18px] w-[18px] text-[var(--fs-accent)]"
                        strokeWidth={2.25}
                      />
                    )}
                  </span>
                  <span className="min-w-0 text-base font-bold tracking-tight text-fs-text">
                    Faso<span className="text-[var(--fs-accent)]">Stock</span>
                  </span>
                </Link>
                {!isPosRoute && primaryMobile.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(true)}
                    className={shellToolbarIconButtonClass}
                    aria-label="Ouvrir le menu de navigation"
                    aria-expanded={mobileNavOpen}
                    aria-haspopup="dialog"
                  >
                    <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void signOutAndRedirect(router, { queryClient })}
                className={shellToolbarIconButtonClass}
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
                "max-[1023px]:pb-[calc(0.5rem+3.5rem+max(0.5rem,var(--fs-safe-bottom)))]",
              isPosRoute ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden",
            )}
          >
            {children}
          </main>

          {!isDesktop && !isPosRoute && primaryMobile.length > 0 ? (
            <>
              <nav
                className={cn(
                  "fixed bottom-0 left-0 right-0 z-50 pt-2",
                  shellBottomNavBarClass,
                )}
                aria-label="Navigation principale"
              >
                <div className="mx-auto grid min-h-[56px] w-full max-w-lg grid-cols-4 items-stretch gap-1 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
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
                          "flex min-h-[56px] min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl px-1.5 transition-[color,background-color,transform] duration-200 ease-out",
                          active
                            ? shellMobileTabActiveClass
                            : [
                                shellMobileTabInactiveClass,
                                "active:scale-[0.98] active:bg-black/[0.05] dark:active:bg-white/[0.07]",
                              ],
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center rounded-xl transition-colors duration-200",
                            active
                              ? "bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] p-1.5"
                              : "p-0.5",
                          )}
                          aria-hidden
                        >
                          <Icon
                            className={cn(
                              "size-6 shrink-0",
                              active ? "stroke-[2.5]" : "stroke-[2]",
                            )}
                          />
                        </span>
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
                      "flex min-h-[56px] min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-2xl px-1.5 transition-[color,background-color,transform] duration-200 ease-out",
                      shellMobileTabInactiveClass,
                      "active:scale-[0.98] active:bg-black/[0.05] dark:active:bg-white/[0.07]",
                    )}
                    aria-label="Autres sections"
                  >
                    <span className="flex items-center justify-center rounded-xl p-0.5" aria-hidden>
                      <MoreHorizontal className="size-6 shrink-0 stroke-2" />
                    </span>
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

          {!isDesktop && !isPosRoute && mobileNavOpen ? (
            <div
              className="fixed inset-0 z-[60] lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navigation"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/50"
                aria-label="Fermer le menu"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className="absolute left-0 top-0 flex h-full w-[min(100%,288px)] flex-col shadow-xl">
                <AppSidebar
                  variant="mobileDrawer"
                  collapsed={false}
                  onToggleCollapsed={() => {}}
                  items={visibleNav}
                  userEmail={userEmail}
                  isActive={isActive}
                  companyLogoUrl={data?.companyLogoUrl ?? null}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
