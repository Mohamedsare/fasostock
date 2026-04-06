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
    onError: async (e, vars) => {
      const msg = messageFromUnknownError(e);
      const isOverpay = /montant supérieur au reste à payer/i.test(msg);
      if (isOverpay) {
        const fresh = sale?.id ? await fetchCreditSaleDetail(sale.id).catch(() => null) : null;
        const freshRest = fresh ? remainingTotal(fresh) : null;
        const hasOtherPayments =
          (fresh?.sale_payments ?? []).some((p) => p.method === "other" && Number(p.amount) > 0);

        if (freshRest != null && freshRest <= RPC_EPSILON) {
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
          vars.amount > freshRest + RPC_EPSILON
        ) {
          const adjusted = roundMoney(freshRest);
          if (adjusted > RPC_EPSILON) {
            payMut.mutate({ ...vars, amount: adjusted });
            return;
          }
        }

        // Diagnostic précis : si des lignes `other` existent et que l'API refuse encore
        // l'encaissement, la base cible utilise probablement l'ancienne version du RPC.
        if (hasOtherPayments) {
          toast.error(
            "Encaissement bloqué côté base (migration manquante). Appliquez la migration 00084_append_sale_payment_exclude_credit_placeholder.sql puis réessayez.",
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
            let amount = roundMoney(p.amount);
            if (amount > rest + RPC_EPSILON && amount <= rest + 1) {
              amount = roundMoney(rest);
            }
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
