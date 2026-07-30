"use client";

import { useEffect, useState } from "react";
import { MdSend } from "react-icons/md";
import {
  canShareDocumentFile,
  shareDocument,
  type ShareDocumentOutcome,
} from "@/lib/features/share/share-document";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/**
 * Bouton « Envoyer » : transmet un document (reçu, ticket, quittance, facture)
 * au client via WhatsApp ou toute autre application de l'appareil.
 *
 * Le PDF n'est généré qu'au clic (`makeBlob`) : sur un téléphone en réseau
 * faible, on ne prépare pas un document que le vendeur n'enverra peut-être pas.
 */
export function SendDocumentButton({
  makeBlob,
  filename,
  title,
  message,
  phone,
  label = "Envoyer",
  className,
  disabled,
  onSent,
}: {
  /** Génère le PDF à envoyer (appelé au clic). */
  makeBlob: () => Promise<Blob>;
  filename: string;
  /** Titre du partage (ex. « Reçu de paiement »). */
  title: string;
  /** Message accompagnant le document. */
  message: string;
  /** Téléphone du client — pré-sélectionne la conversation WhatsApp sur ordinateur. */
  phone?: string | null;
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Appelé après un envoi effectif (pas après un abandon). */
  onSent?: (outcome: ShareDocumentOutcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [nativeShare, setNativeShare] = useState(false);

  // `canShare` dépend du navigateur : à évaluer côté client seulement, sinon le
  // rendu serveur et le rendu client divergent.
  useEffect(() => {
    setNativeShare(canShareDocumentFile());
  }, []);

  async function handleClick() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const blob = await makeBlob();
      const outcome = await shareDocument({
        blob,
        filename,
        title,
        message,
        phone,
      });
      if (outcome === "cancelled") return;
      if (outcome === "shared") {
        toast.success("Document transmis à l'application choisie.");
      } else if (outcome === "whatsapp-manual") {
        toast.info(
          `PDF enregistré (${filename}) et WhatsApp ouvert : joignez le fichier à la conversation.`,
          7000,
        );
      } else {
        toast.info(
          `PDF enregistré (${filename}). Joignez-le à votre message pour l'envoyer au client.`,
          7000,
        );
      }
      onSent?.(outcome);
    } catch (e) {
      toast.error(
        messageFromUnknownError(e, "Impossible de préparer le document à envoyer."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={() => void handleClick()}
      title={
        nativeShare
          ? "Envoyer au client (WhatsApp, e-mail, autres applications)"
          : "Enregistrer le PDF et ouvrir WhatsApp pour l'envoyer au client"
      }
      className={cn(
        "touch-manipulation inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-black/10 bg-fs-surface-container px-3 text-sm font-semibold text-fs-text disabled:opacity-50 dark:border-white/10",
        className,
      )}
    >
      {busy ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <MdSend className="h-5 w-5 shrink-0" aria-hidden />
      )}
      {/* Libellé sur une seule ligne : jamais de retour à la ligne dans un bouton. */}
      <span className="truncate whitespace-nowrap">{label}</span>
    </button>
  );
}
