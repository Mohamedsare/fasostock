export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

/** Plan d'abonnement (table `subscription_plans`). */
export type SubscriptionPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: "month" | "year";
};

/** Abonnement courant d'une entreprise (table `company_subscriptions`). */
export type CompanySubscription = {
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: SubscriptionPlan | null;
};

/** Demande d'abonnement soumise par l'owner. */
export type SubscriptionRequest = {
  id: string;
  companyId: string;
  planId: string;
  billingInterval: "month" | "year";
  amountCents: number;
  currency: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string | null;
  paymentMethod: string;
  transactionId: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewNote: string | null;
};

export type SubscriptionRequestInput = {
  planId: string;
  billingInterval: "month" | "year";
  amountCents: number;
  currency: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  paymentMethod: string;
  transactionId: string;
};

export type SubscriptionPaymentMethod = { key: string; label: string };

/** Moyens de paiement proposés (Burkina Faso). */
export const SUBSCRIPTION_PAYMENT_METHODS: readonly SubscriptionPaymentMethod[] = [
  { key: "cash", label: "Espèces" },
  { key: "orange_money", label: "Orange Money" },
  { key: "moov_money", label: "Moov Money" },
  { key: "bank_transfer", label: "Virement bancaire" },
  { key: "card", label: "Carte bancaire" },
] as const;

/** L'ID de transaction est requis pour tout paiement autre qu'en espèces. */
export function paymentRequiresTransactionId(methodKey: string): boolean {
  return methodKey !== "cash";
}

export function subscriptionPaymentLabel(key: string): string {
  return SUBSCRIPTION_PAYMENT_METHODS.find((m) => m.key === key)?.label ?? key;
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Essai gratuit",
  active: "Actif",
  past_due: "Paiement en retard",
  canceled: "Annulé",
  expired: "Expiré",
};
