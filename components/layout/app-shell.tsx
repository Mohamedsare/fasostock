"use client";

import { AppPresenceReporter } from "@/components/presence/app-presence-reporter";
import { OfflineStrip } from "@/components/offline/offline-strip";
import { CompanyCurrencyLoader } from "@/components/providers/company-currency-loader";
import { CompanyTimeZoneLoader } from "@/components/providers/company-timezone-loader";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { LoadingExperience } from "@/components/loading/loading-experience";
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
import { FullscreenToggleButton } from "@/components/layout/fullscreen-toggle-button";
import { OwnerNotificationsBell } from "@/components/layout/owner-notifications-bell";
import { NAV_ITEMS, RESTAURANT_NAV_ITEMS } from "@/lib/config/navigation";
import { useAppContext } from "@/lib/features/common/app-context";
import { applyActiveStoreChange } from "@/lib/features/stores/active-store";
import { StoreSwitcherSheet } from "@/components/layout/store-switcher-sheet";
import { SupportSessionBanner } from "@/components/layout/support-session-banner";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { useDesktopNav } from "@/lib/hooks/use-media-query";
import { signOutAndRedirect } from "@/lib/auth/sign-out-client";
import { cn } from "@/lib/utils/cn";
import { timeZoneLabelOf } from "@/lib/config/timezones";
import { formatOperationTimeWithSeconds, getActiveTimeZone } from "@/lib/utils/operation-datetime";
import {
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftOpen,
  Package,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  hasSeenInitialAppLoad,
  markInitialAppLoadDone,
} from "@/lib/features/common/initial-app-load";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const BOTTOM_PATHS = [ROUTES.dashboard, ROUTES.products, ROUTES.sales];

/**
 * Écrans qui pilotent eux-mêmes leur boutique (portée Entreprise / Boutique,
 * sélecteur propre, période, onglet) : ils suivent `ctx.storeId` et ne doivent
 * PAS être remontés au changement de boutique, sous peine de perdre ce réglage.
 */
const SELF_MANAGED_STORE_ROUTES = [ROUTES.dashboard, ROUTES.reports];

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
  // Écrans POS plein cadre (caisse rapide, Facture A4, Facture A4 tableau) :
  // pas de barre supérieure, plus d'espace pour la vente — comme la caisse rapide.
  const hidePosTopBar = isPosRoute;
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileBrandLogoErr, setMobileBrandLogoErr] = useState(false);
  /** Heure uniquement côté client — fuseau = celui du navigateur (pays / OS de l’utilisateur). */
  const [clock, setClock] = useState("--:--:--");
  const [clockIso, setClockIso] = useState("");
  const [clockTitle, setClockTitle] = useState("Heure locale");
  /** Splash immersif : première arrivée dans l'onglet uniquement (sessionStorage). */
  const [showImmersiveSplash, setShowImmersiveSplash] = useState<boolean | null>(null);

  const data = ctx.data;
  const isOwner = data?.roleSlug === "owner";
  const stores = data?.stores ?? [];
  const activeStoreId = data?.storeId ?? null;
  const [storeSwitcherOpen, setStoreSwitcherOpen] = useState(false);
  /**
   * Incrémenté à chaque changement de boutique depuis la barre supérieure : sert
   * de `key` à l'écran courant pour le remonter. Un compteur plutôt que le
   * `storeId` lui-même, sinon la première résolution du contexte
   * (`undefined` → id) provoquerait un remontage inutile à chaque chargement.
   */
  const [storeEpoch, setStoreEpoch] = useState(0);
  /** Une bascule depuis la barre supérieure attend son remontage. */
  const remountOnStoreChange = useRef(false);

  /**
   * Changer de boutique doit valoir pour TOUTE l'application, immédiatement.
   * Deux pièges, traités dans l'ordre — en retirer un laisse des écrans afficher
   * les chiffres de la boutique précédente.
   */
  const switchStore = (storeId: string) => {
    setStoreSwitcherOpen(false);
    if (storeId === activeStoreId) return;

    // 1. Contexte + cache : voir `applyActiveStoreChange`.
    applyActiveStoreChange(queryClient, storeId);

    /*
     * 2. Les écrans sous `/stores/<id>/…` (caisse, facture, vente d'engin) tiennent
     *    leur boutique de l'URL, pas du contexte : il faut y aller. Ailleurs, on
     *    remonte l'écran courant — beaucoup de pages recopient la boutique active
     *    dans un filtre local au premier affichage et ne la relisent jamais.
     */
    const scoped = /^\/stores\/[^/]+(\/.*)?$/.exec(pathname);
    if (scoped) {
      router.replace(`/stores/${storeId}${scoped[1] ?? ""}`);
      return;
    }

    /*
     * 3. `?store=` — l'historique des ventes reçoit ce paramètre en revenant de la
     *    caisse, et il l'emporte sur le contexte. On le réaligne, et surtout on ne
     *    remonte PAS l'écran : le remontage repartirait de l'URL telle qu'elle est
     *    à cet instant, or `router.replace` n'a pas encore abouti — la page se
     *    reconstruirait sur l'ancienne boutique. Ici, c'est le changement d'URL
     *    lui-même qui pilote l'écran, sans course possible.
     */
    const search = new URLSearchParams(window.location.search);
    if (search.get("store")) {
      search.set("store", storeId);
      router.replace(`${pathname}?${search.toString()}`);
      return;
    }

    /*
     * 4. Tableau de bord et Rapports ont leur propre vue par boutique (portée
     *    Entreprise / Boutique, période, onglet). Les remonter les renverrait à
     *    leurs valeurs par défaut — on perdrait la portée « Boutique » choisie
     *    juste avant. Ces deux écrans suivent `ctx.storeId` par eux-mêmes.
     */
    if (SELF_MANAGED_STORE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
      return;
    }

    remountOnStoreChange.current = true;
  };

  /**
   * Le remontage est déclenché ici, et non dans `switchStore` : il doit survenir
   * APRÈS un rendu où le contexte porte déjà la nouvelle boutique, sinon l'écran
   * se reconstruirait en relisant l'ancienne. Le drapeau limite l'effet aux
   * bascules de la barre supérieure — les sélecteurs internes du Tableau de bord
   * et des Rapports gèrent leur propre état et n'ont pas à être réinitialisés.
   */
  useEffect(() => {
    if (!remountOnStoreChange.current) return;
    remountOnStoreChange.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remontage volontaire, ordonné après la mise à jour du contexte
    setStoreEpoch((n) => n + 1);
  }, [activeStoreId]);

  /**
   * Le super admin vit dans /admin — sauf en mode dépannage, où il travaille
   * volontairement dans l'espace d'une entreprise cliente.
   */
  useEffect(() => {
    if (data?.isSuperAdmin && !data?.supportSession) router.replace("/admin");
  }, [data?.isSuperAdmin, data?.supportSession, router]);

  useEffect(() => {
    setShowImmersiveSplash(!hasSeenInitialAppLoad());
  }, []);

  useEffect(() => {
    if (!ctx.isLoading) markInitialAppLoadDone();
  }, [ctx.isLoading]);

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
      setClock(formatOperationTimeWithSeconds(now));
      setClockIso(now.toISOString());
      setClockTitle(`Heure de ${timeZoneLabelOf(getActiveTimeZone())} · ${getActiveTimeZone()}`);
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
    () =>
      (data?.businessTypeSlug === "restaurant-fast-food"
        ? RESTAURANT_NAV_ITEMS
        : NAV_ITEMS
      ).filter((i) => i.showInSidebar !== false),
    [data?.businessTypeSlug],
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
    if (showImmersiveSplash === true) {
      return (
        <LoadingExperience
          variant="fullscreen"
          message="Ouverture de votre espace FasoStock…"
          submessage="Connexion sécurisée et chargement de votre entreprise."
        />
      );
    }
    return <AppShellSkeleton />;
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

  if (data?.isSuperAdmin && !data.supportSession) {
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
      {data?.supportSession ? (
        <SupportSessionBanner
          companyName={data.supportSession.companyName}
          reason={data.supportSession.reason}
          expiresAt={data.supportSession.expiresAt}
        />
      ) : null}
      <OfflineStrip />
      {/* Rend active la devise de l'entreprise pour tous les montants affichés. */}
      <CompanyCurrencyLoader />
      <CompanyTimeZoneLoader />
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
            hidePosTopBar ? null : (
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
                {/* Ouvert à tous les rôles — cf. le sélecteur mobile plus bas. */}
                {stores.length > 1 ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setStoreSwitcherOpen((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border border-black/[0.07] bg-fs-surface-container/90 px-2.5 py-1.5",
                        "shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-fs-surface-container",
                        "dark:border-white/10 dark:bg-white/5",
                      )}
                      aria-label="Changer de boutique"
                    >
                      <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-fs-accent" />
                      <span className="max-w-[110px] truncate text-[12px] font-semibold text-fs-text">
                        {stores.find((s) => s.id === activeStoreId)?.name ?? "Boutique"}
                      </span>
                      <ChevronDown className={cn("h-3 w-3 shrink-0 text-neutral-400 transition-transform", storeSwitcherOpen && "rotate-180")} />
                    </button>
                    {storeSwitcherOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setStoreSwitcherOpen(false)} />
                        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-black/[0.07] bg-fs-card shadow-lg dark:border-white/10">
                          {stores.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => switchStore(s.id)}
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium transition-colors",
                                s.id === activeStoreId
                                  ? "bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)] text-fs-accent"
                                  : "text-fs-text hover:bg-black/[0.035] dark:hover:bg-white/5",
                              )}
                            >
                              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.id === activeStoreId ? "bg-fs-accent" : "bg-transparent")} />
                              <span className="flex-1 truncate">{s.name}</span>
                              {s.isPrimary ? <span className="text-[10px] text-neutral-400">principal</span> : null}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
                <FullscreenToggleButton />
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
            )
          ) : hidePosTopBar ? null : (
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
                      // eslint-disable-next-line @next/next/no-img-element
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
              {/*
                * Ouvert à tous les rôles : un caissier affecté à deux boutiques doit
                * pouvoir basculer de l'une à l'autre. `stores` ne contient déjà que
                * ses boutiques (RLS `current_user_store_ids`).
                */}
              {stores.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStoreSwitcherOpen(true)}
                    className={cn(
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/[0.07] bg-fs-surface-container/90 text-fs-accent",
                      "shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform active:scale-95 dark:border-white/10 dark:bg-white/5",
                    )}
                    aria-label={`Changer de boutique (actuelle : ${
                      stores.find((s) => s.id === activeStoreId)?.name ?? "Boutique"
                    })`}
                    aria-haspopup="dialog"
                  >
                    <ShoppingBag className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                  {storeSwitcherOpen ? (
                    <StoreSwitcherSheet
                      stores={stores}
                      activeStoreId={activeStoreId}
                      onSelect={switchStore}
                      onClose={() => setStoreSwitcherOpen(false)}
                    />
                  ) : null}
                </>
              ) : null}
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
                "max-[1023px]:pb-[calc(0.75rem+4.75rem+max(0.75rem,var(--fs-safe-bottom)))] max-[1023px]:[scroll-padding-bottom:calc(0.75rem+4.75rem+max(0.75rem,var(--fs-safe-bottom)))]",
              isPosRoute ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden",
            )}
          >
            {/*
              * `key` : au changement de boutique, l'écran courant repart de zéro.
              * Sans lui, les filtres qui recopient la boutique active à leur
              * premier affichage (Ventes, Crédit, Tableau de bord…) resteraient
              * figés sur l'ancienne. Un `Fragment` — aucun nœud DOM ajouté, donc
              * aucune incidence sur la mise en page (notamment les écrans POS).
              */}
            <Fragment key={storeEpoch}>{children}</Fragment>
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
                    const defaultShort = MOBILE_LABELS[item.href];
                    const label =
                      item.label !== (NAV_ITEMS.find((n) => n.href === item.href)?.label ?? item.label)
                        ? item.label
                        : (defaultShort ?? item.label);
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
              <div className="absolute left-0 top-0 flex h-full w-[min(100%,260px)] flex-col shadow-xl">
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
      <AppPresenceReporter />
    </div>
  );
}
