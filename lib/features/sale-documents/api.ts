"use client";

import { businessRpcError } from "@/lib/errors/business-rpc-error";
import { createClient } from "@/lib/supabase/client";
import type {
  SaleDocument,
  SaleDocumentInput,
  SaleDocumentKind,
  SaleDocumentLine,
  SaleDocumentLineDraft,
  SaleDocumentStatus,
} from "./types";

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Taille d'une page de `sale_documents_list`.
 *
 * Le RPC plafonne lui-même à 500 : demander davantage ne renverrait pas plus de
 * lignes et ferait croire à la boucle qu'elle a atteint la fin.
 */
const PAGE_SIZE = 500;

/** Garde-fou identique à `fetchAllPages` : un filtre oublié ne doit pas vider la base. */
const HARD_LIMIT = 20_000;

function mapLine(row: Row): SaleDocumentLine {
  return {
    id: String(row.id ?? ""),
    productId: row.product_id == null ? null : String(row.product_id),
    label: String(row.label ?? ""),
    description: str(row.description),
    unit: String(row.unit ?? "u"),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    discountPercent: num(row.discount_percent),
    total: num(row.total),
    position: Math.trunc(num(row.position)),
  };
}

function mapDocument(row: Row): SaleDocument {
  const rawLines = Array.isArray(row.items) ? (row.items as Row[]) : [];
  return {
    id: String(row.id ?? ""),
    companyId: String(row.company_id ?? ""),
    storeId: String(row.store_id ?? ""),
    kind: row.kind === "quote" ? "quote" : "invoice",
    number: String(row.number ?? ""),
    status: String(row.status ?? "draft") as SaleDocumentStatus,

    customerId: row.customer_id == null ? null : String(row.customer_id),
    customerName: String(row.customer_name ?? ""),
    customerPhone: str(row.customer_phone),
    customerEmail: str(row.customer_email),
    customerAddress: str(row.customer_address),
    customerTaxId: str(row.customer_tax_id),

    subject: str(row.subject),
    clientReference: str(row.client_reference),

    issueDate: String(row.issue_date ?? ""),
    validUntil: row.valid_until == null ? null : String(row.valid_until),
    dueDate: row.due_date == null ? null : String(row.due_date),

    subtotal: num(row.subtotal),
    discountKind: row.discount_kind === "percent" ? "percent" : "amount",
    discountValue: num(row.discount_value),
    discount: num(row.discount),
    taxRate: num(row.tax_rate),
    tax: num(row.tax),
    total: num(row.total),

    notes: str(row.notes),
    terms: str(row.terms),

    sourceDocumentId: row.source_document_id == null ? null : String(row.source_document_id),
    sourceDocumentNumber: str(row.source_document_number),
    convertedDocumentId:
      row.converted_document_id == null ? null : String(row.converted_document_id),
    convertedDocumentNumber: str(row.converted_document_number),

    saleId: row.sale_id == null ? null : String(row.sale_id),
    saleNumber: str(row.sale_number),
    paidAmount: num(row.paid_amount),

    sentAt: row.sent_at == null ? null : String(row.sent_at),
    decidedAt: row.decided_at == null ? null : String(row.decided_at),
    issuedAt: row.issued_at == null ? null : String(row.issued_at),
    createdAt: String(row.created_at ?? ""),
    authorName: str(row.author_name),

    lines: rawLines.map(mapLine).sort((a, b) => a.position - b.position),
  };
}

/**
 * Devis et factures d'une entreprise (ou d'une seule boutique).
 *
 * Passe par le RPC `sale_documents_list` plutôt que par un select : c'est lui qui
 * calcule le déjà-encaissé à partir des règlements de la vente. Une colonne
 * recopiée sur le document se serait désynchronisée dès le premier acompte
 * enregistré depuis la page Crédit.
 */
export async function listSaleDocuments(params: {
  companyId: string;
  storeId: string | null;
  kind?: SaleDocumentKind | null;
}): Promise<SaleDocument[]> {
  const supabase = createClient();
  const rows: Row[] = [];

  for (let offset = 0; offset < HARD_LIMIT; offset += PAGE_SIZE) {
    const { data, error } = await supabase.rpc("sale_documents_list", {
      p_company_id: params.companyId,
      p_store_id: params.storeId,
      p_kind: params.kind ?? null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows.map(mapDocument);
}

/**
 * Marque expirés les devis dont la validité est passée.
 *
 * Appelé à l'ouverture de la page : l'état vit dans la base, pas dans l'affichage,
 * pour qu'un devis périmé le soit partout (écran, PDF, autres appareils).
 */
export async function expireDueSaleDocuments(companyId: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sale_documents_expire_due", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return Math.trunc(num(data));
}

function documentColumns(input: SaleDocumentInput) {
  return {
    customer_id: input.customerId,
    customer_name: input.customerName.trim(),
    customer_phone: str(input.customerPhone),
    customer_email: str(input.customerEmail),
    customer_address: str(input.customerAddress),
    customer_tax_id: str(input.customerTaxId),
    subject: str(input.subject),
    client_reference: str(input.clientReference),
    issue_date: input.issueDate,
    valid_until: input.kind === "quote" ? input.validUntil : null,
    due_date: input.kind === "invoice" ? input.dueDate : null,
    discount_kind: input.discountKind,
    discount_value: Math.max(0, input.discountValue),
    tax_rate: Math.min(Math.max(0, input.taxRate), 100),
    notes: str(input.notes),
    terms: str(input.terms),
  };
}

export async function createSaleDocument(params: {
  companyId: string;
  storeId: string;
  input: SaleDocumentInput;
  lines: SaleDocumentLineDraft[];
}): Promise<string> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("sale_documents")
    .insert({
      company_id: params.companyId,
      store_id: params.storeId,
      kind: params.input.kind,
      created_by: userRes.user?.id ?? null,
      ...documentColumns(params.input),
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = String((data as { id: string }).id);
  await replaceSaleDocumentLines({
    companyId: params.companyId,
    documentId: id,
    lines: params.lines,
  });
  return id;
}

export async function updateSaleDocument(params: {
  documentId: string;
  companyId: string;
  input: SaleDocumentInput;
  lines: SaleDocumentLineDraft[];
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sale_documents")
    .update(documentColumns(params.input))
    .eq("id", params.documentId);
  if (error) throw error;

  await replaceSaleDocumentLines({
    companyId: params.companyId,
    documentId: params.documentId,
    lines: params.lines,
  });
}

/**
 * Remplace les lignes d'un document (suppression + réinsertion).
 *
 * Un devis en compte quelques dizaines au plus : le remplacement complet évite
 * toute la mécanique de réconciliation ligne à ligne pour un coût négligeable, et
 * garantit que l'ordre affiché est celui qui sera imprimé.
 */
async function replaceSaleDocumentLines(params: {
  companyId: string;
  documentId: string;
  lines: SaleDocumentLineDraft[];
}): Promise<void> {
  const supabase = createClient();
  const { error: delErr } = await supabase
    .from("sale_document_lines")
    .delete()
    .eq("document_id", params.documentId);
  if (delErr) throw delErr;

  const rows = params.lines
    .filter((l) => l.label.trim().length > 0 && l.quantity > 0)
    .map((l, index) => ({
      company_id: params.companyId,
      document_id: params.documentId,
      product_id: l.productId,
      label: l.label.trim(),
      description: str(l.description),
      unit: l.unit.trim() || "u",
      quantity: l.quantity,
      unit_price: Math.max(0, l.unitPrice),
      discount_percent: Math.min(Math.max(0, l.discountPercent), 100),
      position: index,
    }));

  if (rows.length === 0) {
    // Document vidé de ses lignes : sans écriture de ligne, rien ne réveille le
    // document, et son total resterait celui d'avant. Cette mise à jour à vide sert
    // uniquement de déclencheur — la base recalcule elle-même, et trouve zéro.
    const { error } = await supabase
      .from("sale_documents")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", params.documentId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("sale_document_lines").insert(rows);
  if (error) throw error;
}

/** Envoyé, accepté, refusé, annulé… — horodaté côté serveur. */
export async function setSaleDocumentStatus(params: {
  documentId: string;
  status: SaleDocumentStatus;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("sale_document_set_status", {
    p_document_id: params.documentId,
    p_status: params.status,
  });
  if (error) {
    throw businessRpcError(error, "Le statut du document n'a pas pu être changé.");
  }
}

/** Devis accepté → facture brouillon reprenant les mêmes lignes et les mêmes prix. */
export async function convertQuoteToInvoice(documentId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sale_document_convert_to_invoice", {
    p_document_id: documentId,
  });
  if (error) {
    throw businessRpcError(error, "Le devis n'a pas pu être transformé en facture.");
  }
  return String(data ?? "");
}

/** Copie conforme, en brouillon, avec un nouveau numéro. */
export async function duplicateSaleDocument(documentId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sale_document_duplicate", {
    p_document_id: documentId,
  });
  if (error) throw businessRpcError(error, "Le document n'a pas pu être dupliqué.");
  return String(data ?? "");
}

/**
 * Émet la facture : crée la vente réelle, déstocke les lignes du catalogue et fige
 * le document. Sans règlement, la facture part entièrement à crédit.
 */
export async function issueSaleDocument(params: {
  documentId: string;
  payments: Array<{
    method: "cash" | "mobile_money" | "card" | "other";
    amount: number;
    reference?: string | null;
  }>;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sale_document_issue", {
    p_document_id: params.documentId,
    p_payments: params.payments
      .filter((p) => p.amount > 0)
      .map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
  });
  if (error) {
    throw businessRpcError(error, "La facture n'a pas pu être émise.");
  }
  return String(data ?? "");
}

export async function deleteSaleDocument(documentId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("sale_documents").delete().eq("id", documentId);
  if (error) throw error;
}

/**
 * Propriétaire : ouvre ou ferme le module « Devis & Factures » pour l'entreprise.
 *
 * Passe par un RPC plutôt que par un UPDATE : le drapeau vit sur `companies`, dont la
 * politique d'écriture est plus large que « propriétaire seul ». La fonction (et le
 * trigger `companies_enforce_owner_flags`) referment cette porte.
 */
export async function setSaleDocumentsEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_sale_documents_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) {
    throw businessRpcError(error, "Le réglage n'a pas pu être enregistré.");
  }
}
