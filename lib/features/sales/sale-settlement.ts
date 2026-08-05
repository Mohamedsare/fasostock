import type { CreditPaymentRow } from "@/lib/features/credit/types";

/** Tolérance arrondis monnaie (FCFA, etc.) — alignée sur `CREDIT_AMOUNT_EPS`. */
export const SETTLEMENT_EPS = 0.005;

/**
 * Fenêtre (ms) sous laquelle un paiement est considéré comme encaissé *pendant* la vente.
 * Les lignes `sale_payments` créées avec la vente sont insérées dans la même transaction
 * (écart ≈ 0) : au-delà, c'est un passage en caisse ultérieur = remboursement de crédit.
 */
export const AT_SALE_WINDOW_MS = 10_000;

/** Vente minimale nécessaire au calcul (compatible `SaleItem` comme `CreditSaleRow`). */
export type SettlementSale = {
  total: number;
  created_at: string;
  status?: string;
  sale_payments?: CreditPaymentRow[] | null;
};

export type SettlementKind =
  /** Rien à devoir : total encaissé. */
  | "paid"
  /** Une partie encaissée (acompte et/ou remboursements), reste dû. */
  | "partial"
  /** Aucun encaissement : tout le montant est à crédit. */
  | "credit"
  /** Vente annulée / remboursée : la créance n'est plus exigible. */
  | "void";

export type SaleSettlement = {
  /** Montant mis à crédit à la vente (Σ lignes `method = 'other'`). */
  credit: number;
  /** Acompte encaissé au moment de la vente (≠ remboursement de crédit). */
  downPayment: number;
  /** Encaissé après la vente, en recouvrement du crédit. */
  repaidAfterSale: number;
  /** Total réellement encaissé = acompte + remboursements. */
  paid: number;
  /** Reste dû (0 si vente annulée/remboursée). */
  remaining: number;
  kind: SettlementKind;
  /** La vente a une ligne « à crédit » : l'acompte a un sens pour elle. */
  hasCredit: boolean;
};

/**
 * Décompose le règlement d'une vente. Règle unique partagée par les pages Ventes et Crédit :
 * un paiement enregistré dans la foulée de la vente est un **acompte**, un paiement postérieur
 * est un **remboursement de crédit**.
 */
export function saleSettlement(sale: SettlementSale): SaleSettlement {
  const saleAt = Date.parse(sale.created_at);
  let credit = 0;
  let downPayment = 0;
  let repaidAfterSale = 0;

  for (const p of sale.sale_payments ?? []) {
    const amount = Number(p.amount ?? 0);
    if (p.method === "other") {
      credit += amount;
      continue;
    }
    const gap = Date.parse(p.created_at) - saleAt;
    if (Number.isFinite(gap) && gap > AT_SALE_WINDOW_MS) repaidAfterSale += amount;
    else downPayment += amount;
  }

  const paid = downPayment + repaidAfterSale;
  const voided = sale.status === "cancelled" || sale.status === "refunded";
  const remaining = voided ? 0 : Math.max(0, Number(sale.total) - paid);

  const kind: SettlementKind = voided
    ? "void"
    : remaining <= SETTLEMENT_EPS
      ? "paid"
      : paid <= SETTLEMENT_EPS
        ? "credit"
        : "partial";

  return {
    credit,
    downPayment,
    repaidAfterSale,
    paid,
    remaining,
    kind,
    hasCredit: credit > SETTLEMENT_EPS,
  };
}

export const SETTLEMENT_LABELS: Record<SettlementKind, string> = {
  paid: "Payé",
  partial: "Payé partiellement",
  credit: "À crédit",
  void: "—",
};

export function settlementPillClass(kind: SettlementKind): string {
  switch (kind) {
    case "paid":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "partial":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "credit":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "void":
      return "bg-neutral-400/15 text-neutral-500";
  }
}
