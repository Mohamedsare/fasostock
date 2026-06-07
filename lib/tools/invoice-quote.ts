/**
 * Modèle de données + calculs du générateur public de Facture / Devis.
 * Pur (aucune dépendance React/DOM) — réutilisable et testable.
 */

export type FdDocType = "facture" | "devis";

export type FdLineItem = {
  id: string;
  designation: string;
  /** Quantité (≥ 0). `null` = champ laissé vide (compté comme 0). */
  quantity: number | null;
  /** Prix unitaire HT dans la devise choisie. `null` = champ vide (compté comme 0). */
  unitPrice: number | null;
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
  /** Image de signature / cachet (data URL). */
  signatureDataUrl: string | null;
  /** Libellé sous la signature (ex. « Le gérant »). */
  signatureLabel: string;
  /** Devise secondaire pour conversion (ISO 4217). "" = désactivée. */
  secondaryCurrency: string;
  /** Taux : 1 [devise principale] = exchangeRate [devise secondaire]. */
  exchangeRate: number;
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
  const q = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0;
  const p = typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
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

/** Crée une ligne d'article vierge (id unique). */
export function createLineItem(): FdLineItem {
  return {
    id: `it_${Math.random().toString(36).slice(2, 10)}`,
    designation: "",
    quantity: 1,
    unitPrice: null,
  };
}

/** Document vierge par défaut (source unique pour le générateur et la route PDF). */
export function createEmptyDocument(): FdDocument {
  return {
    docType: "facture",
    currency: "XOF",
    number: "",
    date: "",
    dueDate: "",
    logoDataUrl: null,
    senderName: "",
    senderDetails: "",
    clientName: "",
    clientDetails: "",
    items: [createLineItem()],
    taxEnabled: false,
    taxRate: 18,
    discountMode: "amount",
    discountValue: 0,
    notes: "",
    signatureDataUrl: null,
    signatureLabel: "",
    secondaryCurrency: "",
    exchangeRate: 0,
  };
}

/** Conversion active ? (devise secondaire renseignée + taux > 0) */
export function hasConversion(doc: FdDocument): boolean {
  return Boolean(doc.secondaryCurrency) && Number.isFinite(doc.exchangeRate) && doc.exchangeRate > 0;
}

/** Nom de fichier proposé pour l'export PDF. */
export function pdfFileName(doc: FdDocument): string {
  const base = doc.docType === "facture" ? "Facture" : "Devis";
  const num = (doc.number || "").replace(/[^a-zA-Z0-9_-]/g, "") || new Date().toISOString().slice(0, 10);
  return `${base}_${num}`;
}

/* ---------- Brouillon : normalisation d'un JSON inconnu (localStorage) ---------- */

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Reconstruit un `FdDocument` valide à partir d'un objet potentiellement partiel
 * ou corrompu (relecture du brouillon localStorage), en s'appuyant sur `fallback`.
 */
export function normalizeDraft(parsed: unknown, fallback: FdDocument): FdDocument {
  if (!parsed || typeof parsed !== "object") return fallback;
  const p = parsed as Record<string, unknown>;

  const items: FdLineItem[] = Array.isArray(p.items)
    ? p.items
        .filter((it): it is Record<string, unknown> => Boolean(it) && typeof it === "object")
        .map((it, i) => ({
          id: str(it.id) || `it_${i}_${Math.random().toString(36).slice(2, 8)}`,
          designation: str(it.designation),
          quantity: numOrNull(it.quantity),
          unitPrice: numOrNull(it.unitPrice),
        }))
    : fallback.items;

  return {
    docType: p.docType === "devis" ? "devis" : "facture",
    currency: str(p.currency, fallback.currency),
    number: str(p.number, fallback.number),
    date: str(p.date, fallback.date),
    dueDate: str(p.dueDate),
    logoDataUrl: typeof p.logoDataUrl === "string" ? p.logoDataUrl : null,
    senderName: str(p.senderName),
    senderDetails: str(p.senderDetails),
    clientName: str(p.clientName),
    clientDetails: str(p.clientDetails),
    items: items.length > 0 ? items : fallback.items,
    taxEnabled: p.taxEnabled === true,
    taxRate: num(p.taxRate, fallback.taxRate),
    discountMode: p.discountMode === "percent" ? "percent" : "amount",
    discountValue: num(p.discountValue),
    notes: str(p.notes),
    signatureDataUrl: typeof p.signatureDataUrl === "string" ? p.signatureDataUrl : null,
    signatureLabel: str(p.signatureLabel),
    secondaryCurrency: str(p.secondaryCurrency),
    exchangeRate: num(p.exchangeRate),
  };
}
