"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdEventBusy } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  RentalDialogShell,
  RentalField,
  RentalSubmitButton,
} from "@/components/rental/rental-dialog-shell";
import { endRentalLease } from "@/lib/features/rental/api";
import { toIsoDate } from "@/lib/features/rental/rental-format";
import type { RentalLease } from "@/lib/features/rental/types";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/**
 * Fin de bail (départ du locataire). Les échéances des périodes commençant après
 * la sortie sont annulées : on ne facture jamais un mois non occupé. Le lot
 * redevient immédiatement disponible pour un nouveau bail.
 */
export function RentalEndLeaseDialog({
  lease,
  onClose,
  onDone,
}: {
  lease: RentalLease;
  onClose: () => void;
  onDone: () => void;
}) {
  const [endedAt, setEndedAt] = useState(() => toIsoDate(new Date()));
  const [reason, setReason] = useState("");
  const [terminated, setTerminated] = useState(false);

  const mut = useMutation({
    mutationFn: () =>
      endRentalLease({
        leaseId: lease.id,
        endedAt,
        reason: reason.trim() || null,
        terminated,
      }),
    onSuccess: () => {
      toast.success("Bail clôturé — le lot est de nouveau disponible.");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Clôture impossible.")),
  });

  return (
    <RentalDialogShell
      title="Fin de bail"
      subtitle={`${lease.tenantName} · ${lease.propertyName} — ${lease.unitLabel}`}
      icon={<MdEventBusy className="h-5 w-5 text-amber-600" aria-hidden />}
      onClose={onClose}
      busy={mut.isPending}
      zIndex="z-[90]"
      footer={
        <RentalSubmitButton
          label="Clôturer le bail"
          tone="danger"
          busy={mut.isPending}
          onClick={() => mut.mutate()}
        />
      }
    >
      {lease.balance > 0.5 ? (
        <div className="rounded-xl bg-red-500/10 p-3">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            {formatCurrency(lease.balance)} restent impayés
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            La clôture ne les efface pas : la dette reste visible dans l&apos;historique du
            locataire. Encaissez d&apos;abord si le locataire règle avant de partir.
          </p>
        </div>
      ) : null}

      {lease.depositPaid > 0.5 ? (
        <div className="rounded-xl bg-sky-500/10 p-3">
          <p className="text-sm font-bold text-sky-700 dark:text-sky-300">
            Caution détenue : {formatCurrency(lease.depositPaid)}
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Pour la rendre, enregistrez un encaissement de nature « Restitution de caution »
            avant de clôturer — le locataire repart avec son reçu.
          </p>
        </div>
      ) : null}

      <RentalField
        label="Date de sortie"
        hint="Les périodes commençant après cette date ne seront pas facturées"
      >
        <input
          type="date"
          className={fsInputClass()}
          value={endedAt}
          onChange={(e) => setEndedAt(e.target.value)}
        />
      </RentalField>

      <RentalField label="Motif (optionnel)">
        <textarea
          className={fsInputClass("min-h-16")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Déménagement, fin de contrat, impayés répétés…"
        />
      </RentalField>

      <div className="flex flex-wrap gap-1.5">
        {[
          { key: false, label: "Fin normale" },
          { key: true, label: "Résiliation" },
        ].map((o) => (
          <button
            key={String(o.key)}
            type="button"
            onClick={() => setTerminated(o.key)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
              terminated === o.key
                ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                : "border-black/10 text-neutral-600 hover:bg-black/[0.04] dark:border-white/10 dark:text-neutral-300",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </RentalDialogShell>
  );
}
