import {
  addDays,
  differenceInCalendarDays,
  isThisWeek,
  isToday,
  parseISO,
  startOfDay,
} from "date-fns";
import type {
  CreditPaymentRow,
  CreditLineStatus,
  CreditSaleRow,
  CustomerCreditAggregate,
} from "./types";

/** Tolérance arrondis monnaie (FCFA, etc.). */
export const CREDIT_AMOUNT_EPS = 0.005;

const EPS = CREDIT_AMOUNT_EPS;

/**
 * Encaissements réels (espèces, mobile money, carte, virement).
 * Les lignes `method === "other"` sont la convention POS / facture A4 pour le solde « à crédit »
 * (pas d’argent encaissé à la vente) — elles ne réduisent pas le reste à payer.
 */
export function realizedPaidTotal(sale: CreditSaleRow): number {
  return (sale.sale_payments ?? []).reduce((s, p) => {
    if (p.method === "other") return s;
    return s + Number(p.amount);
  }, 0);
}

/** Alias métier page Crédit / créances (hors lignes crédit comptable). */
export function paidTotal(sale: CreditSaleRow): number {
  return realizedPaidTotal(sale);
}

/** Somme brute de toutes les lignes `sale_payments` (audit — inclut les montants « à crédit »). */
export function grossRecordedPaymentsTotal(payments: CreditPaymentRow[]): number {
  return payments.reduce((s, p) => s + Number(p.amount), 0);
}

export function remainingTotal(sale: CreditSaleRow): number {
  return Math.max(0, Number(sale.total) - paidTotal(sale));
}

/** Échéance : base de données ou +30 jours après la vente (défaut Burkina / pratique métier). */
export function effectiveDueDate(sale: CreditSaleRow): Date {
  if (sale.credit_due_at) {
    const d = parseISO(sale.credit_due_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const created = parseISO(sale.created_at);
  return addDays(Number.isNaN(created.getTime()) ? new Date() : created, 30);
}

export function daysOverdue(sale: CreditSaleRow, now = new Date()): number {
  const rem = remainingTotal(sale);
  if (rem <= EPS) return 0;
  const due = startOfDay(effectiveDueDate(sale));
  const nd = startOfDay(now);
  const diff = differenceInCalendarDays(nd, due);
  return diff > 0 ? diff : 0;
}

export function creditLineStatus(sale: CreditSaleRow, now = new Date()): CreditLineStatus {
  if (sale.status === "cancelled" || sale.status === "refunded") return "annule";
  const rem = remainingTotal(sale);
  if (rem <= EPS) return "solde";
  const paid = paidTotal(sale);
  const overdue = daysOverdue(sale, now) > 0;
  if (overdue) return "en_retard";
  if (paid <= EPS) return "non_paye";
  return "partiel";
}

export function dueBadgeVariant(
  sale: CreditSaleRow,
  now = new Date(),
): "ok" | "soon" | "late" {
  const rem = remainingTotal(sale);
  if (rem <= EPS) return "ok";
  if (daysOverdue(sale, now) > 0) return "late";
  const due = startOfDay(effectiveDueDate(sale));
  const nd = startOfDay(now);
  const daysTo = differenceInCalendarDays(due, nd);
  if (daysTo <= 7) return "soon";
  return "ok";
}

export function isDueToday(sale: CreditSaleRow, now = new Date()): boolean {
  if (remainingTotal(sale) <= EPS) return false;
  return isToday(effectiveDueDate(sale));
}

export function isDueThisWeek(sale: CreditSaleRow, now = new Date()): boolean {
  if (remainingTotal(sale) <= EPS) return false;
  const d = effectiveDueDate(sale);
  if (isToday(d)) return true;
  return isThisWeek(d, { weekStartsOn: 1 });
}

export const CREDIT_STATUS_LABELS: Record<CreditLineStatus, string> = {
  non_paye: "Non payé",
  partiel: "Partiellement payé",
  solde: "Soldé",
  en_retard: "En retard",
  annule: "Annulé",
};

function maxRealizedPaymentDate(sale: CreditSaleRow): string | null {
  const pays = (sale.sale_payments ?? []).filter((p) => p.method !== "other");
  if (pays.length === 0) return null;
  let best = pays[0]!.created_at;
  for (const p of pays) {
    if (p.created_at > best) best = p.created_at;
  }
  return best;
}

/** Agrège les ventes ouvertes (reste > 0) par client. */
export function buildCustomerAggregates(sales: CreditSaleRow[]): CustomerCreditAggregate[] {
  const byCustomer = new Map<string, CreditSaleRow[]>();
  for (const s of sales) {
    if (!s.customer_id || !s.customer) continue;
    const arr = byCustomer.get(s.customer_id) ?? [];
    arr.push(s);
    byCustomer.set(s.customer_id, arr);
  }

  const out: CustomerCreditAggregate[] = [];
  for (const [customerId, list] of byCustomer) {
    const open = list.filter((s) => remainingTotal(s) > EPS);
    if (open.length === 0) continue;
    const c = list[0]!.customer!;
    let totalDue = 0;
    let overdueAmount = 0;
    let nextDue: Date | null = null;
    let lastPay: string | null = null;
    for (const s of open) {
      const r = remainingTotal(s);
      totalDue += r;
      if (daysOverdue(s) > 0) overdueAmount += r;
      const d = effectiveDueDate(s);
      if (!nextDue || d < nextDue) nextDue = d;
      const mp = maxRealizedPaymentDate(s);
      if (mp && (!lastPay || mp > lastPay)) lastPay = mp;
    }
    let risk: CustomerCreditAggregate["risk"] = "normal";
    if (overdueAmount > EPS) {
      risk = overdueAmount >= totalDue * 0.5 ? "critique" : "attention";
    }
    out.push({
      customerId,
      customerName: c.name,
      phone: c.phone,
      openSaleCount: open.length,
      totalDue,
      overdueAmount,
      lastPaymentAt: lastPay,
      nextDueAt: nextDue ? nextDue.toISOString() : null,
      risk,
    });
  }
  out.sort((a, b) => b.totalDue - a.totalDue);
  return out;
}
