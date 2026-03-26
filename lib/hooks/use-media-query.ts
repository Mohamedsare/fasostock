"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const onChange = () => setMatches(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** ≥ 1024px — cohérent avec navigation latérale Flutter (desktop). */
export function useDesktopNav(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
