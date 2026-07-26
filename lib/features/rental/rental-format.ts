import type { RentalLease } from "./types";

/** `YYYY-MM-DD` d'une date locale (les colonnes `date` Postgres n'ont pas de fuseau). */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date courte lisible (`05/07/2026`). `null` → tiret. */
export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Mois en toutes lettres (`juillet 2026`). */
export function formatMonthFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(d);
}

/** Écart en jours entre une date et aujourd'hui (positif = dans le passé). */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** Retard d'un bail en jours (0 si à jour). */
export function lateDays(lease: RentalLease): number {
  if (lease.lateCount <= 0 || !lease.nextDueDate) return 0;
  return Math.max(0, daysSince(lease.nextDueDate) ?? 0);
}

/**
 * État de règlement d'un bail, du point de vue du bailleur.
 * `late` = au moins une échéance dépassée non soldée ; `advance` = payé d'avance.
 */
export type RentalLeaseHealth = "late" | "due" | "current" | "advance" | "closed";

export function leaseHealth(lease: RentalLease): RentalLeaseHealth {
  if (lease.status !== "active") return "closed";
  if (lease.lateCount > 0) return "late";
  if (lease.balance > 0.5) return "due";
  if (lease.balance < -0.5) return "advance";
  return "current";
}

export const RENTAL_HEALTH_LABELS: Record<RentalLeaseHealth, string> = {
  late: "En retard",
  due: "À encaisser",
  current: "À jour",
  advance: "Payé d'avance",
  closed: "Clôturé",
};

/**
 * Nombre de mois de loyer que représente un solde impayé — c'est le langage du
 * bailleur (« il doit 3 mois »), plus parlant qu'un montant brut.
 */
export function monthsOwed(lease: RentalLease): number {
  if (lease.rentAmount <= 0 || lease.balance <= 0) return 0;
  return Math.floor((lease.balance + 0.5) / lease.rentAmount);
}

/** Libellé compact de la situation (« 2 mois de retard », « à jour »). */
export function balanceLabel(lease: RentalLease): string {
  if (lease.balance > 0.5) {
    const m = monthsOwed(lease);
    if (m >= 1) return `${m} mois de loyer en attente`;
    return "Solde partiel en attente";
  }
  if (lease.balance < -0.5) return "Payé d'avance";
  return "À jour";
}
