"use client";

import { useEffect, useRef } from "react";

/**
 * Barre de progression du scroll affichée tout en haut de la page.
 *
 * Stratégie :
 * - Sur les navigateurs modernes (Chrome / Edge / Safari / Firefox récents),
 *   l'animation est entièrement pilotée par CSS via `animation-timeline:
 *   scroll(root)` (cf. `globals.css`) — 60fps, zéro JS dans la frame.
 * - Sur les rares user-agents sans support, on bascule sur un rAF JS
 *   minimaliste qui met à jour `transform: scaleX(...)` (toujours GPU,
 *   throttle naturel via requestAnimationFrame).
 */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const supportsScrollTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline: scroll()");

    if (supportsScrollTimeline) return;

    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const ratio = Math.min(1, Math.max(0, window.scrollY / max));
      el.style.transform = `scaleX(${ratio})`;
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    if (reduced) {
      update();
      return;
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="fs-scroll-progress"
      role="presentation"
    />
  );
}
