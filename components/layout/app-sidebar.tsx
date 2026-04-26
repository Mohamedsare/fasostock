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

  useEffect(() => {
    setOpenSections((prev) => {
      const next: Record<string, boolean> = {};
      for (const href of sectionHrefs) next[href] = prev[href] ?? false;
      return next;
    });
  }, [sectionHrefs]);

  const sectionExpanded = (href: string) => openSections[href] ?? false;
  const toggleSection = (href: string) => {
    setOpenSections((prev) => ({ ...prev, [href]: !(prev[href] ?? false) }));
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
              effectiveCollapsed ? "w-[58px]" : "w-[204px]",
            ),
        "border-r border-[color-mix(in_srgb,#f97316_16%,rgba(0,0,0,0.1))] dark:border-[#7c3a12]",
        "bg-[color-mix(in_srgb,#f97316_11%,white)] shadow-[inset_-1px_0_0_0_rgba(0,0,0,0.03)] dark:bg-[#2a140a] dark:shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.04)]",
      )}
      aria-label="Navigation"
    >
      {/* Fond décoratif très léger — même famille que la surface principale */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,#f97316_16%,white)] via-[color-mix(in_srgb,#f97316_7%,transparent)] to-[color-mix(in_srgb,#f97316_12%,white)] dark:from-[#3a1d0f] dark:via-[#2f170c] dark:to-[#241108]"
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
            "flex min-w-0 items-center rounded-2xl outline-none transition-[transform,box-shadow] duration-200",
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
                    "overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)]",
                    "ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)]",
                    effectiveCollapsed ? "h-9 w-9" : "h-8 w-8",
                  ),
            )}
            aria-hidden
          >
            {companyLogoUrl && !brandLogoErr ? (
              <img
                src={companyLogoUrl}
                alt=""
                className="h-full w-full object-contain object-center"
                onError={() => setBrandLogoErr(true)}
              />
            ) : (
              <Package
                className="h-4 w-4 text-[var(--fs-accent)]"
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
          "relative z-[1] flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden",
          "px-2.5 py-3 [scrollbar-gutter:stable]",
        )}
        aria-label="Sections de l’application"
      >
        {(() => {
          let currentSectionHref: string | null = null;
          return items.map((item) => {
            const Icon = item.icon;
            if (item.kind === "section") {
              currentSectionHref = item.href;
              const isOpen = sectionExpanded(item.href);
              return (
                <button
                  type="button"
                  key={`${item.href}-${item.label}`}
                  onClick={() => toggleSection(item.href)}
                  className={cn(
                    "mt-3 flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left",
                    "text-[11px] font-extrabold uppercase tracking-wide text-black/70 transition-colors",
                    "hover:bg-black/[0.04] dark:text-neutral-200/85 dark:hover:bg-white/[0.06]",
                    effectiveCollapsed && "sr-only",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {item.label}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                </button>
              );
            }

            if (item.child && currentSectionHref && !sectionExpanded(currentSectionHref)) {
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
                  "group/nav relative flex items-center rounded-2xl text-[13px] font-semibold leading-tight tracking-tight",
                  "outline-none transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
                  "focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
                  effectiveCollapsed
                    ? "justify-center px-2 py-3"
                    : cn("gap-3 px-3 py-2.5", item.child && "pl-6"),
                  active
                    ? [
                        "bg-[color-mix(in_srgb,var(--fs-accent)_13%,transparent)] text-[var(--fs-accent)] dark:bg-[#f97316]/35 dark:text-white",
                        "shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.45)]",
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
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
                    active
                      ? "bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-[var(--fs-accent)] dark:bg-[#f97316]/28 dark:text-white"
                      : "bg-[color-mix(in_srgb,#f97316_12%,white)] text-black group-hover/nav:bg-[color-mix(in_srgb,#f97316_19%,white)] group-hover/nav:text-black dark:bg-white/[0.06] dark:text-neutral-100 dark:group-hover/nav:bg-white/[0.1] dark:group-hover/nav:text-white",
                    effectiveCollapsed ? "h-9 w-9" : "h-8 w-8",
                  )}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" strokeWidth={active ? 2.35 : 2} />
                </span>
                {!effectiveCollapsed ? (
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                ) : null}
              </Link>
            );
          });
        })()}
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
              "group/collapse flex w-full items-center rounded-2xl border border-black/[0.07] bg-fs-surface-container/60 text-fs-on-surface-variant",
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
              "rounded-2xl border border-black/[0.05] bg-fs-surface-low/90 px-2.5 py-2 dark:border-white/[0.07] dark:bg-white/[0.04]",
              "dark:border-white/[0.16] dark:bg-white/[0.07]",
              effectiveCollapsed && "flex justify-center border-0 bg-transparent p-0",
            )}
          >
            {!effectiveCollapsed ? (
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] text-[10px] font-bold tabular-nums text-[var(--fs-accent)] ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)]"
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
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] text-[10px] font-bold tabular-nums text-[var(--fs-accent)] ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)]"
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
