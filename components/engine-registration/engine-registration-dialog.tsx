"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { upsertEngineRegistration } from "@/lib/features/engine-registration/api";
import {
  REGISTRATION_STEP_LABELS,
  REGISTRATION_STEP_ORDER,
  deriveRegistrationStep,
  type EngineRegistration,
  type EngineRegistrationListItem,
} from "@/lib/features/engine-registration/types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MdClose, MdLock } from "react-icons/md";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-neutral-500">{hint}</span> : null}
    </label>
  );
}

function DocCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FsCard padding="p-4">
      <div
        className={cn(
          "mb-3 border-l-4 pl-2 text-sm font-bold uppercase tracking-wide",
          accent ? "border-fs-accent text-fs-text" : "border-neutral-300 text-fs-text",
        )}
      >
        {title}
      </div>
      {children}
    </FsCard>
  );
}

export function EngineRegistrationDialog({
  row,
  companyId,
  canEdit,
  onClose,
}: {
  /** Dossier ciblé (le parent monte ce composant avec `key={saleId}`, jamais null). */
  row: EngineRegistrationListItem;
  companyId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reg, setReg] = useState<EngineRegistration>(() => ({ ...row.registration }));

  const saveMut = useMutation({
    mutationFn: async () => {
      await upsertEngineRegistration({ saleId: row.saleId, companyId, registration: reg });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["engine-registrations"] });
      toast.success("Dossier mis à jour");
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  const input = fsInputClass("rounded-md border border-black/8");
  const busy = saveMut.isPending;
  const paid = row.paid;
  const currentStep = deriveRegistrationStep(reg, paid);
  const set = <K extends keyof EngineRegistration>(key: K, value: EngineRegistration[K]) =>
    setReg((r) => (r ? { ...r, [key]: value } : r));
  const setStr = (key: keyof EngineRegistration, value: string) =>
    set(key, (value.trim() === "" ? null : value) as EngineRegistration[keyof EngineRegistration]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <FsCard
        className="max-h-[min(94dvh,940px)] w-full max-w-3xl overflow-hidden rounded-t-2xl sm:rounded-2xl"
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,940px)] flex-col">
          {/* En-tête */}
          <div className="flex items-start justify-between gap-3 border-b border-black/6 p-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-fs-text">
                Dossier {row.saleNumber}
              </h2>
              <p className="mt-0.5 truncate text-xs text-neutral-500">
                {row.clientName || "Client"}
                {row.engineDesignation ? ` · ${row.engineDesignation}` : ""}
                {row.engineChassis ? ` · Châssis ${row.engineChassis}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!busy) onClose();
              }}
              aria-label="Fermer"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/8 text-neutral-700"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Corps */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {/* Progression */}
            <div className="flex flex-wrap gap-1.5">
              {REGISTRATION_STEP_ORDER.map((s, i) => {
                const currentIdx = REGISTRATION_STEP_ORDER.indexOf(currentStep);
                const done = i < currentIdx;
                const active = i === currentIdx;
                return (
                  <span
                    key={s}
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      active
                        ? "bg-fs-accent text-white"
                        : done
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-neutral-100 text-neutral-400",
                    )}
                  >
                    {REGISTRATION_STEP_LABELS[s]}
                  </span>
                );
              })}
            </div>

            {/* Paiement (lecture) */}
            <div className="flex items-center justify-between rounded-lg bg-fs-surface-container/60 px-4 py-3">
              <div>
                <span className="text-xs text-neutral-500">Total</span>
                <span className="ml-2 text-sm font-bold text-fs-text">
                  {formatCurrency(row.total)}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-500">Reste</span>
                <span
                  className={cn(
                    "ml-2 text-sm font-bold",
                    row.remaining > 0 ? "text-amber-700" : "text-emerald-700",
                  )}
                >
                  {formatCurrency(row.remaining)}
                </span>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                  paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                )}
              >
                {paid ? "Soldé" : "Non soldé"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 min-[820px]:grid-cols-2">
              {/* CMC */}
              <DocCard title="CMC (mise en circulation)">
                <label className="mb-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-fs-accent"
                    checked={reg.cmcAvailable}
                    disabled={!canEdit}
                    onChange={(e) => set("cmcAvailable", e.target.checked)}
                  />
                  <span className="text-sm font-medium text-fs-text">CMC disponible</span>
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="N° CMC">
                    <input
                      className={input}
                      value={reg.cmcNumber ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setStr("cmcNumber", e.target.value)}
                    />
                  </Field>
                  <Field label="Date CMC">
                    <input
                      type="date"
                      className={input}
                      value={reg.cmcDate ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setStr("cmcDate", e.target.value)}
                    />
                  </Field>
                </div>
              </DocCard>

              {/* WW */}
              <DocCard title="WW (carte provisoire)" accent>
                {!paid ? (
                  <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <MdLock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      Le WW ne peut être émis que si la vente est <strong>soldée</strong>. Encaissez
                      le reste depuis la page « Vente Engins ».
                    </span>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="N° WW">
                    <input
                      className={input}
                      value={reg.wwNumber ?? ""}
                      disabled={!canEdit || !paid}
                      onChange={(e) => setStr("wwNumber", e.target.value)}
                    />
                  </Field>
                  <Field label="Date WW">
                    <input
                      type="date"
                      className={input}
                      value={reg.wwDate ?? ""}
                      disabled={!canEdit || !paid}
                      onChange={(e) => setStr("wwDate", e.target.value)}
                    />
                  </Field>
                </div>
              </DocCard>

              {/* Dépôt ministère */}
              <DocCard title="Dépôt au ministère">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Date de dépôt">
                    <input
                      type="date"
                      className={input}
                      value={reg.depositDate ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setStr("depositDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Référence dépôt">
                    <input
                      className={input}
                      value={reg.depositReference ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setStr("depositReference", e.target.value)}
                    />
                  </Field>
                </div>
              </DocCard>

              {/* Récépissé */}
              <DocCard title="Récépissé">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="N° récépissé">
                    <input
                      className={input}
                      value={reg.recepisseNumber ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setStr("recepisseNumber", e.target.value)}
                    />
                  </Field>
                  <Field label="Date récépissé">
                    <input
                      type="date"
                      className={input}
                      value={reg.recepisseDate ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setStr("recepisseDate", e.target.value)}
                    />
                  </Field>
                </div>
              </DocCard>

              {/* Carte grise */}
              <DocCard title="Carte grise" accent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="N° carte grise">
                    <input
                      className={input}
                      value={reg.carteGriseNumber ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setStr("carteGriseNumber", e.target.value)}
                    />
                  </Field>
                  <Field label="Date carte grise">
                    <input
                      type="date"
                      className={input}
                      value={reg.carteGriseDate ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => setStr("carteGriseDate", e.target.value)}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Remise au client (date)" hint="Renseigner une fois la carte grise remise.">
                      <input
                        type="date"
                        className={input}
                        value={reg.deliveredToClientDate ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => setStr("deliveredToClientDate", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </DocCard>

              {/* Notes */}
              <DocCard title="Notes">
                <textarea
                  className={cn(input, "min-h-[96px]")}
                  value={reg.notes ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => setStr("notes", e.target.value)}
                  placeholder="Observations, suivi, contacts…"
                />
              </DocCard>
            </div>
          </div>

          {/* Pied */}
          {canEdit ? (
            <div className="flex justify-end gap-2 border-t border-black/6 p-3">
              <button
                type="button"
                onClick={() => {
                  if (!busy) onClose();
                }}
                disabled={busy}
                className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-fs-accent"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={busy}
                className="inline-flex min-h-[44px] min-w-[160px] items-center justify-center rounded-[10px] bg-fs-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? (
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  "Enregistrer le dossier"
                )}
              </button>
            </div>
          ) : null}
        </div>
      </FsCard>
    </div>
  );
}
