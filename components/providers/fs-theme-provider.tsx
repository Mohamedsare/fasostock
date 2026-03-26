"use client";

import { applyFsThemeToDocument, getStoredFsThemePref } from "@/lib/theme/fs-theme";
import { useEffect, type ReactNode } from "react";

/**
 * Réapplique le thème au montage, suit le mode système si « Système » est choisi, synchronise les autres onglets.
 */
export function FsThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyFsThemeToDocument();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (getStoredFsThemePref() === "system") {
        applyFsThemeToDocument("system");
        window.dispatchEvent(new Event("fs-theme-change"));
      }
    };
    mq.addEventListener("change", onSystemChange);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== "fs_theme_mode") return;
      applyFsThemeToDocument();
      window.dispatchEvent(new Event("fs-theme-change"));
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mq.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return <>{children}</>;
}
