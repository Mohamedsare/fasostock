"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { useEffect, useState } from "react";
import { MdClose, MdErrorOutline } from "react-icons/md";

export type SupplierFormValue = {
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const fieldLabelClass = "mb-1.5 block text-xs font-medium leading-tight text-neutral-600 sm:text-[13px]";
const fieldGapClass = "flex flex-col gap-3 sm:gap-3";

export function SupplierFormDialog({
  open,
  onClose,
  variant = "create",
  initialValue,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Aligné Flutter : `Nouveau fournisseur` / `Modifier le fournisseur`. */
  variant?: "create" | "edit";
  initialValue?: Partial<SupplierFormValue> | null;
  onSubmit: (value: SupplierFormValue) => Promise<void> | void;
}) {
  const title = variant === "edit" ? "Modifier le fournisseur" : "Nouveau fournisseur";
  const submitLabel = variant === "edit" ? "Enregistrer" : "Créer";
  const [v, setV] = useState<SupplierFormValue>({
    name: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setV({
      name: initialValue?.name ?? "",
      contact: initialValue?.contact ?? "",
      phone: initialValue?.phone ?? "",
      email: initialValue?.email ?? "",
      address: initialValue?.address ?? "",
      notes: initialValue?.notes ?? "",
    });
    setBusy(false);
    setError(null);
  }, [open, initialValue]);

  if (!open) return null;

  const inputOutline = "min-h-[44px] rounded-[10px] border border-black/8 sm:min-h-0";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-form-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className={cn(
          "max-h-[min(92dvh,640px)] w-full max-w-[400px] shadow-xl",
          "rounded-t-2xl rounded-b-none border-x-0 border-b-0 sm:rounded-2xl sm:border-x sm:border-b",
        )}
        padding="p-0"
      >
        <div className="flex max-h-[min(92dvh,640px)] flex-col">
          {/* En-tête fixe — type AlertDialog Material */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <h2 id="supplier-form-title" className="pr-2 text-lg font-semibold leading-snug text-fs-text">
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

          {/* Corps scrollable — SingleChildScrollView Flutter, maxWidth 400 */}
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

            <div className={fieldGapClass}>
              <div>
                <label htmlFor="supplier-name" className={fieldLabelClass}>
                  Nom *
                </label>
                <input
                  id="supplier-name"
                  className={fsInputClass(inputOutline)}
                  value={v.name}
                  onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nom du fournisseur"
                  autoCapitalize="words"
                  autoComplete="organization"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="supplier-contact" className={fieldLabelClass}>
                  Contact
                </label>
                <input
                  id="supplier-contact"
                  className={fsInputClass(inputOutline)}
                  value={v.contact}
                  onChange={(e) => setV((p) => ({ ...p, contact: e.target.value }))}
                  placeholder="Nom du contact"
                  autoComplete="name"
                />
              </div>

              <div>
                <label htmlFor="supplier-phone" className={fieldLabelClass}>
                  Téléphone
                </label>
                <input
                  id="supplier-phone"
                  className={fsInputClass(inputOutline)}
                  value={v.phone}
                  onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+226 …"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>

              <div>
                <label htmlFor="supplier-email" className={fieldLabelClass}>
                  Email
                </label>
                <input
                  id="supplier-email"
                  className={fsInputClass(inputOutline)}
                  value={v.email}
                  onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@exemple.com"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                />
              </div>

              <div>
                <label htmlFor="supplier-address" className={fieldLabelClass}>
                  Adresse
                </label>
                <textarea
                  id="supplier-address"
                  className={fsInputClass(cn("min-h-[80px] resize-none", inputOutline))}
                  value={v.address}
                  onChange={(e) => setV((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Adresse"
                  rows={2}
                />
              </div>

              <div>
                <label htmlFor="supplier-notes" className={fieldLabelClass}>
                  Notes
                </label>
                <textarea
                  id="supplier-notes"
                  className={fsInputClass(cn("min-h-[80px] resize-none", inputOutline))}
                  value={v.notes}
                  onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Notes…"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Actions — primaire en bas sur mobile (pouce), aligné Material */}
          <div
            className={cn(
              "shrink-0 border-t border-black/6 bg-fs-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] w-full rounded-[10px] px-4 py-3 text-sm font-semibold text-fs-accent active:bg-fs-surface-container sm:min-h-0 sm:w-auto sm:py-2.5"
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
                    await onSubmit({ ...v, name });
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Enregistrement impossible.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] bg-fs-accent px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-60 sm:min-w-[120px] sm:max-w-none"
                disabled={busy}
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
