"use client";

/**
 * « Nouvelle commande » — la première question du service : c'est pour où ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS TUILES, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Sur place, à emporter, en livraison : la réponse change la table, le client
 * demandé, et la façon dont la commande se suit. C'est la seule décision qui doit
 * être prise ici, donc c'est la seule chose affichée.
 *
 * Les tuiles font toute la largeur et 88 px de haut. On les touche debout, à
 * l'entrée du restaurant, sans regarder l'écran de près.
 *
 * En dessous, ce qui est déjà en cours — parce que neuf fois sur dix, le serveur
 * qui ouvre cette page cherche en réalité une table qu'il a déjà ouverte.
 */

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MdChevronRight } from "react-icons/md";

import { FsCard, FsPage, FsScreenHeader } from "@/components/ui/fs-screen-primitives";
import {
  NeedStoreCard,
  SERVICE_ICONS,
  WaitBadge,
  timeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { listOrders } from "@/lib/features/restaurant/api-orders";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

const CHOICES: Array<{
  service: ServiceType;
  href: string;
  hint: string;
  accent: string;
}> = [
  {
    service: "dine_in",
    href: "/restaurant/ventes/salle",
    hint: "Le client s'installe. On choisit une table.",
    accent: "border-fs-accent/35 bg-[color-mix(in_srgb,var(--fs-accent)_9%,transparent)]",
  },
  {
    service: "takeaway",
    href: "/restaurant/ventes/emporter",
    hint: "Le client attend au comptoir. Un nom suffit.",
    accent: "border-sky-500/30 bg-sky-500/[0.06]",
  },
  {
    service: "delivery",
    href: "/restaurant/ventes/livraisons",
    hint: "Le repas part chez le client. Il faut une adresse.",
    accent: "border-violet-500/30 bg-violet-500/[0.06]",
  },
];

export function RestaurantNewOrderScreen() {
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const openQ = useQuery({
    queryKey: queryKeys.restaurantOrders({ companyId, storeId, scope: "open-any" }),
    queryFn: () => listOrders({ companyId, storeId, statuses: ["open"], limit: 12 }),
    enabled: Boolean(companyId && storeId),
    refetchInterval: 15_000,
  });

  const running = useMemo(() => openQ.data?.rows ?? [], [openQ.data]);

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title="Nouvelle commande" subtitle="C'est pour où ?" />
        <NeedStoreCard />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Nouvelle commande"
        subtitle="C'est pour où ? Le reste se règle après."
      />

      <div className="grid gap-2.5">
        {CHOICES.map((c) => {
          const Icon = SERVICE_ICONS[c.service];
          return (
            <Link
              key={c.service}
              href={c.href}
              className={cn(
                "flex min-h-[88px] items-center gap-3.5 rounded-[16px] border-2 px-4 py-3 transition-transform active:scale-[0.99]",
                c.accent,
              )}
            >
              <Icon className="h-9 w-9 shrink-0 text-fs-text" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-extrabold leading-tight text-fs-text">
                  {SERVICE_TYPE_LABELS[c.service]}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
                  {c.hint}
                </span>
              </span>
              <MdChevronRight className="h-6 w-6 shrink-0 text-neutral-400" aria-hidden />
            </Link>
          );
        })}
      </div>

      {running.length > 0 ? (
        <section className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Déjà en cours
          </p>
          <FsCard padding="p-0">
            <ul className="divide-y divide-black/[0.06]">
              {running.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/restaurant/commande/${o.id}`}
                    className="flex items-center gap-2 px-3 py-2.5 active:bg-neutral-50 sm:px-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fs-text">
                        {o.tableLabel
                          ? `Table ${o.tableLabel}`
                          : (o.customerName ?? o.contactName ?? o.orderNumber)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        {SERVICE_TYPE_LABELS[o.serviceType]} · {timeLabel(o.openedAt)} ·{" "}
                        {o.itemCount} article{o.itemCount > 1 ? "s" : ""}
                      </p>
                    </div>
                    {o.hasReadyItems ? (
                      <span className="shrink-0 rounded-md bg-amber-500/16 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                        prêt
                      </span>
                    ) : (
                      <WaitBadge since={o.openedAt} warnAfter={45} lateAfter={90} />
                    )}
                    <span className="shrink-0 text-sm font-bold tabular-nums text-fs-text">
                      {formatCurrency(o.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </FsCard>
        </section>
      ) : null}
    </FsPage>
  );
}
