"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appendSalePayment } from "@/lib/features/credit/api";
import type { CreditSaleRow } from "@/lib/features/credit/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
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
        payMut.mutate({ saleId: sale.id, ...p });
      }}
    />
  );
}
