"use client";

import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/lib/config/navigation";
import { ChevronLeft, Menu, Package, PanelLeftOpen } from "lucide-react";
import Link from "next/link";

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
};

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
  items,
  userEmail,
  isActive,
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "relative flex h-full min-h-0 shrink-0 flex-col",
        "border-r border-black/[0.06] dark:border-white/[0.08]",
        "bg-fs-card shadow-[inset_-1px_0_0_0_rgba(0,0,0,0.03)] dark:shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.04)]",
        "transition-[width] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]",
        collapsed ? "w-[64px]" : "w-[228px]",
      )}
      aria-label="Navigation"
    >
      {/* Fond décoratif très léger — même famille que la surface principale */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-fs-surface-low/80 via-transparent to-fs-surface-container/50 dark:from-white/[0.02] dark:via-transparent dark:to-white/[0.03]"
        aria-hidden
      />

      <div
        className={cn(
          "relative z-[1] flex h-[58px] shrink-0 items-center border-b border-black/[0.06] dark:border-white/[0.08]",
          collapsed ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex min-w-0 items-center rounded-2xl outline-none transition-[transform,box-shadow] duration-200",
            "focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
            collapsed ? "justify-center p-1.5" : "gap-3 p-1 pr-2",
          )}
          title={collapsed ? "FasoStock — Tableau de bord" : undefined}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)]",
              "ring-1 ring-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)]",
              collapsed ? "h-9 w-9" : "h-8 w-8",
            )}
            aria-hidden
          >
            <Package
              className="h-4 w-4 text-[var(--fs-accent)]"
              strokeWidth={2.25}
            />
          </span>
          {!collapsed ? (
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
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group/nav relative flex items-center rounded-2xl text-[13px] font-semibold leading-tight tracking-tight",
                "outline-none transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
                "focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
                collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5",
                active
                  ? [
                      "bg-[color-mix(in_srgb,var(--fs-accent)_13%,transparent)] text-[var(--fs-accent)]",
                      "shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.45)]",
                      "dark:shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]",
                    ]
                  : [
                      "text-neutral-600 hover:bg-black/[0.035] hover:text-neutral-900",
                      "active:scale-[0.99] dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-fs-text",
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
                    ? "bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-[var(--fs-accent)]"
                    : "bg-black/[0.04] text-neutral-600 group-hover/nav:bg-black/[0.07] group-hover/nav:text-neutral-800 dark:bg-white/[0.06] dark:text-neutral-400 dark:group-hover/nav:bg-white/[0.1] dark:group-hover/nav:text-fs-text",
                  collapsed ? "h-9 w-9" : "h-8 w-8",
                )}
                aria-hidden
              >
                <Icon
                  className="h-4 w-4"
                  strokeWidth={active ? 2.35 : 2}
                />
              </span>
              {!collapsed ? (
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="relative z-[1] mt-auto space-y-2 border-t border-black/[0.06] p-2.5 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "group/collapse flex w-full items-center rounded-2xl border border-black/[0.07] bg-fs-surface-container/60 text-fs-on-surface-variant",
            "shadow-sm transition-[color,background-color,transform,border-color] duration-200",
            "hover:border-black/[0.1] hover:bg-fs-surface-container hover:text-fs-text",
            "active:scale-[0.98] dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:border-white/[0.14] dark:hover:bg-white/[0.07]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-fs-card",
            collapsed ? "justify-center p-3" : "justify-between gap-2 px-3 py-2.5",
          )}
          title={collapsed ? "Agrandir le menu" : "Réduire le menu"}
        >
          {collapsed ? (
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

        {userEmail ? (
          <div
            className={cn(
              "rounded-2xl border border-black/[0.05] bg-fs-surface-low/90 px-2.5 py-2 dark:border-white/[0.07] dark:bg-white/[0.04]",
              collapsed && "flex justify-center border-0 bg-transparent p-0",
            )}
          >
            {!collapsed ? (
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
