"use client";

import { useMemo, useState } from "react";
import { MdAdd, MdClose, MdDelete } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { postManualEntry } from "@/lib/features/accounting/api";
import type { AccountingAccount, AccountingJournal, ManualEntryLineInput } from "@/lib/features/accounting/types";
import { messageFromUnknownError, toast } from "@/lib/toast";

type DraftLine = {
  key: string;
  accountId: string;
  label: string;
  debit: string;
  credit: string;
};

function newLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    accountId: "",
    label: "",
    debit: "",
    credit: "",
  };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const fmt = (n: number) => n.toLocaleString("fr-FR");

/** Saisie d'une écriture comptable manuelle en partie double (contrôle d'équilibre en direct). */
export function ManualEntryDialog({
  companyId,
  journals,
  accounts,
  onClose,
  onSaved,
}: {
  companyId: string;
  journals: AccountingJournal[];
  accounts: AccountingAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultJournal = journals.find((j) => j.code === "OD") ?? journals[0];
  const [journalId, setJournalId] = useState(defaultJournal?.id ?? "");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine(), newLine()]);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      debit += Math.max(0, Math.round(Number(l.debit) || 0));
      credit += Math.max(0, Math.round(Number(l.credit) || 0));
    }
    return { debit, credit, diff: debit - credit };
  }, [lines]);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.isActive),
    [accounts],
  );

  const validLineCount = lines.filter((l) => {
    const d = Math.round(Number(l.debit) || 0);
    const c = Math.round(Number(l.credit) || 0);
    return l.accountId && ((d > 0 && c === 0) || (c > 0 && d === 0));
  }).length;

  const canSave =
    !saving &&
    journalId !== "" &&
    label.trim().length > 0 &&
    totals.debit > 0 &&
    totals.diff === 0 &&
    validLineCount >= 2 &&
    validLineCount === lines.filter((l) => l.accountId || l.debit || l.credit).length;

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: ManualEntryLineInput[] = lines
        .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l) => ({
          accountId: l.accountId,
          label: l.label,
          debit: Math.max(0, Math.round(Number(l.debit) || 0)),
          credit: Math.max(0, Math.round(Number(l.credit) || 0)),
        }));
      await postManualEntry({
        companyId,
        journalId,
        entryDate,
        label,
        reference: reference.trim() || null,
        lines: payload,
      });
      toast.success("Écriture enregistrée");
      onSaved();
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nouvelle écriture comptable"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-fs-card shadow-xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 px-4 py-3">
          <h2 className="text-base font-bold text-fs-text">Nouvelle écriture</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/8 bg-fs-card text-neutral-700 disabled:opacity-50"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-600">Journal</span>
              <select
                className={fsInputClass()}
                value={journalId}
                onChange={(e) => setJournalId(e.target.value)}
              >
                {journals.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} — {j.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-600">Date</span>
              <input
                type="date"
                className={fsInputClass()}
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-neutral-600">Libellé</span>
              <input
                type="text"
                className={fsInputClass()}
                placeholder="Ex. Règlement facture client X"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-neutral-600">
                Référence / n° de pièce (optionnel)
              </span>
              <input
                type="text"
                className={fsInputClass()}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Lignes (partie double)
              </span>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, newLine()])}
                className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-fs-text hover:bg-fs-surface-container"
              >
                <MdAdd className="h-4 w-4" aria-hidden />
                Ligne
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((l) => (
                <div
                  key={l.key}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-black/[0.06] bg-fs-surface/40 p-2 sm:grid-cols-[1.6fr_1.4fr_1fr_1fr_auto] sm:items-center"
                >
                  <select
                    className={fsInputClass("text-sm")}
                    value={l.accountId}
                    onChange={(e) => patchLine(l.key, { accountId: e.target.value })}
                  >
                    <option value="">Compte…</option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className={fsInputClass("text-sm")}
                    placeholder="Libellé ligne"
                    value={l.label}
                    onChange={(e) => patchLine(l.key, { label: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className={fsInputClass("text-sm")}
                    placeholder="Débit"
                    value={l.debit}
                    onChange={(e) => patchLine(l.key, { debit: e.target.value, credit: "" })}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className={fsInputClass("text-sm")}
                    placeholder="Crédit"
                    value={l.credit}
                    onChange={(e) => patchLine(l.key, { credit: e.target.value, debit: "" })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => (prev.length <= 2 ? prev : prev.filter((x) => x.key !== l.key)))
                    }
                    disabled={lines.length <= 2}
                    className="inline-flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30"
                    aria-label="Supprimer la ligne"
                  >
                    <MdDelete className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-black/6 px-4 py-3">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
            <span className="text-neutral-600">
              Débit : <span className="font-semibold text-fs-text">{fmt(totals.debit)} FCFA</span>
            </span>
            <span className="text-neutral-600">
              Crédit : <span className="font-semibold text-fs-text">{fmt(totals.credit)} FCFA</span>
            </span>
            <span
              className={
                totals.diff === 0 && totals.debit > 0
                  ? "font-semibold text-green-700"
                  : "font-semibold text-red-600"
              }
            >
              {totals.diff === 0 ? "Équilibré ✓" : `Écart : ${fmt(Math.abs(totals.diff))} FCFA`}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-fs-text disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-xl bg-fs-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
