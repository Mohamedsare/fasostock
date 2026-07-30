"use client";

import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Envoi d'un document (reçu, ticket, quittance, facture) au client depuis
 * l'appareil du commerçant.
 *
 * Sur téléphone (Android / iOS), `navigator.share` avec un fichier ouvre la
 * feuille de partage du système : WhatsApp, Telegram, Gmail, Bluetooth… C'est
 * le cas d'usage réel — le vendeur envoie le reçu au client sans imprimante.
 *
 * Sur ordinateur, l'API Web Share ne transporte pas de fichier. On ne peut donc
 * PAS joindre le PDF automatiquement : on l'enregistre, puis on ouvre WhatsApp
 * (Web ou l'application de bureau) sur la conversation du client avec un
 * message pré-rempli — il ne reste qu'à glisser le fichier téléchargé.
 * Mentir sur ce point (« envoyé ! ») serait pire que de l'expliquer.
 */

export type ShareDocumentInput = {
  /** PDF déjà généré. */
  blob: Blob;
  /** Nom de fichier proposé, sans chemin (ex. « recu-VTE-0012.pdf »). */
  filename: string;
  /** Titre du partage (utilisé par certaines applications). */
  title: string;
  /** Message accompagnant le document. */
  message: string;
  /** Téléphone du destinataire, tel que saisi (« 70 12 34 56 », « +226 … »). */
  phone?: string | null;
};

export type ShareDocumentOutcome =
  /** Le document est passé à l'application choisie par l'utilisateur. */
  | "shared"
  /** L'utilisateur a fermé la feuille de partage. */
  | "cancelled"
  /** PDF enregistré + WhatsApp ouvert : la pièce jointe reste à ajouter. */
  | "whatsapp-manual"
  /** PDF enregistré seulement (WhatsApp n'a pas pu être ouvert). */
  | "downloaded";

/** Pays par défaut des numéros clients (numéros nationaux à 8 chiffres). */
const DEFAULT_COUNTRY = "BF" as const;

/**
 * Numéro au format attendu par `wa.me` : chiffres avec indicatif, sans « + ».
 * Retourne `null` si le numéro est inutilisable — on ouvrira WhatsApp sans
 * destinataire plutôt que sur une conversation inexistante.
 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input, DEFAULT_COUNTRY);
  if (parsed?.isValid()) return parsed.format("E.164").replace("+", "");
  // Numéro non reconnu (saisie libre) : on tente les chiffres bruts s'ils
  // ressemblent à un numéro international déjà complet.
  const digits = input.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

/** Lien de conversation WhatsApp avec message pré-rempli. */
export function whatsappUrl(
  phone: string | null | undefined,
  message: string,
): string {
  const number = whatsappNumber(phone);
  const text = encodeURIComponent(message);
  return number
    ? `https://wa.me/${number}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

function toFile(input: ShareDocumentInput): File {
  return new File([input.blob], input.filename, {
    type: input.blob.type || "application/pdf",
  });
}

/**
 * `true` si l'appareil peut envoyer le PDF directement vers une autre
 * application. Sert à adapter le libellé du bouton, pas à masquer l'action :
 * le repli ordinateur reste utile.
 */
export function canShareDocumentFile(input?: {
  blob: Blob;
  filename: string;
}): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    const probe = input
      ? new File([input.blob], input.filename, {
          type: input.blob.type || "application/pdf",
        })
      : new File([new Blob([new Uint8Array([37, 80, 68, 70])])], "test.pdf", {
          type: "application/pdf",
        });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "NotAllowedError")
  );
}

/**
 * Envoie le document. Ne lève pas pour un abandon utilisateur : l'appelant
 * décide du message à partir de l'issue retournée.
 */
export async function shareDocument(
  input: ShareDocumentInput,
): Promise<ShareDocumentOutcome> {
  const file = toFile(input);

  if (canShareDocumentFile({ blob: input.blob, filename: input.filename })) {
    try {
      await navigator.share({
        files: [file],
        title: input.title,
        text: input.message,
      });
      return "shared";
    } catch (e) {
      if (isAbort(e)) return "cancelled";
      // Partage refusé par le navigateur : on continue sur le repli.
    }
  }

  downloadBlob(input.blob, input.filename);
  const opened = window.open(
    whatsappUrl(input.phone, input.message),
    "_blank",
    "noopener,noreferrer",
  );
  return opened ? "whatsapp-manual" : "downloaded";
}

/**
 * Nom de fichier sûr pour toutes les plateformes : les numéros de document
 * peuvent contenir « / » ou des espaces, que WhatsApp et Windows refusent.
 */
export function documentFilename(prefix: string, documentNumber: string): string {
  const slug = documentNumber.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${slug || "document"}.pdf`;
}

/** Message par défaut accompagnant un document client. */
export function buildDocumentMessage(params: {
  /** Ex. « Reçu de paiement », « Facture ». */
  documentLabel: string;
  /** Numéro du document (ex. « VTE-0012 »). */
  documentNumber: string;
  storeName: string;
  customerName?: string | null;
  /** Montant déjà formaté (ex. « 12 500 FCFA »). */
  amountLabel?: string | null;
}): string {
  const hello = params.customerName?.trim()
    ? `Bonjour ${params.customerName.trim()},`
    : "Bonjour,";
  const amount = params.amountLabel?.trim()
    ? ` d'un montant de ${params.amountLabel.trim()}`
    : "";
  return [
    hello,
    `Voici votre ${params.documentLabel.toLowerCase()} n° ${params.documentNumber}${amount}.`,
    `Merci de votre confiance — ${params.storeName}`,
  ].join("\n");
}
