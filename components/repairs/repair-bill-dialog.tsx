"use client";

import { useMemo, useState } from "react";
import { MdCreditCard, MdPayments, MdPhoneIphone, MdWarningAmber } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { RepairDialogShell, RepairField } from "./repair-dialog-shell";
import {
  repairOrderSplit,
  repairOrderTotal,
  vehicleLabel,
  type RepairOrder,
} from "@/lib/features/repairs/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

type Method = "cash" | "mobile_money" | "card" | "other";

const METHODS: { id: Method; label: string; icon: typeof MdPayments }[] = [
  { id: "cash", label: "Espèces", icon: MdPayments },
  { id: "mobile_money", label: "Mobile money", icon: MdPhoneIphone },
  { id: "card", label: "Carte", icon: MdCreditCard },
];

export function RepairBillDialog({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: RepairOrder;
  busy: boolean;
  onClose: () => void;
  onConfirm: (params: {
    payments: Array<{ method: Method; amount: number; reference?: string | null }>;
    discount: number;
  }) => void;
}) {
  const subtotal = useMemo(() => repairOrderTotal(order.lines), [order.lines]);
  const split = useMemo(() => repairOrderSplit(order.lines), [order.lines]);

  const [discountText, setDiscountText] = useState("0");
  const [method, setMethod] = useState<Method>("cash");
  const [amountText, setAmountText] = useState(() => String(subtotal));

  const discount = Math.min(Math.max(0, toNumber(discountText)), subtotal);
  const total = Math.max(0, subtotal - discount);
  const paid = Math.min(Math.max(0, toNumber(amountText)), total);
  const remaining = Math.max(0, total - paid);

  const hasParts = order.lines.some((l) => l.kind === "part");
  const canCredit = order.customerId != null;
  // Sans fiche client, une facture partiellement réglée créerait une créance
  // que personne ne pourrait relancer : on l'interdit ici plutôt qu'après coup.
  const blockedByCredit = remaining > 0 && !canCredit;

  return (
    <RepairDialogShell
      title={`Facturer ${order.orderNumber}`}
      subtitle={vehicleLabel(order)}
      onClose={onClose}
      busy={busy}
      maxWidth="max-w-lg"
      footer={
        <button
          type="button"
          disabled={busy || total <= 0 || blockedByCredit}
          onClick={() =>
            onConfirm({
              payments: paid > 0 ? [{ method, amount: paid }] : [],
              discount,
            })
          }
          className="fs-touch-target w-full rounded-xl bg-fs-accent py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy
            ? "Facturation…"
            : remaining > 0
              ? `Facturer et laisser ${formatCurrency(remaining)} à crédit`
              : `Facturer et encaisser ${formatCurrency(total)}`}
        </button>
      }
    >
      {/* Récapitulatif */}
      <div className="rounded-xl border border-black/[0.07] bg-fs-surface-container/50 p-3 dark:border-white/10">
        <Row label="Pièces" value={formatCurrency(split.parts)} />
        <Row label="Main-d'œuvre" value={formatCurrency(split.labor)} />
        {discount > 0 ? (
          <Row label="Remise" value={`− ${formatCurrency(discount)}`} tone="accent" />
        ) : null}
        <div className="mt-2 flex items-center justify-between border-t border-black/[0.07] pt-2 dark:border-white/10">
          <span className="text-sm font-semibold text-fs-text">Total à payer</span>
          <span className="text-lg font-bold text-fs-accent">{formatCurrency(total)}</span>
        </div>
      </div>

      {hasParts ? (
        <p className="flex gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-800 dark:text-sky-300">
          <MdInfo />
          Les pièces montées sortiront du stock au moment de la facturation. La
          main-d&apos;œuvre, elle, ne touche pas au stock.
        </p>
      ) : null}

      <RepairField label="Remise accordée" hint="Laissez 0 s'il n'y a pas de geste commercial.">
        <input
          value={discountText}
          onChange={(e) => setDiscountText(e.target.value)}
          className={fsInputClass()}
          inputMode="decimal"
        />
      </RepairField>

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
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors",
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
        <input
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          className={fsInputClass()}
          inputMode="decimal"
          aria-label="Montant réglé"
        />
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => setAmountText(String(total))}
            className="flex-1 rounded-lg border border-black/[0.1] py-1.5 text-[11px] font-semibold text-fs-text hover:border-fs-accent/40 dark:border-white/10"
          >
            Tout payé
          </button>
          <button
            type="button"
            onClick={() => setAmountText("0")}
            className="flex-1 rounded-lg border border-black/[0.1] py-1.5 text-[11px] font-semibold text-fs-text hover:border-fs-accent/40 dark:border-white/10"
          >
            Rien maintenant
          </button>
        </div>
      </div>

      {remaining > 0 ? (
        <p
          className={cn(
            "flex gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed",
            blockedByCredit
              ? "bg-red-500/10 text-red-800 dark:text-red-300"
              : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
          )}
        >
          <MdWarningAmber className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {blockedByCredit
            ? "Rattachez une fiche client à l'ordre pour laisser un reste à payer : sans elle, la créance ne pourra être relancée par personne."
            : `${formatCurrency(remaining)} resteront dus. La facture apparaîtra dans « Factures impayées ».`}
        </p>
      ) : null}
    </RepairDialogShell>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold",
          tone === "accent" ? "text-fs-accent" : "text-fs-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MdInfo() {
  return (
    <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current" aria-hidden />
  );
}
