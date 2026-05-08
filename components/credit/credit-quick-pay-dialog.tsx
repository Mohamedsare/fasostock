"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { appendSalePayment, fetchCreditSaleDetail } from "@/lib/features/credit/api";
import type { CreditSaleRow } from "@/lib/features/credit/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { CREDIT_AMOUNT_EPS, remainingTotal } from "@/lib/features/credit/credit-math";
import { formatCurrency } from "@/lib/utils/currency";
import { buildSaleCreditRepaymentReceiptData } from "@/lib/features/credit/build-sale-credit-repayment-receipt-data";
import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";
import { getStore } from "@/lib/features/stores/api";
import { CreditRepaymentReceiptDialog } from "./credit-repayment-receipt-dialog";
import { CreditRecordPaymentDialog } from "./credit-record-payment-dialog";

type Props = {
  sale: CreditSaleRow | null;
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  /** Après invalidations globales (credit-sales, ventes, détails). */
  onPaid?: () => void | Promise<void>;
};

type PayVars = {
  saleId: string;
  method: "cash" | "mobile_money" | "card" | "transfer";
  amount: number;
  reference?: string | null;
  tendered: number;
  /** Solde « reste à payer » juste avant ce paiement (pour le reçu PDF). */
  previousBalance: number;
};

export function CreditQuickPayDialog({
  sale,
  open,
  onClose,
  companyId,
  companyName,
  onPaid,
}: Props) {
  const qc = useQueryClient();
  const roundMoney = (v: number) => Math.round(v * 100) / 100;
  const [receiptData, setReceiptData] = useState<CreditRepaymentReceiptData | null>(null);

  const payMut = useMutation({
    mutationFn: (vars: PayVars) =>
      appendSalePayment({
        saleId: vars.saleId,
        method: vars.method,
        amount: vars.amount,
        reference: vars.reference,
      }),
    onSuccess: async (result, vars) => {
      const change =
        vars.method === "cash"
          ? Math.max(0, roundMoney(vars.tendered - vars.amount))
          : 0;
      if (vars.method === "cash" && change > CREDIT_AMOUNT_EPS) {
        toast.success(`Paiement enregistré. Monnaie à rendre : ${formatCurrency(change)}.`);
      } else {
        toast.success("Paiement enregistré.");
      }

      let receipt: CreditRepaymentReceiptData | null = null;
      if (sale && companyId.length > 0) {
        try {
          const store = await getStore(sale.store_id);
          const issuedAt = new Date(result.createdAtIso);
          const newBalance = Math.max(0, roundMoney(vars.previousBalance - vars.amount));
          receipt = buildSaleCreditRepaymentReceiptData({
            companyId,
            companyName,
            sale,
            store,
            paymentId: result.paymentId,
            issuedAt,
            method: vars.method,
            amountPaid: vars.amount,
            amountTendered: vars.method === "cash" ? vars.tendered : null,
            changeDue:
              vars.method === "cash" && change > CREDIT_AMOUNT_EPS ? change : null,
            paymentReference: vars.reference ?? null,
            previousBalance: vars.previousBalance,
            newBalance,
          });
        } catch {
          /* reçu optionnel — le paiement est déjà enregistré */
        }
      }
      if (receipt) setReceiptData(receipt);

      onClose();
      await qc.invalidateQueries({ queryKey: ["credit-sales"] });
      await qc.invalidateQueries({ queryKey: ["sales"] });
      if (sale?.id) {
        await qc.invalidateQueries({ queryKey: ["sale-detail", sale.id] });
        await qc.invalidateQueries({ queryKey: ["credit-sale-detail", sale.id] });
      }
      await onPaid?.();
    },
    onError: async (e, vars) => {
      const msg = messageFromUnknownError(e);
      const isOverpay = /montant supérieur au reste à payer/i.test(msg);
      if (isOverpay) {
        const fresh = sale?.id ? await fetchCreditSaleDetail(sale.id).catch(() => null) : null;
        const freshRest = fresh ? remainingTotal(fresh) : null;
        const hasOtherPayments =
          (fresh?.sale_payments ?? []).some((p) => p.method === "other" && Number(p.amount) > 0);

        if (freshRest != null && freshRest <= CREDIT_AMOUNT_EPS) {
          await qc.invalidateQueries({ queryKey: ["credit-sales"] });
          await qc.invalidateQueries({ queryKey: ["sales"] });
          if (sale?.id) {
            await qc.invalidateQueries({ queryKey: ["sale-detail", sale.id] });
            await qc.invalidateQueries({ queryKey: ["credit-sale-detail", sale.id] });
          }
          toast.info("Cette créance est déjà soldée. La liste a été actualisée.");
          onClose();
          await onPaid?.();
          return;
        }

        if (
          freshRest != null &&
          vars?.amount != null &&
          vars.amount > freshRest + CREDIT_AMOUNT_EPS
        ) {
          const adjusted = roundMoney(freshRest);
          if (adjusted > CREDIT_AMOUNT_EPS) {
            payMut.mutate({
              ...vars,
              amount: adjusted,
              previousBalance: freshRest,
            });
            return;
          }
        }

        if (hasOtherPayments) {
          toast.error(
            "Le paiement ne peut pas être validé pour le moment. Actualisez la page puis réessayez.",
          );
          return;
        }

        await qc.invalidateQueries({ queryKey: ["credit-sales"] });
        await qc.invalidateQueries({ queryKey: ["sales"] });
        if (sale?.id) {
          await qc.invalidateQueries({ queryKey: ["sale-detail", sale.id] });
          await qc.invalidateQueries({ queryKey: ["credit-sale-detail", sale.id] });
        }
        toast.error("Le solde a changé. La liste a été actualisée, réessayez avec le nouveau reste.");
        return;
      }
      toast.error(msg);
    },
  });

  return (
    <>
      <CreditRecordPaymentDialog
        sale={sale}
        open={open}
        onClose={onClose}
        busy={payMut.isPending}
        onSubmit={(p) => {
          if (!sale) return;
          void (async () => {
            try {
              const fresh = await fetchCreditSaleDetail(sale.id);
              if (!fresh) {
                toast.error("Impossible de charger la vente. Réessayez.");
                return;
              }
              const rest = remainingTotal(fresh);
              const tendered = roundMoney(p.tendered);
              const applied = roundMoney(Math.min(tendered, rest));
              if (p.method !== "cash" && tendered > rest + CREDIT_AMOUNT_EPS) {
                toast.error(
                  `Le montant ne peut pas dépasser le reste à payer (${formatCurrency(rest)}) pour ce mode de paiement.`,
                );
                return;
              }
              if (applied <= CREDIT_AMOUNT_EPS) {
                toast.error(
                  rest <= CREDIT_AMOUNT_EPS
                    ? "Cette créance est déjà soldée."
                    : "Montant reçu insuffisant ou invalide.",
                );
                return;
              }
              payMut.mutate({
                saleId: sale.id,
                method: p.method,
                amount: applied,
                reference: p.reference,
                tendered,
                previousBalance: rest,
              });
            } catch (e) {
              toast.error(messageFromUnknownError(e));
            }
          })();
        }}
      />
      {receiptData ? (
        <CreditRepaymentReceiptDialog data={receiptData} onClose={() => setReceiptData(null)} />
      ) : null}
    </>
  );
}
