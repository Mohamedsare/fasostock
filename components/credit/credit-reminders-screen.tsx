"use client";

/**
 * « Rappels de crédit » — l'écran qui transforme une liste de créances en gestes à faire
 * aujourd'hui.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI LE DISTINGUE DE LA PAGE CRÉDIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La page Crédit répond à « qui me doit quoi ». Elle est complète, elle est juste, et
 * elle ne fait rien arriver : on la consulte, on referme, l'argent reste dehors.
 *
 * Celle-ci répond à une autre question, la seule qui récupère de l'argent : « QUI
 * J'APPELLE MAINTENANT ». D'où trois différences de fond :
 *
 *   1. ELLE OUBLIE CE QU'ELLE VIENT DE DIRE. Un client relancé ce matin disparaît de la
 *      liste jusqu'à la prochaine échéance de rappel. Sans cela, trois personnes de la
 *      boutique le relancent le même jour et on le perd.
 *
 *   2. ELLE PORTE LE MESSAGE. Le texte est écrit, courtois, prêt à partir sur WhatsApp.
 *      C'est le point de blocage réel : personne n'ose écrire « tu me dois 45 000 ».
 *
 *   3. ELLE ACCEPTE LE « PAS MAINTENANT ». Le report est un geste de première classe,
 *      daté, qui expire tout seul. Un client qui a prévenu n'est pas un client à
 *      relancer — mais il ne doit pas non plus être oublié.
 *
 * Aucune dette n'est recalculée ici : les montants viennent de `buildCustomerAggregates`
 * (`credit-math.ts`), la seule source de vérité de l'application sur ce sujet.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  MdAccessTime,
  MdCheckCircle,
  MdChevronRight,
  MdCreditCard,
  MdLock,
  MdNotificationsActive,
  MdPhone,
  MdSchedule,
  MdSearch,
  MdSnooze,
  MdTune,
  MdWhatsapp,
} from "react-icons/md";

import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
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
  type CreditReminderState,
} from "@/lib/features/credit/reminders";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { whatsappUrl } from "@/lib/features/share/share-document";
import {
  DEFAULT_CREDIT_REMINDERS_CONFIG,
  fetchCreditRemindersConfig,
  frequencyLabel,
  setCreditRemindersConfig,
  type CreditRemindersConfig,
} from "@/lib/features/settings/credit-reminders-config";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import type { CustomerCreditAggregate } from "@/lib/features/credit/types";
import { formatCurrency } from "@/lib/utils/currency";

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function dayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** « il y a 3 jours » — plus parlant qu'une date pour juger si l'on peut réinsister. */
function sinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} jours`;
  const months = Math.floor(days / 30);
  return months === 1 ? "il y a un mois" : `il y a ${months} mois`;
}

type Tab = "today" | "snoozed" | "all";

export function CreditRemindersScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const companyName = ctx.data?.companyName ?? "";
  const storeName = ctx.data?.stores.find((s) => s.id === storeId)?.name ?? companyName;
  const canView = h?.canCreditReminders ?? false;
  const isOwner = h?.isOwner ?? false;

  const [tab, setTab] = useState<Tab>("today");
  const [query, setQuery] = useState("");
  const [snoozing, setSnoozing] = useState<CustomerCreditAggregate | null>(null);
  /*
   * Les réglages vivent AUSSI ici, et pas seulement dans Paramètres.
   *
   * C'est sur cet écran qu'on découvre qu'ils sont mal réglés — « pourquoi ce client
   * n'apparaît pas ? », « pourquoi je revois celui-là ? ». Envoyer le commerçant dans
   * Paramètres à ce moment-là, c'est lui faire perdre sa liste, son filtre et sa
   * recherche pour trois secondes de réglage. Repliés par défaut : la page reste une
   * page d'action, pas un formulaire.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);

  const salesQ = useQuery({
    queryKey: queryKeys.creditSales({ companyId, storeId, from: "", to: "" }),
    queryFn: () => listCreditSales({ companyId, storeId, from: "", to: "" }),
    enabled: Boolean(companyId) && canView,
    staleTime: 60_000,
  });

  const statesQ = useQuery({
    queryKey: queryKeys.creditReminderStates(companyId),
    queryFn: () => fetchCreditReminderStates(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 30_000,
  });

  const configQ = useQuery({
    queryKey: queryKeys.creditRemindersConfig(companyId),
    queryFn: () => fetchCreditRemindersConfig(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 5 * 60_000,
  });

  const aggregates = useMemo(
    () => buildCustomerAggregates(salesQ.data ?? []),
    [salesQ.data],
  );
  const states = useMemo(
    () => statesQ.data ?? new Map<string, CreditReminderState>(),
    [statesQ.data],
  );
  const config = configQ.data;

  /** Ce qu'il y a à faire aujourd'hui, et ce qui est mis de côté. */
  const { due, snoozedList } = useMemo(() => {
    const dueList: CustomerCreditAggregate[] = [];
    const snoozed: CustomerCreditAggregate[] = [];
    if (!config) return { due: dueList, snoozedList: snoozed };
    for (const a of aggregates) {
      const state = states.get(a.customerId);
      if (
        isReminderDue({
          aggregate: a,
          state,
          frequencyDays: config.frequencyDays,
          minAmount: config.minAmount,
          overdueOnly: config.overdueOnly,
        })
      ) {
        dueList.push(a);
      } else if (state?.snoozedUntil) {
        snoozed.push(a);
      }
    }
    return { due: dueList, snoozedList: snoozed };
  }, [aggregates, states, config]);

  const rows = useMemo(() => {
    const base = tab === "today" ? due : tab === "snoozed" ? snoozedList : aggregates;
    const q = norm(query);
    if (!q) return base;
    return base.filter((a) => norm(a.customerName).includes(q));
  }, [tab, due, snoozedList, aggregates, query]);

  const totals = useMemo(() => {
    let all = 0;
    let overdue = 0;
    for (const a of aggregates) {
      all += a.totalDue;
      overdue += a.overdueAmount;
    }
    return { all, overdue, dueToday: due.reduce((s, a) => s + a.totalDue, 0) };
  }, [aggregates, due]);

  const logMut = useMutation({
    mutationFn: (v: { a: CustomerCreditAggregate; message: string | null; channel: "whatsapp" | "call" | "app" }) =>
      logCreditReminder({
        companyId,
        customerId: v.a.customerId,
        amountDue: v.a.totalDue,
        channel: v.channel,
        message: v.message,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.creditReminderStates(companyId) });
    },
    onError: (e) => toastMutationError("credit-reminders", e),
  });

  /**
   * Écriture des réglages depuis CETTE page. Même clé `company_settings` que l'écran
   * Paramètres — il n'y a qu'un seul réglage, vu de deux endroits, et l'invalidation
   * commune fait que changer ici met l'autre à jour tout seul.
   *
   * La base tranche pour de bon : `can_write_company_setting` (00207) n'autorise que le
   * propriétaire. Cacher le panneau aux autres est un confort d'affichage, pas la
   * frontière de sécurité.
   */
  const configMut = useMutation({
    mutationFn: async (patch: Partial<CreditRemindersConfig>) => {
      if (!companyId) throw new Error("Entreprise introuvable.");
      await setCreditRemindersConfig(companyId, {
        ...(config ?? DEFAULT_CREDIT_REMINDERS_CONFIG),
        ...patch,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.creditRemindersConfig(companyId) });
    },
    onError: (e) => toastMutationError("credit-reminders", e),
  });

  const snoozeMut = useMutation({
    mutationFn: (v: { a: CustomerCreditAggregate; days: number }) =>
      snoozeCreditReminder({
        companyId,
        customerId: v.a.customerId,
        amountDue: v.a.totalDue,
        until: isoDatePlusDays(v.days),
      }),
    onSuccess: async (_d, v) => {
      toast.success(
        v.days === 1
          ? `${v.a.customerName} ne réapparaîtra pas avant demain.`
          : `${v.a.customerName} est mis de côté pour ${v.days} jours.`,
      );
      setSnoozing(null);
      await qc.invalidateQueries({ queryKey: queryKeys.creditReminderStates(companyId) });
    },
    onError: (e) => toastMutationError("credit-reminders", e),
  });

  function sendWhatsApp(a: CustomerCreditAggregate) {
    const message = buildCreditReminderMessage({
      customerName: a.customerName,
      totalDue: a.totalDue,
      overdueAmount: a.overdueAmount,
      storeName,
      nextDueAt: a.nextDueAt,
    });
    window.open(whatsappUrl(a.phone, message), "_blank", "noopener,noreferrer");
    /*
     * On enregistre la relance à l'OUVERTURE de WhatsApp, pas à l'envoi réel : le
     * navigateur ne saura jamais si le message est effectivement parti. Le pire cas est
     * un client qui n'est pas re-proposé pendant un cycle alors qu'on a renoncé — sans
     * gravité, et il reste visible dans « Tous ». Le cas inverse (relancer trois fois
     * quelqu'un qu'on vient de contacter) coûte, lui, un client.
     */
    logMut.mutate({ a, message, channel: "whatsapp" });
  }

  if (permLoading) {
    return (
      <FsPage>
        <FsScreenHeader title="Rappels de crédit" />
        <div className="flex justify-center py-10" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!canView) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Rappels de crédit"
          subtitle="Qui relancer aujourd'hui, et avec quels mots."
        />
        <FsCard padding="p-6">
          <div className="text-center">
            <MdLock className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">Accès réservé</p>
            <p className="mt-1 text-xs text-neutral-600">
              {h?.creditRemindersOn
                ? "Demandez au propriétaire l'accès à la page Crédit (page Employés)."
                : "Le propriétaire n'a pas encore activé les rappels de crédit (Paramètres)."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const loading = salesQ.isPending || configQ.isPending;

  return (
    <FsPage>
      <FsScreenHeader
        title="Rappels de crédit"
        subtitle="Ce qu'il y a à réclamer aujourd'hui — et le message poli, déjà écrit."
      />

      <FsCard padding="p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[11px] font-medium text-neutral-500">Total dû</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-fs-text">
              {formatCurrency(totals.all)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-neutral-500">Déjà échu</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-red-600">
              {formatCurrency(totals.overdue)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-neutral-500">À relancer</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-fs-accent">
              {formatCurrency(totals.dueToday)}
            </p>
          </div>
        </div>
        {config ? (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
            <MdSchedule className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Rappel : {frequencyLabel(config.frequencyDays).toLowerCase()}
              {config.maxPerSession > 0
                ? ` · ${config.maxPerSession} par tour`
                : " · tour complet"}
              {config.minAmount > 0
                ? ` · à partir de ${formatCurrency(config.minAmount)}`
                : ""}
              {config.overdueOnly ? " · créances échues seulement" : ""}
              {` · pas avant ${String(config.fromHour).padStart(2, "0")} h`}
            </span>
            {isOwner ? (
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
                className="inline-flex items-center gap-1 rounded-md border border-black/[0.1] px-1.5 py-0.5 font-semibold text-fs-accent"
              >
                <MdTune className="h-3.5 w-3.5" aria-hidden />
                {settingsOpen ? "Fermer" : "Régler"}
              </button>
            ) : null}
          </p>
        ) : null}

        {/*
          Le panneau de réglage, sur place. Chaque champ écrit immédiatement : il n'y a
          pas de bouton « Enregistrer », parce qu'il n'y a rien à valider ensemble — et
          que l'effet se voit dans la liste juste en dessous, dans la seconde.
        */}
        {isOwner && settingsOpen ? (
          <div className="mt-3 space-y-3 rounded-[10px] border border-black/[0.08] bg-fs-surface px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="block text-xs font-medium text-neutral-600"
                  htmlFor="rem-page-frequency"
                >
                  Fréquence par client
                </label>
                <select
                  id="rem-page-frequency"
                  className={fsInputClass("mt-1.5")}
                  value={String((config ?? DEFAULT_CREDIT_REMINDERS_CONFIG).frequencyDays)}
                  disabled={configMut.isPending}
                  onChange={(e) => {
                    void configMut.mutateAsync({ frequencyDays: Number(e.target.value) });
                  }}
                >
                  {[1, 2, 3, 7, 14, 30].map((d) => (
                    <option key={d} value={d}>
                      {frequencyLabel(d)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-xs font-medium text-neutral-600"
                  htmlFor="rem-page-max"
                >
                  Clients par tour
                </label>
                <select
                  id="rem-page-max"
                  className={fsInputClass("mt-1.5")}
                  value={String((config ?? DEFAULT_CREDIT_REMINDERS_CONFIG).maxPerSession)}
                  disabled={configMut.isPending}
                  onChange={(e) => {
                    void configMut.mutateAsync({ maxPerSession: Number(e.target.value) });
                  }}
                >
                  <option value="0">Tous — le tour complet</option>
                  {[3, 5, 10, 20].map((n) => (
                    <option key={n} value={n}>
                      Les {n} plus gros montants
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-xs font-medium text-neutral-600"
                  htmlFor="rem-page-min"
                >
                  Ne rien rappeler en dessous de
                </label>
                <input
                  id="rem-page-min"
                  inputMode="numeric"
                  /*
                   * `key` sur la valeur enregistrée : un champ non contrôlé ne se
                   * rafraîchit pas tout seul quand le réglage change ailleurs (écran
                   * Paramètres, autre onglet). Le remonter à neuf après chaque écriture
                   * est ce qui garde les deux vues d'accord.
                   */
                  key={`min-${(config ?? DEFAULT_CREDIT_REMINDERS_CONFIG).minAmount}`}
                  defaultValue={String(
                    Math.round((config ?? DEFAULT_CREDIT_REMINDERS_CONFIG).minAmount),
                  )}
                  disabled={configMut.isPending}
                  className={fsInputClass("mt-1.5 text-right tabular-nums")}
                  onBlur={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "");
                    const v = Math.max(0, Number(digits) || 0);
                    if (v !== (config ?? DEFAULT_CREDIT_REMINDERS_CONFIG).minAmount) {
                      void configMut.mutateAsync({ minAmount: v });
                    }
                  }}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-medium text-neutral-600"
                  htmlFor="rem-page-hour"
                >
                  Pas avant
                </label>
                <select
                  id="rem-page-hour"
                  className={fsInputClass("mt-1.5")}
                  value={String((config ?? DEFAULT_CREDIT_REMINDERS_CONFIG).fromHour)}
                  disabled={configMut.isPending}
                  onChange={(e) => {
                    void configMut.mutateAsync({ fromHour: Number(e.target.value) });
                  }}
                >
                  {[5, 6, 7, 8, 9, 10, 12, 14, 16].map((hh) => (
                    <option key={hh} value={hh}>
                      {String(hh).padStart(2, "0")} h
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 border-t border-black/[0.06] pt-3",
                configMut.isPending && "pointer-events-none opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fs-text">
                  Seulement les créances en retard
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {(config ?? DEFAULT_CREDIT_REMINDERS_CONFIG).overdueOnly
                    ? "Un client dont l'échéance n'est pas encore passée n'est pas rappelé."
                    : "Tous vos débiteurs sont rappelés, échéance passée ou non."}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                checked={(config ?? DEFAULT_CREDIT_REMINDERS_CONFIG).overdueOnly}
                disabled={configMut.isPending}
                onChange={(e) => {
                  void configMut.mutateAsync({ overdueOnly: e.target.checked });
                }}
              />
            </label>

            <p className="text-[11px] leading-relaxed text-neutral-500">
              Ces réglages sont les mêmes que dans{" "}
              <Link
                href={ROUTES.settings}
                className="font-semibold text-fs-accent hover:underline"
              >
                Paramètres › Rappels de crédit
              </Link>
              . Ils valent pour toute l&apos;entreprise, et la liste ci-dessous se remet à
              jour immédiatement.
            </p>
          </div>
        ) : null}
      </FsCard>

      <div className="mt-3 flex flex-wrap gap-2">
        <FsFilterChip
          icon={MdNotificationsActive}
          label={`À relancer (${due.length})`}
          selected={tab === "today"}
          onClick={() => setTab("today")}
        />
        <FsFilterChip
          icon={MdSnooze}
          label={`Mis de côté (${snoozedList.length})`}
          selected={tab === "snoozed"}
          onClick={() => setTab("snoozed")}
        />
        <FsFilterChip
          icon={MdCreditCard}
          label={`Tous (${aggregates.length})`}
          selected={tab === "all"}
          onClick={() => setTab("all")}
        />
      </div>

      <div className="relative mt-2">
        <MdSearch
          className="pointer-events-none absolute left-2.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un client…"
          className={fsInputClass("w-full pl-9")}
          aria-label="Chercher un client"
        />
      </div>

      {salesQ.isError ? (
        <div className="mt-3">
          <FsQueryErrorPanel error={salesQ.error} onRetry={() => void salesQ.refetch()} />
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-10" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : null}

      {!loading && !salesQ.isError && rows.length === 0 ? (
        <FsCard className="mt-3" padding="p-6">
          <div className="text-center">
            <MdCheckCircle className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">
              {tab === "today"
                ? aggregates.length === 0
                  ? "Personne ne vous doit rien"
                  : "Rien à relancer aujourd'hui"
                : tab === "snoozed"
                  ? "Personne n'est mis de côté"
                  : "Aucun client trouvé"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              {tab === "today" && aggregates.length > 0
                ? "Tous vos débiteurs ont été relancés récemment, ou sont mis de côté. L'onglet « Tous » les montre quand même."
                : tab === "today"
                  ? "Vos ventes à crédit sont toutes soldées."
                  : "Essayez un autre onglet ou un autre mot."}
            </p>
          </div>
        </FsCard>
      ) : null}

      <div className="mt-3 space-y-2">
        {rows.map((a) => {
          const state = states.get(a.customerId);
          const since = sinceLabel(state?.lastSentAt ?? null);
          const snoozedTo = dayLabel(state?.snoozedUntil ?? null);
          const stillSnoozed =
            state?.snoozedUntil != null && state.snoozedUntil >= isoDatePlusDays(0);
          return (
            <FsCard key={a.customerId} padding="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-fs-text">{a.customerName}</span>
                    {a.risk === "critique" ? (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                        Retard important
                      </span>
                    ) : a.risk === "attention" ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                        En retard
                      </span>
                    ) : null}
                  </div>

                  {/*
                    La phrase telle qu'elle sera dite au client. C'est ce que le
                    commerçant lit avant de décider d'appeler — la voir écrite est ce
                    qui rend le geste facile.
                  */}
                  <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                    vous doit{" "}
                    <span className="font-bold tabular-nums text-fs-accent">
                      {formatCurrency(a.totalDue)}
                    </span>
                    {a.openSaleCount > 1 ? (
                      <span className="text-neutral-500"> · {a.openSaleCount} ventes</span>
                    ) : null}
                  </p>

                  <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-neutral-500">
                    {a.overdueAmount > 0 ? (
                      <span className="font-semibold text-red-600">
                        {formatCurrency(a.overdueAmount)} échu
                      </span>
                    ) : null}
                    {a.nextDueAt ? (
                      <span className="inline-flex items-center gap-1">
                        <MdAccessTime className="h-3.5 w-3.5" aria-hidden />
                        échéance {dayLabel(a.nextDueAt)}
                      </span>
                    ) : null}
                    {a.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <MdPhone className="h-3.5 w-3.5" aria-hidden />
                        {a.phone}
                      </span>
                    ) : (
                      <span className="text-amber-700">Pas de téléphone enregistré</span>
                    )}
                  </p>

                  {since ? (
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Relancé {since}
                      {state && state.sentCount > 1 ? ` · ${state.sentCount} relances` : ""}
                    </p>
                  ) : null}
                  {stillSnoozed && snoozedTo ? (
                    <p className="mt-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                      Mis de côté jusqu&apos;au {snoozedTo}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => sendWhatsApp(a)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#25D366] px-3 py-2 text-xs font-semibold text-white"
                >
                  <MdWhatsapp className="h-4 w-4" aria-hidden />
                  Relancer poliment
                </button>
                {a.phone ? (
                  <a
                    href={`tel:${a.phone.replace(/\s+/g, "")}`}
                    onClick={() => logMut.mutate({ a, message: null, channel: "call" })}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-black/[0.1] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800"
                  >
                    <MdPhone className="h-4 w-4" aria-hidden />
                    Appeler
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSnoozing(a)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-black/[0.1] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800"
                >
                  <MdSnooze className="h-4 w-4" aria-hidden />
                  Plus tard
                </button>
                <Link
                  href={ROUTES.credit}
                  className="inline-flex items-center gap-1 rounded-[8px] px-2 py-2 text-xs font-semibold text-fs-accent"
                >
                  Détail
                  <MdChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </FsCard>
          );
        })}
      </div>

      {snoozing ? (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Mettre de côté"
        >
          <button
            type="button"
            className="absolute inset-0 -z-0"
            aria-label="Fermer"
            onClick={() => setSnoozing(null)}
          />
          <div className="relative z-10 w-full rounded-t-lg bg-fs-surface p-4 shadow-2xl sm:max-w-sm sm:rounded-lg">
            <p className="text-sm font-bold text-fs-text">
              Mettre {snoozing.customerName} de côté
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              Il ne réapparaîtra pas dans les rappels avant la date choisie. Sa dette,
              elle, reste entière et visible dans « Tous ».
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { days: 1, label: "Demain" },
                { days: 3, label: "Dans 3 jours" },
                { days: 7, label: "La semaine prochaine" },
                { days: 30, label: "Dans un mois" },
              ].map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  disabled={snoozeMut.isPending}
                  onClick={() => snoozeMut.mutate({ a: snoozing, days: opt.days })}
                  className={cn(
                    "min-h-11 rounded-md border border-black/10 bg-fs-card text-xs font-semibold text-neutral-800",
                    snoozeMut.isPending && "opacity-60",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSnoozing(null)}
              className="mt-3 min-h-11 w-full rounded-md border border-black/10 text-sm font-semibold text-neutral-700"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </FsPage>
  );
}
