"use client";

import {
  fetchOwnerNotificationsData,
  ownerNotificationStyle,
  type OwnerNotificationItem,
} from "@/lib/features/notifications/owner-notifications";
import { queryKeys } from "@/lib/query/query-keys";
import { cn } from "@/lib/utils/cn";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  BellOff,
  Loader2,
  Package,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdAutoAwesome,
  MdInventory2,
  MdLocalShipping,
  MdReceiptLong,
  MdStar,
  MdWarningAmber,
} from "react-icons/md";

function hiddenStorageKey(companyId: string): string {
  return `fs_owner_notif_hidden_${companyId}`;
}

function loadHidden(companyId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(hiddenStorageKey(companyId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x)));
  } catch {
    return new Set();
  }
}

function saveHidden(companyId: string, ids: Set<string>) {
  try {
    localStorage.setItem(hiddenStorageKey(companyId), JSON.stringify([...ids]));
  } catch {
    /* */
  }
}

function rowIcon(kind: OwnerNotificationItem["kind"], trendLabel?: string | null) {
  if (kind === "trendsAi" && trendLabel) {
    if (trendLabel === "Progression") return TrendingUp;
    if (trendLabel === "Régression") return TrendingDown;
    if (trendLabel === "Stable") return Activity;
  }
  switch (kind) {
    case "stockout":
      return MdInventory2;
    case "underMinStock":
      return MdWarningAmber;
    case "topSalesToday":
      return MdReceiptLong;
    case "massiveStockEntry":
      return MdLocalShipping;
    case "productsNotSoldMonths":
      return TrendingDown;
    case "top10ProductsSold":
      return MdStar;
    case "trendsAi":
    default:
      return MdAutoAwesome;
  }
}

function trendLabelFromTitle(title: string): string | null {
  const parts = title.split(" — ");
  if (parts.length < 2) return null;
  return parts[1]!.trim() || null;
}

export function OwnerNotificationsBell({
  companyId,
  storeId,
}: {
  companyId: string;
  storeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden(companyId));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHidden(loadHidden(companyId));
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = useQuery({
    queryKey: queryKeys.ownerNotifications(companyId, storeId),
    queryFn: () => fetchOwnerNotificationsData({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 45_000,
  });

  const visible = useMemo(() => {
    const items = q.data?.items ?? [];
    return items.filter((i) => !hidden.has(i.id));
  }, [q.data?.items, hidden]);

  const badgeCount = visible.length;

  const hideOne = useCallback(
    (id: string) => {
      setHidden((prev) => {
        const next = new Set(prev);
        next.add(id);
        saveHidden(companyId, next);
        return next;
      });
    },
    [companyId],
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          void q.refetch();
        }}
        className="relative rounded-lg p-2 text-neutral-700 hover:bg-fs-surface-container"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {badgeCount > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(100vw-24px,480px)] rounded-2xl border border-black/8 bg-fs-card shadow-xl"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="rounded-t-2xl bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)] px-4 py-3">
            <div className="flex items-start gap-3">
              <Sparkles className="h-7 w-7 shrink-0 text-fs-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-fs-text">Notifications</p>
                <p className="text-xs text-neutral-600">
                  Alertes métier (stock, ventes, tendances) — comme sur mobile.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-neutral-600 hover:bg-black/5"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(520px,70vh)] overflow-y-auto overscroll-contain">
            {q.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-fs-accent" aria-hidden />
              </div>
            ) : q.isError ? (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <Package className="h-12 w-12 text-red-500" aria-hidden />
                <p className="text-sm text-neutral-700">
                  Impossible d&apos;afficher les notifications.
                </p>
                <button
                  type="button"
                  onClick={() => void q.refetch()}
                  className="rounded-xl border border-black/8 px-4 py-2 text-sm font-semibold text-fs-accent"
                >
                  Réessayer
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <BellOff className="h-12 w-12 text-neutral-400" aria-hidden />
                <p className="text-sm text-neutral-600">Aucune notification à afficher</p>
              </div>
            ) : (
              <ul className="divide-y divide-black/6 p-2">
                {visible.map((item) => {
                  const trendLbl =
                    item.kind === "trendsAi" ? trendLabelFromTitle(item.title) : null;
                  const st = ownerNotificationStyle(item.kind, trendLbl);
                  const Icon = rowIcon(item.kind, trendLbl);
                  const isTop10 = item.kind === "top10ProductsSold" && item.subtitle.includes("\n\n");
                  const [top10Intro, top10Body] = isTop10
                    ? item.subtitle.split("\n\n")
                    : [item.subtitle, ""];
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "rounded-xl border border-y border-r border-black/6 border-l-transparent bg-fs-surface-container/50 p-0.5",
                        st.border,
                      )}
                    >
                      <div className="flex gap-3 rounded-lg p-3">
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                            st.bg,
                          )}
                        >
                          <Icon className={cn("h-5 w-5", st.color)} aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm font-bold", st.color)}>{item.title}</p>
                          {isTop10 ? (
                            <div className="mt-1 space-y-2">
                              <p className="text-xs font-semibold text-neutral-600">{top10Intro}</p>
                              <p className="line-clamp-12 whitespace-pre-wrap text-xs leading-relaxed text-fs-text">
                                {top10Body}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-1 line-clamp-12 text-xs leading-snug text-neutral-600">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {item.trailing ? (
                            <span className={cn("text-xs font-bold", st.color)}>{item.trailing}</span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => hideOne(item.id)}
                            className="text-[11px] font-semibold text-neutral-500 hover:text-fs-text"
                          >
                            Masquer
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
