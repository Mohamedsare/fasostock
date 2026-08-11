import type { SaleItem } from "./types";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import { escapeCsv } from "@/lib/utils/csv";
import { saleSellerLabel, saleStoreLabel } from "./sale-display";
import { SETTLEMENT_LABELS, saleSettlement } from "./sale-settlement";
import { saleDelivery } from "./sale-delivery";
import { computeSaleProfit, type SaleCostAggregate } from "./sale-profit";
import { salePaymentsLabel } from "@/lib/features/payments/payment-display";

const SALES_HEADERS = [
  "numero",
  "date",
  "boutique",
  "vente_par",
  "client",
  "statut",
  "sous_total",
  "remise",
  "tva",
  "total",
  "acompte",
  "reste_du",
  "paiement",
  "reglement",
  // Suivi de retrait (00188) : « À retirer » = payée, marchandise encore en boutique.
  "retrait",
  "retrait_prevu_le",
  "retrait_note",
] as const;

/** Colonnes ajoutées seulement si le coût d'achat est fourni (droit « bénéfice »). */
const PROFIT_HEADERS = ["cout_achat", "benefice", "marge_pct"] as const;

export function salesToSpreadsheetMatrix(
  sales: SaleItem[],
  stores: { id: string; name: string }[] = [],
  options?: {
    /**
     * Coût d'achat par vente. Fourni ⇒ trois colonnes de plus ; absent ⇒ export
     * identique à avant (un caissier n'exporte pas de colonnes vides).
     */
    costById?: Record<string, SaleCostAggregate>;
  },
): { headers: string[]; rows: ProSheetCell[][] } {
  const costById = options?.costById;
  const rows: ProSheetCell[][] = sales.map((s) => {
    const date = s.created_at?.slice(0, 19) ?? "";
    const st = saleSettlement(s);
    const dl = saleDelivery(s);
    const base: ProSheetCell[] = [
      s.sale_number ?? "",
      date,
      saleStoreLabel(s, stores),
      saleSellerLabel(s),
      s.customer?.name ?? "",
      s.status ?? "",
      Number(s.subtotal ?? 0),
      Number(s.discount ?? 0),
      Number(s.tax ?? 0),
      Number(s.total ?? 0),
      st.hasCredit ? st.downPayment : 0,
      st.remaining,
      salePaymentsLabel(s.sale_payments),
      SETTLEMENT_LABELS[st.kind],
      dl.awaiting ? "A retirer" : "Remis",
      dl.awaiting ? dl.dueAt ?? "" : "",
      dl.awaiting ? dl.note ?? "" : "",
    ];
    if (!costById) return base;
    const profit = computeSaleProfit(s, costById[s.id]);
    // Bénéfice incalculable (aucun prix d'achat connu) : cellules vides, pas des zéros
    // qui se laisseraient additionner dans un tableau croisé.
    if (!profit || profit.unknown) return [...base, "", "", ""];
    return [
      ...base,
      Math.round(profit.cost),
      Math.round(profit.profit),
      Math.round(profit.marginPercent),
    ];
  });
  return {
    headers: costById ? [...SALES_HEADERS, ...PROFIT_HEADERS] : [...SALES_HEADERS],
    rows,
  };
}

export function salesToCsv(
  sales: SaleItem[],
  stores: { id: string; name: string }[] = [],
): string {
  const { headers, rows } = salesToSpreadsheetMatrix(sales, stores);
  const esc = (v: ProSheetCell) =>
    typeof v === "number" ? String(v) : escapeCsv(String(v ?? ""));
  const lines = rows.map((r) => r.map(esc).join(","));
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}
