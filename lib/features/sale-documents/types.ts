/**
 * Module « Devis & Factures ».
 * Tables `sale_documents` / `sale_document_lines` — migration 00201.
 *
 * Un même objet, deux visages : le DEVIS propose un prix, la FACTURE le réclame.
 * Le devis n'engage rien ; la facture ÉMISE crée une vente réelle (stock, chiffre
 * d'affaires, crédit). Toute la logique de montants vit dans la base — ici on ne
 * fait que présenter, et les aperçus à l'écran reproduisent le calcul serveur.
 */

export type SaleDocumentKind = "quote" | "invoice";

export type SaleDocumentStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "refused"
  | "expired"
  | "converted"
  | "issued"
  | "cancelled";

export const SALE_DOCUMENT_STATUS_LABELS: Record<SaleDocumentStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  refused: "Refusé",
  expired: "Expiré",
  converted: "Transformé en facture",
  issued: "Émise",
  cancelled: "Annulé",
};

/** Ce que le statut veut dire concrètement pour le commerçant. */
export const SALE_DOCUMENT_STATUS_HINTS: Record<SaleDocumentStatus, string> = {
  draft: "En préparation. Rien n'est parti chez le client, tout reste modifiable.",
  sent: "Remis au client. On attend sa réponse.",
  accepted: "Le client a dit oui. Il reste à transformer le devis en facture.",
  refused: "Le client a dit non. Le document reste, pour mémoire.",
  expired: "La date de validité est passée : vos prix ne vous engagent plus.",
  converted: "Ce devis a donné une facture. Il est conservé comme preuve du prix promis.",
  issued: "Facture émise : la vente est enregistrée et le stock à jour.",
  cancelled: "Abandonné. Aucun effet sur vos chiffres.",
};

/** Statuts qu'un utilisateur peut poser à la main, selon le type de document. */
export function selectableStatuses(kind: SaleDocumentKind): SaleDocumentStatus[] {
  return kind === "quote"
    ? ["draft", "sent", "accepted", "refused", "cancelled"]
    : ["draft", "sent", "cancelled"];
}

/** Un document figé ne se modifie plus (voir `sale_documents_guard_locked`). */
export function isSaleDocumentLocked(status: SaleDocumentStatus): boolean {
  return status === "issued" || status === "converted" || status === "cancelled";
}

export type SaleDocumentLine = {
  id: string;
  /** `null` = prestation ou libellé libre : aucun stock ne bouge à l'émission. */
  productId: string | null;
  label: string;
  description: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  /** Total de ligne calculé par la base (colonne générée). */
  total: number;
  position: number;
};

/** Ligne en cours de saisie (pas encore enregistrée). */
export type SaleDocumentLineDraft = {
  productId: string | null;
  label: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
};

export type SaleDocumentDiscountKind = "amount" | "percent";

export type SaleDocument = {
  id: string;
  companyId: string;
  storeId: string;
  kind: SaleDocumentKind;
  number: string;
  status: SaleDocumentStatus;

  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  customerTaxId: string | null;

  subject: string | null;
  clientReference: string | null;

  issueDate: string;
  validUntil: string | null;
  dueDate: string | null;

  subtotal: number;
  discountKind: SaleDocumentDiscountKind;
  discountValue: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;

  notes: string | null;
  terms: string | null;

  /** Devis d'origine, si ce document est né d'une conversion. */
  sourceDocumentId: string | null;
  sourceDocumentNumber: string | null;
  /** Facture née de ce devis. */
  convertedDocumentId: string | null;
  convertedDocumentNumber: string | null;

  saleId: string | null;
  saleNumber: string | null;
  /** Déjà encaissé sur la vente — lu des règlements, jamais recopié. */
  paidAmount: number;

  sentAt: string | null;
  decidedAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  authorName: string | null;

  lines: SaleDocumentLine[];
};

/** Champs saisis dans le formulaire (hors lignes). */
export type SaleDocumentInput = {
  kind: SaleDocumentKind;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerTaxId: string;
  subject: string;
  clientReference: string;
  issueDate: string;
  /** Devis uniquement. */
  validUntil: string | null;
  /** Facture uniquement. */
  dueDate: string | null;
  discountKind: SaleDocumentDiscountKind;
  discountValue: number;
  taxRate: number;
  notes: string;
  terms: string;
};

/**
 * Reproduit à l'écran le calcul de la base (`sale_documents_compute_totals`).
 *
 * Volontairement dupliqué plutôt que deviné : le commerçant doit voir le total
 * bouger pendant qu'il saisit. La base reste seule juge — si les deux divergent,
 * c'est elle qui a raison, et le document rechargé le montrera.
 */
export function computeSaleDocumentTotals(params: {
  lines: readonly { quantity: number; unitPrice: number; discountPercent: number }[];
  discountKind: SaleDocumentDiscountKind;
  discountValue: number;
  taxRate: number;
}): { subtotal: number; discount: number; taxable: number; tax: number; total: number } {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const subtotal = round2(
    params.lines.reduce(
      (sum, l) =>
        sum + round2(l.quantity * l.unitPrice * (1 - clampPercent(l.discountPercent) / 100)),
      0,
    ),
  );

  const discount =
    params.discountKind === "percent"
      ? round2((subtotal * Math.min(Math.max(0, params.discountValue), 100)) / 100)
      : Math.min(round2(Math.max(0, params.discountValue)), subtotal);

  const taxable = Math.max(0, round2(subtotal - discount));
  const tax = round2((taxable * Math.min(Math.max(0, params.taxRate), 100)) / 100);
  return { subtotal, discount, taxable, tax, total: round2(taxable + tax) };
}

function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(0, v), 100);
}

/** Total d'une ligne, arrondi comme la colonne générée en base. */
export function saleDocumentLineTotal(line: {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}): number {
  return (
    Math.round(line.quantity * line.unitPrice * (1 - clampPercent(line.discountPercent) / 100) * 100) /
    100
  );
}

/** Reste dû sur une facture émise. */
export function saleDocumentRemaining(doc: SaleDocument): number {
  if (doc.saleId == null) return 0;
  return Math.max(0, Math.round((doc.total - doc.paidAmount) * 100) / 100);
}

/** Nom du destinataire tel qu'on l'affiche. */
export function saleDocumentCustomerLabel(doc: {
  customerName: string;
  customerPhone: string | null;
}): string {
  const name = doc.customerName.trim();
  if (name) return name;
  return doc.customerPhone?.trim() || "Destinataire non précisé";
}

/** Nombre de jours avant péremption d'un devis (négatif = déjà périmé). */
export function daysUntilExpiry(validUntil: string | null): number | null {
  if (!validUntil) return null;
  const end = new Date(`${validUntil}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** Titre imprimé en haut du document. */
export function saleDocumentTitle(doc: { kind: SaleDocumentKind; status: SaleDocumentStatus }): string {
  if (doc.kind === "quote") return "DEVIS";
  // Tant qu'elle n'est pas émise, la facture n'a créé aucune vente : l'annoncer
  // « PROFORMA » évite qu'un client la prenne pour une facture définitive.
  return doc.status === "issued" ? "FACTURE" : "FACTURE PROFORMA";
}

/** Nom de fichier proposé au partage / téléchargement. */
export function saleDocumentFilename(doc: { kind: SaleDocumentKind; number: string }): string {
  const safe = doc.number.replace(/[^\w.\-]/g, "_") || "document";
  return `${doc.kind === "quote" ? "devis" : "facture"}-${safe}.pdf`;
}
