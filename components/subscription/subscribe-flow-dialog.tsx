"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { useEffect, useMemo, useState } from "react";
import {
  MdCheckCircle,
  MdClose,
  MdErrorOutline,
  MdRadioButtonChecked,
  MdRadioButtonUnchecked,
} from "react-icons/md";
import {
  SUBSCRIPTION_PAYMENT_METHODS,
  paymentRequiresTransactionId,
  subscriptionPaymentLabel,
  type SubscriptionPlan,
  type SubscriptionRequestInput,
} from "@/lib/features/subscription/types";

const STEPS = ["Période", "Informations", "Confirmation"] as const;

const labelClass = "mb-1.5 block text-[13px] font-medium leading-tight text-neutral-700";
const inputOutline =
  "min-h-12 rounded-[10px] border border-black/8 px-3 text-base touch-manipulation sm:min-h-0 sm:text-sm";

export function SubscribeFlowDialog({
  open,
  onClose,
  plans,
  monthlyEquivalent,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  plans: SubscriptionPlan[];
  /** Prix mensuel de référence (pour calculer l'économie annuelle). */
  monthlyEquivalent: number | null;
  onSubmit: (input: SubscriptionRequestInput) => Promise<void>;
}) {
  const monthly = useMemo(
    () => plans.find((p) => p.interval === "month") ?? null,
    [plans],
  );
  const annual = useMemo(
    () => plans.find((p) => p.interval === "year") ?? null,
    [plans],
  );

  const [step, setStep] = useState(0);
  const [planId, setPlanId] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("orange_money");
  const [transactionId, setTransactionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPlanId(annual?.id ?? monthly?.id ?? "");
    setFirstName("");
    setLastName("");
    setPhone("");
    setCity("");
    setPaymentMethod("orange_money");
    setTransactionId("");
    setBusy(false);
    setError(null);
    setDone(false);
  }, [open, annual?.id, monthly?.id]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === planId) ?? null,
    [plans, planId],
  );

  if (!open) return null;

  const needsTxn = paymentRequiresTransactionId(paymentMethod);

  function validateStep1(): boolean {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Nom et prénom requis.");
      return false;
    }
    if (phone.trim().length < 6) {
      setError("Numéro de téléphone requis.");
      return false;
    }
    if (needsTxn && !transactionId.trim()) {
      setError("L'ID de la transaction est requis pour ce mode de paiement.");
      return false;
    }
    setError(null);
    return true;
  }

  async function handleConfirm() {
    if (!selectedPlan) {
      setError("Choisissez un plan.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await onSubmit({
        planId: selectedPlan.id,
        billingInterval: selectedPlan.interval,
        amountCents: selectedPlan.priceCents,
        currency: selectedPlan.currency,
        firstName,
        lastName,
        phone,
        city,
        paymentMethod,
        transactionId,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscribe-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <FsCard
        className={cn(
          "max-h-[min(94dvh,820px)] w-full max-w-[520px] shadow-xl",
          "rounded-t-2xl rounded-b-none border-x-0 border-b-0 sm:rounded-2xl sm:border-x sm:border-b",
        )}
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,820px)] flex-col">
          <div
            className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
            aria-hidden
          />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-4 pb-3 pt-3.5 sm:px-5 sm:pt-5">
            <h2 id="subscribe-title" className="text-lg font-semibold leading-snug text-fs-text">
              {done ? "Demande envoyée" : "Souscrire / Renouveler"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container disabled:opacity-50 sm:h-10 sm:w-10"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Stepper */}
          {!done ? (
            <div className="flex shrink-0 items-center gap-1.5 px-4 py-3 sm:px-5">
              {STEPS.map((label, i) => (
                <div key={label} className="flex flex-1 items-center gap-1.5">
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                      i <= step
                        ? "bg-fs-accent text-white"
                        : "bg-fs-surface-container text-neutral-500",
                    )}
                  >
                    {i + 1}
                  </div>
                  <span
                    className={cn(
                      "hidden text-xs font-medium sm:inline",
                      i <= step ? "text-fs-text" : "text-neutral-400",
                    )}
                  >
                    {label}
                  </span>
                  {i < STEPS.length - 1 ? (
                    <span
                      className={cn(
                        "h-0.5 flex-1 rounded-full",
                        i < step ? "bg-fs-accent" : "bg-fs-surface-container",
                      )}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {error ? (
              <div className="mb-4 rounded-lg border border-red-200/80 bg-red-50/90 p-3">
                <div className="flex gap-2.5">
                  <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
                  <p className="text-xs font-medium leading-snug text-red-800 sm:text-sm">
                    {error}
                  </p>
                </div>
              </div>
            ) : null}

            {done ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <MdCheckCircle className="h-16 w-16 text-emerald-500" aria-hidden />
                <p className="text-base font-semibold text-fs-text">
                  Votre demande a bien été envoyée.
                </p>
                <p className="max-w-sm text-sm text-neutral-600">
                  Elle sera validée après vérification du paiement. Votre abonnement
                  sera activé dès confirmation. Vous pouvez fermer cette fenêtre.
                </p>
              </div>
            ) : step === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-neutral-600">
                  Choisissez la formule qui vous convient.
                </p>
                {monthly ? (
                  <PlanCard
                    plan={monthly}
                    selected={planId === monthly.id}
                    onSelect={() => setPlanId(monthly.id)}
                    subtitle="Facturé chaque mois"
                  />
                ) : null}
                {annual ? (
                  <PlanCard
                    plan={annual}
                    selected={planId === annual.id}
                    onSelect={() => setPlanId(annual.id)}
                    subtitle="Facturé une fois par an"
                    badge={
                      monthlyEquivalent && monthlyEquivalent > 0
                        ? `Économisez ${formatCurrency(monthlyEquivalent * 12 - annual.priceCents)}`
                        : undefined
                    }
                  />
                ) : null}
              </div>
            ) : step === 1 ? (
              <div className="flex flex-col gap-4 sm:gap-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                  <div>
                    <label htmlFor="sub-first" className={labelClass}>
                      Prénom *
                    </label>
                    <input
                      id="sub-first"
                      className={fsInputClass(inputOutline)}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label htmlFor="sub-last" className={labelClass}>
                      Nom *
                    </label>
                    <input
                      id="sub-last"
                      className={fsInputClass(inputOutline)}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="sub-phone" className={labelClass}>
                    Téléphone *
                  </label>
                  <input
                    id="sub-phone"
                    className={fsInputClass(inputOutline)}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+226 …"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label htmlFor="sub-city" className={labelClass}>
                    Ville
                  </label>
                  <input
                    id="sub-city"
                    className={fsInputClass(inputOutline)}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ouagadougou, Bobo-Dioulasso…"
                  />
                </div>
                <div>
                  <label className={labelClass}>Méthode de paiement *</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {SUBSCRIPTION_PAYMENT_METHODS.map((m) => {
                      const sel = paymentMethod === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setPaymentMethod(m.key)}
                          className={cn(
                            "flex items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                            sel
                              ? "border-fs-accent bg-fs-accent/[0.06] text-fs-accent"
                              : "border-black/[0.08] bg-fs-card text-neutral-800",
                          )}
                        >
                          {sel ? (
                            <MdRadioButtonChecked className="h-4 w-4 shrink-0" aria-hidden />
                          ) : (
                            <MdRadioButtonUnchecked
                              className="h-4 w-4 shrink-0 text-neutral-400"
                              aria-hidden
                            />
                          )}
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {needsTxn ? (
                  <div>
                    <label htmlFor="sub-txn" className={labelClass}>
                      ID de la transaction *
                    </label>
                    <input
                      id="sub-txn"
                      className={fsInputClass(inputOutline)}
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="Réf. du paiement Mobile Money / virement"
                    />
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Numéro de référence reçu après le paiement (pour vérification).
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-600">
                  Vérifiez les informations avant d&apos;envoyer.
                </p>
                <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
                  <RecapRow label="Formule" value={selectedPlan?.name ?? "—"} />
                  <RecapRow
                    label="Montant"
                    value={
                      selectedPlan
                        ? `${formatCurrency(selectedPlan.priceCents)} / ${
                            selectedPlan.interval === "year" ? "an" : "mois"
                          }`
                        : "—"
                    }
                    strong
                  />
                  <RecapRow label="Nom" value={`${firstName} ${lastName}`.trim() || "—"} />
                  <RecapRow label="Téléphone" value={phone || "—"} />
                  {city ? <RecapRow label="Ville" value={city} /> : null}
                  <RecapRow label="Paiement" value={subscriptionPaymentLabel(paymentMethod)} />
                  {needsTxn ? (
                    <RecapRow label="ID transaction" value={transactionId || "—"} />
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className={cn(
              "shrink-0 border-t border-black/6 bg-fs-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4",
              "pb-[calc(5.75rem+var(--fs-safe-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            {done ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-fs-accent px-4 py-3 text-base font-bold text-white sm:text-sm sm:font-semibold"
              >
                Fermer
              </button>
            ) : (
              <div className="flex gap-2.5">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep((s) => Math.max(0, s - 1));
                    }}
                    disabled={busy}
                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-black/[0.08] bg-fs-card px-4 py-3 text-sm font-semibold text-neutral-800 disabled:opacity-60 sm:flex-none sm:px-5"
                  >
                    Précédent
                  </button>
                ) : null}
                {step < 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 0 && !planId) {
                        setError("Choisissez un plan.");
                        return;
                      }
                      if (step === 1 && !validateStep1()) return;
                      setError(null);
                      setStep((s) => Math.min(2, s + 1));
                    }}
                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[10px] bg-fs-accent px-4 py-3 text-base font-bold text-white sm:text-sm sm:font-semibold"
                  >
                    Continuer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={busy}
                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[10px] bg-fs-accent px-4 py-3 text-base font-bold text-white disabled:opacity-60 sm:text-sm sm:font-semibold"
                  >
                    {busy ? (
                      <span
                        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                        aria-hidden
                      />
                    ) : (
                      "Valider la demande"
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </FsCard>
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  onSelect,
  subtitle,
  badge,
}: {
  plan: SubscriptionPlan;
  selected: boolean;
  onSelect: () => void;
  subtitle: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
        selected
          ? "border-fs-accent bg-fs-accent/[0.05] ring-1 ring-fs-accent/30"
          : "border-black/[0.08] bg-fs-card hover:bg-fs-surface-container",
      )}
    >
      {selected ? (
        <MdRadioButtonChecked className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
      ) : (
        <MdRadioButtonUnchecked className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-fs-text">{plan.name}</p>
          {badge ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-neutral-500">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-bold text-fs-accent">{formatCurrency(plan.priceCents)}</p>
        <p className="text-[11px] text-neutral-500">
          / {plan.interval === "year" ? "an" : "mois"}
        </p>
      </div>
    </button>
  );
}

function RecapRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span
        className={cn(
          "text-right text-sm",
          strong ? "font-bold text-fs-accent" : "font-medium text-fs-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}
