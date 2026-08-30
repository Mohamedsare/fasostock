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
 *  2. UN TOUR PAR CONNEXION, PAS PAR PAGE. À l'ouverture de la session, la carte passe
 *     les débiteurs en revue UNE fois, puis se tait jusqu'à la prochaine connexion.
 *     Naviguer dans l'application ne la relance pas.
 *  3. APRÈS UN DÉLAI. Elle arrive quelques secondes après l'ouverture, pas pendant le
 *     chargement — le premier écran appartient au travail en cours.
 *  4. ELLE SE TAIT DÈS QU'ON LUI RÉPOND. Relancé, reporté ou fermé : plus rien
 *     jusqu'au prochain cycle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TOUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne montre pas un client et n'attend pas : elle les FAIT DÉFILER seule, quelques
 * secondes chacun, du plus gros montant au plus petit, et s'arrête d'elle-même à la fin.
 *
 * C'est ce que le patron demande vraiment en se connectant : « où est mon argent ? ».
 * Un seul nom ne répond pas à cette question, et lui faire cliquer vingt fois pour
 * l'obtenir revient à ne pas la lui poser. Le tour dure ce qu'il dure, se referme tout
 * seul, et laisse un compteur (« 3 / 20 ») pour qu'il sache à tout instant combien il
 * reste — un défilement sans fin visible est une source d'angoisse, pas d'information.
 *
 * Deux garde-fous rendent le défilement supportable :
 *   • il se MET EN PAUSE dès que la souris entre dans la carte ou qu'un de ses boutons
 *     prend le focus. Une carte qui s'échappe au moment où on tend le doigt vers
 *     « Relancer » est pire que pas de carte du tout ;
 *   • une barre de progression montre le temps qui reste sur la fiche courante, pour que
 *     le changement ne surprenne jamais.
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
 * Temps d'affichage d'un client avant de passer au suivant.
 *
 * Sept secondes : c'est le temps de lire un nom, un montant et une ancienneté, puis de
 * décider si on agit. En dessous, le tour devient un défilement qu'on subit ; au-dessus,
 * vingt clients tiennent l'écran pendant plus de trois minutes.
 */
const TOUR_STEP_MS = 7_000;

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

/**
 * Marqueur « tour déjà fait » — par entreprise, pour ne pas suivre un patron d'une
 * maison à l'autre.
 *
 * ── Pourquoi `sessionStorage` et non `localStorage` ──
 * Le tour doit repartir À CHAQUE CONNEXION, et se taire entre-temps. `sessionStorage`
 * dit exactement cela : il est propre à l'onglet, il SURVIT aux rechargements (une
 * coupure réseau et un F5 ne relancent donc pas le tour), et il disparaît quand l'onglet
 * se ferme — c'est-à-dire quand la journée de travail s'arrête.
 *
 * `localStorage` gardait la trace pour la journée entière : se reconnecter l'après-midi
 * ne redonnait plus rien, alors que c'est précisément le moment où l'on veut savoir ce
 * qui reste dehors.
 */
function shownKey(companyId: string): string {
  return `fs_credit_nudge_tour_${companyId}`;
}

/** `"done"` si le tour a déjà eu lieu, `"blocked"` si le stockage est inaccessible. */
function readTourMark(companyId: string): string | null {
  try {
    return sessionStorage.getItem(shownKey(companyId));
  } catch {
    // Navigation privée, stockage bloqué : on préfère ne rien afficher plutôt que
    // de relancer le tour à CHAQUE page faute de pouvoir s'en souvenir.
    return "blocked";
  }
}

function writeTourMark(companyId: string): void {
  try {
    sessionStorage.setItem(shownKey(companyId), "done");
  } catch {
    /* stockage indisponible : sans mémoire, on n'insiste pas */
  }
}

/**
 * Enveloppe : elle ne fait qu'attendre de savoir DANS QUELLE MAISON on est.
 *
 * Le marqueur « tour deja fait » est range par entreprise. Le lire avant que le contexte
 * ait livre l'identifiant reviendrait a le lire sous une cle vide, donc a ne rien
 * trouver, donc a relancer le tour a chaque rechargement. Le `key` remonte l'ecran a
 * neuf si le patron change d'entreprise, ce qui relit le bon marqueur.
 */
export function CreditReminderNudge() {
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  if (!companyId) return null;
  return <CreditReminderNudgeFor key={companyId} companyId={companyId} />;
}

function CreditReminderNudgeFor({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h } = usePermissions();
  const pathname = usePathname() ?? "";

  const storeId = ctx.data?.storeId ?? null;
  const companyName = ctx.data?.companyName ?? "";
  const storeName = ctx.data?.stores.find((s) => s.id === storeId)?.name ?? companyName;
  const moduleOn = h?.canCreditReminders ?? false;

  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  /** Le défilement s'arrête tant que la carte est survolée ou qu'un bouton a le focus. */
  const [paused, setPaused] = useState(false);

  /*
   * MARQUEUR LU UNE SEULE FOIS — et c'est tout le sujet de ce bloc.
   *
   * L'effet plus bas ÉCRIT « tour fait » dès que le premier client s'affiche. Tant que
   * cette valeur était RELUE à chaque rendu, elle se retournait contre la carte qu'elle
   * venait d'autoriser : l'effet écrivait le marqueur, le rendu suivant le relisait,
   * `active` retombait à faux, et la carte disparaissait. Or le rendu suivant arrive
   * immédiatement — les trois requêtes ne se résolvent pas ensemble, et la moindre
   * navigation redéclenche `usePathname`. D'où le symptôme : aucune carte, ou le temps
   * d'un battement de cil.
   *
   * Le marqueur sert à empêcher un NOUVEAU tour (rechargement, navigation), jamais à
   * interrompre celui qui est en cours. Il est donc lu une fois, à l'ouverture —
   * l'initialiseur paresseux de `useState` garantit cette unicité, y compris sous le
   * double rendu du mode strict — et l'entreprise est déjà connue puisque l'enveloppe ne
   * monte cet écran qu'à ce moment-là.
   */
  const [tourMarkAtMount] = useState<string | null>(() => readTourMark(companyId));
  const tourAlreadyDone = tourMarkAtMount === "done";
  const blocked = tourMarkAtMount === "blocked";

  /** Le rappel n'a le droit d'exister que si tout est réuni — on ne lit rien avant. */
  const active = moduleOn && !isBusyRoute(pathname) && !blocked && !tourAlreadyDone;

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
      // `0` = tour complet. `slice(0, 0)` renverrait un tableau VIDE : le cas est donc
      // traité à part, et non par une valeur sentinelle glissée dans `slice`.
      .slice(0, config.maxPerSession > 0 ? config.maxPerSession : undefined);
  }, [config, salesQ.data, statesQ.data]);

  const total = candidates.length;
  const current = candidates[index] ?? null;

  /*
   * Le tour est marqué fait à la PREMIÈRE apparition réelle, et non à l'ouverture de
   * l'application : marquer trop tôt le ferait sauter les jours où les données arrivent
   * lentement, c'est-à-dire exactement les jours de mauvaise connexion.
   */
  useEffect(() => {
    if (current && companyId) writeTourMark(companyId);
  }, [current, companyId]);

  /*
   * LE DÉFILEMENT. Un pas toutes les `TOUR_STEP_MS`, jusqu'au dernier client, puis la
   * carte se referme d'elle-même.
   *
   * `setIndex` est appelé DANS le minuteur, jamais dans le corps de l'effet : c'est ce
   * qui évite la cascade de rendus que la règle `react-hooks/set-state-in-effect`
   * interdit — et, accessoirement, ce qui fait qu'un tour est un tour et non une boucle
   * qui se rejoue à chaque rendu.
   *
   * La pause n'annule pas le tour : elle suspend le minuteur, qui repart entier au
   * `pointerleave`. Quelqu'un qui lit une fiche ne doit pas la voir filer, et quelqu'un
   * qui revient ne doit pas se retrouver trois clients plus loin.
   */
  useEffect(() => {
    if (!active || !ready || dismissed || paused || !current) return;
    const t = setTimeout(() => {
      setIndex((i) => i + 1);
    }, TOUR_STEP_MS);
    return () => clearTimeout(t);
  }, [active, ready, dismissed, paused, current, index]);

  /*
   * Fin du tour : l'index a dépassé le dernier client. On referme.
   *
   * C'est un effet et non un test dans le rendu, parce que `candidates` peut encore
   * grandir pendant le tour (une requête de fond qui se termine) : décider « c'est fini »
   * pendant le rendu fermerait la carte sur une liste incomplète.
   */
  useEffect(() => {
    if (!ready || dismissed || total === 0) return;
    if (index < total) return;
    const t = setTimeout(() => setDismissed(true), 0);
    return () => clearTimeout(t);
  }, [ready, dismissed, index, total]);

  if (!active || !ready || dismissed || !withinHours || !current) return null;

  const remaining = total - index - 1;
  /*
   * Le total de TOUTE la tournée, pas seulement de la fiche affichée. C'est le chiffre
   * qui fait agir : « 47 500 F » se remet à demain, « 38 millions dehors » non.
   */
  const totalDueAll = candidates.reduce((sum, a) => sum + a.totalDue, 0);

  function next() {
    if (index + 1 < total) setIndex((i) => i + 1);
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
      <div
        /*
         * La pause couvre la souris ET le clavier. `onFocus`/`onBlur` remontent depuis
         * les boutons (contrairement à `focus`, `focusin` bulle — c'est ce que React
         * expose ici), sans quoi un utilisateur au clavier verrait la fiche changer
         * pendant qu'il tabule vers « Relancer ».
         */
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className="pointer-events-auto overflow-hidden rounded-xl border border-black/[0.08] bg-fs-card shadow-2xl"
      >
        {/*
          Barre de progression du pas en cours. `animation-play-state` suit la pause :
          l'arrêt se VOIT, sinon on croit la carte figée. `key` sur l'index redémarre
          l'animation à chaque client — une transition CSS ne se rejoue pas toute seule.
        */}
        <div className="h-0.5 w-full bg-black/[0.06]" aria-hidden>
          <div
            key={index}
            className="h-full bg-fs-accent/60"
            style={{
              animation: `fs-nudge-progress ${TOUR_STEP_MS}ms linear forwards`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
        <style>{`@keyframes fs-nudge-progress { from { width: 0% } to { width: 100% } }`}</style>

        <div className="flex items-start gap-2 px-3 pt-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fs-accent/15">
            <MdNotificationsActive className="h-4 w-4 text-fs-accent" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Rappel de crédit
              {total > 1 ? (
                <span className="rounded-full bg-black/[0.06] px-1.5 py-0.5 tabular-nums text-neutral-600">
                  {index + 1}/{total}
                </span>
              ) : null}
              {paused ? (
                <span className="font-medium normal-case text-neutral-400">en pause</span>
              ) : null}
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
            encore {remaining} client{remaining > 1 ? "s" : ""} — total dû{" "}
            <span className="font-semibold tabular-nums text-neutral-700">
              {formatCurrency(totalDueAll)}
            </span>
          </p>
        ) : (
          <p className="border-t border-black/[0.06] px-3 py-1.5 text-center text-[11px] text-neutral-500">
            dernier de la liste
          </p>
        )}
      </div>
    </div>
  );
}
