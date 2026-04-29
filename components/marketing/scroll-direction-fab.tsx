"use client";

import { useEffect, useMemo, useState } from "react";
import { MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";

const TOP_THRESHOLD = 120;

export function ScrollDirectionFab() {
  const [atTop, setAtTop] = useState(true);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const update = () => {
      const y = window.scrollY || 0;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      setAtTop(y <= TOP_THRESHOLD);
      setCanScroll(maxScroll > TOP_THRESHOLD);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const action = useMemo(
    () =>
      atTop
        ? {
            label: "Descendre",
            icon: <MdKeyboardArrowDown className="h-5 w-5" aria-hidden />,
            run: () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" as const }),
          }
        : {
            label: "Remonter",
            icon: <MdKeyboardArrowUp className="h-5 w-5" aria-hidden />,
            run: () => window.scrollTo({ top: 0, behavior: "smooth" as const }),
          },
    [atTop],
  );

  if (!canScroll) return null;

  return (
    <button
      type="button"
      onClick={action.run}
      aria-label={action.label}
      title={action.label}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-3 z-50 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-fs-accent text-white shadow-[0_10px_28px_-14px_rgba(232,93,44,0.9)] transition hover:brightness-110 active:scale-95 sm:bottom-6 sm:right-6 sm:h-12 sm:w-12"
    >
      {action.icon}
    </button>
  );
}

