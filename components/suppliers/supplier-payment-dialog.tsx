"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MdAutoAwesome, MdPayments, MdTune } from "react-icons/md";
import {
  SupplierDialogError,
  SupplierDialogShell,
  SupplierField,
  SupplierSubmitButton,
  supplierInputClass,
} from "@/components/suppliers/supplier-dialog-shell";
import {
  dueLabel,
  formatDayFr,
  invoiceDue,
  invoiceUrgency,
} from "@/lib/features/suppliers/payables-math";
import {
  SUPPLIER_PAYMENT_METHOD_LABELS,
  type SupplierAccount,
  type SupplierInvoice,
  type SupplierPaymentMethod,
} from "@/lib/features/suppliers/types";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

export type SupplierPaymentValue = {
  supplierId: string;
  amount: number;
  method: SupplierPaymentMethod;
  paidAt: string;
  reference: string;
  notes: string;
  allocations: { invoiceId: string; amount: number }[] | null;
};

const METHODS: SupplierPaymentMethod[] = [
  "cash",
  "mobile_money",
  "transfer",
  "card",
  "other",
];

function num(s: string): number {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Règlement d'un fournisseur.
 *
 * Deux modes d'imputation. « Automatique » solde les échéances les plus
 * anciennes d'abord (FIFO) — c'est ce que fait le commerçant dans sa tête.
 * « Choisir » sert quand le fournisseur exige qu'une facture précise soit
 * soldée. Le surplus éventuel devient une avance, jamais un montant perdu.
 */
export function SupplierPaymentDialog({
  open,
  onClose,
  suppliers,
  invoices,
  presetSupplierId,
  presetInvoiceId,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: SupplierAccount[];
  /** Dettes ouvertes, toutes fournisseurs confondus. */
  invoices: SupplierInvoice[];
  presetSupplierId?: string | null;
  presetInvoiceId?: string | null;
  onSubmit: (value: SupplierPaymentValue) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SupplierPaymentMethod>("cash");
  const [paidAt, setPaidAt] = useState(nowLocalInput());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les listes `suppliers` / `invoices` changent d'identité à chaque
  // rafraîchissement : sans ce garde-fou, un règlement en cours de saisie
  // serait réinitialisé. On n'initialise qu'à l'ouverture.
  const initedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      initedRef.current = false;
      return;
    }
    if (initedRef.current) return;
    initedRef.current = true;
    setBusy(false);
    setError(null);
    setMethod("cash");
    setPaidAt(nowLocalInput());
    setReference("");
    setNotes("");

    const sid =
      presetSupplierId ??
      invoices.find((i) => i.id === presetInvoiceId)?.supplierId ??
      suppliers.find((s) => s.stats.balance > 0)?.id ??
      suppliers[0]?.id ??
      "";
    setSupplierId(sid);

    if (presetInvoiceId) {
      const inv = invoices.find((i) => i.id === presetInvoiceId);
      setMode("manual");
      setPicked(inv ? { [inv.id]: String(invoiceDue(inv)) } : {});
      setAmount(inv ? String(invoiceDue(inv)) : "");
    } else {
      setMode("auto");
      setPicked({});
      setAmount("");
    }
  }, [open, presetSupplierId, presetInvoiceId, suppliers, invoices]);

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  const openInvoices = useMemo(
    () =>
      invoices
        .filter((i) => i.supplierId === supplierId && invoiceDue(i) > 0)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [invoices, supplierId],
  );

  const pickedTotal = useMemo(
    () =>
      openInvoices.reduce((acc, inv) => acc + Math.max(0, num(picked[inv.id] ?? "")), 0),
    [openInvoices, picked],
  );

  if (!open) return null;

  const value = mode === "manual" ? pickedTotal : num(amount);
  const balance = supplier?.stats.balance ?? 0;
  const surplus = Math.max(0, value - balance);

  function togglePick(inv: SupplierInvoice) {
    setPicked((p) => {
      const next = { ...p };
      if (next[inv.id] !== undefined) delete next[inv.id];
      else next[inv.id] = String(invoiceDue(inv));
      return next;
    });
  }

  function payAll() {
    setMode("auto");
    setAmount(String(balance));
  }

  async function submit() {
    setError(null);
    if (!supplierId) {
      setError("Choisissez un fournisseur.");
      return;
    }
    if (value <= 0) {
      setError("Le montant du règlement doit être supérieur à 0.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit({
        supplierId,
        amount: value,
        method,
        paidAt: new Date(paidAt).toISOString(),
        reference,
        notes,
        allocations:
          mode === "manual"
            ? openInvoices
                .filter((inv) => num(picked[inv.id] ?? "") > 0)
                .map((inv) => ({
                  invoiceId: inv.id,
                  amount: Math.min(num(picked[inv.id] ?? ""), invoiceDue(inv)),
                }))
            : null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SupplierDialogShell
      title="Payer un fournisseur"
      subtitle={supplier ? `${supplier.name} · dette ${formatCurrency(balance)}` : undefined}
      icon={<MdPayments className="h-5 w-5 text-emerald-600" aria-hidden />}
      onClose={onClose}
      busy={busy}
      maxWidth="max-w-xl"
      footer={
        <div className="space-y-2">
          {value > 0 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">Reste dû après règlement</span>
              <span className="font-bold text-fs-text">
                {formatCurrency(Math.max(0, balance - value))}
              </span>
            </div>
          ) : null}
          <SupplierSubmitButton
            label={value > 0 ? `Payer ${formatCurrency(value)}` : "Payer"}
            onClick={submit}
            busy={busy}
            disabled={value <= 0 || !supplierId}
            tone="emerald"
          />
        </div>
      }
    >
      <SupplierDialogError message={error} />

      <SupplierField label="Fournisseur *">
        <select
          className={supplierInputClass}
          value={supplierId}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setPicked({});
            setAmount("");
          }}
        >
          <option value="">— Choisir —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.stats.balance > 0 ? ` · dette ${formatCurrency(s.stats.balance)}` : ""}
            </option>
          ))}
        </select>
      </SupplierField>

      {supplier && supplier.stats.creditAvailable > 0 ? (
        <p className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          Une avance de {formatCurrency(supplier.stats.creditAvailable)} est déjà versée à ce
          fournisseur et non imputée.
        </p>
      ) : null}

      <div className="flex gap-2">
        {(
          [
            { key: "auto", label: "Imputation auto", icon: MdAutoAwesome },
            { key: "manual", label: "Choisir les dettes", icon: MdTune },
          ] as const
        ).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold",
              mode === m.key
                ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-black/[0.08] bg-fs-card text-neutral-700",
            )}
          >
            <m.icon className="h-4 w-4" aria-hidden />
            {m.label}
          </button>
        ))}
      </div>

      {mode === "auto" ? (
        <SupplierField
          label="Montant versé *"
          hint="Solde d'abord les échéances les plus anciennes. Le surplus reste en avance."
        >
          <input
            className={cn(supplierInputClass, "text-lg font-bold")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoFocus
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {balance > 0 ? (
              <button
                type="button"
                onClick={payAll}
                className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                Tout solder · {formatCurrency(balance)}
              </button>
            ) : null}
            {supplier && supplier.stats.overdueAmount > 0 ? (
              <button
                type="button"
                onClick={() => setAmount(String(supplier.stats.overdueAmount))}
                className="rounded-lg border border-red-500/40 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300"
              >
                Le retard · {formatCurrency(supplier.stats.overdueAmount)}
              </button>
            ) : null}
          </div>
        </SupplierField>
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold text-neutral-600">
            Dettes à solder ({openInvoices.length})
          </p>
          {openInvoices.length === 0 ? (
            <p className="rounded-xl border border-black/[0.08] bg-fs-surface-container px-3 py-4 text-center text-xs text-neutral-500">
              Aucune dette ouverte pour ce fournisseur. Le versement sera enregistré comme
              avance.
            </p>
          ) : (
            <div className="space-y-2">
              {openInvoices.map((inv) => {
                const checked = picked[inv.id] !== undefined;
                const urgency = invoiceUrgency(inv);
                return (
                  <div
                    key={inv.id}
                    className={cn(
                      "rounded-xl border px-3 py-2.5",
                      checked
                        ? "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/30"
                        : "border-black/[0.08] bg-fs-card",
                    )}
                  >
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
                        checked={checked}
                        onChange={() => togglePick(inv)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fs-text">
                          {inv.label || inv.invoiceNumber || "Dette"}
                        </span>
                        <span
                          className={cn(
                            "block text-[11px]",
                            urgency === "overdue" ? "text-red-600" : "text-neutral-500",
                          )}
                        >
                          Échéance {formatDayFr(inv.dueDate)} · {dueLabel(inv.dueDate)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-sm font-bold text-red-600">
                        {formatCurrency(invoiceDue(inv))}
                      </span>
                    </label>
                    {checked ? (
                      <input
                        className={cn(supplierInputClass, "mt-2")}
                        value={picked[inv.id] ?? ""}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [inv.id]: e.target.value }))
                        }
                        inputMode="decimal"
                        placeholder="Montant imputé"
                        aria-label="Montant imputé sur cette dette"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {surplus > 0 ? (
        <p className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          {formatCurrency(surplus)} dépassent la dette actuelle : ce surplus sera gardé en
          avance chez ce fournisseur.
        </p>
      ) : null}

      <SupplierField label="Mode de paiement">
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-xs font-semibold",
                method === m
                  ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)] text-fs-accent"
                  : "border-black/[0.08] bg-fs-card text-neutral-700",
              )}
            >
              {SUPPLIER_PAYMENT_METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </SupplierField>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <SupplierField label="Date et heure">
          <input
            type="datetime-local"
            className={supplierInputClass}
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </SupplierField>
        <SupplierField label="Référence" hint="N° de transfert, reçu…">
          <input
            className={supplierInputClass}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="OM-4587…"
          />
        </SupplierField>
      </div>

      <SupplierField label="Notes">
        <textarea
          className={cn(supplierInputClass, "min-h-[60px] resize-none")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Remis à…"
        />
      </SupplierField>
    </SupplierDialogShell>
  );
}
