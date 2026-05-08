import { paymentMethodLabel } from "@/lib/features/receipt/build-receipt-ticket-data";
import type { Store } from "@/lib/features/stores/types";
import { CREDIT_AMOUNT_EPS } from "@/lib/features/credit/credit-math";
import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";
import { creditRepaymentReceiptNumberFromPaymentId } from "@/lib/features/credit/credit-repayment-receipt-number";
import type { CreditSaleRow } from "@/lib/features/credit/types";

/** Crédit vente POS — aligné Flutter `CreditPaymentReceiptPayload` / `_buildSaleReceiptData`. */
export function buildSaleCreditRepaymentReceiptData(params: {
  companyId: string;
  companyName: string;
  sale: CreditSaleRow;
  store: Store | null;
  paymentId: string;
  issuedAt: Date;
  method: "cash" | "mobile_money" | "card" | "transfer";
  amountPaid: number;
  amountTendered?: number | null;
  changeDue?: number | null;
  paymentReference?: string | null;
  previousBalance: number;
  newBalance: number;
}): CreditRepaymentReceiptData {
  const st = params.store;
  const sale = params.sale;
  const receiptNumber = creditRepaymentReceiptNumberFromPaymentId(
    params.paymentId,
    params.issuedAt,
  );
  const saleNo = (sale.sale_number ?? "").trim();
  return {
    companyId: params.companyId,
    companyName: params.companyName.trim() || "Entreprise",
    storeId: sale.store_id,
    customerId: sale.customer_id ?? "",
    creditId: sale.id,
    paymentId: params.paymentId,
    receiptNumber,
    issuedAt: params.issuedAt,
    storeName: st?.name?.trim() || sale.store?.name || "Boutique",
    storeCommercialName: st?.commercial_name ?? null,
    storeLogoUrl: st?.logo_url ?? null,
    storeAddress: st?.address ?? null,
    storePhone: st?.phone ?? null,
    storeMobileMoney: st?.mobile_money ?? null,
    storePrimaryColor: st?.primary_color ?? null,
    storeFooterText: st?.footer_text ?? null,
    invoiceSignerTitle: st?.invoice_signer_title ?? null,
    invoiceSignerName: st?.invoice_signer_name ?? null,
    customerName: sale.customer?.name ?? "Client",
    customerPhone: sale.customer?.phone ?? null,
    creditTitle: saleNo.length > 0 ? `Vente ${saleNo}` : "Vente",
    paymentMethodLabel: paymentMethodLabel(params.method),
    paymentMethodCode: params.method,
    paymentReference: params.paymentReference ?? null,
    amountPaid: Math.max(0, params.amountPaid),
    amountTendered: params.amountTendered ?? null,
    changeDue: params.changeDue ?? null,
    previousBalance: params.previousBalance,
    newBalance: params.newBalance,
    currency: st?.currency?.trim() || "XOF",
    dueAt: sale.credit_due_at ? new Date(sale.credit_due_at) : null,
    note: saleNo.length > 0 ? saleNo : null,
    settled: params.newBalance <= CREDIT_AMOUNT_EPS,
  };
}
