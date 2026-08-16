"use client";

import { toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import {
  customerIdsSharingPhone,
  fetchCustomerDebt,
  hasBlockingDebt,
} from "./customer-debt";

/**
 * Vente refusée, motif DÉJÀ affiché à l'écran. Les gestionnaires d'erreur des
 * mutations la laissent passer en silence : un second toast, technique celui-là,
 * recouvrirait l'explication que le caissier est en train de lire.
 */
export class SaleBlockedError extends Error {
  constructor() {
    super("Vente bloquée (dette client en cours).");
    this.name = "SaleBlockedError";
  }
}

export type DebtGuardCustomer = {
  id: string;
  name?: string | null;
  phone?: string | null;
};

/** Le client tel que le caissier le nomme : son nom, sinon son numéro. */
function customerLabel(c: DebtGuardCustomer | undefined): string {
  const name = c?.name?.trim();
  if (name) return c?.phone?.trim() ? `${name} (${c.phone.trim()})` : name;
  const phone = c?.phone?.trim();
  return phone || "Ce client";
}

/**
 * Contrôle « pas de nouvelle vente tant que l'ardoise n'est pas soldée ».
 *
 * Appelé au moment de l'encaissement, jamais avant : le panier peut être constitué,
 * discuté, modifié — c'est l'argent qui déclenche la règle, et c'est à ce moment-là
 * que le client est devant quelqu'un qui peut lui en parler.
 *
 * **En cas de panne réseau, la vente passe.** C'est délibéré : une boutique dont la
 * connexion tombe doit continuer à vendre. Refuser tout encaissement parce qu'on n'a
 * pas pu lire les dettes ferait bien plus de dégâts qu'un crédit accordé en trop.
 *
 * @returns `true` si la vente peut continuer, `false` si elle est refusée (le toast
 * d'explication a déjà été affiché à l'appelant).
 */
export async function allowSaleForCustomer(params: {
  enabled: boolean;
  companyId: string;
  customerId: string | null | undefined;
  customers: readonly DebtGuardCustomer[];
}): Promise<boolean> {
  const { enabled, companyId, customerId, customers } = params;
  if (!enabled || !customerId || !companyId) return true;

  let debt: Awaited<ReturnType<typeof fetchCustomerDebt>>;
  try {
    debt = await fetchCustomerDebt({
      companyId,
      customerIds: customerIdsSharingPhone(customers, customerId),
    });
  } catch {
    toast.info(
      "Dettes du client non vérifiées (connexion) : la vente continue.",
      4000,
    );
    return true;
  }

  if (!hasBlockingDebt(debt)) return true;

  const who = customerLabel(customers.find((c) => c.id === customerId));
  toast.blocked({
    title: "Dette en cours : vente refusée",
    message: `${who} doit encore ${formatCurrency(debt.total)} sur ${debt.saleCount} vente${
      debt.saleCount > 1 ? "s" : ""
    } non soldée${debt.saleCount > 1 ? "s" : ""}.`,
    hint: "Faites régler cette dette (page Crédit) avant d'encaisser une nouvelle vente.",
  });
  return false;
}
