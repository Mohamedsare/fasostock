"use client";

/**
 * « Caisse » — ouvrir le matin, compter le soir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION À LAQUELLE PERSONNE NE POUVAIT RÉPONDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * À la fermeture, le patron compte. Il trouve 184 200. Le logiciel dit qu'il a été
 * encaissé 191 000 en espèces. Où sont les 6 800 ?
 *
 * Sans fond de caisse enregistré le matin et sans sorties notées dans la journée,
 * la question n'a même pas de réponse possible — et donc personne ne la pose. Au
 * bout de six mois, l'écart devient la norme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES DE CALCUL, ET ELLES SONT EN BASE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. SEULES LES ESPÈCES COMPTENT. L'Orange Money encaissé dans la journée n'est
 *    pas dans le tiroir ; l'y compter ferait apparaître un manquant tous les soirs.
 * 2. LES SORTIES SE NOTENT. Les 20 000 pris pour le charbon, la monnaie rendue —
 *    sans elles, l'écart n'explique rien.
 * 3. L'ÉCART EST ENREGISTRÉ, JAMAIS CORRIGÉ EN SILENCE. Une caisse qui tombe juste
 *    tous les soirs parce que le logiciel a ajusté la différence ne sert à rien.
 *
 * Le calcul vit dans `restaurant_close_cash_session` et `restaurant_cash_session_state`
 * (00221) — écrit une seule fois pour que l'état affiché en cours de journée et le
 * décompte de clôture ne puissent jamais diverger.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAccountBalanceWallet,
  MdAdd,
  MdArrowDownward,
  MdArrowUpward,
  MdLockOpen,
  MdPointOfSale,
  MdRemove,
} from "react-icons/md";

import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsPager } from "@/components/ui/fs-pager";
import {
  NeedStoreCard,
  RestaurantEmptyCard,
  RestaurantSheet,
  btnOutline,
  btnPrimary,
  dateTimeLabel,
  timeLabel,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import {
  addCashMovement,
  closeCashSession,
  getCashSessionState,
  getOpenCashSession,
  listCashMovements,
  listCashSessions,
  openCashSession,
} from "@/lib/features/restaurant/api-ops";
import {
  CASH_MOVEMENT_LABELS,
  RESTAURANT_PAGE_SIZE,
  type CashCloseResult,
  type CashMovementType,
} from "@/lib/features/restaurant/types";
import { ROUTES } from "@/lib/config/routes";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

export type CashView = "register" | "sessions" | "closing";

export function RestaurantCashScreen({ view }: { view: CashView }) {
  if (view === "sessions") return <SessionsView />;
  return <RegisterView closing={view === "closing"} />;
}

/* ═══════════════════════════ Poste de caisse / Clôture ═══════════════════════════ */

function RegisterView({ closing }: { closing: boolean }) {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;

  const [openSheet, setOpenSheet] = useState(false);
  const [moveSheet, setMoveSheet] = useState<CashMovementType | null>(null);
  const [closeSheet, setCloseSheet] = useState(false);
  const [result, setResult] = useState<CashCloseResult | null>(null);

  const sessionQ = useQuery({
    queryKey: queryKeys.restaurantCashSession(companyId, storeId),
    queryFn: () => getOpenCashSession(storeId!),
    enabled: Boolean(companyId && storeId),
    staleTime: 15_000,
  });
  const session = sessionQ.data ?? null;

  const stateQ = useQuery({
    queryKey: queryKeys.restaurantCashSessionState(companyId, session?.id ?? ""),
    queryFn: () => getCashSessionState(session!.id),
    enabled: Boolean(session?.id),
    /* Le tiroir bouge à chaque vente : au-delà d'une minute, le chiffre est déjà faux. */
    refetchInterval: 30_000,
  });

  const movementsQ = useQuery({
    queryKey: queryKeys.restaurantCashMovements(companyId, session?.id ?? ""),
    queryFn: () => listCashMovements(session!.id),
    enabled: Boolean(session?.id),
    staleTime: 30_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["restaurant", companyId] });

  const openMut = useMutation({
    mutationFn: (amount: number) =>
      openCashSession({ companyId, storeId: storeId!, openingAmount: amount }),
    onSuccess: async () => {
      setOpenSheet(false);
      toast.success("Caisse ouverte.");
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-cash-open", e),
  });

  const moveMut = useMutation({
    mutationFn: (p: { type: CashMovementType; amount: number; notes: string | null }) =>
      addCashMovement({ sessionId: session!.id, ...p }),
    onSuccess: async () => {
      setMoveSheet(null);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-cash-movement", e),
  });

  const closeMut = useMutation({
    mutationFn: (p: { counted: number; notes: string | null }) =>
      closeCashSession({
        sessionId: session!.id,
        countedAmount: p.counted,
        notes: p.notes,
      }),
    onSuccess: async (r) => {
      setCloseSheet(false);
      setResult(r);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-cash-close", e),
  });

  const state = stateQ.data;
  const movements = useMemo(() => movementsQ.data ?? [], [movementsQ.data]);
  const daily = useMemo(
    () => movements.filter((m) => m.type !== "opening" && m.type !== "closing"),
    [movements],
  );

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader
          title={closing ? "Clôture" : "Poste de caisse"}
          subtitle="Le fond de caisse, les sorties, et le compte du soir."
        />
        <NeedStoreCard />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title={closing ? "Clôture de caisse" : "Poste de caisse"}
        subtitle={
          closing
            ? "Comptez le tiroir, l'application vous dit ce qu'il devrait contenir."
            : "Le fond du matin, les sorties de la journée, et ce qui devrait être dans le tiroir."
        }
      />

      {sessionQ.isError ? (
        <FsQueryErrorPanel error={sessionQ.error} onRetry={() => void sessionQ.refetch()} />
      ) : sessionQ.isPending ? (
        <div className="mt-10 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : !session ? (
        <RestaurantEmptyCard
          icon={MdLockOpen}
          title="Caisse fermée"
          message="Ouvrez la caisse en déclarant le fond de départ. Sans lui, aucun contrôle du soir n'est possible : on ne peut pas savoir combien il devrait y avoir si on ne sait pas combien il y avait."
          action={
            <button type="button" onClick={() => setOpenSheet(true)} className={btnPrimary}>
              <MdLockOpen className="h-5 w-5" aria-hidden />
              Ouvrir la caisse
            </button>
          }
        />
      ) : (
        <>
          {/*
            LE chiffre de l'écran : ce qui devrait être dans le tiroir, maintenant.
            Tout le reste de la carte n'existe que pour l'expliquer.
          */}
          <FsCard padding="p-4">
            <p className="text-xs font-medium text-neutral-600">
              Devrait être dans le tiroir
            </p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums leading-none text-fs-text">
              {state ? formatCurrency(state.expected) : "…"}
            </p>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              Caisse ouverte à {timeLabel(session.openedAt)}
              {session.openedByName ? ` par ${session.openedByName}` : ""}
            </p>

            {state ? (
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-3">
                <Cell label="Fond de départ" value={state.opening} />
                <Cell label="Ventes espèces" value={state.cashSales} positive />
                <Cell label="Entrées / sorties" value={state.movements} signed />
              </dl>
            ) : null}

            <p className="mt-2.5 text-[11px] leading-relaxed text-neutral-500">
              Espèces uniquement. L&apos;Orange Money, Moov et Wave encaissés
              aujourd&apos;hui ne sont pas dans le tiroir.
            </p>
          </FsCard>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMoveSheet("withdrawal")}
              className={cn(btnOutline, "min-h-12")}
            >
              <MdArrowUpward className="h-5 w-5" aria-hidden />
              Sortie
            </button>
            <button
              type="button"
              onClick={() => setMoveSheet("deposit")}
              className={cn(btnOutline, "min-h-12")}
            >
              <MdArrowDownward className="h-5 w-5" aria-hidden />
              Apport
            </button>
            <Link
              href={`${ROUTES.stores}/${storeId}/pos-quick`}
              className={cn(btnOutline, "col-span-2 min-h-12")}
            >
              <MdPointOfSale className="h-5 w-5" aria-hidden />
              Ouvrir la caisse rapide
            </Link>
            <button
              type="button"
              onClick={() => setCloseSheet(true)}
              className={cn(btnPrimary, "col-span-2 min-h-12")}
            >
              <MdAccountBalanceWallet className="h-5 w-5" aria-hidden />
              Clôturer et compter
            </button>
          </div>

          {daily.length > 0 ? (
            <FsCard className="mt-3" padding="p-0">
              <p className="border-b border-black/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Entrées et sorties du jour
              </p>
              <ul className="divide-y divide-black/[0.05]">
                {daily.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fs-text">
                        {CASH_MOVEMENT_LABELS[m.type as CashMovementType] ?? m.type}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        {timeLabel(m.createdAt)}
                        {m.createdByName ? ` · ${m.createdByName}` : ""}
                        {m.notes ? ` · ${m.notes}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-bold tabular-nums",
                        m.amount < 0
                          ? "text-rose-700 dark:text-rose-400"
                          : "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {m.amount > 0 ? "+" : ""}
                      {formatCurrency(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </FsCard>
          ) : null}
        </>
      )}

      {/* ── Ouvrir ── */}
      <RestaurantSheet
        open={openSheet}
        title="Ouvrir la caisse"
        subtitle="Combien y a-t-il dans le tiroir avant la première vente ?"
        onClose={() => setOpenSheet(false)}
        footer={
          <OpenFooter busy={openMut.isPending} onSubmit={(v) => openMut.mutate(v)} />
        }
      >
        <p className="rounded-[10px] bg-fs-surface-container px-3 py-2 text-xs leading-relaxed text-neutral-600">
          C&apos;est le fond de caisse : la monnaie laissée pour rendre. Sans lui, le
          compte du soir ne peut rien prouver.
        </p>
      </RestaurantSheet>

      {/* ── Entrée / sortie ── */}
      {moveSheet ? (
        <MovementSheet
          type={moveSheet}
          busy={moveMut.isPending}
          onClose={() => setMoveSheet(null)}
          onSubmit={(p) => moveMut.mutate({ type: moveSheet, ...p })}
        />
      ) : null}

      {/* ── Clôture ── */}
      {closeSheet && session ? (
        <CloseSheet
          expected={state?.expected ?? 0}
          busy={closeMut.isPending}
          onClose={() => setCloseSheet(false)}
          onSubmit={(p) => closeMut.mutate(p)}
        />
      ) : null}

      {/* ── Résultat de clôture ── */}
      {result ? (
        <RestaurantSheet
          open
          title="Caisse clôturée"
          onClose={() => setResult(null)}
          footer={
            <button
              type="button"
              onClick={() => setResult(null)}
              className={cn(btnPrimary, "w-full")}
            >
              Terminé
            </button>
          }
        >
          <div
            className={cn(
              "rounded-[12px] border p-4 text-center",
              Math.abs(result.variance) < 1
                ? "border-emerald-500/30 bg-emerald-500/[0.07]"
                : result.variance < 0
                  ? "border-rose-500/30 bg-rose-500/[0.07]"
                  : "border-amber-500/30 bg-amber-500/[0.07]",
            )}
          >
            <p className="text-xs font-medium text-neutral-600">Écart de caisse</p>
            <p
              className={cn(
                "mt-1 text-3xl font-extrabold tabular-nums leading-none",
                Math.abs(result.variance) < 1
                  ? "text-emerald-700 dark:text-emerald-400"
                  : result.variance < 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-amber-700 dark:text-amber-400",
              )}
            >
              {result.variance > 0 ? "+" : ""}
              {formatCurrency(result.variance)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-600">
              {Math.abs(result.variance) < 1
                ? "La caisse tombe juste."
                : result.variance < 0
                  ? "Il manque de l'argent dans le tiroir. Vérifiez les sorties non notées avant de chercher ailleurs."
                  : "Il y a plus que prévu. Une vente encaissée en espèces a peut-être été enregistrée en mobile money."}
            </p>
          </div>

          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Fond de départ" value={result.opening} />
            <Row label="Ventes en espèces" value={result.cashSales} />
            <Row label="Entrées / sorties" value={result.movements} signed />
            <Row label="Attendu" value={result.expected} strong />
            <Row label="Compté" value={result.counted} strong />
          </dl>
        </RestaurantSheet>
      ) : null}
    </FsPage>
  );
}

function OpenFooter({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("0");
  return (
    <div className="space-y-2">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={fsInputClass("text-lg font-bold")}
        aria-label="Fond de caisse"
        autoFocus
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => onSubmit(Math.max(0, Number(amount) || 0))}
        className={cn(btnPrimary, "w-full min-h-12")}
      >
        <MdLockOpen className="h-5 w-5" aria-hidden />
        Ouvrir la caisse
      </button>
    </div>
  );
}

function MovementSheet({
  type,
  busy,
  onClose,
  onSubmit,
}: {
  type: CashMovementType;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: { amount: number; notes: string | null }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const out = type === "withdrawal" || type === "expense";

  return (
    <RestaurantSheet
      open
      title={out ? "Sortie de caisse" : "Apport en caisse"}
      subtitle={
        out
          ? "L'argent qui quitte le tiroir sans être une vente."
          : "L'argent ajouté au tiroir en cours de journée."
      }
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || (Number(amount) || 0) <= 0}
          onClick={() =>
            onSubmit({
              amount: Math.abs(Number(amount) || 0),
              notes: notes.trim() || null,
            })
          }
          className={cn(btnPrimary, "w-full min-h-12")}
        >
          {out ? <MdRemove className="h-5 w-5" aria-hidden /> : <MdAdd className="h-5 w-5" aria-hidden />}
          Enregistrer
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">Montant</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={fsInputClass("text-lg font-bold")}
            autoFocus
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            Toujours en positif : c&apos;est le sens du mouvement qui décide du signe.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">Motif</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={out ? "Achat de charbon, avance au cuisinier…" : "Appoint de monnaie…"}
            className={fsInputClass()}
          />
        </label>
        {out ? (
          <div className="flex flex-wrap gap-1.5">
            {["Achat charbon", "Achat glace", "Avance personnel", "Taxi course"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNotes(s)}
                className="fs-touch-target rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-neutral-700 active:bg-neutral-100"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </RestaurantSheet>
  );
}

function CloseSheet({
  expected,
  busy,
  onClose,
  onSubmit,
}: {
  expected: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: { counted: number; notes: string | null }) => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [reveal, setReveal] = useState(false);

  const value = Number(counted) || 0;
  const variance = value - expected;

  return (
    <RestaurantSheet
      open
      title="Clôturer la caisse"
      subtitle="Comptez d'abord, comparez ensuite."
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || counted.trim().length === 0}
          onClick={() => onSubmit({ counted: Math.max(0, value), notes: notes.trim() || null })}
          className={cn(btnPrimary, "w-full min-h-12")}
        >
          Clôturer
        </button>
      }
    >
      <div className="space-y-3">
        {/*
          Le montant attendu est CACHÉ tant qu'on n'a pas saisi le compte réel.
          L'afficher d'abord, c'est inviter à recopier le chiffre du logiciel au lieu
          de compter le tiroir — et une clôture recopiée ne prouve rien.
        */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Montant compté dans le tiroir
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className={fsInputClass("text-xl font-extrabold")}
            autoFocus
          />
        </label>

        {counted.trim().length === 0 ? (
          <button
            type="button"
            onClick={() => setReveal(true)}
            className="fs-touch-target w-full rounded-[10px] bg-fs-surface-container px-3 py-2.5 text-xs leading-relaxed text-neutral-600"
          >
            {reveal
              ? `Attendu : ${formatCurrency(expected)}`
              : "Comptez d'abord le tiroir. Toucher ici affiche le montant attendu — mais une clôture recopiée ne prouve rien."}
          </button>
        ) : (
          <div
            className={cn(
              "rounded-[10px] border px-3 py-2.5",
              Math.abs(variance) < 1
                ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                : "border-amber-500/30 bg-amber-500/[0.06]",
            )}
          >
            <p className="flex items-center justify-between text-xs text-neutral-600">
              <span>Attendu</span>
              <span className="font-bold tabular-nums text-fs-text">
                {formatCurrency(expected)}
              </span>
            </p>
            <p className="mt-1 flex items-center justify-between text-sm font-bold">
              <span className="text-neutral-700">Écart</span>
              <span
                className={cn(
                  "tabular-nums",
                  Math.abs(variance) < 1
                    ? "text-emerald-700 dark:text-emerald-400"
                    : variance < 0
                      ? "text-rose-700 dark:text-rose-400"
                      : "text-amber-700 dark:text-amber-400",
                )}
              >
                {variance > 0 ? "+" : ""}
                {formatCurrency(variance)}
              </span>
            </p>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Observation
          </span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ce qui explique l'écart, s'il y en a un."
            className={fsInputClass()}
          />
        </label>
      </div>
    </RestaurantSheet>
  );
}

function Cell({
  label,
  value,
  positive,
  signed,
}: {
  label: string;
  value: number;
  positive?: boolean;
  signed?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-neutral-500">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums",
          signed && value < 0
            ? "text-rose-700 dark:text-rose-400"
            : positive
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-fs-text",
        )}
      >
        {signed && value > 0 ? "+" : ""}
        {formatCurrency(value)}
      </dd>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  signed,
}: {
  label: string;
  value: number;
  strong?: boolean;
  signed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={cn("text-neutral-600", strong && "font-semibold text-fs-text")}>
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums text-fs-text",
          strong ? "font-extrabold" : "font-medium",
        )}
      >
        {signed && value > 0 ? "+" : ""}
        {formatCurrency(value)}
      </dd>
    </div>
  );
}

/* ═══════════════════════════ Historique des sessions ═══════════════════════════ */

function SessionsView() {
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const [page, setPage] = useState(0);

  const storeNames = useMemo(
    () => new Map((ctx.data?.stores ?? []).map((s) => [s.id, s.name])),
    [ctx.data?.stores],
  );
  const storeIds = useMemo(
    () => (storeId ? [storeId] : (ctx.data?.stores ?? []).map((s) => s.id)),
    [storeId, ctx.data?.stores],
  );

  const listQ = useQuery({
    queryKey: queryKeys.restaurantCashSessions(companyId, storeId, page),
    queryFn: () =>
      listCashSessions({
        storeIds,
        storeNames,
        limit: RESTAURANT_PAGE_SIZE,
        offset: page * RESTAURANT_PAGE_SIZE,
      }),
    enabled: Boolean(companyId && storeIds.length > 0),
    staleTime: 60_000,
  });

  const rows = useMemo(() => listQ.data?.rows ?? [], [listQ.data]);

  if (!companyId) return null;

  return (
    <FsPage>
      <FsScreenHeader
        title="Sessions de caisse"
        subtitle="Chaque journée : le fond du matin, le compte du soir, et l'écart."
      />

      {listQ.isError ? (
        <FsQueryErrorPanel error={listQ.error} onRetry={() => void listQ.refetch()} />
      ) : listQ.isPending ? (
        <div className="mt-10 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <RestaurantEmptyCard
          icon={MdAccountBalanceWallet}
          title="Aucune session"
          message="Ouvrez votre première caisse depuis le poste de caisse."
          action={
            <Link href="/restaurant/caisse" className={btnPrimary}>
              Aller au poste de caisse
            </Link>
          }
        />
      ) : (
        <>
          <FsCard padding="p-0">
            <ul className="divide-y divide-black/[0.06]">
              {rows.map((s) => {
                /*
                 * L'écart n'est calculable ici que si la session est close : le montant
                 * attendu vient d'un calcul serveur qu'on ne refait pas pour chaque
                 * ligne d'un historique. On montre donc ce qui est certain — fond,
                 * compté — et on laisse la clôture porter l'écart détaillé.
                 */
                const closed = s.status === "closed";
                return (
                  <li key={s.id} className="px-3 py-2.5 sm:px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-fs-text">
                          {dateTimeLabel(s.openedAt)}
                          {closed ? ` → ${timeLabel(s.closedAt)}` : ""}
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          {s.openedByName ? `${s.openedByName} · ` : ""}
                          Fond {formatCurrency(s.openingAmount)}
                          {s.storeName ? ` · ${s.storeName}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                          closed
                            ? "bg-neutral-500/10 text-neutral-600"
                            : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {closed ? "Clôturée" : "Ouverte"}
                      </span>
                    </div>
                    {closed && s.closingAmount !== null ? (
                      <p className="mt-1 text-xs text-neutral-700">
                        Compté à la fermeture :{" "}
                        <span className="font-bold tabular-nums text-fs-text">
                          {formatCurrency(s.closingAmount)}
                        </span>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </FsCard>

          <FsPager
            page={page}
            hasMore={listQ.data?.hasMore ?? false}
            pageSize={RESTAURANT_PAGE_SIZE}
            rowsOnPage={rows.length}
            busy={listQ.isFetching}
            onPageChange={setPage}
            itemLabel="Sessions"
            className="mt-3"
          />
        </>
      )}
    </FsPage>
  );
}
