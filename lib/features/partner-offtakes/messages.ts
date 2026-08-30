"use client";

/**
 * Les messages que le commerçant envoie à son partenaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE TEXTE EST ÉCRIT ICI, ET PAS LAISSÉ À L'UTILISATEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Réclamer de l'argent à un confrère est un exercice délicat : trop sec, on perd un
 * partenaire ; trop vague, on ne récupère rien. La plupart des commerçants n'envoient
 * donc RIEN, et attendent — ce qui est la seule façon sûre de ne pas être payé.
 *
 * Le message pré-écrit lève cette hésitation. Il est courtois, il est précis, il tient
 * en cinq lignes sur un écran de téléphone, et il reste modifiable avant l'envoi
 * (WhatsApp ouvre la conversation avec le texte, il ne l'envoie pas).
 *
 * Trois règles tenues dans chaque message :
 *   • On rappelle le CONTEXTE avant le chiffre (« l'enlèvement du 12/09 »), sinon le
 *     destinataire lit une réclamation sans savoir de quoi il s'agit.
 *   • On donne UN seul chiffre à retenir : le reste dû. Le total et le versé sont là
 *     pour la vérification, pas pour la décision.
 *   • On ne menace jamais et on ne suppose pas la mauvaise foi. Neuf retards sur dix
 *     sont des oublis.
 */

import { formatCurrency } from "@/lib/utils/currency";
import type { PartnerOfftake } from "./types";

function frDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Le détail de ce qui est parti — celui qu'on envoie AU MOMENT de l'enlèvement. */
export function buildOfftakeDeliveryMessage(params: {
  offtake: PartnerOfftake;
  storeName: string;
}): string {
  const { offtake: o, storeName } = params;
  const lines: string[] = [];

  lines.push(`Bonjour ${o.partnerName},`);
  lines.push("");
  lines.push(`Voici le détail de ce que vous avez pris ce jour (bon ${o.offtakeNumber}) :`);
  lines.push("");
  for (const l of o.lines) {
    lines.push(
      `• ${l.label} — ${l.quantity}${l.unit ? ` ${l.unit}` : ""} × ${formatCurrency(
        l.unitPrice,
      )} = ${formatCurrency(l.quantity * l.unitPrice)}`,
    );
  }
  lines.push("");
  lines.push(`TOTAL : ${formatCurrency(o.totalAmount)}`);
  if (o.amountPaid > 0) lines.push(`Versé : ${formatCurrency(o.amountPaid)}`);
  if (o.remaining > 0) {
    const due = frDate(o.dueAt);
    lines.push(
      due
        ? `Reste à payer : ${formatCurrency(o.remaining)} (convenu pour le ${due})`
        : `Reste à payer : ${formatCurrency(o.remaining)}`,
    );
  } else {
    lines.push("Tout est réglé, merci.");
  }
  lines.push("");
  lines.push(`Merci pour la confiance — ${storeName}`);

  return lines.join("\n");
}

/** La relance — celle qu'on envoie plus tard, quand le solde traîne. */
export function buildOfftakeReminderMessage(params: {
  offtake: PartnerOfftake;
  storeName: string;
}): string {
  const { offtake: o, storeName } = params;
  const takenOn = frDate(o.createdAt);
  const due = frDate(o.dueAt);

  const lines: string[] = [];
  lines.push(`Bonjour ${o.partnerName},`);
  lines.push("");
  lines.push(
    takenOn
      ? `J'espère que le commerce marche bien. Petit rappel amical au sujet de l'enlèvement du ${takenOn} (bon ${o.offtakeNumber}).`
      : `J'espère que le commerce marche bien. Petit rappel amical au sujet du bon ${o.offtakeNumber}.`,
  );
  lines.push("");
  lines.push(`Total : ${formatCurrency(o.totalAmount)}`);
  if (o.amountPaid > 0) lines.push(`Déjà versé : ${formatCurrency(o.amountPaid)}`);
  lines.push(`Reste à régler : ${formatCurrency(o.remaining)}`);
  if (due) lines.push(`Échéance convenue : ${due}`);
  lines.push("");
  lines.push(
    "Si le règlement est déjà parti, merci de ne pas tenir compte de ce message. Sinon, dites-moi simplement quand cela vous arrange.",
  );
  lines.push("");
  lines.push(`Bien à vous — ${storeName}`);

  return lines.join("\n");
}

/** Le reçu — après un versement, pour que le partenaire ait sa trace. */
export function buildOfftakePaymentMessage(params: {
  offtake: PartnerOfftake;
  storeName: string;
  amount: number;
  remainingAfter: number;
}): string {
  const { offtake: o, storeName, amount, remainingAfter } = params;
  const lines: string[] = [];
  lines.push(`Bonjour ${o.partnerName},`);
  lines.push("");
  lines.push(
    `Bien reçu votre versement de ${formatCurrency(amount)} sur le bon ${o.offtakeNumber}. Merci.`,
  );
  lines.push("");
  lines.push(
    remainingAfter > 0
      ? `Il reste ${formatCurrency(remainingAfter)} sur cet enlèvement.`
      : "Ce bon est désormais entièrement soldé.",
  );
  lines.push("");
  lines.push(`À bientôt — ${storeName}`);
  return lines.join("\n");
}
