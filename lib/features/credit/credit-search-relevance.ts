import type { CreditSaleRow, CustomerCreditAggregate } from "@/lib/features/credit/types";
import type { WarehouseDispatchInvoiceSummary } from "@/lib/features/warehouse/types";

/** Aligné Flutter `credit_page.dart` (_saleSearchRelevance, etc.). */
export function saleSearchRelevance(s: CreditSaleRow, q: string, numOnly: string): number {
  if (!q && !numOnly) return 0;
  let score = 0;
  const saleNum = (s.sale_number ?? "").toLowerCase();
  const name = (s.customer?.name ?? "").toLowerCase();
  const phoneDigits = (s.customer?.phone ?? "").replace(/\s/g, "");
  const seller = (s.created_by_label ?? "").toLowerCase();
  const store = (s.store?.name ?? "").toLowerCase();
  const tot = String(s.total);
  const id = (s.id ?? "").toLowerCase();

  const bumpField = (hay: string, prefixWt: number, containsWt: number) => {
    if (!hay || !hay.includes(q)) return;
    score += hay.startsWith(q) ? prefixWt : containsWt;
    score += Math.max(0, 28 - Math.min(hay.indexOf(q), 28));
  };

  bumpField(saleNum, 120, 56);
  bumpField(name, 112, 52);
  bumpField(store, 40, 22);
  if (id.includes(q)) score += 35;
  if (numOnly && phoneDigits.includes(numOnly)) {
    score += phoneDigits.startsWith(numOnly) ? 92 : 50;
    score += Math.max(0, 16 - Math.min(phoneDigits.indexOf(numOnly), 16));
  }
  if (tot.includes(q)) score += 40;
  bumpField(seller, 42, 26);
  return score;
}

export function customerAggSearchRelevance(
  c: CustomerCreditAggregate,
  q: string,
  numOnly: string,
): number {
  if (!q && !numOnly) return 0;
  let score = 0;
  const name = c.customerName.toLowerCase();
  const phoneDigits = (c.phone ?? "").replace(/\s/g, "");
  if (name.includes(q)) {
    score += name.startsWith(q) ? 115 : 54;
    score += Math.max(0, 28 - Math.min(name.indexOf(q), 28));
  }
  if (numOnly && phoneDigits.includes(numOnly)) {
    score += phoneDigits.startsWith(numOnly) ? 95 : 52;
    score += Math.max(0, 16 - Math.min(phoneDigits.indexOf(numOnly), 16));
  }
  return score;
}

export function dispatchSearchRelevance(
  d: WarehouseDispatchInvoiceSummary,
  q: string,
  totalKnown: number | null,
): number {
  if (!q) return 0;
  let score = 0;
  const doc = (d.documentNumber ?? "").toLowerCase();
  const cust = (d.customerName ?? "").toLowerCase();
  const cre = (d.createdAt ?? "").toLowerCase();

  const bump = (hay: string, prefixWt: number, containsWt: number) => {
    if (!hay || !hay.includes(q)) return;
    score += hay.startsWith(q) ? prefixWt : containsWt;
    score += Math.max(0, 26 - Math.min(hay.indexOf(q), 26));
  };

  bump(doc, 118, 55);
  bump(cust, 108, 50);
  if (cre.includes(q)) score += 24;
  if (totalKnown != null && String(totalKnown).includes(q)) score += 38;
  return score;
}
