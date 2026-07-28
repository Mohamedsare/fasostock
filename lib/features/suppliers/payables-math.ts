import { daysSince } from "./api";
import type {
  SupplierAccount,
  SupplierAgingBuckets,
  SupplierInvoice,
} from "./types";

/** Reste à payer d'une dette (0 si annulée). */
export function invoiceDue(inv: SupplierInvoice): number {
  if (inv.status === "cancelled") return 0;
  return Math.max(0, inv.amount - inv.paidAmount);
}

/** Jours de retard d'une dette : > 0 en retard, < 0 encore dans les délais. */
export function invoiceDaysLate(inv: SupplierInvoice): number {
  return daysSince(inv.dueDate);
}

export type InvoiceUrgency = "overdue" | "today" | "soon" | "later" | "settled";

/**
 * Urgence d'une dette — c'est ce qui pilote toute la couleur de la page.
 * « soon » = échéance dans les 7 jours, la fenêtre où il faut préparer l'argent.
 */
export function invoiceUrgency(inv: SupplierInvoice): InvoiceUrgency {
  if (invoiceDue(inv) <= 0) return "settled";
  const late = invoiceDaysLate(inv);
  if (late > 0) return "overdue";
  if (late === 0) return "today";
  if (late >= -7) return "soon";
  return "later";
}

export const URGENCY_LABELS: Record<InvoiceUrgency, string> = {
  overdue: "En retard",
  today: "Échoit aujourd'hui",
  soon: "Sous 7 jours",
  later: "À venir",
  settled: "Soldée",
};

/** Balance âgée : depuis combien de temps l'argent est dû. */
export function agingBuckets(invoices: SupplierInvoice[]): SupplierAgingBuckets {
  const b: SupplierAgingBuckets = { notDue: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0 };
  for (const inv of invoices) {
    const due = invoiceDue(inv);
    if (due <= 0) continue;
    const late = invoiceDaysLate(inv);
    if (late <= 0) b.notDue += due;
    else if (late <= 30) b.d1to30 += due;
    else if (late <= 60) b.d31to60 += due;
    else if (late <= 90) b.d61to90 += due;
    else b.d90plus += due;
  }
  return b;
}

export type PayablesTotals = {
  balance: number;
  overdue: number;
  dueSoon: number;
  credit: number;
  suppliersWithDebt: number;
  suppliersOverdue: number;
  openInvoices: number;
  worstDaysLate: number;
};

export function payablesTotals(accounts: SupplierAccount[]): PayablesTotals {
  let balance = 0;
  let overdue = 0;
  let dueSoon = 0;
  let credit = 0;
  let suppliersWithDebt = 0;
  let suppliersOverdue = 0;
  let openInvoices = 0;
  let worstDaysLate = 0;

  for (const a of accounts) {
    balance += a.stats.balance;
    overdue += a.stats.overdueAmount;
    dueSoon += a.stats.dueSoonAmount;
    credit += a.stats.creditAvailable;
    openInvoices += a.stats.openInvoices;
    if (a.stats.balance > 0) suppliersWithDebt += 1;
    if (a.stats.overdueAmount > 0) suppliersOverdue += 1;
    if (a.daysLate > worstDaysLate) worstDaysLate = a.daysLate;
  }

  return {
    balance,
    overdue,
    dueSoon,
    credit,
    suppliersWithDebt,
    suppliersOverdue,
    openInvoices,
    worstDaysLate,
  };
}

/**
 * Échéancier des 8 prochaines semaines : combien il faut sortir, et quand.
 * Le retard est regroupé dans une première barre « En retard » — c'est de
 * l'argent à sortir maintenant, pas dans une semaine.
 */
export type CashOutSlot = { key: string; label: string; amount: number; overdue: boolean };

export function cashOutSchedule(invoices: SupplierInvoice[], weeks = 8): CashOutSlot[] {
  const slots: CashOutSlot[] = [
    { key: "overdue", label: "En retard", amount: 0, overdue: true },
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < weeks; i += 1) {
    const start = new Date(today);
    start.setDate(start.getDate() + i * 7);
    slots.push({
      key: `w${i}`,
      label: i === 0 ? "Cette semaine" : `S+${i}`,
      amount: 0,
      overdue: false,
    });
  }

  for (const inv of invoices) {
    const due = invoiceDue(inv);
    if (due <= 0) continue;
    const late = invoiceDaysLate(inv);
    if (late > 0) {
      slots[0]!.amount += due;
      continue;
    }
    const idx = Math.min(weeks - 1, Math.floor(-late / 7));
    slots[idx + 1]!.amount += due;
  }

  return slots;
}

/** Date courte « 12 mars » / « 12 mars 2025 » si l'année diffère. */
export function formatDayFr(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

export function formatDateTimeFr(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDayFr(iso)} · ${d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** « en retard de 12 j » / « dans 5 j » / « aujourd'hui ». */
export function dueLabel(dueDate: string): string {
  const late = daysSince(dueDate);
  if (late === 0) return "aujourd'hui";
  if (late > 0) return `en retard de ${late} j`;
  return `dans ${-late} j`;
}

/** Échéance proposée par défaut à partir des conditions du fournisseur. */
export function defaultDueDate(termsDays: number, fromIso?: string): string {
  const base = fromIso ? new Date(`${fromIso}T00:00:00`) : new Date();
  base.setDate(base.getDate() + Math.max(0, Math.trunc(termsDays)));
  return base.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
