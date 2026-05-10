"use client";

import { AppErrorBoundary } from "@/components/error-boundary/app-error-boundary";
import { FsThemeProvider } from "@/components/providers/fs-theme-provider";
import { GlobalErrorReporting } from "@/components/providers/global-error-reporting";
import { PublicPresenceReporter } from "@/components/presence/public-presence-reporter";
import { QueryProvider } from "@/lib/query/query-provider";
import { SyncProvider } from "@/components/providers/sync-provider";
import { ToastProvider } from "@/components/toast/toast-provider";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <FsThemeProvider>
        <SyncProvider>
          <ToastProvider>
            <GlobalErrorReporting />
            <AppErrorBoundary>{children}</AppErrorBoundary>
            <PublicPresenceReporter />
          </ToastProvider>
        </SyncProvider>
      </FsThemeProvider>
    </QueryProvider>
  );
}
