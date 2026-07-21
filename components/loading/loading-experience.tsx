"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdAutorenew,
  MdInventory2,
  MdPointOfSale,
  MdStorefront,
  MdSync,
} from "react-icons/md";
import { cn } from "@/lib/utils/cn";

const STATUS_LINES = [
  "Synchronisation de votre espace…",
  "Préparation des boutiques…",
  "Mise à jour du stock en temps réel…",
  "Application des permissions…",
  "Finalisation de l'interface…",
] as const;

const TIPS = [
  "Astuce : même en connexion faible, vos ventes sont gardées en file d'attente.",
  "Astuce : scannez un code-barres depuis la caisse rapide.",
  "Astuce : consultez le tableau de bord pour vos KPI du jour.",
] as const;

const STEP_ICONS = [MdStorefront, MdInventory2, MdPointOfSale, MdSync] as const;

export type LoadingExperienceProps = {
  /** Plein écran (session), dans le main (routes), ou carte overlay. */
  variant?: "fullscreen" | "embedded" | "overlay";
  message?: string;
  submessage?: string;
  showTips?: boolean;
};

export function LoadingExperience({
  variant = "fullscreen",
  message,
  submessage,
  showTips = true,
}: LoadingExperienceProps) {
  const [spot, setSpot] = useState({ x: 50, y: 42 });
  const [statusIdx, setStatusIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [progress, setProgress] = useState(8);
  const [step, setStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const isOverlay = variant === "overlay";
  const isEmbedded = variant === "embedded";

  useEffect(() => {
    const id = window.setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_LINES.length);
      setStep((s) => (s + 1) % STEP_ICONS.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showTips) return;
    const id = window.setInterval(() => {
      setTipIdx((i) => (i + 1) % TIPS.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, [showTips]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 88) return 12 + Math.random() * 8;
        const bump = 4 + Math.random() * 11;
        return Math.min(88, p + bump);
      });
    }, 680);
    return () => window.clearInterval(id);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isOverlay) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSpot({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }, [isOverlay]);

  const headline = message ?? STATUS_LINES[statusIdx];
  const detail =
    submessage ??
    (isOverlay
      ? "Synchronisation du compte en cours."
      : "Nous préparons vos données. Quelques secondes suffisent en général.");

  const rootClass = cn(
    "relative flex flex-col overflow-hidden text-fs-text",
    isOverlay
      ? "w-full max-w-[min(100%,22rem)] items-center rounded-3xl border border-black/8 bg-fs-card/95 px-6 py-8 text-center shadow-[0_12px_48px_-10px_rgb(0_0_0/0.2)] backdrop-blur-xl dark:border-white/10"
      : isEmbedded
        ? "min-h-[min(72dvh,100%)] w-full flex-1 items-center justify-center px-4 py-10"
        : "min-h-[100dvh] w-full items-center justify-center px-5 py-10 sm:px-8",
  );

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={headline}
      className={rootClass}
    >
      {!isOverlay ? (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 75% 50% at ${spot.x}% ${spot.y}%,
                  color-mix(in srgb, var(--fs-accent) 20%, transparent),
                  transparent 70%),
                radial-gradient(ellipse 40% 30% at 92% 8%,
                  color-mix(in srgb, var(--fs-pos-orange) 16%, transparent),
                  transparent),
                linear-gradient(168deg, var(--fs-surface), var(--fs-surface-low) 55%, var(--fs-surface-container))
              `,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.28] dark:opacity-[0.18]"
            style={{
              backgroundImage: `
                linear-gradient(color-mix(in srgb, var(--fs-text) 5%, transparent) 1px, transparent 1px),
                linear-gradient(90deg, color-mix(in srgb, var(--fs-text) 5%, transparent) 1px, transparent 1px)
              `,
              backgroundSize: "40px 40px",
              maskImage: "radial-gradient(ellipse 65% 55% at 50% 42%, black, transparent)",
            }}
            aria-hidden
          />
          <div
            className="fs-loading-float pointer-events-none absolute -left-20 top-[20%] h-64 w-64 rounded-full bg-fs-accent/10 blur-3xl"
            aria-hidden
          />
          <div
            className="fs-loading-float pointer-events-none absolute -right-16 bottom-[15%] h-56 w-56 rounded-full bg-[#f97316]/12 blur-3xl [animation-delay:1.4s]"
            aria-hidden
          />
        </>
      ) : null}

      <div
        className={cn(
          "relative z-10 flex w-full flex-col items-center",
          isOverlay ? "gap-5" : "max-w-md gap-7",
        )}
      >
        {/* Logo + anneau */}
        <div className="fs-loading-enter relative">
          <div
            className="fs-loading-ring absolute inset-0 m-auto h-[88px] w-[88px] rounded-full sm:h-[96px] sm:w-[96px]"
            aria-hidden
          />
          <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-fs-card shadow-lg ring-1 ring-black/6 dark:ring-white/10 sm:h-20 sm:w-20">
            <Image
              src="/fs.png"
              alt=""
              width={48}
              height={48}
              className="fs-loading-logo-pulse rounded-xl"
              priority
            />
          </div>
        </div>

        {/* Convoyeur */}
        {!isOverlay ? (
          <div
            className="fs-loading-enter w-full max-w-xs overflow-hidden rounded-2xl border border-black/8 bg-fs-card/80 px-3 py-3 shadow-md backdrop-blur-md dark:border-white/10"
            style={{ animationDelay: "80ms" }}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-fs-accent">
                Flux entrepôt
              </span>
              <span className="font-mono text-[10px] tabular-nums text-fs-on-surface-variant">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="relative h-14 overflow-hidden rounded-xl bg-fs-surface-container/90">
              <div className="fs-loading-conveyor absolute inset-y-0 flex w-[200%] items-center gap-3 px-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-fs-card shadow-sm dark:border-white/10",
                      i % 2 === 0 ? "text-fs-accent" : "text-[#f97316]",
                    )}
                    aria-hidden
                  >
                    <MdInventory2 className="h-4 w-4" />
                  </div>
                ))}
              </div>
              <div
                className="fs-loading-scan-line pointer-events-none absolute inset-x-0 top-0 h-full w-1 bg-gradient-to-b from-transparent via-fs-accent/70 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        ) : (
          <div
            className="fs-loading-ring-static h-12 w-12 rounded-full border-[3px] border-fs-accent/25 border-t-fs-accent"
            aria-hidden
          />
        )}

        {/* Texte */}
        <div
          className="fs-loading-enter space-y-2 text-center"
          style={{ animationDelay: "140ms" }}
        >
          <h1
            className={cn(
              "fs-loading-shimmer-text bg-gradient-to-r from-fs-text via-fs-accent to-[#f97316] bg-clip-text font-bold tracking-tight text-transparent",
              isOverlay ? "text-base" : "text-xl sm:text-2xl",
            )}
          >
            {headline}
          </h1>
          <p
            className={cn(
              "leading-relaxed text-fs-on-surface-variant",
              isOverlay ? "text-xs" : "text-sm",
            )}
          >
            {detail}
          </p>
        </div>

        {/* Barre de progression */}
        <div
          className={cn(
            "fs-loading-enter w-full",
            isOverlay ? "max-w-[16rem]" : "max-w-xs",
          )}
          style={{ animationDelay: "200ms" }}
        >
          <div className="h-2 overflow-hidden rounded-full bg-fs-surface-container ring-1 ring-black/5 dark:ring-white/8">
            <div
              className="fs-loading-progress-bar h-full rounded-full bg-gradient-to-r from-fs-accent via-[#f97316] to-fs-accent transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Étapes */}
        {!isOverlay ? (
          <div
            className="fs-loading-enter flex items-center gap-2 sm:gap-3"
            style={{ animationDelay: "260ms" }}
            aria-hidden
          >
            {STEP_ICONS.map((Icon, i) => (
              <div
                key={i}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-500",
                  step === i
                    ? "scale-110 border-fs-accent/40 bg-fs-accent/15 text-fs-accent shadow-md shadow-fs-accent/15"
                    : "border-black/6 bg-fs-card/60 text-fs-on-surface-variant/70 dark:border-white/8",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            ))}
          </div>
        ) : null}

        {showTips && !isOverlay ? (
          <p
            className="fs-loading-enter max-w-sm text-center text-xs leading-relaxed text-fs-on-surface-variant/90"
            style={{ animationDelay: "320ms" }}
          >
            {TIPS[tipIdx]}
          </p>
        ) : null}

        {isOverlay ? (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-fs-on-surface-variant">
            <MdAutorenew className="h-3.5 w-3.5 animate-spin text-fs-accent" aria-hidden />
            Connexion sécurisée
          </p>
        ) : (
          <p
            className="fs-loading-enter flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fs-on-surface-variant/80"
            style={{ animationDelay: "380ms" }}
          >
            <span className="fs-loading-dots inline-flex gap-1" aria-hidden>
              <span className="h-1.5 w-1.5 rounded-full bg-fs-accent" />
              <span className="h-1.5 w-1.5 rounded-full bg-fs-accent" />
              <span className="h-1.5 w-1.5 rounded-full bg-fs-accent" />
            </span>
            FasoStock
          </p>
        )}
      </div>
    </div>
  );
}
