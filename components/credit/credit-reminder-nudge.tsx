"use client";

/**
 * Le rappel qui vient au commerçant, au lieu d'attendre qu'il aille le chercher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS UN TOAST
 * ─────────────────────────────────────────────────────────────────────────────
 * `lib/toast` affiche UN message à la fois, quelques secondes, et se referme seul.
 * C'est le bon outil pour « Vente enregistrée » — et le mauvais pour ceci :
 *
 *   • un rappel de créance demande une DÉCISION (relancer, reporter, ignorer) ;
 *     un message qui s'évapore en trois secondes n'en laisse pas le temps ;
 *   • il ne doit jamais recouvrir la caisse ni voler le fil des confirmations de
 *     vente — donc pas la même file d'attente ;
 *   • il doit pouvoir dire « et 4 autres », ce qu'un toast ne sait pas faire.
 *
 * D'où une carte discrète, en bas à droite (au-dessus de la barre de navigation sur
 * mobile), qui reste tant qu'on ne l'a pas traitée et ne clignote jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI FAIT QU'ELLE NE DÉRANGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. JAMAIS PENDANT UNE VENTE. Les routes de caisse (POS, facture, encaissement) la
 *     suppriment complètement. On ne parle pas de dettes à quelqu'un qui a un client
 *     devant lui.
 *  2. UNE FOIS PAR JOUR, PAS PAR PAGE. Un marqueur local retient le jour de la
 *     dernière apparition : naviguer dans l'application ne la fait pas revenir.
 *  3. APRÈS UN DÉLAI. Elle arrive quelques secondes après l'ouverture, pas pendant le
 *     chargement — le premier écran appartient au travail en cours.
 *  4. ELLE SE TAIT DÈS QU'ON LUI RÉPOND. Relancé, reporté ou fermé : plus rien
 *     jusqu'au prochain cycle.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MdClose, MdNotificationsActive, MdSnooze, MdWhatsapp } from "react-icons/md";

import { ROUTES } from "@/lib/config/routes";
import { useAppContext } from "@/lib/features/common/app-context";
import { listCreditSales } from "@/lib/features/credit/api";
import { buildCustomerAggregates } from "@/lib/features/credit/credit-math";
import {
  buildCreditReminderMessage,
  fetchCreditReminderStates,
  isoDatePlusDays,
  isReminderDue,
  logCreditReminder,
  snoozeCreditReminder,
} from "@/lib/features/credit/reminders";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { whatsappUrl } from "@/lib/features/share/share-document";
import { fetchCreditRemindersConfig } from "@/lib/features/settings/credit-reminders-config";
import { queryKeys } from "@/lib/query/query-keys";
import { toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";

/** Le premier écran appartient au travail en cours : le rappel arrive après. */
const APPEAR_DELAY_MS = 6_000;

/**
 * Routes où l'on se tait absolument : un client attend devant le comptoir. Les
 * préfixes couvrent aussi bien `/stores/<id>/pos` que la file d'encaissement.
 */
function isBusyRoute(pathname: string): boolean {
  if (/^\/stores\/[^/]+\/(pos(-quick)?|facture-tab|vente-engin)\/?$/.test(pathname)) {
    return true;
  }
  return pathname === ROUTES.checkoutQueue || pathname.startsWith(`${ROUTES.checkoutQueue}/`);
}

/** Marqueur « déjà montré » — par entreprise, pour ne pas suivre un patron d'une maison à l'autre. */
function shownKey(companyId: string): string {
  return `fs_credit_nudge_shown_${companyId}`;
}

function readShownDay(companyId: string): string | null {
  try {
    return localStorage.getItem(shownKey(companyId));
  } catch {
    // Navigation privée, stockage bloqué : on préfère ne rien afficher plutôt que
    // d'afficher à CHAQUE page faute de pouvoir s'en souvenir.
    return "blocked";
  }
}

function writeShownDay(companyId: string, day: string): void {
  try {
    localStorage.setItem(shownKey(companyId), day);
  } catch {
    /* stockage indisponible : sans mémoire, on n'insiste pas */
  }
}

export function CreditReminderNudge() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h } = usePermissions();
  const pathname = usePathname() ?? "";

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const companyName = ctx.data?.companyName ?? "";
  const storeName = ctx.data?.stores.find((s) => s.id === storeId)?.name ?? companyName;
  const moduleOn = h?.canCreditReminders ?? false;

  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);

  const today = isoDatePlusDays(0);
  const alreadyShownToday = companyId ? readShownDay(companyId) === today : true;
  const blocked = companyId ? readShownDay(companyId) === "blocked" : true;

  /** Le rappel n'a le droit d'exister que si tout est réuni — on ne lit rien avant. */
  const active = moduleOn && Boolean(companyId) && !isBusyRoute(pathname) && !blocked && !alreadyShownToday;

  useEffect(() => {
    if (!active) {
      /*
       * Remise a plat DIFFEREE. Appeler `setReady(false)` en plein corps d'effet
       * declenche un rendu en cascade (react-hooks/set-state-in-effect) : on repasse
       * donc par la boucle d'evenements, ce qui ne change rien au resultat visible
       * (le rappel n'est de toute facon pas affiche quand `active` est faux).
       */
      const reset = setTimeout(() => setReady(false), 0);
      return () => clearTimeout(reset);
    }
    const t = setTimeout(() => setReady(true), APPEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, [active]);

  const configQ = useQuery({
    queryKey: queryKeys.creditRemindersConfig(companyId),
    queryFn: () => fetchCreditRemindersConfig(companyId),
    enabled: active && ready,
    staleTime: 5 * 60_000,
  });

  const salesQ = useQuery({
    queryKey: queryKeys.creditSales({ companyId, storeId, from: "", to: "" }),
    queryFn: () => listCreditSales({ companyId, storeId, from: "", to: "" }),
    enabled: active && ready,
    staleTime: 60_000,
  });

  const statesQ = useQuery({
    queryKey: queryKeys.creditReminderStates(companyId),
    queryFn: () => fetchCreditReminderStates(companyId),
    enabled: active && ready,
    staleTime: 30_000,
  });

  const config = configQ.data;

  /** L'heure convenue par le patron n'est pas encore venue : on ne dit rien. */
  const withinHours = useMemo(() => {
    if (!config) return false;
    return new Date().getHours() >= config.fromHour;
  }, [config]);

  const candidates = useMemo(() => {
    if (!config || !salesQ.data) return [];
    const states = statesQ.data ?? new Map();
    return buildCustomerAggregates(salesQ.data)
      .filter((a) =>
        isReminderDue({
          aggregate: a,
          state: states.get(a.customerId),
          frequencyDays: config.frequencyDays,
          minAmount: config.minAmount,
          overdueOnly: config.overdueOnly,
        }),
      )
      .slice(0, config.maxPerSession);
  }, [config, salesQ.data, statesQ.data]);

  const current = candidates[index] ?? null;

  /*
   * Le jour est marqué à la PREMIÈRE apparition réelle, et non à l'ouverture de
   * l'application : marquer trop tôt ferait sauter le rappel les jours où les données
   * arrivent lentement, c'est-à-dire exactement les jours de mauvaise connexion.
   */
  useEffect(() => {
    if (current && companyId) writeShownDay(companyId, today);
  }, [current, companyId, today]);

  if (!active || !ready || dismissed || !withinHours || !current) return null;

  const remaining = candidates.length - index - 1;

  function next() {
    if (index + 1 < candidates.length) setIndex((i) => i + 1);
    else setDismissed(true);
  }

  function relaunch() {
    const a = current!;
    const message = buildCreditReminderMessage({
      customerName: a.customerName,
      totalDue: a.totalDue,
      overdueAmount: a.overdueAmount,
      storeName,
      nextDueAt: a.nextDueAt,
    });
    window.open(whatsappUrl(a.phone, message), "_blank", "noopener,noreferrer");
    void logCreditReminder({
      companyId,
      customerId: a.customerId,
      amountDue: a.totalDue,
      channel: "whatsapp",
      message,
    })
      .then(() => qc.invalidateQueries({ queryKey: queryKeys.creditReminderStates(companyId) }))
      .catch(() => {
        /* la relance est partie : ne pas transformer un échec d'écriture en écran d'erreur */
      });
    next();
  }

  function later() {
    const a = current!;
    void snoozeCreditReminder({
      companyId,
      customerId: a.customerId,
      amountDue: a.totalDue,
      until: isoDatePlusDays(3),
    })
      .then(() => {
        toast.info(`${a.customerName} est mis de côté pour 3 jours.`);
        return qc.invalidateQueries({ queryKey: queryKeys.creditReminderStates(companyId) });
      })
      .catch(() => {
        /* silencieux : c'est un geste de confort, pas une opération à réussir */
      });
    next();
  }

  return (
    <div
      /*
       * `bottom-24` sur mobile : la barre de navigation du shell occupe le bas de
       * l'écran, une carte posée dessus recouvrirait les onglets. À partir de 1024 px
       * cette barre n'existe plus et la carte peut descendre.
       */
      className="pointer-events-none fixed bottom-24 right-2 z-[95] w-[calc(100%-1rem)] max-w-sm min-[1024px]:bottom-5 min-[1024px]:right-5"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto overflow-hidden rounded-xl border border-black/[0.08] bg-fs-card shadow-2xl">
        <div className="flex items-start gap-2 px-3 pt-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fs-accent/15">
            <MdNotificationsActive className="h-4 w-4 text-fs-accent" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Rappel de crédit
            </p>
            <p className="mt-0.5 text-sm leading-snug text-fs-text">
              <span className="font-bold">{current.customerName}</span> vous doit{" "}
              <span className="font-bold tabular-nums text-fs-accent">
                {formatCurrency(current.totalDue)}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {current.overdueAmount > 0
                ? `${formatCurrency(current.overdueAmount)} déjà échu`
                : `${current.openSaleCount} vente${current.openSaleCount > 1 ? "s" : ""} en cours`}
              {current.phone ? ` · ${current.phone}` : " · pas de téléphone"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-black/5"
            aria-label="Fermer les rappels pour aujourd'hui"
          >
            <MdClose className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 border-t border-black/[0.06] px-3 py-2">
          <button
            type="button"
            onClick={relaunch}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-[#25D366] px-2 py-2 text-xs font-semibold text-white"
          >
            <MdWhatsapp className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Relancer</span>
          </button>
          <button
            type="button"
            onClick={later}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-black/[0.1] px-2.5 py-2 text-xs font-semibold text-neutral-700"
          >
            <MdSnooze className="h-4 w-4" aria-hidden />
            Plus tard
          </button>
          <Link
            href={ROUTES.creditReminders}
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-[8px] px-2 py-2 text-xs font-semibold text-fs-accent"
          >
            Tout voir
          </Link>
        </div>

        {remaining > 0 ? (
          <p className="border-t border-black/[0.06] px-3 py-1.5 text-center text-[11px] text-neutral-500">
            et {remaining} autre{remaining > 1 ? "s" : ""} client{remaining > 1 ? "s" : ""} à
            relancer
          </p>
        ) : null}
      </div>
    </div>
  );
}
