"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdArrowBack,
  MdDashboard,
  MdHome,
  MdInventory2,
  MdLogin,
  MdPointOfSale,
  MdSearch,
  MdSupportAgent,
} from "react-icons/md";
import { ROUTES } from "@/lib/config/routes";
import { cn } from "@/lib/utils/cn";

const QUICK_LINKS = [
  { href: ROUTES.dashboard, label: "Tableau de bord", icon: MdDashboard },
  { href: ROUTES.sales, label: "Ventes", icon: MdPointOfSale },
  { href: ROUTES.products, label: "Produits", icon: MdInventory2 },
  { href: ROUTES.help, label: "Aide", icon: MdSupportAgent },
] as const;

const KNOWN_PREFIXES = [
  ROUTES.dashboard,
  ROUTES.products,
  ROUTES.sales,
  ROUTES.customers,
  ROUTES.settings,
  ROUTES.login,
  "/",
] as const;

function normalizePathInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      return new URL(t).pathname;
    } catch {
      return "";
    }
  }
  return t.startsWith("/") ? t : `/${t}`;
}

export function NotFoundExperience() {
  const router = useRouter();
  const [pathInput, setPathInput] = useState("");
  const [spot, setSpot] = useState({ x: 50, y: 40 });
  const [scanFlash, setScanFlash] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let flashTimer: number | undefined;
    const id = window.setInterval(() => {
      setScanFlash(true);
      flashTimer = window.setTimeout(() => setScanFlash(false), 280);
    }, 2800);
    return () => {
      window.clearInterval(id);
      if (flashTimer) window.clearTimeout(flashTimer);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setSpot({ x, y });
  }, []);

  function goToPath() {
    const path = normalizePathInput(pathInput);
    if (!path) return;
    router.push(path);
  }

  function suggestPath(): string | null {
    const q = pathInput.trim().toLowerCase();
    if (!q) return null;
    const hit = KNOWN_PREFIXES.find((p) => p.includes(q) || q.includes(p.replace("/", "")));
    return hit ?? null;
  }

  const suggestion = suggestPath();

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-fs-surface text-fs-text"
    >
      {/* Fond dynamique */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90 transition-[background] duration-300"
        style={{
          background: `
            radial-gradient(ellipse 80% 55% at ${spot.x}% ${spot.y}%,
              color-mix(in srgb, var(--fs-accent) 22%, transparent),
              transparent 68%),
            radial-gradient(ellipse 50% 40% at 85% 15%,
              color-mix(in srgb, var(--fs-pos-orange) 18%, transparent),
              transparent),
            radial-gradient(ellipse 45% 35% at 8% 88%,
              color-mix(in srgb, var(--fs-accent) 12%, transparent),
              transparent),
            linear-gradient(165deg,
              var(--fs-surface) 0%,
              var(--fs-surface-low) 45%,
              var(--fs-surface-container) 100%)
          `,
        }}
        aria-hidden
      />

      {/* Grille entrepôt */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
        style={{
          backgroundImage: `
            linear-gradient(color-mix(in srgb, var(--fs-text) 6%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in srgb, var(--fs-text) 6%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent)",
        }}
        aria-hidden
      />

      {/* Orbes flottants */}
      <div
        className="fs-404-float pointer-events-none absolute -left-16 top-[18%] h-56 w-56 rounded-full bg-fs-accent/10 blur-3xl"
        aria-hidden
      />
      <div
        className="fs-404-float pointer-events-none absolute -right-20 bottom-[12%] h-72 w-72 rounded-full bg-[#f97316]/12 blur-3xl [animation-delay:1.2s]"
        aria-hidden
      />

      <header className="fs-404-enter relative z-10 flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-2xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-fs-accent"
        >
          <Image
            src="/fs.png"
            alt="FasoStock"
            width={40}
            height={40}
            className="rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-105"
            priority
          />
          <span className="text-sm font-semibold tracking-tight text-fs-text sm:text-base">
            FasoStock
          </span>
        </Link>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/8 bg-fs-card/80 px-4 text-sm font-medium text-fs-text shadow-sm backdrop-blur-md transition hover:border-fs-accent/30 hover:bg-fs-card active:scale-[0.98] dark:border-white/10"
        >
          <MdArrowBack className="h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
          Retour
        </button>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-5 pb-10 pt-4 sm:px-8">
        <div className="fs-404-enter mb-8 flex w-full max-w-lg flex-col items-center">
          {/* Carte « scan » */}
          <div className="relative mb-6 w-full max-w-xs sm:max-w-sm">
            <div
              className={cn(
                "relative overflow-hidden rounded-3xl border border-black/8 bg-fs-card/90 p-6 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:shadow-black/30",
                scanFlash && "ring-2 ring-fs-accent/40",
              )}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="rounded-full bg-fs-accent/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fs-accent">
                  Réf. introuvable
                </span>
                <span className="font-mono text-[10px] text-fs-on-surface-variant">ERR-404</span>
              </div>

              {/* Faux code-barres */}
              <div className="relative mx-auto h-16 w-full max-w-[220px] overflow-hidden rounded-lg bg-fs-surface-container/80 px-2 py-2">
                <div className="flex h-full items-stretch justify-center gap-[3px]" aria-hidden>
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-sm bg-fs-text/25 dark:bg-white/20"
                      style={{
                        width: i % 3 === 0 ? 3 : i % 5 === 0 ? 2 : 4,
                        opacity: 0.35 + (i % 7) * 0.08,
                      }}
                    />
                  ))}
                </div>
                <div
                  className="fs-404-scan-line pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-fs-accent/50 to-transparent"
                  aria-hidden
                />
              </div>

              <p className="mt-4 text-center text-xs text-fs-on-surface-variant">
                Aucun article à cette adresse dans l&apos;entrepôt numérique.
              </p>
            </div>

            {/* Badge 404 */}
            <div
              className="fs-404-glitch absolute -right-3 -top-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-fs-accent to-[#f97316] text-2xl font-black text-white shadow-lg shadow-fs-accent/30 sm:-right-5 sm:-top-5 sm:h-24 sm:w-24 sm:text-3xl"
              aria-hidden
            >
              404
            </div>
          </div>

          <h1
            className="fs-404-shimmer-text max-w-xl bg-gradient-to-r from-fs-text via-fs-accent to-[#f97316] bg-clip-text text-center text-3xl font-bold tracking-tight text-transparent sm:text-4xl md:text-5xl"
          >
            Cette page n&apos;est pas en stock
          </h1>
          <p className="mt-4 max-w-md text-center text-sm leading-relaxed text-fs-on-surface-variant sm:text-base">
            Le lien est peut-être obsolète, mal saisi, ou la page a été déplacée.
            Utilisez la recherche ci-dessous ou repartez vers une zone connue de
            l&apos;application.
          </p>
        </div>

        {/* Recherche de chemin */}
        <div
          className="fs-404-enter w-full max-w-lg rounded-2xl border border-black/8 bg-fs-card/85 p-4 shadow-lg backdrop-blur-xl dark:border-white/10 sm:p-5"
          style={{ animationDelay: "120ms" }}
        >
          <label htmlFor="fs-404-path" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fs-on-surface-variant">
            Où souhaitez-vous aller ?
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <MdSearch
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fs-on-surface-variant"
                aria-hidden
              />
              <input
                id="fs-404-path"
                type="search"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goToPath();
                }}
                placeholder="/dashboard, /sales, /products…"
                className="w-full rounded-xl border border-black/10 bg-fs-surface py-3 pl-10 pr-3 text-sm text-fs-text outline-none ring-fs-accent/0 transition placeholder:text-fs-on-surface-variant/70 focus:border-fs-accent/40 focus:ring-2 focus:ring-fs-accent/25 dark:border-white/12"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              onClick={goToPath}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-fs-accent px-5 text-sm font-semibold text-white shadow-md shadow-fs-accent/25 transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
              disabled={!normalizePathInput(pathInput)}
            >
              Y aller
            </button>
          </div>
          {suggestion && suggestion !== normalizePathInput(pathInput) ? (
            <p className="mt-2 text-xs text-fs-on-surface-variant">
              Suggestion :{" "}
              <button
                type="button"
                className="font-semibold text-fs-accent underline-offset-2 hover:underline"
                onClick={() => {
                  setPathInput(suggestion);
                  router.push(suggestion);
                }}
              >
                {suggestion}
              </button>
            </p>
          ) : null}
        </div>

        {/* Liens rapides */}
        <nav
          className="fs-404-enter mt-8 grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-4"
          style={{ animationDelay: "220ms" }}
          aria-label="Raccourcis"
        >
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-black/6 bg-fs-card/70 px-3 py-4 text-center text-xs font-semibold text-fs-text shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-fs-accent/25 hover:bg-fs-card hover:shadow-md active:scale-[0.98] dark:border-white/8"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fs-accent/10 text-fs-accent transition group-hover:bg-fs-accent group-hover:text-white">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              {label}
            </Link>
          ))}
        </nav>

        <div
          className="fs-404-enter mt-10 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "320ms" }}
        >
          <Link
            href={ROUTES.dashboard}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fs-accent px-6 text-sm font-semibold text-white shadow-lg shadow-fs-accent/30 transition hover:brightness-105 active:scale-[0.98]"
          >
            <MdDashboard className="h-5 w-5" aria-hidden />
            Tableau de bord
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-fs-card px-6 text-sm font-semibold text-fs-text transition hover:border-fs-accent/30 active:scale-[0.98] dark:border-white/12"
          >
            <MdHome className="h-5 w-5 text-fs-accent" aria-hidden />
            Accueil
          </Link>
          <Link
            href={ROUTES.login}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-fs-on-surface-variant transition hover:text-fs-accent"
          >
            <MdLogin className="h-4 w-4" aria-hidden />
            Connexion
          </Link>
        </div>
      </main>

      <footer className="relative z-10 px-5 py-6 text-center text-[11px] text-fs-on-surface-variant sm:px-8">
        <kbd className="rounded-md border border-black/10 bg-fs-card/80 px-1.5 py-0.5 font-mono text-[10px] dark:border-white/10">
          Échap
        </kbd>{" "}
        pour revenir en arrière · FasoStock
      </footer>
    </div>
  );
}
