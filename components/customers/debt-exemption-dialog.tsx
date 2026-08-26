"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { messageFromUnknownError } from "@/lib/toast";
import type { DebtExemption } from "@/lib/features/credit/debt-exemptions";
import type { Customer } from "@/lib/features/customers/types";
import { cn } from "@/lib/utils/cn";
import {
  formatOperationCalendarDayYmd,
  operationTodayYmd,
} from "@/lib/utils/operation-datetime";
import { useMemo, useState } from "react";
import {
  MdAllInclusive,
  MdCalendarMonth,
  MdCheckCircle,
  MdClose,
  MdCreditScore,
  MdErrorOutline,
  MdInfoOutline,
  MdLockOpen,
  MdToday,
} from "react-icons/md";

type Duration = "today" | "7d" | "30d" | "always" | "custom";

const DURATIONS: Array<{ id: Duration; label: string; icon: typeof MdToday }> = [
  { id: "today", label: "Aujourd'hui", icon: MdToday },
  { id: "7d", label: "7 jours", icon: MdCalendarMonth },
  { id: "30d", label: "30 jours", icon: MdCalendarMonth },
  { id: "always", label: "Sans limite", icon: MdAllInclusive },
  { id: "custom", label: "Jusqu'au…", icon: MdCalendarMonth },
];

/** `YYYY-MM-DD` du jour d'exploitation + n jours (fuseau de l'entreprise). */
function ymdPlusDays(days: number): string {
  const today = operationTodayYmd();
  const [y, m, d] = today.split("-").map((s) => Number(s));
  // Midi UTC : aucun basculement de jour, quel que soit le décalage du poste.
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function untilFor(duration: Duration, customDate: string): string | null {
  switch (duration) {
    case "today":
      return operationTodayYmd();
    case "7d":
      return ymdPlusDays(7);
    case "30d":
      return ymdPlusDays(30);
    case "custom":
      return customDate || null;
    case "always":
    default:
      return null;
  }
}

/**
 * « Ce client peut acheter même s'il doit encore de l'argent. »
 *
 * Le propriétaire lève sa propre règle pour une personne précise, en écrivant
 * pourquoi et jusqu'à quand. C'est volontairement un dialogue et non un simple
 * interrupteur : une dérogation qu'on accorde sans motif ni échéance, c'est une
 * ardoise qui grossit six mois plus tard sans que personne se souvienne pourquoi.
 */
export function DebtExemptionDialog(props: {
  open: boolean;
  customer: Customer | null;
  /** Autorisation en cours de ce client, ou `null`. */
  exemption: DebtExemption | null;
  /** Le refus pour dette est-il activé dans Paramètres ? */
  blockOnDebt: boolean;
  busy: boolean;
  onClose: () => void;
  onGrant: (value: { until: string | null; note: string }) => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const { open, customer, exemption } = props;
  if (!open || !customer) return null;
  /*
   * Remonté à chaque ouverture (et à chaque changement de client) : le formulaire part
   * de l'état réel de l'autorisation, sans effet de réinitialisation à écrire.
   */
  return (
    <DebtExemptionForm
      key={`${customer.id}:${exemption?.at ?? "none"}`}
      {...props}
      customer={customer}
      exemption={exemption}
    />
  );
}

function DebtExemptionForm({
  customer,
  exemption,
  blockOnDebt,
  busy,
  onClose,
  onGrant,
  onRevoke,
}: {
  customer: Customer;
  exemption: DebtExemption | null;
  blockOnDebt: boolean;
  busy: boolean;
  onClose: () => void;
  onGrant: (value: { until: string | null; note: string }) => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const [duration, setDuration] = useState<Duration>(
    exemption?.until ? "custom" : "always",
  );
  const [customDate, setCustomDate] = useState(exemption?.until ?? "");
  const [note, setNote] = useState(exemption?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const today = operationTodayYmd();

  const summary = useMemo(() => {
    const until = untilFor(duration, customDate);
    if (until == null) return "Autorisé tant que vous ne retirez pas l'autorisation.";
    if (until === today) return "Autorisé aujourd'hui seulement.";
    return `Autorisé jusqu'au ${formatOperationCalendarDayYmd(until)} inclus.`;
  }, [duration, customDate, today]);

  const who = customer.name?.trim() || customer.phone?.trim() || "Ce client";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="debt-exemption-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <FsCard
        className="w-full max-w-[460px] rounded-b-none rounded-t-2xl border-x-0 border-b-0 shadow-xl sm:rounded-2xl sm:border-x sm:border-b"
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,780px)] flex-col">
          <div
            className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
            aria-hidden
          />

          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-4 pb-3 pt-3.5 sm:px-5 sm:pt-5">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                )}
                aria-hidden
              >
                <MdCreditScore className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2
                  id="debt-exemption-title"
                  className="text-lg font-semibold leading-snug text-fs-text"
                >
                  Autoriser malgré une dette
                </h2>
                <p className="mt-0.5 truncate text-sm text-neutral-600">
                  {who}
                  {customer.phone?.trim() && customer.name?.trim()
                    ? ` · ${customer.phone.trim()}`
                    : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container disabled:opacity-60 sm:h-10 sm:w-10"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {error ? (
              <div className="mb-4 rounded-lg border border-red-200/80 bg-red-50/90 p-3 dark:border-red-900 dark:bg-red-950/50">
                <div className="flex gap-2.5">
                  <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
                  <p className="text-xs font-medium leading-snug text-red-800 dark:text-red-200 sm:text-sm">
                    {error}
                  </p>
                </div>
              </div>
            ) : null}

            {exemption ? (
              <div className="mb-4 flex gap-2.5 rounded-[10px] bg-emerald-500/10 px-3 py-2.5">
                <MdCheckCircle
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
                  <b>Déjà autorisé</b>
                  {exemption.until
                    ? ` jusqu'au ${formatOperationCalendarDayYmd(exemption.until)} inclus`
                    : " sans limite de date"}
                  {exemption.note ? ` — « ${exemption.note} »` : ""}. Vous pouvez changer
                  la durée ci-dessous, ou retirer l&apos;autorisation.
                </p>
              </div>
            ) : null}

            {!blockOnDebt ? (
              <div className="mb-4 flex gap-2.5 rounded-[10px] bg-amber-500/10 px-3 py-2.5">
                <MdInfoOutline
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                  Le refus de vente pour dette n&apos;est pas activé (Paramètres › Vente au
                  nom d&apos;un client) : pour l&apos;instant, <b>tous</b> vos clients peuvent
                  acheter en devant de l&apos;argent. Cette autorisation sera prête le jour où
                  vous activerez la règle.
                </p>
              </div>
            ) : (
              <p className="mb-4 text-xs leading-relaxed text-neutral-600 sm:text-sm">
                Votre caisse refuse une vente à un client qui doit encore de
                l&apos;argent. {who} en sera dispensé : la vente passera, et le caissier
                verra à l&apos;écran que c&apos;est vous qui l&apos;avez autorisé.
              </p>
            )}

            <p className="mb-1.5 text-[13px] font-medium text-neutral-700">
              Durée de l&apos;autorisation
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => {
                const active = duration === d.id;
                const Icon = d.icon;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDuration(d.id);
                      if (d.id === "custom" && !customDate) setCustomDate(ymdPlusDays(30));
                    }}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors sm:min-h-0 sm:py-2",
                      active
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-fs-surface-container text-neutral-700 ring-1 ring-black/[0.06] active:bg-black/[0.04]",
                    )}
                    aria-pressed={active}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {d.label}
                  </button>
                );
              })}
            </div>

            {duration === "custom" ? (
              <input
                type="date"
                className={fsInputClass("mt-3 min-h-12 rounded-[10px] px-3 text-base sm:min-h-0 sm:text-sm")}
                value={customDate}
                min={today}
                onChange={(e) => setCustomDate(e.target.value)}
                aria-label="Autoriser jusqu'au"
              />
            ) : null}

            <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <MdLockOpen className="h-4 w-4 shrink-0" aria-hidden />
              {summary}
            </p>

            <div className="mt-4">
              <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">
                Motif (facultatif, mais recommandé)
              </label>
              <textarea
                className={fsInputClass("min-h-[84px] resize-none rounded-[10px] px-3 py-2.5 text-base sm:text-sm")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Ex. Client en compte, règle le 30 de chaque mois."
              />
            </div>
          </div>

          <div
            className={cn(
              "shrink-0 border-t border-black/6 bg-fs-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              {exemption ? (
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    try {
                      await onRevoke();
                      onClose();
                    } catch (e) {
                      setError(messageFromUnknownError(e, "Retrait impossible."));
                    }
                  }}
                  disabled={busy}
                  className="min-h-11 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold text-red-600 active:bg-fs-surface-container disabled:opacity-60 sm:mr-auto sm:w-auto"
                >
                  Retirer l&apos;autorisation
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="min-h-11 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold text-fs-accent active:bg-fs-surface-container disabled:opacity-60 sm:w-auto sm:min-w-[100px]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  const until = untilFor(duration, customDate);
                  if (duration === "custom") {
                    if (!customDate) {
                      setError("Choisissez la date de fin.");
                      return;
                    }
                    if (customDate < today) {
                      setError("Cette date est déjà passée.");
                      return;
                    }
                  }
                  try {
                    await onGrant({ until, note });
                    onClose();
                  } catch (e) {
                    setError(messageFromUnknownError(e, "Enregistrement impossible."));
                  }
                }}
                disabled={busy}
                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-emerald-600 px-4 py-3 text-base font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-60 sm:mb-0 sm:min-h-0 sm:w-auto sm:min-w-[150px] sm:py-2.5 sm:text-sm sm:font-semibold"
              >
                {busy ? (
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <MdCreditScore className="h-5 w-5" aria-hidden />
                    {exemption ? "Mettre à jour" : "Autoriser"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </FsCard>
    </div>
  );
}
