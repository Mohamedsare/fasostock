"use client";

/**
 * Module Restaurant — les briques partagées par les treize écrans.
 *
 * Tout ce qui est ici a été extrait parce qu'il apparaissait au moins trois fois :
 * une pastille d'état, un garde-fou « choisissez une boutique », une carte vide.
 * Les recopier aurait garanti qu'elles finissent par diverger — trois nuances de
 * vert pour « prêt » selon l'écran, et un serveur qui ne sait plus lire son écran
 * en plein coup de feu.
 */

import type { ComponentType, ReactNode } from "react";
import {
  MdAccessTime,
  MdCheckCircle,
  MdDeliveryDining,
  MdLocalDining,
  MdOutlineInbox,
  MdShoppingBag,
  MdStorefront,
} from "react-icons/md";

import { FsCard } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import {
  ITEM_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  type ItemStatus,
  type ServiceType,
} from "@/lib/features/restaurant/types";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

/* ─────────────────────────── Dates ─────────────────────────── */

/** Heure seule — en salle, personne ne regarde la date du bon en cours. */
export function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", {
    timeZone: getActiveTimeZone(),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    timeZone: getActiveTimeZone(),
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * « 12 min ». LE chiffre du service : c'est lui qui dit qu'une table attend depuis
 * trop longtemps, bien avant que le client ne se lève pour le faire remarquer.
 */
export function elapsedMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

export function elapsedLabel(iso: string | null | undefined): string {
  const m = elapsedMinutes(iso);
  if (m === null) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, "0")}`;
}

/* ─────────────────────────── Pastilles ─────────────────────────── */

/**
 * Les couleurs du parcours cuisine, décidées UNE fois.
 *
 * `ready` est ambre et non vert : au passe, le vert se lit « c'est bon, rien à
 * faire », alors que c'est exactement le moment où quelqu'un doit se lever. Le vert
 * est réservé à `served`, qui est le seul état où il n'y a plus rien à faire.
 */
const ITEM_STATUS_TONE: Record<ItemStatus, string> = {
  pending: "bg-neutral-500/10 text-neutral-600",
  sent: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  preparing: "bg-violet-500/12 text-violet-700 dark:text-violet-400",
  ready: "bg-amber-500/16 text-amber-700 dark:text-amber-400",
  served: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  void: "bg-rose-500/12 text-rose-700 dark:text-rose-400",
};

export function ItemStatusPill({
  status,
  className,
}: {
  status: ItemStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide sm:text-[11px]",
        ITEM_STATUS_TONE[status],
        className,
      )}
    >
      {ITEM_STATUS_LABELS[status]}
    </span>
  );
}

export const SERVICE_ICONS: Record<ServiceType, ComponentType<{ className?: string }>> = {
  dine_in: MdLocalDining,
  takeaway: MdShoppingBag,
  delivery: MdDeliveryDining,
};

export function ServiceBadge({
  type,
  className,
}: {
  type: ServiceType;
  className?: string;
}) {
  const Icon = SERVICE_ICONS[type];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md bg-fs-surface-container px-1.5 py-0.5 text-[10px] font-semibold leading-none text-neutral-600 sm:text-[11px]",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {SERVICE_TYPE_LABELS[type]}
    </span>
  );
}

/** Compteur d'attente qui vire à l'ambre puis au rouge. Le seul indicateur du KDS. */
export function WaitBadge({
  since,
  warnAfter = 10,
  lateAfter = 20,
  className,
}: {
  since: string | null | undefined;
  warnAfter?: number;
  lateAfter?: number;
  className?: string;
}) {
  const m = elapsedMinutes(since);
  if (m === null) return null;
  const tone =
    m >= lateAfter
      ? "bg-rose-500/16 text-rose-700 dark:text-rose-400"
      : m >= warnAfter
        ? "bg-amber-500/16 text-amber-700 dark:text-amber-400"
        : "bg-fs-surface-container text-neutral-600";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums",
        tone,
        className,
      )}
    >
      <MdAccessTime className="h-3 w-3 shrink-0" aria-hidden />
      {m < 60 ? `${m}′` : elapsedLabel(since)}
    </span>
  );
}

/* ─────────────────────────── États vides / gardes ─────────────────────────── */

export function RestaurantEmptyCard({
  icon: Icon = MdOutlineInbox,
  title,
  message,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <FsCard className="text-center" padding="px-5 py-12 sm:px-6 sm:py-14">
      <Icon className="mx-auto h-12 w-12 text-neutral-300" aria-hidden />
      <h3 className="mt-3 text-base font-semibold leading-snug text-fs-text">{title}</h3>
      {message ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-600">
          {message}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </FsCard>
  );
}

/**
 * Sans boutique choisie, aucun écran de salle n'a de sens : les tables, la cuisine
 * et la caisse appartiennent à UN lieu. Plutôt qu'un écran vide, on dit quoi faire.
 */
export function NeedStoreCard({ label = "boutique" }: { label?: string }) {
  return (
    <RestaurantEmptyCard
      icon={MdStorefront}
      title={`Choisissez une ${label}`}
      message={`Les tables, la cuisine et la caisse appartiennent à une ${label} précise. Sélectionnez-la dans le sélecteur en haut de l'application.`}
    />
  );
}

/** Droit manquant : on le dit, sans jargon et sans page blanche. */
export function NoAccessCard({ what }: { what: string }) {
  return (
    <RestaurantEmptyCard
      icon={MdCheckCircle}
      title="Accès réservé"
      message={`${what} Demandez au propriétaire de vous ouvrir ce droit.`}
    />
  );
}

/* ─────────────────────────── Boutons ─────────────────────────── */

/**
 * Les classes de bouton du module. `min-h-11` partout : en salle, on touche l'écran
 * avec un pouce, debout, parfois d'une seule main.
 */
export const btnPrimary =
  "touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 text-sm font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-40";
export const btnOutline =
  "touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-black/10 bg-fs-card px-4 text-sm font-semibold text-neutral-800 transition-colors active:bg-neutral-50 disabled:opacity-40";
export const btnDanger =
  "touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-rose-500/30 bg-rose-500/[0.06] px-4 text-sm font-semibold text-rose-700 transition-colors active:bg-rose-500/10 disabled:opacity-40 dark:text-rose-400";
export const btnGhost =
  "touch-manipulation inline-flex min-h-10 min-w-10 items-center justify-center rounded-[10px] p-2 text-neutral-600 transition-colors active:bg-neutral-100 disabled:opacity-40";

/* ─────────────────────────── Feuille modale ─────────────────────────── */

/**
 * Le conteneur de tous les dialogues du module : feuille qui monte du bas sur
 * mobile, boîte centrée dès 640 px. C'est la forme qui marche debout, à une main —
 * un dialogue centré sur un téléphone met ses boutons hors de portée du pouce.
 */
export function RestaurantSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidthClass = "sm:max-w-lg",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClass?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-fs-card shadow-2xl sm:rounded-2xl",
          maxWidthClass,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Poignée de glissement : le repère visuel qui dit « ça se ferme vers le bas ». */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-black/15" aria-hidden />
        </div>

        <header className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold leading-tight text-fs-text">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-neutral-600">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="fs-touch-target -mr-1 shrink-0 rounded-lg p-2 text-neutral-500 active:bg-neutral-100"
            aria-label="Fermer"
          >
            <span aria-hidden className="text-lg leading-none">
              ✕
            </span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer ? (
          <footer className="border-t border-black/[0.06] px-4 py-3 pb-[calc(0.75rem+var(--fs-safe-bottom))] sm:px-5 sm:pb-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
