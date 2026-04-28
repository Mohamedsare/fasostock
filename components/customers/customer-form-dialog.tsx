"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import type { CustomerType } from "@/lib/features/customers/types";
import { cn } from "@/lib/utils/cn";
import { useEffect, useState } from "react";
import { MdClose, MdErrorOutline } from "react-icons/md";

export type CustomerFormValue = {
  name: string;
  type: CustomerType;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

/** Aligné sur `CreateCustomerDialog` / `EditCustomerDialog` (Flutter). */
export function CustomerFormDialog({
  open,
  onClose,
  variant,
  initialValue,
  onSubmit,
  overlayClassName,
}: {
  open: boolean;
  onClose: () => void;
  /** `create` → titre « Nouveau client », bouton « Créer » ; `edit` → « Modifier le client », « Enregistrer ». */
  variant: "create" | "edit";
  initialValue?: Partial<CustomerFormValue> | null;
  onSubmit: (value: CustomerFormValue) => Promise<void> | void;
  /** Ex. `z-[95]` quand le dialogue s’ouvre par-dessus un autre modal. */
  overlayClassName?: string;
}) {
  const [v, setV] = useState<CustomerFormValue>({
    name: "",
    type: "individual",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = variant === "create" ? "Nouveau client" : "Modifier le client";
  const primaryLabel = variant === "create" ? "Créer" : "Enregistrer";

  useEffect(() => {
    if (!open) return;
    setV({
      name: initialValue?.name ?? "",
      type: initialValue?.type ?? "individual",
      phone: initialValue?.phone ?? "",
      email: initialValue?.email ?? "",
      address: initialValue?.address ?? "",
      notes: initialValue?.notes ?? "",
    });
    setBusy(false);
    setError(null);
  }, [open, initialValue]);

  if (!open) return null;
  const inputBase =
    "min-h-12 rounded-[10px] border border-black/8 px-3 text-base touch-manipulation sm:min-h-0 sm:text-sm";

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3",
        overlayClassName ?? "z-50",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-form-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className="w-full max-w-[420px] rounded-t-2xl rounded-b-none border-x-0 border-b-0 sm:rounded-2xl sm:border-x sm:border-b"
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,760px)] flex-col">
          <div className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" aria-hidden />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-4 pb-3 pt-3.5 sm:px-5 sm:pt-5">
            <h2 id="customer-form-title" className="pr-2 text-lg font-semibold leading-snug text-fs-text">
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
              <div className="mb-4 rounded-lg border border-red-200/80 bg-red-50/90 p-3 dark:border-red-900 dark:bg-red-950/50">
                <div className="flex gap-2.5">
                  <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
                  <p className="text-xs font-medium leading-snug text-red-800 dark:text-red-200 sm:text-sm">{error}</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-4 sm:gap-3">
            <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Nom *</label>
              <input
                  className={fsInputClass(inputBase)}
                value={v.name}
                onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))}
                autoCapitalize="words"
                autoComplete="name"
                  autoFocus
              />
            </div>

            <div>
                <p className="mb-1.5 text-[13px] font-medium text-neutral-700">Type</p>
              <div className="inline-flex w-full rounded-[10px] border border-black/8 bg-fs-surface-container p-0.5">
                <button
                  type="button"
                  onClick={() => setV((p) => ({ ...p, type: "individual" }))}
                    className={`flex-1 rounded-lg py-3 text-sm font-semibold transition-colors sm:py-2.5 sm:text-sm ${
                    v.type === "individual"
                      ? "bg-fs-card text-fs-accent shadow-sm ring-1 ring-fs-accent/25"
                      : "text-neutral-600"
                  }`}
                >
                  Particulier
                </button>
                <button
                  type="button"
                  onClick={() => setV((p) => ({ ...p, type: "company" }))}
                    className={`flex-1 rounded-lg py-3 text-sm font-semibold transition-colors sm:py-2.5 sm:text-sm ${
                    v.type === "company"
                      ? "bg-fs-card text-fs-accent shadow-sm ring-1 ring-fs-accent/25"
                      : "text-neutral-600"
                  }`}
                >
                  Entreprise
                </button>
              </div>
            </div>

            <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Téléphone</label>
              <input
                  className={fsInputClass(inputBase)}
                value={v.phone}
                onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))}
                inputMode="tel"
                autoComplete="tel"
              />
            </div>

            <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Email</label>
              <input
                  className={fsInputClass(inputBase)}
                value={v.email}
                onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
                autoComplete="email"
                type="email"
                  inputMode="email"
              />
            </div>

            <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Adresse</label>
              <textarea
                  className={fsInputClass(cn("min-h-[92px] resize-none", inputBase))}
                value={v.address}
                onChange={(e) => setV((p) => ({ ...p, address: e.target.value }))}
                rows={2}
              />
            </div>

            <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Notes</label>
              <textarea
                  className={fsInputClass(cn("min-h-[92px] resize-none", inputBase))}
                value={v.notes}
                onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          </div>

          <div
            className={cn(
              "shrink-0 border-t border-black/6 bg-fs-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold text-fs-accent active:bg-fs-surface-container sm:min-h-0 sm:w-auto sm:min-w-[100px]"
                disabled={busy}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  const name = v.name.trim();
                  if (name.length < 2) {
                    setError("Nom requis (2 caractères minimum)");
                    return;
                  }
                  try {
                    setBusy(true);
                    await onSubmit(v);
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Enregistrement impossible.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 py-3 text-base font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-60 sm:mb-0 sm:min-w-[120px] sm:max-w-none sm:text-sm sm:font-semibold"
                disabled={busy}
              >
                {busy ? (
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  primaryLabel
                )}
              </button>
            </div>
          </div>
        </div>
      </FsCard>
    </div>
  );
}
