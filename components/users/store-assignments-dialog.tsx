"use client";

import { FsCard, FsSectionLabel } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { toFriendlyError } from "@/lib/utils/friendly-error";
import { useEffect, useState } from "react";
import { MdCheck, MdClose, MdStorefront } from "react-icons/md";

type StoreLite = { id: string; name: string; isPrimary?: boolean };

/**
 * Réaffecter un employé entre les boutiques de l'entreprise.
 *
 * Plusieurs boutiques à la fois sont non seulement permises mais attendues :
 * un caissier coché sur deux boutiques vend dans les deux depuis son espace,
 * chacune avec son propre catalogue et son propre stock.
 */
export function StoreAssignmentsDialog({
  open,
  userLabel,
  stores,
  initialStoreIds,
  onClose,
  onSubmit,
}: {
  open: boolean;
  userLabel: string;
  stores: StoreLite[];
  initialStoreIds: string[];
  onClose: () => void;
  onSubmit: (storeIds: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; hint: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(initialStoreIds);
    setBusy(false);
    setError(null);
  }, [open, initialStoreIds]);

  if (!open) return null;

  const toggle = (id: string) => {
    setError(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const unchanged =
    selected.length === initialStoreIds.length &&
    selected.every((id) => initialStoreIds.includes(id));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Affecter aux boutiques"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className="w-full max-w-lg rounded-b-none rounded-t-2xl border-x-0 border-b-0 sm:rounded-2xl sm:border-x sm:border-b"
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,760px)] flex-col">
          <div className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" aria-hidden />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-3 pb-3 pt-3 sm:px-4 sm:pt-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-600">Affectation aux boutiques</p>
              <p className="mt-0.5 truncate text-sm font-bold text-fs-text">{userLabel}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container sm:h-9 sm:w-9 sm:rounded-lg"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
            <FsSectionLabel>Boutiques accessibles</FsSectionLabel>
            <p className="mt-1 text-xs text-neutral-600">
              Cochez toutes les boutiques où cette personne travaille. Elle pourra passer de
              l&apos;une à l&apos;autre depuis son espace, avec le catalogue et le stock propres à
              chacune.
            </p>

            <div className="mt-3 space-y-1.5">
              {stores.map((s) => {
                const on = selected.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[12px] border px-3 py-3 text-left transition-colors",
                      on
                        ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)]"
                        : "border-black/8 bg-fs-card",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                        on
                          ? "border-fs-accent bg-fs-accent text-white"
                          : "border-black/15 bg-fs-card text-transparent",
                      )}
                      aria-hidden
                    >
                      <MdCheck className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-semibold",
                          on ? "text-fs-accent" : "text-fs-text",
                        )}
                      >
                        {s.name}
                      </span>
                      {s.isPrimary ? (
                        <span className="text-[11px] text-neutral-500">Boutique principale</span>
                      ) : null}
                    </span>
                    <MdStorefront
                      className={cn("h-5 w-5 shrink-0", on ? "text-fs-accent" : "text-neutral-400")}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-neutral-600">
              {selected.length} boutique{selected.length > 1 ? "s" : ""} sélectionnée
              {selected.length > 1 ? "s" : ""} sur {stores.length}. Pour couper complètement
              l&apos;accès, désactivez plutôt le compte.
            </p>

            {error ? (
              <div className="mt-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-700">{error.title}</p>
                {error.hint ? (
                  <p className="mt-0.5 text-xs text-red-600">{error.hint}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-black/6 bg-fs-card/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-[10px] border border-black/8 bg-fs-card px-3 py-2.5 text-xs font-semibold text-neutral-700 sm:min-h-0 sm:text-sm"
                disabled={busy}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy || unchanged || selected.length === 0}
                onClick={async () => {
                  setError(null);
                  if (selected.length === 0) {
                    setError({
                      title: "Aucune boutique sélectionnée",
                      hint: "Cochez au moins une boutique, ou désactivez le compte depuis la liste des employés.",
                    });
                    return;
                  }
                  try {
                    setBusy(true);
                    await onSubmit(selected);
                    onClose();
                  } catch (e) {
                    const f = toFriendlyError(e, "Affectation impossible");
                    setError({ title: f.title, hint: f.hint });
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-3 py-2.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60 sm:min-h-0 sm:text-sm"
              >
                <MdStorefront className="h-4 w-4" aria-hidden />
                {busy ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      </FsCard>
    </div>
  );
}
