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

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-end justify-center bg-black/40 p-3 sm:items-center",
        overlayClassName ?? "z-50",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-form-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard className="w-full max-w-[400px]" padding="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="customer-form-title" className="text-lg font-semibold text-fs-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-neutral-700"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 max-h-[min(70vh,520px)] overflow-y-auto">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200/80 bg-red-50/90 p-3 dark:border-red-900 dark:bg-red-950/50">
              <div className="flex gap-2">
                <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
                <p className="text-xs font-medium leading-snug text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Nom *</label>
              <input
                className={fsInputClass("rounded-[10px] border border-black/8")}
                value={v.name}
                onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))}
                autoCapitalize="words"
                autoComplete="name"
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-neutral-600">Type</p>
              <div className="inline-flex w-full rounded-[10px] border border-black/8 bg-fs-surface-container p-0.5">
                <button
                  type="button"
                  onClick={() => setV((p) => ({ ...p, type: "individual" }))}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-colors sm:text-sm ${
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
                  className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-colors sm:text-sm ${
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
              <label className="mb-1 block text-xs font-medium text-neutral-600">Téléphone</label>
              <input
                className={fsInputClass("rounded-[10px] border border-black/8")}
                value={v.phone}
                onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))}
                inputMode="tel"
                autoComplete="tel"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Email</label>
              <input
                className={fsInputClass("rounded-[10px] border border-black/8")}
                value={v.email}
                onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
                autoComplete="email"
                type="email"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Adresse</label>
              <textarea
                className={fsInputClass("min-h-[72px] resize-none rounded-[10px] border border-black/8")}
                value={v.address}
                onChange={(e) => setV((p) => ({ ...p, address: e.target.value }))}
                rows={2}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Notes</label>
              <textarea
                className={fsInputClass("min-h-[72px] resize-none rounded-[10px] border border-black/8")}
                value={v.notes}
                onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-fs-accent sm:min-w-[100px]"
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
            className="inline-flex min-h-[44px] min-w-[120px] items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-60"
            disabled={busy}
          >
            {busy ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              primaryLabel
            )}
          </button>
        </div>
      </FsCard>
    </div>
  );
}
