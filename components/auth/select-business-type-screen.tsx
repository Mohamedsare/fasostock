"use client";

import { BusinessTypeCard } from "@/components/auth/business-type-card";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_TYPES,
  OTHER_BUSINESS_TYPE_SLUG,
  groupByCategory,
  searchBusinessTypes,
  type BusinessCategoryId,
  type BusinessTypeOption,
} from "@/lib/config/business-types";
import { ROUTES } from "@/lib/config/routes";
import { cn } from "@/lib/utils/cn";
import { ChevronLeft, Search, SearchX, ShieldCheck, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type KeyboardEvent } from "react";

type CategoryFilter = BusinessCategoryId | "all";

/** Id DOM d’une carte — sert au déplacement du focus aux flèches. */
function cardDomId(slug: string): string {
  return `business-type-${slug}`;
}

/** Carte de repli, toujours présente dans le catalogue (dernière entrée). */
const OTHER_OPTION: BusinessTypeOption =
  BUSINESS_TYPES.find((b) => b.slug === OTHER_BUSINESS_TYPE_SLUG) ??
  BUSINESS_TYPES[BUSINESS_TYPES.length - 1];

export function SelectBusinessTypeScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);

  const trimmedQuery = query.trim();

  /** Activités retenues par la recherche puis par la puce de catégorie. */
  const visible = useMemo(() => {
    const matches = searchBusinessTypes(trimmedQuery);
    return category === "all" ? matches : matches.filter((o) => o.category === category);
  }, [trimmedQuery, category]);

  const groups = useMemo(() => groupByCategory(visible), [visible]);
  const hasResults = groups.length > 0;
  const matchedOther = visible.some((o) => o.slug === OTHER_BUSINESS_TYPE_SLUG);
  /** Repli « Autre commerce » : visible avec la liste complète, ou en secours si rien ne matche. */
  const showOther = matchedOther || !hasResults;
  /** Recherche infructueuse — sauf si « Autre commerce » est justement le résultat. */
  const showEmptyState = !hasResults && !matchedOther;

  /** Ordre à plat des cartes affichées — sert à la navigation aux flèches. */
  const navOrder = useMemo(() => {
    const flat = groups.flatMap((g) => g.options);
    return showOther ? [...flat, OTHER_OPTION] : flat;
  }, [groups, showOther]);

  const rovingSlug =
    focusedSlug && navOrder.some((o) => o.slug === focusedSlug)
      ? focusedSlug
      : navOrder[0]?.slug ?? null;

  const onSelectType = useCallback(
    (slug: string) => {
      if (pendingSlug) return;
      setPendingSlug(slug);
      const q = new URLSearchParams({ businessType: slug });
      router.push(`${ROUTES.register}?${q.toString()}`);
    },
    [pendingSlug, router],
  );

  const focusCardAt = useCallback(
    (index: number) => {
      if (navOrder.length === 0) return;
      const wrapped = (index + navOrder.length) % navOrder.length;
      const next = navOrder[wrapped];
      setFocusedSlug(next.slug);
      document.getElementById(cardDomId(next.slug))?.focus();
    },
    [navOrder],
  );

  /** Flèches / Home / End dans le radiogroup (motif ARIA). */
  const onNavigateKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        focusCardAt(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        focusCardAt(index - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusCardAt(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusCardAt(navOrder.length - 1);
      }
    },
    [focusCardAt, navOrder.length],
  );

  const navIndexBySlug = useMemo(
    () => new Map(navOrder.map((o, i) => [o.slug, i] as const)),
    [navOrder],
  );

  function cardProps(option: BusinessTypeOption) {
    const index = navIndexBySlug.get(option.slug) ?? 0;
    return {
      option,
      selected: pendingSlug === option.slug,
      pending: pendingSlug === option.slug,
      onSelect: () => onSelectType(option.slug),
      onNavigateKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onNavigateKeyDown(e, index),
      tabIndex: option.slug === rovingSlug ? 0 : -1,
      id: cardDomId(option.slug),
    };
  }

  function resetFilters() {
    setQuery("");
    setCategory("all");
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="rounded-[26px] border border-neutral-200/80 bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.07)] sm:p-6 dark:border-white/10 dark:bg-fs-surface-low/80">
        {/* En-tête : retour + progression */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href={ROUTES.login}
            className="inline-flex items-center gap-1 rounded-lg py-1 text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Connexion
          </Link>

          <ol className="flex items-center gap-2 text-[11px] font-semibold sm:text-xs" aria-label="Progression">
            <li className="flex items-center gap-1.5" aria-current="step">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fs-accent text-[10px] text-white">
                1
              </span>
              <span className="text-fs-text">Activité</span>
            </li>
            <li aria-hidden className="h-px w-5 bg-neutral-300 dark:bg-white/15" />
            <li className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 text-[10px] dark:border-white/20">
                2
              </span>
              <span className="hidden sm:inline">Votre entreprise</span>
            </li>
          </ol>
        </div>

        {/* Hero */}
        <div className="mt-2 flex flex-col items-center text-center">
          <Image
            src="/fs.png"
            alt=""
            width={96}
            height={96}
            className="h-[76px] w-[76px] object-contain sm:h-[88px] sm:w-[88px]"
            priority
          />
          <p className="mt-1 text-[1.6rem] font-extrabold leading-none tracking-tight">
            <span className="text-[#111827] dark:text-white">Faso</span>
            <span className="text-[#f97316]">Stock</span>
          </p>
          <h1 className="mt-3 max-w-xl text-[1.5rem] font-bold leading-tight tracking-tight text-fs-text sm:text-[1.75rem]">
            Quel type de commerce gérez-vous ?
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-400">
            Choisissez votre activité : FasoStock adapte le vocabulaire, les écrans et les
            modules de votre espace.
          </p>
        </div>

        {/* Barre de recherche + filtres (collante au scroll) */}
        <div className="sticky top-0 z-20 -mx-4 mt-5 border-b border-black/[0.06] bg-white/90 px-4 pb-2.5 pt-3 backdrop-blur-md sm:-mx-6 sm:px-6 dark:border-white/10 dark:bg-fs-surface-low/90">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
              strokeWidth={2}
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                }
              }}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-label="Rechercher une activité"
              placeholder="Rechercher : pharmacie, maquis, pièces moto…"
              className="fs-touch-target h-12 w-full rounded-xl border border-black/[0.09] bg-fs-surface-container/60 pl-11 pr-11 text-[15px] text-fs-text outline-none transition-colors placeholder:text-neutral-400 focus:border-fs-accent/60 focus:bg-fs-card focus:ring-2 focus:ring-fs-accent/20 dark:border-white/10"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-fs-surface-container hover:text-fs-text"
              >
                <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </button>
            ) : null}
          </div>

          <div
            className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Filtrer par famille d’activité"
          >
            <FilterChip
              label="Tout"
              active={category === "all"}
              onClick={() => setCategory("all")}
            />
            {BUSINESS_CATEGORIES.map((c) => (
              <FilterChip
                key={c.id}
                label={c.shortLabel}
                active={category === c.id}
                onClick={() => setCategory(c.id)}
              />
            ))}
          </div>
        </div>

        {/* Résultats */}
        <div
          className="mt-4"
          role="radiogroup"
          aria-label="Type d’activité"
        >
          {trimmedQuery || category !== "all" ? (
            <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-neutral-500 dark:text-neutral-400">
              <span aria-live="polite">
                {visible.length === 0
                  ? "Aucune activité trouvée"
                  : `${visible.length} activité${visible.length > 1 ? "s" : ""} trouvée${visible.length > 1 ? "s" : ""}`}
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="font-semibold text-fs-accent underline-offset-4 hover:underline"
              >
                Tout afficher
              </button>
            </p>
          ) : null}

          {groups.map((group) => (
            <section key={group.category.id} className="mb-6 last:mb-0">
              <div className="mb-2.5 flex items-center gap-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                  {group.category.label}
                </h2>
                <span
                  aria-hidden
                  className="h-px flex-1 bg-gradient-to-r from-black/[0.09] to-transparent dark:from-white/15"
                />
                <span className="text-[11px] font-semibold text-neutral-400">
                  {group.options.length}
                </span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {group.options.map((option) => (
                  <BusinessTypeCard key={option.slug} {...cardProps(option)} />
                ))}
              </div>
            </section>
          ))}

          {showEmptyState ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/10 bg-fs-surface-container/40 px-4 py-8 text-center dark:border-white/15">
              <SearchX className="h-8 w-8 text-neutral-400" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-[15px] font-semibold text-fs-text">
                Aucune activité ne correspond à « {trimmedQuery} »
              </p>
              <p className="mt-1 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">
                Essayez un autre mot (ex. « moto », « tissu », « gaz ») ou continuez avec
                « Autre commerce » ci-dessous.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="fs-touch-target mt-4 rounded-xl border border-black/10 bg-fs-card px-4 py-2 text-sm font-semibold text-fs-text transition-colors hover:border-fs-accent/40 hover:text-fs-accent dark:border-white/15"
              >
                Effacer la recherche
              </button>
            </div>
          ) : null}

          {showOther ? (
            <div className={cn("grid gap-2.5", hasResults ? "mt-2" : "mt-3")}>
              <BusinessTypeCard {...cardProps(OTHER_OPTION)} />
            </div>
          ) : null}
        </div>

        {/* Pied de page */}
        <div className="mt-7 flex flex-col items-center gap-3 border-t border-black/[0.06] pt-5 text-center dark:border-white/10">
          <p className="inline-flex items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-400">
            <ShieldCheck className="h-4 w-4 text-fs-accent" strokeWidth={2} aria-hidden />
            Aucune carte bancaire demandée pour créer votre espace.
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Déjà un compte ?{" "}
            <Link
              href={ROUTES.login}
              className="font-semibold text-fs-accent underline-offset-4 hover:underline"
            >
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-fs-accent focus-visible:ring-offset-1",
        active
          ? "border-transparent bg-fs-accent text-white shadow-[0_4px_12px_-4px_rgba(232,93,44,0.55)]"
          : "border-black/[0.09] bg-fs-card text-neutral-600 hover:border-fs-accent/35 hover:text-fs-accent dark:border-white/10 dark:text-neutral-300",
      )}
    >
      {label}
    </button>
  );
}
