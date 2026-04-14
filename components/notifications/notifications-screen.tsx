"use client";

import { FsCard, FsPage, FsQueryErrorPanel } from "@/components/ui/fs-screen-primitives";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/features/notifications/api";
import type { AppNotification } from "@/lib/features/notifications/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useMemo } from "react";

function formatNotificationDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function NotificationsScreen() {
  const qc = useQueryClient();
  const { helpers, isLoading: permLoading } = usePermissions();
  const isOwner = helpers?.isOwner ?? false;

  const notificationsQ = useQuery({
    queryKey: queryKeys.notificationsInbox,
    queryFn: () => listNotifications(100),
    enabled: isOwner && !permLoading,
    staleTime: 15_000,
  });

  const items = notificationsQ.data ?? [];
  const unreadCount = useMemo(
    () => items.filter((n) => n.read_at == null).length,
    [items],
  );

  const markReadMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.notificationsInbox });
      await qc.invalidateQueries({ queryKey: queryKeys.notificationsUnread });
    },
    onError: (e) => toastMutationError("notifications", e),
  });

  const markAllMut = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.notificationsInbox });
      await qc.invalidateQueries({ queryKey: queryKeys.notificationsUnread });
    },
    onError: (e) => toastMutationError("notifications", e),
  });

  async function onRowTap(n: AppNotification) {
    if (n.read_at != null) return;
    markReadMut.mutate(n.id);
  }

  if (permLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!isOwner) {
    return (
      <FsPage>
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
          <p className="max-w-md text-sm leading-relaxed text-neutral-700">
            Cette section est réservée au propriétaire de l&apos;entreprise.
          </p>
        </div>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="mb-6 flex flex-col gap-3 min-[560px]:flex-row min-[560px]:items-start min-[560px]:justify-between">
        <header className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-fs-text min-[900px]:text-2xl">
            Notifications
          </h1>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void notificationsQ.refetch()}
            disabled={notificationsQ.isFetching}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border border-black/8 bg-fs-card px-3 py-2 text-sm font-semibold text-neutral-800 active:bg-fs-surface-container disabled:opacity-60 min-[560px]:min-h-0"
            aria-label="Rafraîchir"
          >
            <RefreshCw
              className={cn("h-4 w-4", notificationsQ.isFetching && "animate-spin")}
              aria-hidden
            />
            <span className="hidden min-[560px]:inline">Actualiser</span>
          </button>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-3 py-2 text-sm font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-60 min-[560px]:min-h-0 min-[560px]:flex-none"
            >
              <CheckCheck className="h-4 w-4" aria-hidden />
              Tout marquer lu
            </button>
          ) : null}
        </div>
      </div>

      {notificationsQ.isError ? (
        <FsQueryErrorPanel
          error={notificationsQ.error}
          onRetry={() => void notificationsQ.refetch()}
        />
      ) : null}

      {notificationsQ.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : null}

      {!notificationsQ.isLoading && !notificationsQ.isError && items.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
          <Bell className="h-16 w-16 text-neutral-300 dark:text-neutral-600" aria-hidden />
          <p className="mt-4 text-base text-neutral-600">Aucune notification</p>
        </div>
      ) : null}

      {!notificationsQ.isLoading && !notificationsQ.isError && items.length > 0 ? (
        <FsCard className="overflow-hidden p-0" padding="p-0">
          <ul className="divide-y divide-black/6">
            {items.map((n) => {
              const read = n.read_at != null;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void onRowTap(n)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-4 text-left transition-colors active:bg-fs-surface-container sm:px-5",
                      !read && "bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)]",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                        read
                          ? "bg-fs-surface-container text-neutral-600"
                          : "bg-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)] text-fs-accent",
                      )}
                      aria-hidden
                    >
                      <Bell className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm text-fs-text sm:text-base",
                          read ? "font-normal" : "font-semibold",
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body ? (
                        <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{n.body}</p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-neutral-500">
                        {formatNotificationDate(n.created_at)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </FsCard>
      ) : null}
    </FsPage>
  );
}
