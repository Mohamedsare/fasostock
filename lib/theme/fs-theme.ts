/**
 * Thème FasoStock web — aligné Paramètres Flutter (Système / Clair / Sombre).
 * Source de vérité : `localStorage` clé `fs_theme_mode`, classe `dark` sur `<html>`.
 */

export const FS_THEME_STORAGE_KEY = "fs_theme_mode";

export type FsThemePref = "system" | "light" | "dark";

export function getStoredFsThemePref(): FsThemePref {
  if (typeof window === "undefined") return "system";
  try {
    const t = localStorage.getItem(FS_THEME_STORAGE_KEY);
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {
    /* */
  }
  return "system";
}

/** Calcule si l’UI doit être en sombre selon la préférence (inclut le mode système). */
export function resolveFsThemeIsDark(pref: FsThemePref): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applique `dark` sur `<html>` et `data-theme` (à appeler après lecture du stockage ou d’un choix utilisateur). */
export function applyFsThemeToDocument(pref?: FsThemePref): FsThemePref {
  if (typeof document === "undefined") return pref ?? "system";
  const p = pref ?? getStoredFsThemePref();
  const dark = resolveFsThemeIsDark(p);
  const root = document.documentElement;
  if (dark) root.classList.add("dark");
  else root.classList.remove("dark");
  root.setAttribute("data-theme", p);
  root.style.colorScheme = dark ? "dark" : "light";
  return p;
}

export function notifyFsThemeChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("fs-theme-change"));
}

export function persistAndApplyFsTheme(pref: FsThemePref): void {
  try {
    localStorage.setItem(FS_THEME_STORAGE_KEY, pref);
  } catch {
    /* */
  }
  applyFsThemeToDocument(pref);
  notifyFsThemeChanged();
}
