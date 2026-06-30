"use client";

import { createClient } from "@/lib/supabase/client";
import type {
  CompanySubscription,
  SubscriptionPlan,
  SubscriptionRequest,
  SubscriptionRequestInput,
  SubscriptionStatus,
} from "./types";

function mapPlan(row: Record<string, unknown> | null | undefined): SubscriptionPlan | null {
  if (!row) return null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    priceCents: Number(row.price_cents ?? 0),
    currency: String(row.currency ?? "XOF"),
    interval: (String(row.interval ?? "month") === "year" ? "year" : "month"),
  };
}

/** Plans payants actifs (mensuel + annuel), triés par prix croissant. */
export async function fetchPaidPlans(): Promise<SubscriptionPlan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id, slug, name, description, price_cents, currency, interval")
    .eq("is_active", true)
    .gt("price_cents", 0)
    .order("price_cents", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map(mapPlan)
    .filter((p): p is SubscriptionPlan => p != null);
}

/** Abonnement courant de l'entreprise (ou null si aucun). */
export async function fetchMySubscription(
  companyId: string,
): Promise<CompanySubscription | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_subscriptions")
    .select(
      "status, current_period_start, current_period_end, cancel_at_period_end, plan:subscription_plans(id, slug, name, description, price_cents, currency, interval)",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const planRaw = row.plan;
  const planObj = Array.isArray(planRaw)
    ? (planRaw[0] as Record<string, unknown> | undefined)
    : (planRaw as Record<string, unknown> | undefined);
  return {
    status: (String(row.status ?? "trialing") as SubscriptionStatus),
    currentPeriodStart:
      row.current_period_start != null ? String(row.current_period_start) : null,
    currentPeriodEnd:
      row.current_period_end != null ? String(row.current_period_end) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    plan: mapPlan(planObj),
  };
}

function mapRequest(row: Record<string, unknown>): SubscriptionRequest {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    planId: String(row.plan_id),
    billingInterval: String(row.billing_interval) === "year" ? "year" : "month",
    amountCents: Number(row.amount_cents ?? 0),
    currency: String(row.currency ?? "XOF"),
    firstName: String(row.first_name ?? ""),
    lastName: String(row.last_name ?? ""),
    phone: String(row.phone ?? ""),
    city: row.city != null ? String(row.city) : null,
    paymentMethod: String(row.payment_method ?? ""),
    transactionId: row.transaction_id != null ? String(row.transaction_id) : null,
    status:
      (String(row.status ?? "pending") as SubscriptionRequest["status"]) ?? "pending",
    createdAt: String(row.created_at),
    reviewNote: row.review_note != null ? String(row.review_note) : null,
  };
}

/** Dernière demande d'abonnement de l'entreprise (pour afficher l'état « en attente »). */
export async function fetchMyLatestRequest(
  companyId: string,
): Promise<SubscriptionRequest | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscription_requests")
    .select(
      "id, company_id, plan_id, billing_interval, amount_cents, currency, first_name, last_name, phone, city, payment_method, transaction_id, status, created_at, review_note",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRequest(data as Record<string, unknown>) : null;
}

/** Demandes approuvées de l'entreprise (= factures téléchargeables), récentes d'abord. */
export async function fetchMyApprovedRequests(
  companyId: string,
): Promise<SubscriptionRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscription_requests")
    .select(
      "id, company_id, plan_id, billing_interval, amount_cents, currency, first_name, last_name, phone, city, payment_method, transaction_id, status, created_at, review_note",
    )
    .eq("company_id", companyId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRequest);
}

export async function createSubscriptionRequest(
  companyId: string,
  input: SubscriptionRequestInput,
): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("subscription_requests").insert({
    company_id: companyId,
    plan_id: input.planId,
    billing_interval: input.billingInterval,
    amount_cents: input.amountCents,
    currency: input.currency,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    phone: input.phone.trim(),
    city: input.city.trim() || null,
    payment_method: input.paymentMethod,
    transaction_id: input.transactionId.trim() || null,
    status: "pending",
    created_by: auth.user?.id ?? null,
  });
  if (error) throw error;
}
