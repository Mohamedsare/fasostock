"use client";

import { useState } from "react";
import {
  MdCreditCard,
  MdInfo,
  MdInventory2,
  MdPayments,
  MdPhoneIphone,
  MdWarningAmber,
} from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { SaleDocumentDialogShell, SaleDocumentField } from "./sale-document-dialog-shell";
import {
  saleDocumentCustomerLabel,
  type SaleDocument,
} from "@/lib/features/sale-documents/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

type Method = "cash" | "mobile_money" | "card" | "other";

const METHODS: { id: Method; label: string; icon: typeof MdPayments }[] = [
  { id: "cash", label: "Espèces", icon: MdPayments },
  { id: "mobile_money", label: "Mobile money", icon: MdPhoneIphone },
  { id: "card", label: "Carte", icon: MdCreditCard },
];

/**
 * Émission d'une facture : le moment où le papier devient une vente.
 *
 * C'est l'écran le plus lourd de conséquences du module — stock déduit, chiffre
 * d'affaires compté, crédit ouvert — donc celui qui doit le dire le plus clairement,
 * AVANT le clic et non après.
 */
export function SaleDocumentIssueDialog({
  document: doc,
  busy,
  onClose,
  onConfirm,
}: {
  document: SaleDocument;
  busy: boolean;
  onClose: () => void;
  onConfirm: (params: {
    payments: Array<{ method: Method; amount: number; reference?: string | null }>;
  }) => void;
}) {
  const [method, setMethod] = useState<Method>("cash");
  const [amountText, setAmountText] = useState(() => String(doc.total));

  const paid = Math.min(Math.max(0, toNumber(amountText)), doc.total);
  const remaining = Math.max(0, doc.total - paid);

  const stockLines = doc.lines.filter((l) => l.productId != null).length;
  const serviceLines = doc.lines.length - stockLines;

  // Sans fiche client, un solde impayé serait une créance que personne ne peut
  // relancer. La base refuse déjà ; on l'explique ici plutôt que de laisser
  // l'utilisateur buter sur un message d'erreur après coup.
  const blockedByCredit = remaining > 0 && doc.customerId == null;

  return (
    <SaleDocumentDialogShell
      title={`Émettre la facture ${doc.number}`}
      subtitle={saleDocumentCustomerLabel(doc)}
      onClose={onClose}
      busy={busy}
      maxWidth="max-w-lg"
      footer={
        <button
          type="button"
          disabled={busy || doc.total <= 0 || blockedByCredit}
          onClick={() => onConfirm({ payments: paid > 0 ? [{ method, amount: paid }] : [] })}
          className="fs-touch-target w-full rounded-md bg-fs-accent py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy
            ? "Émission…"
            : remaining > 0
              ? `Émettre et laisser ${formatCurrency(remaining)} à crédit`
              : `Émettre et encaisser ${formatCurrency(doc.total)}`}
        </button>
      }
    >
      {/* Ce que l'émission déclenche, dit avant le clic. */}
      <p className="flex items-start gap-2 rounded-md bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-800 dark:text-sky-300">
        <MdInfo className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          En émettant, cette facture devient une <b>vente enregistrée</b> : elle comptera
          dans votre chiffre d&apos;affaires, votre marge et vos rapports. Le document sera
          ensuite <b>figé</b> — pour corriger, il faudra en établir un nouveau.
        </span>
      </p>

      <div className="rounded-md border border-black/[0.07] bg-fs-surface-container/50 p-3 dark:border-white/10">
        <Row label="Montant hors remise" value={formatCurrency(doc.subtotal)} />
        {doc.discount > 0 ? (
          <Row label="Remise" value={`− ${formatCurrency(doc.discount)}`} tone="warn" />
        ) : null}
        {doc.taxRate > 0 ? (
          <Row label={`TVA ${doc.taxRate} %`} value={formatCurrency(doc.tax)} />
        ) : null}
        <div className="mt-2 flex items-center justify-between border-t border-black/[0.07] pt-2 dark:border-white/10">
          <span className="text-sm font-semibold text-fs-text">Net à payer</span>
          <span className="text-lg font-bold text-fs-accent">{formatCurrency(doc.total)}</span>
        </div>
      </div>

      {stockLines > 0 ? (
        <p className="flex items-start gap-2 rounded-md bg-neutral-500/10 px-3 py-2 text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
          <MdInventory2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {stockLines} ligne{stockLines > 1 ? "s" : ""} sortiront du stock.
            {serviceLines > 0
              ? ` Les ${serviceLines} ligne${serviceLines > 1 ? "s" : ""} de prestation, non : on ne stocke pas des heures.`
              : ""}{" "}
            Si la marchandise manque, l&apos;émission est refusée et rien n&apos;est écrit.
          </span>
        </p>
      ) : null}

      <div>
        <span className="mb-1 block text-xs font-semibold text-neutral-600">
          Règlement du client
        </span>
        <div className="mb-2 flex gap-1.5">
          {METHODS.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition-colors",
                  method === m.id
                    ? "border-transparent bg-fs-accent text-white"
                    : "border-black/[0.1] bg-fs-card text-neutral-600 hover:border-fs-accent/40 dark:border-white/10 dark:text-neutral-300",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {m.label}
              </button>
            );
          })}
        </div>
        <SaleDocumentField
          label="Montant encaissé maintenant"
          hint="Laissez 0 si le client règle plus tard : le solde partira en crédit client."
        >
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className={fsInputClass("rounded-md")}
            inputMode="decimal"
          />
        </SaleDocumentField>
      </div>

      {remaining > 0 ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md px-3 py-2 text-[11px] leading-relaxed",
            blockedByCredit
              ? "bg-red-500/10 text-red-700 dark:text-red-300"
              : "bg-amber-500/10 text-amber-900 dark:text-amber-200",
          )}
        >
          <MdWarningAmber className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {blockedByCredit ? (
              <>
                <b>Rattachez d&apos;abord une fiche client.</b> Un solde de{" "}
                {formatCurrency(remaining)} laissé sans fiche serait une créance que
                personne ne pourrait relancer. Modifiez la facture pour y choisir un client.
              </>
            ) : (
              <>
                {formatCurrency(remaining)} resteront dus par{" "}
                <b>{saleDocumentCustomerLabel(doc)}</b>, et apparaîtront dans la page Crédit
                comme n&apos;importe quelle vente à crédit.
              </>
            )}
          </span>
        </div>
      ) : null}
    </SaleDocumentDialogShell>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold",
          tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-fs-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}
