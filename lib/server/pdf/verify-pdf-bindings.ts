import type { SupabaseClient } from "@supabase/supabase-js";

import { creditRepaymentReceiptNumberFromPaymentId } from "@/lib/features/credit/credit-repayment-receipt-number";
import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";
import type { InvoiceA4Data } from "@/lib/features/invoices/invoice-a4-types";
import { P } from "@/lib/constants/permissions";

const AMOUNT_EPS = 0.02;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function amountsMatch(a: number, b: number, eps = AMOUNT_EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function parsePaymentMethodCode(
  raw: string,
): CreditRepaymentReceiptData["paymentMethodCode"] | null {
  const m = raw.trim().toLowerCase();
  if (m === "cash" || m === "mobile_money" || m === "card" || m === "transfer") {
    return m;
  }
  return null;
}

export type InvoicePdfBinding =
  | { kind: "sale"; companyId: string }
  | { kind: "warehouse_dispatch"; companyId: string }
  | { kind: "preview"; companyId: string };

/** Vente liée — numéro, boutique et montants doivent correspondre à la base. */
export async function verifyInvoiceSaleBinding(
  supabase: SupabaseClient,
  saleId: string,
  data: InvoiceA4Data,
): Promise<{ ok: true; companyId: string } | { ok: false; status: number; error: string }> {
  const id = saleId.trim();
  if (!id) {
    return { ok: false, status: 400, error: "saleId requis pour générer la facture de façon sécurisée." };
  }

  const { data: row, error } = await supabase
    .from("sales")
    .select("company_id, store_id, sale_number, subtotal, discount, tax, total")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, status: 404, error: "Vente introuvable." };
  }

  const companyId = String(row.company_id ?? "").trim();
  const storeId = String(row.store_id ?? "").trim();
  const saleNumber = String(row.sale_number ?? "").trim();
  const clientSaleNumber = String(data.saleNumber ?? "").trim();
  const clientStoreId = String(data.store?.id ?? "").trim();

  if (!companyId) {
    return { ok: false, status: 404, error: "Vente introuvable." };
  }
  if (saleNumber !== clientSaleNumber) {
    return { ok: false, status: 403, error: "Données facture incohérentes avec la vente." };
  }
  if (storeId && clientStoreId && storeId !== clientStoreId) {
    return { ok: false, status: 403, error: "Boutique incohérente avec la vente." };
  }
  if (String(data.store?.company_id ?? "").trim() && String(data.store?.company_id ?? "").trim() !== companyId) {
    return { ok: false, status: 403, error: "Entreprise incohérente avec la vente." };
  }
  if (
    !amountsMatch(num(row.subtotal), data.subtotal) ||
    !amountsMatch(num(row.discount), data.discount) ||
    !amountsMatch(num(row.tax), data.tax) ||
    !amountsMatch(num(row.total), data.total)
  ) {
    return { ok: false, status: 403, error: "Montants facture incohérents avec la vente." };
  }

  return { ok: true, companyId };
}

/** Bon de sortie dépôt — numéro document et entreprise. */
export async function verifyWarehouseDispatchBinding(
  supabase: SupabaseClient,
  dispatchId: string,
  data: InvoiceA4Data,
): Promise<{ ok: true; companyId: string } | { ok: false; status: number; error: string }> {
  const id = dispatchId.trim();
  if (!id) {
    return {
      ok: false,
      status: 400,
      error: "warehouseDispatchId requis pour ce document dépôt.",
    };
  }

  const { data: row, error } = await supabase
    .from("warehouse_dispatch_invoices")
    .select("company_id, document_number")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, status: 404, error: "Bon de sortie introuvable." };
  }

  const companyId = String(row.company_id ?? "").trim();
  const docNumber = String(row.document_number ?? "").trim();
  const clientDoc = String(data.saleNumber ?? "").trim();
  const clientCompanyId = String(data.store?.company_id ?? "").trim();

  if (!companyId) {
    return { ok: false, status: 404, error: "Bon de sortie introuvable." };
  }
  if (docNumber !== clientDoc) {
    return { ok: false, status: 403, error: "Numéro de document incohérent avec le bon de sortie." };
  }
  if (clientCompanyId && clientCompanyId !== companyId) {
    return { ok: false, status: 403, error: "Entreprise incohérente avec le bon de sortie." };
  }

  return { ok: true, companyId };
}

/** Aperçu paramètres (démo) — owner ou gestion paramètres. */
export async function verifyInvoicePreviewBinding(
  supabase: SupabaseClient,
  userId: string,
  data: InvoiceA4Data,
): Promise<{ ok: true; companyId: string } | { ok: false; status: number; error: string }> {
  const companyId = String(data.store?.company_id ?? "").trim();
  if (!companyId) {
    return { ok: false, status: 400, error: "Identifiant entreprise (boutique) manquant." };
  }

  const { data: roleRow, error: roleErr } = await supabase
    .from("user_company_roles")
    .select("company_id, roles!inner(slug)")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (roleErr || !roleRow) {
    return { ok: false, status: 403, error: "Non autorisé." };
  }

  const rolesRaw = (roleRow as { roles?: { slug?: string } | { slug?: string }[] }).roles;
  const role = Array.isArray(rolesRaw) ? rolesRaw[0] : rolesRaw;
  const slug = role?.slug ?? "";

  let allowed = slug === "owner";
  if (!allowed) {
    const { data: keys, error: kErr } = await supabase.rpc("get_my_permission_keys", {
      p_company_id: companyId,
    });
    if (!kErr && Array.isArray(keys)) {
      allowed = keys.map((k) => String(k)).includes(P.settingsManage);
    }
  }

  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: "Aperçu facture réservé au propriétaire ou aux gestionnaires des paramètres.",
    };
  }

  return { ok: true, companyId };
}

export function parseInvoicePdfRouteMeta(json: unknown): {
  saleId: string | null;
  warehouseDispatchId: string | null;
  previewOnly: boolean;
} {
  if (!json || typeof json !== "object") {
    return { saleId: null, warehouseDispatchId: null, previewOnly: false };
  }
  const o = json as Record<string, unknown>;
  const saleId =
    typeof o.saleId === "string" && o.saleId.trim().length > 0 ? o.saleId.trim() : null;
  const warehouseDispatchId =
    typeof o.warehouseDispatchId === "string" && o.warehouseDispatchId.trim().length > 0
      ? o.warehouseDispatchId.trim()
      : null;
  const previewOnly = o.previewOnly === true;
  return { saleId, warehouseDispatchId, previewOnly };
}

/** Paiement crédit vente ou crédit libre — montants et identifiants vérifiés en base. */
export async function verifyCreditRepaymentBinding(
  supabase: SupabaseClient,
  data: CreditRepaymentReceiptData,
): Promise<{ ok: true; companyId: string } | { ok: false; status: number; error: string }> {
  const paymentId = String(data.paymentId ?? "").trim();
  if (!paymentId) {
    return {
      ok: false,
      status: 400,
      error: "paymentId requis pour générer le reçu de façon sécurisée.",
    };
  }

  const creditId = String(data.creditId ?? "").trim();
  const clientCompanyId = String(data.companyId ?? "").trim();
  const expectedReceipt = creditRepaymentReceiptNumberFromPaymentId(
    paymentId,
    data.issuedAt,
  );
  if (String(data.receiptNumber ?? "").trim() !== expectedReceipt) {
    return { ok: false, status: 403, error: "Numéro de reçu incohérent avec le paiement." };
  }

  const { data: salePay, error: spErr } = await supabase
    .from("sale_payments")
    .select("id, sale_id, method, amount, created_at, sales!inner(company_id, store_id, customer_id)")
    .eq("id", paymentId)
    .maybeSingle();

  if (!spErr && salePay) {
    const row = salePay as {
      sale_id?: string;
      method?: string;
      amount?: number;
      created_at?: string;
      sales?:
        | { company_id?: string; store_id?: string; customer_id?: string | null }
        | Array<{ company_id?: string; store_id?: string; customer_id?: string | null }>;
    };
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
    const companyId = String(sale?.company_id ?? "").trim();
    const saleId = String(row.sale_id ?? "").trim();

    if (!companyId || !saleId) {
      return { ok: false, status: 404, error: "Paiement introuvable." };
    }
    if (creditId && creditId !== saleId) {
      return { ok: false, status: 403, error: "Crédit incohérent avec le paiement." };
    }
    if (clientCompanyId && clientCompanyId !== companyId) {
      return { ok: false, status: 403, error: "Entreprise incohérente avec le paiement." };
    }
    if (!amountsMatch(num(row.amount), data.amountPaid)) {
      return { ok: false, status: 403, error: "Montant incohérent avec le paiement." };
    }
    const methodCode = parsePaymentMethodCode(String(row.method ?? ""));
    if (methodCode && methodCode !== data.paymentMethodCode) {
      return { ok: false, status: 403, error: "Mode de paiement incohérent." };
    }
    const storeId = String(sale?.store_id ?? "").trim();
    if (storeId && String(data.storeId ?? "").trim() && storeId !== String(data.storeId).trim()) {
      return { ok: false, status: 403, error: "Boutique incohérente avec le paiement." };
    }
    const customerId = sale?.customer_id != null ? String(sale.customer_id).trim() : "";
    if (
      customerId &&
      String(data.customerId ?? "").trim() &&
      customerId !== String(data.customerId).trim()
    ) {
      return { ok: false, status: 403, error: "Client incohérent avec le paiement." };
    }

    return { ok: true, companyId };
  }

  const { data: legacyPay, error: lpErr } = await supabase
    .from("legacy_customer_credit_payments")
    .select(
      "id, credit_id, method, amount, created_at, legacy_customer_credits!inner(company_id, store_id, customer_id)",
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (lpErr || !legacyPay) {
    return { ok: false, status: 404, error: "Paiement introuvable." };
  }

  const lp = legacyPay as {
    credit_id?: string;
    method?: string;
    amount?: number;
    legacy_customer_credits?:
      | { company_id?: string; store_id?: string; customer_id?: string }
      | Array<{ company_id?: string; store_id?: string; customer_id?: string }>;
  };
  const credit = Array.isArray(lp.legacy_customer_credits)
    ? lp.legacy_customer_credits[0]
    : lp.legacy_customer_credits;
  const companyId = String(credit?.company_id ?? "").trim();
  const legacyCreditId = String(lp.credit_id ?? "").trim();

  if (!companyId || !legacyCreditId) {
    return { ok: false, status: 404, error: "Paiement introuvable." };
  }
  if (creditId && creditId !== legacyCreditId) {
    return { ok: false, status: 403, error: "Crédit incohérent avec le paiement." };
  }
  if (clientCompanyId && clientCompanyId !== companyId) {
    return { ok: false, status: 403, error: "Entreprise incohérente avec le paiement." };
  }
  if (!amountsMatch(num(lp.amount), data.amountPaid)) {
    return { ok: false, status: 403, error: "Montant incohérent avec le paiement." };
  }
  const methodCode = parsePaymentMethodCode(String(lp.method ?? ""));
  if (methodCode && methodCode !== data.paymentMethodCode) {
    return { ok: false, status: 403, error: "Mode de paiement incohérent." };
  }

  return { ok: true, companyId };
}
