"use client";

import { cn } from "@/lib/utils/cn";
import {
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

type FsHorizontalScrollProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  children: ReactNode;
  /**
   * Sur desktop (pointeur fin) : si le contenu déborde, la molette verticale
   * fait défiler horizontalement (comme de nombreux onglets / timelines).
   * Désactivé sur tactile pour ne pas voler le scroll de page.
   */
  wheelHorizontalDesktop?: boolean;
};

/**
 * Zone scrollable horizontale avec UX desktop : scrollbar fine (via `fs-scroll-x`)
 * et optionnellement translation molette verticale → scroll horizontal.
 */
export function FsHorizontalScroll({
  children,
  className,
  wheelHorizontalDesktop = true,
  ...divProps
}: FsHorizontalScrollProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!wheelHorizontalDesktop) return;
      if (window.matchMedia("(pointer: coarse)").matches) return;
      const el = ref.current;
      if (!el) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const dy = e.deltaY;
      if (dy === 0) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const next = el.scrollLeft + dy;
      const atStart = el.scrollLeft <= 0 && dy < 0;
      const atEnd = el.scrollLeft >= maxScroll - 1 && dy > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(maxScroll, next));
    },
    [wheelHorizontalDesktop],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || !wheelHorizontalDesktop) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel, wheelHorizontalDesktop]);

  return (
    <div ref={ref} className={cn("fs-scroll-x", className)} {...divProps}>
      {children}
    </div>
  );
}
