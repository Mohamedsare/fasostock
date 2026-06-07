/**
 * Modèle de données + calculs du générateur public de Facture / Devis.
 * Pur (aucune dépendance React/DOM) — réutilisable et testable.
 */

export type FdDocType = "facture" | "devis";

export type FdLineItem = {
  id: string;
  designation: string;
  /** Quantité (≥ 0). */
  quantity: number;
  /** Prix unitaire HT dans la devise choisie. */
  unitPrice: number;
};

export type FdDiscountMode = "amount" | "percent";

export type FdDocument = {
  docType: FdDocType;
  /** Devise ISO 4217 (XOF, EUR, USD…). */
  currency: string;
  number: string;
  /** Date d'émission (yyyy-mm-dd). */
  date: string;
  /** Échéance (facture) / validité (devis), yyyy-mm-dd. Optionnel. */
  dueDate: string;
  logoDataUrl: string | null;
  senderName: string;
  senderDetails: string;
  clientName: string;
  clientDetails: string;
  items: FdLineItem[];
  /** Activer la TVA. */
  taxEnabled: boolean;
  /** Taux de TVA en %. */
  taxRate: number;
  discountMode: FdDiscountMode;
  /** Valeur de la remise (montant absolu ou %). */
  discountValue: number;
  notes: string;
};

export type FdTotals = {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineTotal(item: FdLineItem): number {
  const q = Number.isFinite(item.quantity) ? item.quantity : 0;
  const p = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return round2(Math.max(0, q) * Math.max(0, p));
}

export function computeTotals(doc: FdDocument): FdTotals {
  const subtotal = round2(doc.items.reduce((sum, it) => sum + lineTotal(it), 0));

  const rawDiscount =
    doc.discountMode === "percent"
      ? (subtotal * Math.max(0, doc.discountValue)) / 100
      : Math.max(0, doc.discountValue);
  const discountAmount = round2(Math.min(rawDiscount, subtotal));

  const taxableBase = round2(subtotal - discountAmount);
  const taxAmount = doc.taxEnabled ? round2((taxableBase * Math.max(0, doc.taxRate)) / 100) : 0;
  const total = round2(taxableBase + taxAmount);

  return { subtotal, discountAmount, taxableBase, taxAmount, total };
}

export const FD_CURRENCIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "XOF", label: "FCFA (XOF) — Franc CFA Ouest" },
  { code: "XAF", label: "FCFA (XAF) — Franc CFA Centre" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "Dollar US (USD)" },
  { code: "MAD", label: "Dirham (MAD)" },
  { code: "GHS", label: "Cedi (GHS)" },
  { code: "NGN", label: "Naira (NGN)" },
  { code: "CAD", label: "Dollar canadien (CAD)" },
  { code: "GBP", label: "Livre sterling (GBP)" },
];

/** Devises sans décimales usuelles (montants entiers). */
const ZERO_DECIMAL = new Set(["XOF", "XAF"]);

export function formatMoney(amount: number, currency: string): string {
  const fractionDigits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    // Devise non reconnue par Intl → repli simple.
    const n = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(Number.isFinite(amount) ? amount : 0);
    return `${n} ${currency}`;
  }
}

export function formatDateFr(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(d);
}

/** Libellés dépendant du type de document. */
export function docLabels(docType: FdDocType): {
  title: string;
  numberLabel: string;
  dateLabel: string;
  dueLabel: string;
  numberPrefix: string;
} {
  return docType === "facture"
    ? {
        title: "FACTURE",
        numberLabel: "Facture N°",
        dateLabel: "Date d’émission",
        dueLabel: "Date d’échéance",
        numberPrefix: "FAC",
      }
    : {
        title: "DEVIS",
        numberLabel: "Devis N°",
        dateLabel: "Date d’émission",
        dueLabel: "Valable jusqu’au",
        numberPrefix: "DEV",
      };
}

/** Numéro suggéré : PREFIX-AAAAMMJJ-XXX (aléatoire court). */
export function suggestNumber(docType: FdDocType, date: string): string {
  const { numberPrefix } = docLabels(docType);
  const compact = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const rand = Math.floor(100 + Math.random() * 900);
  return `${numberPrefix}-${compact}-${rand}`;
}
