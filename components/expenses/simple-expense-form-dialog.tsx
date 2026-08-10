"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { useEffect, useMemo, useState } from "react";
import { MdClose, MdErrorOutline, MdPayments, MdPhoneIphone } from "react-icons/md";
import {
  MOBILE_MONEY_PROVIDERS,
  buildMobileMoneyReference,
  mobileMoneyProviderFromReference,
  type MobileMoneyProvider,
} from "@/lib/features/payments/payment-display";
import type {
  CustomExpenseCategory,
  ExpenseFormInput,
} from "@/lib/features/expenses/types";

/**
 * Saisie d'une dépense en mode « Personnaliser mes dépenses ».
 *
 * Cinq champs, pas six : montant, catégorie, date, règlement, note facultative.
 * Le bénéficiaire, la référence, le libellé et la boutique du formulaire complet
 * ont disparu — non pas cachés, mais jugés inutiles pour noter 2 000 F de
 * carburant entre deux clients. Un formulaire qu'on ne remplit pas ne trace rien.
 *
 * L'opérateur mobile money n'a pas de colonne : il part dans `expenses.reference`
 * avec la convention déjà posée pour les ventes ([buildMobileMoneyReference]).
 */

const fieldLabelClass =
  "mb-1.5 block text-[13px] font-medium leading-tight text-neutral-700";
const inputOutline =
  "min-h-12 rounded-lg border border-black/8 px-3 text-base touch-manipulation sm:min-h-0 sm:text-sm";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type PaymentChoice = "cash" | "mobile_money";

export function SimpleExpenseFormDialog({
  open,
  onClose,
  variant = "create",
  initialValue,
  categories,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  variant?: "create" | "edit";
  initialValue?: Partial<ExpenseFormInput> | null;
  /** Postes actifs de l'entreprise ; le premier est proposé par défaut. */
  categories: CustomExpenseCategory[];
  onSubmit: (value: ExpenseFormInput) => Promise<void> | void;
}) {
  const title = variant === "edit" ? "Modifier la dépense" : "Nouvelle dépense";
  const submitLabel = variant === "edit" ? "Enregistrer" : "Ajouter";

  const [categoryId, setCategoryId] = useState<string>("");
  const [amountText, setAmountText] = useState("");
  const [amount, setAmount] = useState(0);
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [payment, setPayment] = useState<PaymentChoice>("cash");
  const [provider, setProvider] = useState<MobileMoneyProvider>("orange_money");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeIds = useMemo(
    () => new Set(categories.map((c) => c.id)),
    [categories],
  );

  useEffect(() => {
    if (!open) return;
    const initialCategory = initialValue?.categoryId ?? "";
    setCategoryId(
      initialCategory && activeIds.has(initialCategory)
        ? initialCategory
        : (categories[0]?.id ?? ""),
    );
    const initialAmount = initialValue?.amount ?? 0;
    setAmount(initialAmount);
    setAmountText(initialAmount > 0 ? String(initialAmount) : "");
    setExpenseDate(initialValue?.expenseDate ?? todayIso());
    const method = initialValue?.paymentMethod;
    setPayment(method === "mobile_money" ? "mobile_money" : "cash");
    setProvider(
      mobileMoneyProviderFromReference(initialValue?.reference) ?? "orange_money",
    );
    setNotes(initialValue?.notes ?? "");
    setBusy(false);
    setError(null);
  }, [open, initialValue, categories, activeIds]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="simple-expense-form-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className={cn(
          "max-h-[min(94dvh,800px)] w-full max-w-[440px] shadow-xl",
          "rounded-t-xl rounded-b-none border-x-0 border-b-0 sm:rounded-xl sm:border-x sm:border-b",
        )}
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,800px)] flex-col">
          <div
            className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
            aria-hidden
          />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-4 pb-3 pt-3.5 sm:px-5 sm:pt-5">
            <h2
              id="simple-expense-form-title"
              className="pr-2 text-lg font-semibold leading-snug text-fs-text"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container sm:h-10 sm:w-10"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {error ? (
              <div className="mb-4 rounded-lg border border-red-200/80 bg-red-50/90 p-3">
                <div className="flex gap-2.5">
                  <MdErrorOutline
                    className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
                    aria-hidden
                  />
                  <p className="text-xs font-medium leading-snug text-red-800 sm:text-sm">
                    {error}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-4 sm:gap-3">
              {/* Montant */}
              <div>
                <label htmlFor="cexp-amount" className={fieldLabelClass}>
                  Montant *
                </label>
                <input
                  id="cexp-amount"
                  className={fsInputClass(inputOutline)}
                  value={amountText}
                  onChange={(e) => {
                    const t = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
                    setAmountText(t);
                    setAmount(Number(t) || 0);
                  }}
                  placeholder="0"
                  inputMode="decimal"
                  autoFocus
                />
              </div>

              {/* Catégorie — uniquement les postes de l'entreprise */}
              <div>
                <label htmlFor="cexp-category" className={fieldLabelClass}>
                  Catégorie *
                </label>
                <select
                  id="cexp-category"
                  className={fsInputClass(inputOutline)}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {categories.length === 0 ? (
                    <option value="">— Aucun poste créé —</option>
                  ) : null}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label htmlFor="cexp-date" className={fieldLabelClass}>
                  Date *
                </label>
                <input
                  id="cexp-date"
                  type="date"
                  className={fsInputClass(inputOutline)}
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>

              {/* Règlement : espèces ou mobile money (puis l'opérateur) */}
              <div>
                <span className={fieldLabelClass}>Règlement *</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: "cash" as const, label: "Espèces", icon: MdPayments },
                      {
                        key: "mobile_money" as const,
                        label: "Mobile Money",
                        icon: MdPhoneIphone,
                      },
                    ]
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const selected = payment === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setPayment(opt.key)}
                        aria-pressed={selected}
                        className={cn(
                          "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold",
                          selected
                            ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                            : "border-black/[0.08] bg-fs-card text-neutral-700",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {payment === "mobile_money" ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {MOBILE_MONEY_PROVIDERS.map((p) => {
                      const selected = provider === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setProvider(p.id)}
                          aria-pressed={selected}
                          className={cn(
                            "inline-flex min-h-11 items-center justify-center rounded-lg border px-2 text-xs font-semibold sm:text-sm",
                            selected
                              ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                              : "border-black/[0.08] bg-fs-card text-neutral-700",
                          )}
                        >
                          {p.short}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Note (facultative) */}
              <div>
                <label htmlFor="cexp-notes" className={fieldLabelClass}>
                  Note (facultatif)
                </label>
                <textarea
                  id="cexp-notes"
                  className={fsInputClass(cn("min-h-[72px] resize-none", inputOutline))}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex. course au marché"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              "shrink-0 border-t border-black/6 bg-fs-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4",
              "pb-[calc(5.75rem+var(--fs-safe-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setError(null);
                if (!(amount > 0)) {
                  setError("Montant requis (supérieur à 0).");
                  return;
                }
                if (!categoryId) {
                  setError(
                    "Choisissez une catégorie. Le propriétaire les crée depuis « Mes catégories ».",
                  );
                  return;
                }
                if (!expenseDate) {
                  setError("Date requise.");
                  return;
                }
                try {
                  setBusy(true);
                  await onSubmit({
                    category: "autre",
                    categoryId,
                    label: "",
                    amount,
                    paymentMethod: payment,
                    payee: "",
                    reference:
                      payment === "mobile_money"
                        ? (buildMobileMoneyReference(provider) ?? "")
                        : "",
                    expenseDate,
                    storeId: initialValue?.storeId ?? null,
                    notes,
                  });
                  onClose();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Enregistrement impossible.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-fs-accent px-4 py-3 text-base font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-60 sm:min-w-[120px] sm:text-sm sm:font-semibold"
            >
              {busy ? (
                <span
                  className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </div>
      </FsCard>
    </div>
  );
}
