"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { useEffect, useState } from "react";
import { MdClose, MdErrorOutline } from "react-icons/md";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseFormInput,
} from "@/lib/features/expenses/types";

const fieldLabelClass =
  "mb-1.5 block text-[13px] font-medium leading-tight text-neutral-700";
const inputOutline =
  "min-h-12 rounded-[10px] border border-black/8 px-3 text-base touch-manipulation sm:min-h-0 sm:text-sm";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormDialog({
  open,
  onClose,
  variant = "create",
  initialValue,
  stores,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  variant?: "create" | "edit";
  initialValue?: Partial<ExpenseFormInput> | null;
  stores: { id: string; name: string }[];
  onSubmit: (value: ExpenseFormInput) => Promise<void> | void;
}) {
  const title = variant === "edit" ? "Modifier la dépense" : "Nouvelle dépense";
  const submitLabel = variant === "edit" ? "Enregistrer" : "Ajouter";

  const [v, setV] = useState<ExpenseFormInput>({
    category: "loyer",
    label: "",
    amount: 0,
    paymentMethod: "cash",
    payee: "",
    reference: "",
    expenseDate: todayIso(),
    storeId: null,
    notes: "",
  });
  // Champ montant en texte (pour gérer la saisie vide / décimale proprement).
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setV({
      category: initialValue?.category ?? "loyer",
      label: initialValue?.label ?? "",
      amount: initialValue?.amount ?? 0,
      paymentMethod: initialValue?.paymentMethod ?? "cash",
      payee: initialValue?.payee ?? "",
      reference: initialValue?.reference ?? "",
      expenseDate: initialValue?.expenseDate ?? todayIso(),
      storeId: initialValue?.storeId ?? null,
      notes: initialValue?.notes ?? "",
    });
    setAmountText(
      initialValue?.amount != null && initialValue.amount > 0
        ? String(initialValue.amount)
        : "",
    );
    setBusy(false);
    setError(null);
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-form-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className={cn(
          "max-h-[min(94dvh,800px)] w-full max-w-[460px] shadow-xl",
          "rounded-t-2xl rounded-b-none border-x-0 border-b-0 sm:rounded-2xl sm:border-x sm:border-b",
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
              id="expense-form-title"
              className="pr-2 text-lg font-semibold leading-snug text-fs-text"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container sm:h-10 sm:w-10"
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
                <label htmlFor="exp-amount" className={fieldLabelClass}>
                  Montant (FCFA) *
                </label>
                <input
                  id="exp-amount"
                  className={fsInputClass(inputOutline)}
                  value={amountText}
                  onChange={(e) => {
                    const t = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
                    setAmountText(t);
                    setV((p) => ({ ...p, amount: Number(t) || 0 }));
                  }}
                  placeholder="0"
                  inputMode="decimal"
                  autoFocus
                />
              </div>

              {/* Catégorie */}
              <div>
                <label htmlFor="exp-category" className={fieldLabelClass}>
                  Catégorie *
                </label>
                <select
                  id="exp-category"
                  className={fsInputClass(inputOutline)}
                  value={v.category}
                  onChange={(e) => setV((p) => ({ ...p, category: e.target.value }))}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Libellé */}
              <div>
                <label htmlFor="exp-label" className={fieldLabelClass}>
                  Libellé
                </label>
                <input
                  id="exp-label"
                  className={fsInputClass(inputOutline)}
                  value={v.label}
                  onChange={(e) => setV((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Ex. Loyer du mois de juin"
                />
              </div>

              {/* Date + Mode de règlement */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                <div>
                  <label htmlFor="exp-date" className={fieldLabelClass}>
                    Date *
                  </label>
                  <input
                    id="exp-date"
                    type="date"
                    className={fsInputClass(inputOutline)}
                    value={v.expenseDate}
                    onChange={(e) =>
                      setV((p) => ({ ...p, expenseDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="exp-payment" className={fieldLabelClass}>
                    Règlement
                  </label>
                  <select
                    id="exp-payment"
                    className={fsInputClass(inputOutline)}
                    value={v.paymentMethod}
                    onChange={(e) =>
                      setV((p) => ({ ...p, paymentMethod: e.target.value }))
                    }
                  >
                    {EXPENSE_PAYMENT_METHODS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bénéficiaire */}
              <div>
                <label htmlFor="exp-payee" className={fieldLabelClass}>
                  Bénéficiaire
                </label>
                <input
                  id="exp-payee"
                  className={fsInputClass(inputOutline)}
                  value={v.payee}
                  onChange={(e) => setV((p) => ({ ...p, payee: e.target.value }))}
                  placeholder="À qui / quel fournisseur"
                />
              </div>

              {/* Boutique (optionnel) */}
              {stores.length > 0 ? (
                <div>
                  <label htmlFor="exp-store" className={fieldLabelClass}>
                    Boutique
                  </label>
                  <select
                    id="exp-store"
                    className={fsInputClass(inputOutline)}
                    value={v.storeId ?? ""}
                    onChange={(e) =>
                      setV((p) => ({ ...p, storeId: e.target.value || null }))
                    }
                  >
                    <option value="">Toute l&apos;entreprise</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Référence */}
              <div>
                <label htmlFor="exp-ref" className={fieldLabelClass}>
                  Référence
                </label>
                <input
                  id="exp-ref"
                  className={fsInputClass(inputOutline)}
                  value={v.reference}
                  onChange={(e) => setV((p) => ({ ...p, reference: e.target.value }))}
                  placeholder="N° de reçu / facture"
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="exp-notes" className={fieldLabelClass}>
                  Notes
                </label>
                <textarea
                  id="exp-notes"
                  className={fsInputClass(cn("min-h-[80px] resize-none", inputOutline))}
                  value={v.notes}
                  onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Notes…"
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
            <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setError(null);
                  if (!(v.amount > 0)) {
                    setError("Montant requis (supérieur à 0).");
                    return;
                  }
                  if (!v.expenseDate) {
                    setError("Date requise.");
                    return;
                  }
                  try {
                    setBusy(true);
                    await onSubmit(v);
                    onClose();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Enregistrement impossible.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-fs-accent px-4 py-3 text-base font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-60 sm:min-w-[120px] sm:text-sm sm:font-semibold"
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
        </div>
      </FsCard>
    </div>
  );
}
