"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appendSalePayment, fetchCreditSaleDetail } from "@/lib/features/credit/api";
import type { CreditSaleRow } from "@/lib/features/credit/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { remainingTotal } from "@/lib/features/credit/credit-math";
import { formatCurrency } from "@/lib/utils/currency";
import { CreditRecordPaymentDialog } from "./credit-record-payment-dialog";

type Props = {
  sale: CreditSaleRow | null;
  open: boolean;
  onClose: () => void;
  /** Après invalidations globales (credit-sales, ventes, détails). */
  onPaid?: () => void | Promise<void>;
};

export function CreditQuickPayDialog({ sale, open, onClose, onPaid }: Props) {
  const qc = useQueryClient();
  const RPC_EPSILON = 0.0001;
  const roundMoney = (v: number) => Math.round(v * 100) / 100;
  const payMut = useMutation({
    mutationFn: appendSalePayment,
    onSuccess: async () => {
      toast.success("Paiement enregistré.");
      onClose();
      await qc.invalidateQueries({ queryKey: ["credit-sales"] });
      await qc.invalidateQueries({ queryKey: ["sales"] });
      if (sale?.id) {
        await qc.invalidateQueries({ queryKey: ["sale-detail", sale.id] });
        await qc.invalidateQueries({ queryKey: ["credit-sale-detail", sale.id] });
      }
      await onPaid?.();
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  return (
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
            const amount = roundMoney(p.amount);
            if (amount > rest + RPC_EPSILON) {
              toast.error(
                `Le montant dépasse le reste à payer (${formatCurrency(rest)}). Actualisez la liste puis réessayez.`,
              );
              return;
            }
            payMut.mutate({ saleId: sale.id, ...p, amount });
          } catch (e) {
            toast.error(messageFromUnknownError(e));
          }
        })();
      }}
    />
  );
}
