"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Loader2 } from "lucide-react";
import { MdCampaign, MdDoneAll, MdNotificationsNone, MdRefresh } from "react-icons/md";

import { PushActivationCard } from "@/components/push/push-activation-card";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
} from "@/components/ui/fs-screen-primitives";
import {
  deleteNotification,
  listMyNotifications,
  markAllMyNotificationsRead,
  markNotificationRead,
} from "@/lib/features/notifications/api";
import type { AppNotification } from "@/lib/features/notifications/types";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";

const TYPE_LABELS: Record<string, string> = {
  admin_message: "Message de l’équipe FasoStock",
  app_message: "Message",
  sale: "Vente",
  stock_alert: "Alerte de stock",
  test: "Test",
  push_diagnostic: "Diagnostic des notifications",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? "Notification";
}

export function NotificationsScreen() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: queryKeys.myNotifications,
    queryFn: () => listMyNotifications(),
    staleTime: 30_000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.myNotifications });
  };

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const markAll = useMutation({
    mutationFn: () => markAllMyNotificationsRead(),
    onSuccess: () => {
      invalidate();
      toast.success("Toutes les notifications sont marquées comme lues.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: invalidate,
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const items = q.data ?? [];
  const unread = items.filter((n) => n.readAt === null).length;

  return (
    <FsPage>
      <FsScreenHeader
        title="Notifications"
        subtitle="Les messages qui vous ont été envoyés, et l’activation des alertes sur cet appareil."
      />

      <PushActivationCard />

      <FsCard className="mt-3" padding="p-0">
        <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-3">
          <MdCampaign className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
          <p className="text-sm font-semibold text-fs-text">
            Messages reçus
            {unread > 0 ? (
              <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                {unread} non lu{unread > 1 ? "s" : ""}
              </span>
            ) : null}
          </p>
          <div className="ml-auto flex items-center gap-1">
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-fs-accent hover:bg-black/5 disabled:opacity-60"
              >
                <MdDoneAll className="h-4 w-4" aria-hidden />
                Tout marquer lu
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void q.refetch()}
              className="rounded-lg p-1.5 text-neutral-600 hover:bg-black/5"
              aria-label="Actualiser"
            >
              <MdRefresh className={cn("h-5 w-5", q.isFetching && "animate-spin")} aria-hidden />
            </button>
          </div>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-8 w-8 animate-spin text-fs-accent" aria-hidden />
          </div>
        ) : q.isError ? (
          <div className="p-4">
            <FsQueryErrorPanel error={q.error} onRetry={() => void q.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <BellOff className="h-12 w-12 text-neutral-400" aria-hidden />
            <p className="text-sm text-neutral-600">Aucun message pour le moment.</p>
            <p className="max-w-sm text-xs text-neutral-500">
              Les messages de l’équipe FasoStock et les alertes de votre entreprise s’afficheront
              ici, même si vous n’avez pas activé les notifications.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {items.map((n) => (
              <NotificationRow
                key={n.id}
                item={n}
                onRead={() => markOne.mutate(n.id)}
                onDelete={() => remove.mutate(n.id)}
                busy={
                  (markOne.isPending && markOne.variables === n.id) ||
                  (remove.isPending && remove.variables === n.id)
                }
              />
            ))}
          </ul>
        )}
      </FsCard>
    </FsPage>
  );
}

function NotificationRow({
  item,
  onRead,
  onDelete,
  busy,
}: {
  item: AppNotification;
  onRead: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const isUnread = item.readAt === null;
  return (
    <li className={cn("flex gap-3 px-4 py-3", isUnread && "bg-fs-accent/[0.04]")}>
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isUnread ? "bg-fs-accent/15" : "bg-black/5",
        )}
      >
        <MdNotificationsNone
          className={cn("h-5 w-5", isUnread ? "text-fs-accent" : "text-neutral-500")}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("text-sm text-fs-text", isUnread ? "font-bold" : "font-semibold")}>
            {item.title}
          </p>
          {isUnread ? (
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-fs-accent" aria-label="Non lu" />
          ) : null}
        </div>
        {item.body ? (
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-neutral-600">
            {item.body}
          </p>
        ) : null}
        <p className="mt-1.5 text-[11px] text-neutral-500">
          {typeLabel(item.type)} · {formatDateTime(item.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {isUnread ? (
          <button
            type="button"
            onClick={onRead}
            disabled={busy}
            className="text-[11px] font-semibold text-fs-accent hover:underline disabled:opacity-60"
          >
            Marquer lu
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-[11px] font-semibold text-neutral-500 hover:text-red-600 disabled:opacity-60"
        >
          Supprimer
        </button>
      </div>
    </li>
  );
}
