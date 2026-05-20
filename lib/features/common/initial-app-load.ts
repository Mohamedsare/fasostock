/** Splash immersif : une fois par onglet / session jusqu'à déconnexion. */
export const INITIAL_APP_LOAD_SESSION_KEY = "fs_initial_load_done";

export function hasSeenInitialAppLoad(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(INITIAL_APP_LOAD_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markInitialAppLoadDone(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(INITIAL_APP_LOAD_SESSION_KEY, "1");
  } catch {
    /* quota / mode privé */
  }
}

export function clearInitialAppLoadSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(INITIAL_APP_LOAD_SESSION_KEY);
  } catch {
    /* */
  }
}
