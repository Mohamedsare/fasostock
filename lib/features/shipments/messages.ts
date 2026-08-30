"use client";

/**
 * Les messages qui accompagnent un colis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX MESSAGES, DEUX SUJETS QU'IL NE FAUT PAS MÉLANGER
 * ─────────────────────────────────────────────────────────────────────────────
 * L'AVIS D'EXPÉDITION dit « c'est parti, voilà par quel car, voilà le bordereau ». Il
 * remplace l'appel qu'on passe de toute façon, et il évite le pire des cas : un colis
 * qui dort trois jours à la gare routière parce que personne n'a prévenu le
 * destinataire qu'il devait aller le retirer.
 *
 * LA RELANCE DE FRAIS ne parle QUE du transport. C'est ce qui la rend envoyable : le
 * client a souvent déjà payé sa marchandise, et lui écrire « vous me devez de l'argent »
 * serait à la fois faux et vexant. Ici on parle de 4 500 F de car, pas de sa dette.
 *
 * Les deux restent modifiables avant l'envoi : WhatsApp ouvre la conversation avec le
 * texte, il ne l'envoie pas.
 */

import { formatCurrency } from "@/lib/utils/currency";
import type { Shipment } from "./types";

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

/** « C'est parti » — le message qui évite qu'un colis dorme à la gare routière. */
export function buildShipmentDispatchMessage(params: {
  shipment: Shipment;
  storeName: string;
}): string {
  const { shipment: s, storeName } = params;
  const first = s.recipientName.trim().split(/\s+/)[0] ?? s.recipientName;
  const lines: string[] = [];

  lines.push(`Bonjour ${first},`);
  lines.push("");
  lines.push(
    `Votre colis est parti pour ${s.destination}${
      s.packageCount > 1 ? ` (${s.packageCount} colis)` : ""
    }.`,
  );
  lines.push("");
  if (s.carrier) lines.push(`Transporteur : ${s.carrier}`);
  if (s.carrierPhone) lines.push(`Contact transporteur : ${s.carrierPhone}`);
  if (s.trackingRef) lines.push(`N° de bordereau : ${s.trackingRef}`);
  const expected = frDate(s.expectedAt);
  if (expected) lines.push(`Arrivée annoncée : ${expected}`);
  if (s.packageNote) lines.push(`Contenu : ${s.packageNote}`);
  lines.push(`Référence expédition : ${s.shipmentNumber}`);

  if (s.shippingPaidBy === "company" && s.shippingRemaining > 0) {
    lines.push("");
    lines.push(
      `Frais de transport avancés de notre côté : ${formatCurrency(s.shippingCost)}. Vous pourrez nous les rendre avec votre prochain règlement.`,
    );
  }

  lines.push("");
  lines.push("Merci de me confirmer dès que vous l'avez retiré.");
  lines.push("");
  lines.push(`Bonne réception — ${storeName}`);

  return lines.join("\n");
}

/** La relance — elle ne parle QUE du transport avancé. */
export function buildShipmentFeeReminderMessage(params: {
  shipment: Shipment;
  storeName: string;
}): string {
  const { shipment: s, storeName } = params;
  const first = s.recipientName.trim().split(/\s+/)[0] ?? s.recipientName;
  const sentOn = frDate(s.shippedAt ?? s.createdAt);
  const lines: string[] = [];

  lines.push(`Bonjour ${first},`);
  lines.push("");
  lines.push(
    sentOn
      ? `J'espère que tout va bien. Petit rappel au sujet des frais de transport du colis envoyé le ${sentOn} (réf. ${s.shipmentNumber}${
          s.trackingRef ? `, bordereau ${s.trackingRef}` : ""
        }).`
      : `J'espère que tout va bien. Petit rappel au sujet des frais de transport du colis réf. ${s.shipmentNumber}.`,
  );
  lines.push("");
  lines.push(
    `J'ai avancé ${formatCurrency(s.shippingCost)} au transporteur${
      s.carrier ? ` (${s.carrier})` : ""
    }.`,
  );
  if (s.shippingReimbursed > 0) {
    lines.push(`Déjà rendu : ${formatCurrency(s.shippingReimbursed)}`);
  }
  lines.push(`Reste à rendre : ${formatCurrency(s.shippingRemaining)}`);
  lines.push("");
  lines.push(
    "Ce n'est pas pressé — vous pouvez l'ajouter à votre prochain règlement. Si c'est déjà parti, merci de ne pas en tenir compte.",
  );
  lines.push("");
  lines.push(`Merci beaucoup — ${storeName}`);

  return lines.join("\n");
}
