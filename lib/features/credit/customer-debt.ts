"use client";

import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { customerPhoneDigits } from "@/lib/features/customers/phone";
import { CREDIT_AMOUNT_EPS } from "./credit-math";

/** Ce que le client doit encore, au moment où on le lui demande. */
export type CustomerDebtSummary = {
  /** Reste dû, toutes ventes ouvertes confondues. */
  total: number;
  /** Nombre de ventes non soldées (« sur 3 ventes »). */
  saleCount: number;
};

type CustomerLike = { id: string; phone?: string | null };

/**
 * Le client **et ses doublons** : toutes les fiches qui portent le même numéro.
 *
 * Sans ça, le contrôle de dette se contourne en trois secondes — il suffit de recréer
 * une fiche au même numéro pour repartir avec une ardoise vierge. C'est le numéro qui
 * identifie une personne au comptoir, pas la ligne de base de données.
 */
export function customerIdsSharingPhone(
  customers: readonly CustomerLike[],
  customerId: string,
): string[] {
  const self = customers.find((c) => c.id === customerId);
  const digits = customerPhoneDigits(self?.phone);
  if (!self || digits.length === 0) return [customerId];
  const ids = customers
    .filter((c) => customerPhoneDigits(c.phone) === digits)
    .map((c) => c.id);
  return ids.includes(customerId) ? ids : [...ids, customerId];
}

/**
 * Reste dû par un client (ou un groupe de fiches au même numéro).
 *
 * Même définition que la page Crédit : total de la vente moins les encaissements
 * **réels**, les lignes `method === "other"` étant la convention « à crédit » et non de
 * l'argent reçu. Les deux écrans doivent annoncer le même chiffre — sinon le caissier
 * refuse une vente pour une dette que le propriétaire ne voit nulle part.
 */
export async function fetchCustomerDebt(params: {
  companyId: string;
  customerIds: string[];
}): Promise<CustomerDebtSummary> {
  const ids = params.customerIds.filter(Boolean);
  if (!params.companyId || ids.length === 0) return { total: 0, saleCount: 0 };

  const supabase = createClient();
  const { data, error } = await fetchAllPages<
    { total: number | null; sale_payments: Array<{ method: string; amount: number }> | null },
    unknown
  >((from, to) =>
    supabase
      .from("sales")
      .select("id,total,sale_payments(method,amount)")
      .eq("company_id", params.companyId)
      .in("customer_id", ids)
      .eq("status", "completed")
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;

  let total = 0;
  let saleCount = 0;
  for (const sale of data ?? []) {
    const paid = (sale.sale_payments ?? []).reduce(
      (s, p) => (p.method === "other" ? s : s + Number(p.amount)),
      0,
    );
    const remaining = Math.max(0, Number(sale.total ?? 0) - paid);
    if (remaining > CREDIT_AMOUNT_EPS) {
      total += remaining;
      saleCount += 1;
    }
  }
  return { total, saleCount };
}

/** Y a-t-il vraiment une dette, au-delà des arrondis de monnaie ? */
export function hasBlockingDebt(debt: CustomerDebtSummary | null | undefined): boolean {
  return (debt?.total ?? 0) > CREDIT_AMOUNT_EPS;
}
