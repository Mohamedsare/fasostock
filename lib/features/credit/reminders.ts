"use client";

/**
 * Les relances de crédit : ce qu'on a déjà dit à qui, et quand.
 *
 * Cette couche NE CALCULE AUCUNE DETTE. Les montants dus viennent d'où ils sont venus
 * depuis toujours — les ventes et leurs `sale_payments`, agrégés par
 * `buildCustomerAggregates` (`credit-math.ts`). Ici on ne tient que la mémoire des
 * relances, pour ne pas harceler et pour savoir où l'on en est.
 *
 * Voir l'en-tête de `supabase/migrations/00212_credit_reminders.sql`.
 */

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/currency";
import type { CustomerCreditAggregate } from "./types";

export type ReminderChannel = "whatsapp" | "sms" | "call" | "app";

/** Ce que la page sait d'un client : sa dette (calculée) + l'historique des relances. */
export type CreditReminderState = {
  customerId: string;
  /** Dernière relance ENVOYÉE (les reports n'en sont pas). */
  lastSentAt: string | null;
  /** Montant annoncé lors de cette relance — pas le solde à jour. */
  lastAmountDue: number | null;
  lastChannel: ReminderChannel | null;
  /** Report en cours : le client ne doit pas remonter avant cette date. */
  snoozedUntil: string | null;
  sentCount: number;
};

/**
 * Dernière relance et report en cours, par client, en une seule lecture.
 *
 * Ne lève jamais : tant que la migration 00212 n'est pas appliquée, la fonction n'existe
 * pas côté base. La page doit alors afficher les dettes SANS historique de relance —
 * dégradée, mais utile — plutôt qu'un écran d'erreur sur une information secondaire.
 */
export async function fetchCreditReminderStates(
  companyId: string,
): Promise<Map<string, CreditReminderState>> {
  const out = new Map<string, CreditReminderState>();
  if (!companyId) return out;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("credit_reminder_states", {
      p_company_id: companyId,
    });
    if (error) return out;
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const id = row.customer_id == null ? "" : String(row.customer_id);
      if (!id) continue;
      out.set(id, {
        customerId: id,
        lastSentAt: row.last_sent_at == null ? null : String(row.last_sent_at),
        lastAmountDue: row.last_amount_due == null ? null : Number(row.last_amount_due),
        lastChannel:
          row.last_channel == null ? null : (String(row.last_channel) as ReminderChannel),
        snoozedUntil: row.snoozed_until == null ? null : String(row.snoozed_until),
        sentCount: Number(row.sent_count ?? 0),
      });
    }
    return out;
  } catch {
    return out;
  }
}

/**
 * Note qu'une relance est partie.
 *
 * `sent_by` n'est pas un paramètre : la policy d'insertion (00212) exige
 * `sent_by = auth.uid()`, personne ne peut donc signer une relance du nom d'un collègue.
 */
export async function logCreditReminder(params: {
  companyId: string;
  customerId: string;
  amountDue: number;
  channel: ReminderChannel;
  message: string | null;
  note?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Session expirée.");

  const { error } = await supabase.from("credit_reminders").insert({
    company_id: params.companyId,
    customer_id: params.customerId,
    kind: "sent",
    channel: params.channel,
    amount_due: Math.max(0, Math.round(params.amountDue)),
    message: params.message,
    note: params.note ?? null,
    sent_by: user.id,
  });
  if (error) throw error;
}

/**
 * Met un client de côté jusqu'à une date.
 *
 * Un report N'EST PAS une relance : il ne compte pas dans `sentCount` et ne remet pas à
 * zéro le « relancé le… ». Le client qui prévient qu'il paiera après la récolte doit
 * cesser de remonter chaque matin, sans pour autant paraître avoir été relancé.
 */
export async function snoozeCreditReminder(params: {
  companyId: string;
  customerId: string;
  amountDue: number;
  /** Date de réapparition (AAAA-MM-JJ). */
  until: string;
  note?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Session expirée.");

  const { error } = await supabase.from("credit_reminders").insert({
    company_id: params.companyId,
    customer_id: params.customerId,
    kind: "snoozed",
    channel: "app",
    amount_due: Math.max(0, Math.round(params.amountDue)),
    snooze_until: params.until,
    note: params.note ?? null,
    sent_by: user.id,
  });
  if (error) throw error;
}

/** Date du jour au format `AAAA-MM-JJ`, dans le fuseau du navigateur. */
export function todayIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Même date, décalée de N jours — pour les boutons « dans 3 jours », « la semaine prochaine ». */
export function isoDatePlusDays(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return todayIsoDate(d);
}

/**
 * Ce client doit-il apparaître dans les rappels aujourd'hui ?
 *
 * Trois raisons de le taire, et elles se cumulent :
 *   • un REPORT est en cours (il a prévenu, on n'insiste pas) ;
 *   • il a été relancé il y a moins de `frequencyDays` jours (on ne harcèle pas) ;
 *   • sa dette est sous le seuil, ou pas encore échue si le patron ne veut que les retards.
 */
export function isReminderDue(params: {
  aggregate: CustomerCreditAggregate;
  state: CreditReminderState | undefined;
  frequencyDays: number;
  minAmount: number;
  overdueOnly: boolean;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  const { aggregate: a, state } = params;

  if (a.totalDue < params.minAmount) return false;
  if (params.overdueOnly && a.overdueAmount <= 0) return false;

  if (state?.snoozedUntil) {
    // Comparaison de dates seules : un report « jusqu'au 12 » tient toute la journée du 12.
    if (todayIsoDate(now) <= state.snoozedUntil) return false;
  }

  if (state?.lastSentAt) {
    const last = new Date(state.lastSentAt);
    if (Number.isFinite(last.getTime())) {
      const elapsedDays = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
      if (elapsedDays < Math.max(1, params.frequencyDays)) return false;
    }
  }

  return true;
}

/**
 * Le message de relance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EST ÉCRIT ICI PLUTÔT QUE LAISSÉ AU COMMERÇANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Réclamer de l'argent à quelqu'un qu'on voit tous les jours au marché est
 * inconfortable. Le message qu'on n'ose pas écrire est celui qu'on n'envoie pas — et
 * une créance qu'on ne réclame jamais finit par ne plus être réclamable.
 *
 * Le texte est donc prêt, courtois, et il tient trois règles :
 *   • il commence par une salutation, jamais par un chiffre ;
 *   • il donne UN seul montant à retenir ;
 *   • il ne suppose pas la mauvaise foi et laisse une porte de sortie honorable
 *     (« si c'est déjà parti, n'en tenez pas compte »).
 *
 * Il reste modifiable avant l'envoi : WhatsApp ouvre la conversation avec le texte, il
 * ne l'envoie pas tout seul.
 */
export function buildCreditReminderMessage(params: {
  customerName: string;
  totalDue: number;
  overdueAmount: number;
  storeName: string;
  /** Échéance la plus proche (ISO), si connue. */
  nextDueAt: string | null;
}): string {
  const firstName = params.customerName.trim().split(/\s+/)[0] ?? params.customerName;
  const lines: string[] = [];

  lines.push(`Bonjour ${firstName},`);
  lines.push("");
  lines.push(
    "J'espère que vous allez bien. Petit rappel amical concernant votre compte chez nous.",
  );
  lines.push("");
  lines.push(`Montant restant à régler : ${formatCurrency(params.totalDue)}`);

  if (params.overdueAmount > 0 && params.overdueAmount < params.totalDue) {
    lines.push(`dont ${formatCurrency(params.overdueAmount)} déjà échu.`);
  }

  if (params.nextDueAt) {
    const d = new Date(params.nextDueAt);
    if (Number.isFinite(d.getTime())) {
      lines.push(
        `Échéance : ${d.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}`,
      );
    }
  }

  lines.push("");
  lines.push(
    "Vous pouvez passer quand cela vous arrange, ou m'envoyer le règlement par mobile money.",
  );
  lines.push(
    "Si vous avez déjà réglé, merci de ne pas tenir compte de ce message.",
  );
  lines.push("");
  lines.push(`Merci pour votre confiance — ${params.storeName}`);

  return lines.join("\n");
}
