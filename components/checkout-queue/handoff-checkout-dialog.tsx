"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MdClose,
  MdCreditCard,
  MdPayments,
  MdPhoneIphone,
  MdReceiptLong,
  MdSchedule,
  MdWarningAmber,
} from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  buildMobileMoneyReference,
  mobileMoneyProviderLabel,
  MOBILE_MONEY_PROVIDERS,
  type MobileMoneyProvider,
} from "@/lib/features/payments/payment-display";
import {
  handoffLineTotal,
  handoffUnitCount,
  waitingLabel,
  type PosHandoff,
} from "@/lib/features/dual-cashier/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

/** Modes proposés au caissier — mêmes intitulés qu'en caisse rapide, à dessein. */
type PayMode = "cash" | "card" | "mobile_money" | "mixed" | "credit";

export type HandoffCheckoutSubmit = {
  payments: Array<{
    method: "cash" | "mobile_money" | "card" | "other";
    amount: number;
    reference?: string | null;
  }>;
  discount: number;
  customerId: string | null;
  creditDueAt: string | null;
};

/** Échéance de crédit saisie en `yyyy-mm-dd` → instant ISO (minuit local). */
function dueIso(yyyyMmDd: string): string | null {
  const s = yyyyMmDd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * L'écran d'encaissement d'un bon.
 *
 * Il ne redemande PAS ce que le vendeur a déjà fait (les articles sont là, en lecture
 * seule) et ne demande QUE ce qui se décide au comptoir, l'argent à la main : comment le
 * client paie, combien il donne, et — si le patron l'a autorisé — la remise et le crédit.
 *
 * Le total est écrit en très gros et reste visible sans faire défiler : c'est le seul
 * chiffre que le caissier annonce à voix haute, et l'erreur la plus coûteuse de la
 * journée serait de le lire à moitié.
 */
export function HandoffCheckoutDialog({
  handoff,
  customers,
  providers,
  allowCard,
  allowSplit,
  allowCredit,
  hideCustomer,
  busy,
  onClose,
  onSubmit,
}: {
  handoff: PosHandoff;
  customers: Array<{ id: string; name: string }>;
  /** Opérateurs mobile money proposés (réglage entreprise « encaissement »). */
  providers: MobileMoneyProvider[];
  allowCard: boolean;
  allowSplit: boolean;
  allowCredit: boolean;
  hideCustomer: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: HandoffCheckoutSubmit) => void;
}) {
  const [mode, setMode] = useState<PayMode>("cash");
  const [provider, setProvider] = useState<MobileMoneyProvider | null>(
    providers.length === 1 ? providers[0]! : null,
  );
  const [amountReceived, setAmountReceived] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [discountStr, setDiscountStr] = useState(
    handoff.discount > 0 ? String(Math.round(handoff.discount)) : "",
  );
  const [customerId, setCustomerId] = useState(handoff.customerId ?? "");
  const [creditDown, setCreditDown] = useState("");
  const [creditDue, setCreditDue] = useState("");

  // Attente affichée en direct : le caissier voit vieillir le bon pendant qu'il encaisse.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const discountValue = Math.max(0, Math.round(toNumber(discountStr)));
  const total = Math.max(0, handoff.subtotal - discountValue);

  const receivedValue = Math.max(0, toNumber(amountReceived));
  const change = Math.max(0, receivedValue - total);
  const splitCashValue = Math.min(Math.max(0, toNumber(splitCash)), total);
  const splitMobileValue = Math.max(0, total - splitCashValue);
  const creditDownValue = Math.min(Math.max(0, toNumber(creditDown)), total);
  const creditRemaining = Math.max(0, total - creditDownValue);

  const modes = useMemo(() => {
    const list: Array<{ id: PayMode; label: string }> = [{ id: "cash", label: "ESPÈCES" }];
    if (allowCard) list.push({ id: "card", label: "CARTE" });
    list.push({
      id: "mobile_money",
      label:
        providers.length === 1
          ? (MOBILE_MONEY_PROVIDERS.find((p) => p.id === providers[0])?.short ?? "MOBILE").toUpperCase()
          : "MOBILE",
    });
    if (allowSplit) list.push({ id: "mixed", label: "MIXTE" });
    if (allowCredit) list.push({ id: "credit", label: "CRÉDIT" });
    return list;
  }, [allowCard, allowSplit, allowCredit, providers]);

  const needsProvider = mode === "mobile_money" || mode === "mixed";
  const customerName = customers.find((c) => c.id === customerId)?.name ?? null;

  /** Ce qui manque pour pouvoir encaisser, dit en clair plutôt qu'en bouton grisé muet. */
  const blocker = useMemo((): string | null => {
    if (total <= 0) return "Le total est à zéro : vérifiez la remise.";
    if (needsProvider && !provider) return "Choisissez l'opérateur mobile money.";
    if (mode === "mixed" && splitCashValue <= 0) {
      return "Indiquez la part payée en espèces.";
    }
    if (mode === "mixed" && splitCashValue >= total) {
      return "La part en espèces couvre déjà tout : choisissez « ESPÈCES ».";
    }
    if (mode === "credit" && !customerId) {
      return "Une vente à crédit exige un client : c'est lui qui devra l'argent.";
    }
    if (mode === "credit" && creditRemaining <= 0) {
      return "Le client règle tout : choisissez « ESPÈCES » plutôt que « CRÉDIT ».";
    }
    return null;
  }, [
    total,
    needsProvider,
    provider,
    mode,
    splitCashValue,
    customerId,
    creditRemaining,
  ]);

  function buildPayments(): HandoffCheckoutSubmit["payments"] {
    const ref = provider ? buildMobileMoneyReference(provider) : null;
    switch (mode) {
      case "card":
        return [{ method: "card", amount: total }];
      case "mobile_money":
        return [{ method: "mobile_money", amount: total, reference: ref }];
      case "mixed":
        return [
          { method: "cash", amount: splitCashValue },
          { method: "mobile_money", amount: splitMobileValue, reference: ref },
        ];
      case "credit": {
        // Même convention qu'en caisse : l'acompte réellement encaissé, puis une ligne
        // `other` pour le solde dû — c'est elle que lisent la page Crédit et les rapports.
        const lines: HandoffCheckoutSubmit["payments"] = [];
        if (creditDownValue > 0) lines.push({ method: "cash", amount: creditDownValue });
        lines.push({ method: "other", amount: creditRemaining, reference: "À crédit" });
        return lines;
      }
      default:
        return [{ method: "cash", amount: total }];
    }
  }

  function submit() {
    if (blocker || busy) return;
    onSubmit({
      payments: buildPayments(),
      discount: discountValue,
      customerId: customerId || null,
      creditDueAt: mode === "credit" ? dueIso(creditDue) : null,
    });
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Fermer" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Encaisser le bon ${handoff.number}`}
        className={cn(
          "relative z-10 flex max-h-[94vh] w-full flex-col overflow-hidden bg-fs-card shadow-2xl",
          "rounded-t-2xl border border-black/10 sm:max-w-lg sm:rounded-2xl dark:border-white/10",
        )}
      >
        {/* En-tête : le numéro qu'on annonce, et le total qu'on annonce. Rien d'autre. */}
        <div className="shrink-0 border-b border-black/[0.07] bg-fs-surface-container px-4 pb-3 pt-3.5 dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-fs-accent px-2.5 py-1 text-sm font-extrabold tracking-tight text-white">
                  {handoff.number}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-neutral-600">
                  <MdSchedule className="h-3.5 w-3.5" aria-hidden />
                  {waitingLabel(handoff.createdAt, now)}
                </span>
              </div>
              <p className="mt-1.5 truncate text-xs text-neutral-600">
                Préparé par{" "}
                <span className="font-semibold text-fs-text">
                  {handoff.createdByName ?? "un collègue"}
                </span>{" "}
                · {handoffUnitCount(handoff)} article
                {handoffUnitCount(handoff) > 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5 text-neutral-600" />
            </button>
          </div>

          <div className="mt-3 flex items-end justify-between rounded-xl bg-fs-card px-3 py-2.5 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              À encaisser
            </span>
            <span className="text-3xl font-extrabold leading-none tracking-tight text-fs-accent">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          {/* Ce que le vendeur a mis dans le panier — en lecture seule : le caissier
              vérifie, il ne resaisit pas. */}
          <div className="rounded-xl border border-black/[0.07] dark:border-white/10">
            <div className="flex items-center gap-1.5 border-b border-black/[0.07] px-3 py-2 dark:border-white/10">
              <MdReceiptLong className="h-4 w-4 text-neutral-500" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Le panier
              </span>
            </div>
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.07]">
              {handoff.items.map((it) => (
                <li key={it.id} className="flex items-baseline gap-2 px-3 py-2">
                  <span className="shrink-0 text-sm font-bold tabular-nums text-fs-accent">
                    {it.quantity}×
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fs-text">{it.label}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-fs-text">
                    {formatCurrency(handoffLineTotal(it))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-black/[0.07] px-3 py-2 text-xs text-neutral-600 dark:border-white/10">
              <span>Sous-total</span>
              <span className="tabular-nums">{formatCurrency(handoff.subtotal)}</span>
            </div>
          </div>

          {handoff.note ? (
            <p className="mt-2.5 rounded-xl bg-amber-500/10 px-3 py-2 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Mot du vendeur :</span> {handoff.note}
            </p>
          ) : null}

          {/* Remise accordée au comptoir : le geste commercial se décide devant le
              client, pas en rayon. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-neutral-600" htmlFor="handoff-discount">
              Remise
            </label>
            <input
              id="handoff-discount"
              className={fsInputClass("w-36 text-right")}
              value={discountStr}
              onChange={(e) => setDiscountStr(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </div>

          {/* Modes de paiement — gros boutons : on les touche avec l'argent dans l'autre main. */}
          <div
            className={cn(
              "mt-3.5 grid gap-1.5",
              modes.length >= 5
                ? "grid-cols-5"
                : modes.length === 4
                  ? "grid-cols-4"
                  : "grid-cols-3",
            )}
          >
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-lg border py-3 text-[11px] font-extrabold tracking-tight transition-colors sm:text-xs",
                  mode === m.id
                    ? "border-fs-accent bg-fs-accent text-white shadow-sm"
                    : "border-black/[0.08] bg-fs-surface-container text-fs-text dark:border-white/10",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {needsProvider ? (
            <div className="mt-2.5">
              <p className="mb-1.5 text-xs font-medium text-neutral-600">Opérateur</p>
              <div className="grid grid-cols-3 gap-1.5">
                {providers.map((id) => {
                  const meta = MOBILE_MONEY_PROVIDERS.find((p) => p.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setProvider(id)}
                      className={cn(
                        "inline-flex items-center justify-center gap-1 rounded-lg border py-2.5 text-xs font-bold",
                        provider === id
                          ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                          : "border-black/[0.08] bg-fs-surface-container text-fs-text dark:border-white/10",
                      )}
                    >
                      <MdPhoneIphone className="h-4 w-4" aria-hidden />
                      {meta?.short ?? "Mobile"}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mode === "cash" ? (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-neutral-600" htmlFor="handoff-received">
                Montant reçu
              </label>
              <input
                id="handoff-received"
                className={fsInputClass("text-lg font-bold")}
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                inputMode="decimal"
                placeholder={formatCurrency(total)}
              />
              {receivedValue > 0 ? (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2.5">
                  <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    Monnaie à rendre
                  </span>
                  <span
                    className={cn(
                      "text-xl font-extrabold tabular-nums",
                      receivedValue >= total
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-red-600",
                    )}
                  >
                    {receivedValue >= total ? formatCurrency(change) : "Insuffisant"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "mixed" ? (
            <div className="mt-3 rounded-xl border border-fs-accent/35 bg-fs-accent/[0.06] p-3">
              <label className="mb-1 block text-xs font-medium text-neutral-600" htmlFor="handoff-split">
                Part payée en espèces
              </label>
              <input
                id="handoff-split"
                className={fsInputClass("bg-fs-card text-lg font-bold")}
                value={splitCash}
                onChange={(e) => setSplitCash(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-neutral-600">
                  {provider ? mobileMoneyProviderLabel(provider) : "Mobile money"}
                </span>
                <span className="font-extrabold tabular-nums text-fs-text">
                  {formatCurrency(splitMobileValue)}
                </span>
              </div>
            </div>
          ) : null}

          {mode === "credit" ? (
            <div className="mt-3 rounded-xl border border-fs-accent/35 bg-fs-accent/[0.06] p-3">
              <label className="mb-1 block text-xs font-medium text-neutral-600" htmlFor="handoff-down">
                Acompte encaissé maintenant
              </label>
              <input
                id="handoff-down"
                className={fsInputClass("bg-fs-card text-lg font-bold")}
                value={creditDown}
                onChange={(e) => setCreditDown(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  type="date"
                  className={fsInputClass("w-40 bg-fs-card py-1.5 text-xs sm:py-1.5 sm:text-xs")}
                  value={creditDue}
                  onChange={(e) => setCreditDue(e.target.value)}
                  aria-label="Échéance du crédit"
                />
                <span className="whitespace-nowrap text-xs text-neutral-600">
                  Reste dû{" "}
                  <b className="text-base font-extrabold text-fs-text">
                    {formatCurrency(creditRemaining)}
                  </b>
                </span>
              </div>
            </div>
          ) : null}

          {/* Client : obligatoire à crédit, facultatif sinon — et masquable par le patron
              sur les ventes comptant, comme en caisse rapide. */}
          {mode === "credit" || !hideCustomer ? (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-neutral-600" htmlFor="handoff-customer">
                Client {mode === "credit" ? "(obligatoire à crédit)" : "(facultatif)"}
              </label>
              <select
                id="handoff-customer"
                className={fsInputClass()}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Aucun client</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {handoff.customerId && customerName ? (
                <p className="mt-1 text-[11px] text-neutral-500">
                  Rattaché par le vendeur : {customerName}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Pied collant : l'action, toujours atteignable sans faire défiler. */}
        <div className="shrink-0 border-t border-black/[0.07] bg-fs-surface-container px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 dark:border-white/10">
          {blocker ? (
            <p className="mb-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
              <MdWarningAmber className="mt-px h-4 w-4 shrink-0" aria-hidden />
              {blocker}
            </p>
          ) : null}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 rounded-xl border border-black/[0.08] bg-fs-card py-3 text-sm font-semibold text-fs-text disabled:opacity-50 dark:border-white/10"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || blocker !== null}
              className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-fs-accent py-3 text-sm font-extrabold tracking-tight text-white shadow-sm disabled:opacity-50"
            >
              {busy ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : mode === "card" ? (
                <MdCreditCard className="h-5 w-5" aria-hidden />
              ) : (
                <MdPayments className="h-5 w-5" aria-hidden />
              )}
              {busy ? "Encaissement…" : `ENCAISSER ${formatCurrency(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
