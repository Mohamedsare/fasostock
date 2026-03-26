"use client";

import {
  captureWebAppError,
  shouldSkipRemoteErrorLog,
} from "@/lib/monitoring/remote-error-logger";
import { useEffect } from "react";

/**
 * Enregistre les erreurs non gérées du navigateur pour le super-admin (client_kind: web).
 */
export function GlobalErrorReporting() {
  useEffect(() => {
    function onWindowError(ev: ErrorEvent) {
      const err = ev.error instanceof Error ? ev.error : new Error(ev.message || "Erreur script");
      if (shouldSkipRemoteErrorLog(err)) return;
      void captureWebAppError(err, {
        stack: ev.error instanceof Error ? ev.error.stack ?? undefined : undefined,
        source: "window.error",
        extra: ev.filename
          ? { filename: ev.filename, lineno: ev.lineno, colno: ev.colno }
          : undefined,
      });
    }

    function onRejection(ev: PromiseRejectionEvent) {
      const reason = ev.reason;
      if (shouldSkipRemoteErrorLog(reason)) return;
      /** Passer `reason` tel quel : `new Error(String(obj))` produit le message `[object Object]`. */
      void captureWebAppError(reason, {
        stack: reason instanceof Error ? reason.stack ?? undefined : undefined,
        source: "unhandledrejection",
      });
    }

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
