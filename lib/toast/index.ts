import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";
import type { ToastPayload } from "./types";

export type { ToastPayload, ToastType } from "./types";

const EVENT = "fs-app-toast";

function emit(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT, { detail: payload }));
}

/** Aligné sur `AppToast.success` (Flutter). */
export function toastSuccess(message: string, duration?: number) {
  emit({ type: "success", message, duration });
}

/** Aligné sur `AppToast.error` (Flutter). */
export function toastError(message: string, duration?: number) {
  emit({ type: "error", message, duration });
}

/** Aligné sur `AppToast.info` (Flutter). */
export function toastInfo(message: string, duration?: number) {
  emit({ type: "info", message, duration });
}

export function subscribeToToasts(handler: (payload: ToastPayload) => void) {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<ToastPayload>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** Message utilisateur depuis une erreur inconnue (mutations, catch). */
export function messageFromUnknownError(e: unknown, fallback = "Une erreur s’est produite."): string {
  const m = formatUnknownErrorMessage(e, fallback);
  return m.trim() || fallback;
}

/**
 * Toast d’erreur + remontée super-admin (en plus des hooks React Query si l’erreur vient d’une mutation).
 * Déduplication côté `captureWebAppError` limite les doublons.
 */
export function toastErrorWithLog(
  message: string,
  err?: unknown,
  meta?: { source?: string; duration?: number },
): void {
  toastError(message, meta?.duration);
  if (err != null) {
    void import("@/lib/monitoring/remote-error-logger").then(({ reportHandledClientError }) => {
      reportHandledClientError(err, {
        source: meta?.source ?? "toast",
      });
    });
  }
}

/** Toast + log super-admin — préfixe `source` pour filtrer (ex. `stock:mutation`). */
export function toastMutationError(screen: string, e: unknown, fallback = "Une erreur s’est produite."): void {
  const msg = messageFromUnknownError(e, fallback);
  toastErrorWithLog(msg, e, { source: `${screen}:mutation` });
}

/** API unique style `AppToast` / sonner. */
export const toast = {
  success: toastSuccess,
  error: toastError,
  info: toastInfo,
  /** Erreur utilisateur + log super-admin (dédup avec React Query). */
  errorWithLog: toastErrorWithLog,
};
