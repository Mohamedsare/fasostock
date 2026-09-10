"use client";

import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/lib/config/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Menu, Package, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function navInitials(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "?";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase().slice(0, 2);
  }
  return local.slice(0, 2).toUpperCase();
}

type AppSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  items: NavItem[];
  userEmail?: string | null;
  isActive: (href: string) => boolean;
  /** `companies.logo_url` — même idée que `AppShell` Flutter (logo au-dessus du menu). */
  companyLogoUrl?: string | null;
  /**
   * Tiroir plein écran (mobile) : pas de mode réduit, fermeture au clic lien.
   */
  variant?: "default" | "mobileDrawer";
  /** Appelé après navigation (ex. fermer le drawer). */
  onNavigate?: () => void;
};

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
  items,
  userEmail,
  isActive,
  companyLogoUrl,
  variant = "default",
  onNavigate,
}: AppSidebarProps) {
  const [brandLogoErr, setBrandLogoErr] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const isDrawer = variant === "mobileDrawer";
  const effectiveCollapsed = isDrawer ? false : collapsed;
  const sectionHrefs = useMemo(
    () => items.filter((item) => item.kind === "section").map((item) => item.href),
    [items],
  );
  // Section parente de chaque item (par index), calculée hors render pour éviter
  // une variable mutable réassignée pendant le rendu.
  const parentSectionHrefs = useMemo(() => {
    const out: (string | null)[] = [];
    let current: string | null = null;
    for (const item of items) {
      if (item.kind === "section") current = item.href;
      out.push(current);
    }
    return out;
  }, [items]);

  /**
   * La section qui contient la page ouverte.
   *
   * Sert à teinter son intitulé : dans une liste de douze groupes, savoir d'un
   * coup d'œil dans lequel on se trouve évite de relire tout le menu. Les sections
   * étant ouvertes par défaut, c'est le seul rôle qui lui reste.
   */
  const activeSectionHref = useMemo(() => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "section") continue;
      if (isActive(item.href)) return parentSectionHrefs[i];
    }
    return null;
  }, [items, parentSectionHrefs, isActive]);

  /*
   * Purge des sections disparues quand la navigation change de métier. On ne réécrit
   * PAS les autres à `false` : l'absence de clé est justement ce qui laisse la règle
   * d'ouverture ci-dessous s'appliquer.
   */
  useEffect(() => {
    setOpenSections((prev) => {
      const next: Record<string, boolean> = {};
      for (const href of sectionHrefs) {
        if (href in prev) next[href] = prev[href];
      }
      return next;
    });
  }, [sectionHrefs]);

  /**
   * OUVERTES PAR DÉFAUT, et c'est le cœur de l'apparence du menu.
   *
   * Fermées, il ne restait à l'écran qu'une colonne d'intitulés gris : aucune des
   * pastilles colorées qui font la lisibilité du menu des autres métiers n'était
   * visible, et il fallait deux gestes pour atteindre la moindre page. Le menu
   * hiérarchique doit se lire comme le menu à plat — les sections ne servent qu'à
   * poser des repères dans la liste, pas à la cacher.
   *
   * L'utilisateur garde la main : ce qu'il replie reste replié (`openSections`).
   * Dérivé pendant le rendu plutôt que stocké par un effet, sinon un effet aurait
   * rouvert aussitôt toute section refermée à la main.
   */
  const sectionExpanded = (href: string) => openSections[href] ?? true;
  const toggleSection = (href: string) => {
    setOpenSections((prev) => ({ ...prev, [href]: !sectionExpanded(href) }));
  };

  useEffect(() => {
    setBrandLogoErr(false);
  }, [companyLogoUrl]);

  return (
    <aside
      className={cn(
        isDrawer
          ? "flex h-full min-h-0 w-full max-w-none shrink-0 flex-col"
          : cn(
              "sticky top-0 z-30 flex h-dvh max-h-dvh min-h-0 shrink-0 flex-col self-start",
              "transition-[width] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]",
              effectiveCollapsed ? "w-[58px]" : "w-[216px]",
            ),
        "border-r border-[color-mix(in_srgb,#f97316_16%,rgba(0,0,0,0.1))] dark:border-[#7c3a12]",
        "bg-[color-mix(in_srgb,#f97316_16%,white)] shadow-[inset_-1px_0_0_0_rgba(0,0,0,0.03)] dark:bg-[#31170b] dark:shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.04)]",
      )}
      aria-label="Navigation"
    >
      {/* Fond décoratif très léger — même famille que la surface principale */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,#f97316_22%,white)] via-[color-mix(in_srgb,#f97316_10%,transparent)] to-[color-mix(in_srgb,#f97316_16%,white)] dark:from-[#45200f] dark:via-[#35190c] dark:to-[#2a1308]"
        aria-hidden
      />

      <div
        className={cn(
          "relative z-[1] flex h-[58px] shrink-0 items-center border-b border-black/[0.06] dark:border-white/[0.08]",
          effectiveCollapsed ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex min-w-0 items-center rounded-xl outline-none transition-[transform,box-shadow] duration-200",
            "focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
            effectiveCollapsed ? "justify-center p-1.5" : "gap-3 p-1 pr-2",
          )}
          title={effectiveCollapsed ? "FasoStock — Tableau de bord" : undefined}
          onClick={() => onNavigate?.()}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center",
              companyLogoUrl && !brandLogoErr
                ? cn(
                    "rounded-none bg-transparent p-0 ring-0",
                    effectiveCollapsed ? "h-9 w-9" : "h-8 w-8",
                  )
                : cn(
                    "overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)]",
                    "ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)]",
                    effectiveCollapsed ? "h-9 w-9" : "h-8 w-8",
                  ),
            )}
            aria-hidden
          >
            {companyLogoUrl && !brandLogoErr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={companyLogoUrl}
                alt=""
                className="h-full w-full object-contain object-center"
                onError={() => setBrandLogoErr(true)}
              />
            ) : (
              <Package
                className="h-5 w-5 text-[var(--fs-accent)]"
                strokeWidth={2.25}
              />
            )}
          </span>
          {!effectiveCollapsed ? (
            <span className="min-w-0 font-bold tracking-tight">
              <span className="text-fs-text">Faso</span>
              <span className="text-[var(--fs-accent)]">Stock</span>
            </span>
          ) : null}
        </Link>
      </div>

      <nav
        className={cn(
          "relative z-[1] flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden",
          "px-2.5 py-3 [scrollbar-gutter:stable]",
        )}
        aria-label="Sections de l’application"
      >
        {items.map((item, index) => {
            const Icon = item.icon;
            if (item.kind === "section") {
              const isOpen = sectionExpanded(item.href);
              return (
                <button
                  type="button"
                  key={`${item.href}-${item.label}`}
                  onClick={() => toggleSection(item.href)}
                  aria-expanded={isOpen}
                  className={cn(
                    /*
                     * Un intitulé de groupe, pas un bouton. Il sépare, il ne réclame
                     * pas l'attention : le regard doit tomber sur les entrées
                     * colorées en dessous. D'où le texte minuscule, la couleur
                     * atténuée, le filet de séparation au-dessus, et la hauteur
                     * réduite au strict nécessaire pour rester touchable.
                     */
                    "group/sec mt-4 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left first:mt-1",
                    "border-t border-black/[0.07] pt-2.5 dark:border-white/[0.07]",
                    "text-[10px] font-bold uppercase tracking-[0.09em] transition-colors",
                    "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
                    /* La section de la page ouverte se repère sans avoir à lire. */
                    item.href === activeSectionHref
                      ? "text-[var(--fs-accent)] dark:text-[var(--fs-accent)]"
                      : "text-black/45 dark:text-neutral-300/55",
                    effectiveCollapsed && "sr-only",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {isOpen ? (
                    <ChevronDown
                      className="h-3.5 w-3.5 shrink-0 opacity-45 transition-opacity group-hover/sec:opacity-80"
                      aria-hidden
                    />
                  ) : (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 opacity-45 transition-opacity group-hover/sec:opacity-80"
                      aria-hidden
                    />
                  )}
                </button>
              );
            }

            /*
             * Barre repliée : on n'applique PAS le repli des sections. Leurs en-têtes
             * sont `sr-only` à cette largeur, donc rien ne permettrait de les rouvrir —
             * la barre se retrouvait quasiment vide, avec le seul « Tableau de bord ».
             */
            const currentSectionHref = parentSectionHrefs[index];
            if (
              !effectiveCollapsed &&
              item.child &&
              currentSectionHref &&
              !sectionExpanded(currentSectionHref)
            ) {
              return null;
            }

            const active = isActive(item.href);
            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                title={effectiveCollapsed ? item.label : undefined}
                onClick={() => onNavigate?.()}
                className={cn(
                  "group/nav relative flex items-center rounded-sm text-[13px] font-semibold leading-tight tracking-tight",
                  "outline-none transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
                  "focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
                  effectiveCollapsed
                    ? "justify-center px-2 py-2.5"
                    /*
                     * `pl-5` et non `pl-6` : avec douze sections, six pixels de trop
                     * par entrée mangent la largeur utile des libellés longs
                     * (« Immatriculation Engins ») et les font tous couper.
                     */
                    : cn("gap-2.5 px-3 py-2", item.child && "pl-5"),
                  active
                    ? [
                        "bg-black/5.5 text-fs-text dark:bg-white/12 dark:text-white",
                        "shadow-[0_1px_2px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.45)]",
                        "dark:shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]",
                      ]
                    : [
                        "text-black hover:bg-black/[0.035] hover:text-black",
                        "active:scale-[0.99] dark:text-neutral-100 dark:hover:bg-white/[0.06] dark:hover:text-white",
                      ],
                )}
              >
                {active ? (
                  <span
                    className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--fs-accent)] shadow-[2px_0_8px_color-mix(in_srgb,var(--fs-accent)_45%,transparent)]"
                    aria-hidden
                  />
                ) : null}
                {/*
                  Filet de rattachement : sans lui, un sous-élément décalé de 12 px
                  flotte sans qu'on voie à quelle section il appartient — surtout au
                  milieu d'une liste de trente entrées.
                */}
                {item.child && !effectiveCollapsed ? (
                  <span
                    className="absolute left-2.5 top-0 h-full w-px bg-black/[0.08] dark:bg-white/[0.09]"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-xs transition-[opacity,box-shadow] duration-200",
                    effectiveCollapsed ? "h-10 w-10" : "h-9 w-9",
                    !active && "opacity-85 group-hover/nav:opacity-100",
                    active && "shadow-[0_2px_8px_rgba(0,0,0,0.22)]",
                  )}
                  style={item.iconBg ? { background: item.iconBg } : undefined}
                  aria-hidden
                >
                  <Icon
                    className={cn("h-5 w-5", item.iconBg ? "text-white" : active ? "text-[var(--fs-accent)]" : "text-black dark:text-neutral-100")}
                    strokeWidth={active ? 2.35 : 2}
                  />
                </span>
                {!effectiveCollapsed ? (
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                ) : null}
              </Link>
            );
          })}
      </nav>

      <div className="relative z-[1] mt-auto space-y-2 border-t border-black/[0.06] p-2.5 dark:border-white/[0.08]">
        {isDrawer ? (
          <button
            type="button"
            onClick={() => onNavigate?.()}
            aria-label="Fermer le menu"
            className={cn(
              "group/drawer-close flex w-full items-center justify-between gap-3 rounded-full px-4 py-3",
              "bg-[color-mix(in_srgb,#f97316_14%,white)] text-fs-text",
              "shadow-[0_2px_10px_rgba(0,0,0,0.07)]",
              "transition-[transform,background-color,box-shadow] duration-200",
              "hover:bg-[color-mix(in_srgb,#f97316_20%,white)] hover:shadow-[0_3px_12px_rgba(0,0,0,0.08)] active:scale-[0.98]",
              "dark:bg-[#4a2413] dark:text-white dark:shadow-[0_2px_14px_rgba(0,0,0,0.35)] dark:hover:bg-[#5a2b16]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
            )}
          >
            <span className="flex items-center gap-2.5">
              <Menu
                className="h-[18px] w-[18px] shrink-0 text-[var(--fs-accent)]"
                strokeWidth={2.25}
                aria-hidden
              />
              <span className="text-sm font-bold tracking-tight text-neutral-800 dark:text-neutral-100">
                Menu
              </span>
            </span>
            <ChevronLeft
              className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-300 group-hover/drawer-close:-translate-x-0.5 dark:text-neutral-500"
              aria-hidden
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              "group/collapse flex w-full items-center rounded-xl border border-black/[0.07] bg-fs-surface-container/60 text-fs-on-surface-variant",
              "shadow-sm transition-[color,background-color,transform,border-color] duration-200",
              "hover:border-black/[0.1] hover:bg-fs-surface-container hover:text-fs-text",
              "active:scale-[0.98] dark:border-white/[0.18] dark:bg-white/[0.08] dark:text-white dark:hover:border-white/[0.26] dark:hover:bg-white/[0.13]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
              effectiveCollapsed ? "justify-center p-3" : "justify-between gap-2 px-3 py-2.5",
            )}
            title={effectiveCollapsed ? "Agrandir le menu" : "Réduire le menu"}
          >
            {effectiveCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0 text-[var(--fs-accent)]" aria-hidden />
            ) : (
              <>
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <Menu className="h-4 w-4 text-[var(--fs-accent)]" aria-hidden />
                  Menu
                </span>
                <ChevronLeft
                  className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-300 group-hover/collapse:-translate-x-0.5"
                  aria-hidden
                />
              </>
            )}
          </button>
        )}

        {userEmail ? (
          <div
            className={cn(
              "rounded-xl border border-black/[0.05] bg-fs-surface-low/90 px-2.5 py-2 dark:border-white/[0.07] dark:bg-white/[0.04]",
              "dark:border-white/[0.16] dark:bg-white/[0.07]",
              effectiveCollapsed && "flex justify-center border-0 bg-transparent p-0",
            )}
          >
            {!effectiveCollapsed ? (
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] text-[10px] font-bold tabular-nums text-[var(--fs-accent)] ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)]"
                  aria-hidden
                >
                  {navInitials(userEmail)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Compte
                  </p>
                  <p className="truncate text-xs font-medium text-fs-text">{userEmail}</p>
                </div>
              </div>
            ) : (
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] text-[10px] font-bold tabular-nums text-[var(--fs-accent)] ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)]"
                title={userEmail}
              >
                {navInitials(userEmail)}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
