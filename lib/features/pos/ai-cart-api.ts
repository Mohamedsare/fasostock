"use client";

import { compressImageForUpload } from "@/lib/utils/image-compress";

/** Pièce jointe d'un tour : photo de la liste, ou document PDF (devis, bon de commande). */
export type AiCartFile = {
  kind: "image" | "pdf";
  /** Data URL (`data:image/...;base64,...` ou `data:application/pdf;base64,...`). */
  dataUrl: string;
  name: string;
};

/** Un tour de la discussion tel qu'il part au serveur (`/api/ai/cart-vision`). */
export type AiCartTurn = {
  role: "user" | "assistant";
  text: string;
  file?: AiCartFile | null;
};

export type AiCartCandidate = {
  id: string;
  name: string;
  unit: string;
  salePrice: number;
  stock: number;
  score: number;
};

export type AiCartLine = {
  /** Le libellé lu sur le document, avant rapprochement. */
  label: string;
  quantity: number;
  unit: string;
  note: string;
  /** P.U. écrit sur le document (`null` si le document n'en porte pas). */
  unitPrice: number | null;
  /** Total de ligne écrit sur le document. */
  lineTotal: number | null;
  /** Produit retenu par le rapprochement, `null` si rien de sûr. */
  productId: string | null;
  candidates: AiCartCandidate[];
};

export type AiCartResult = {
  reply: string;
  /** Total général écrit sur le document — sert à vérifier la lecture. */
  documentTotal: number | null;
  lines: AiCartLine[];
};

/**
 * Un PDF de 2 Mo pèse ~2,8 Mo une fois encodé en base64, et il faut rester sous la
 * limite de corps de requête de l'hébergeur (4,5 Mo chez Vercel) — historique de la
 * discussion compris. À 3 Mo le document passait localement et se faisait refuser
 * en production, ce qui est le pire des deux mondes.
 */
export const MAX_PDF_BYTES = 2 * 1024 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Fichier illisible."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

/**
 * Fichier choisi par le caissier → pièce jointe prête à partir.
 *
 * Une photo est redimensionnée avant l'envoi : une photo de téléphone brute (4 à
 * 8 Mo) part sur un forfait data payé par le commerçant et n'apporte rien, le
 * modèle lit aussi bien une image bornée à ~1 280 px. Un PDF part tel quel — le
 * recompresser abîmerait justement ce qu'on veut lire (les chiffres).
 */
export async function attachmentFromFile(file: File): Promise<AiCartFile> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(
        "PDF trop lourd (2 Mo maximum). Envoyez les pages utiles, ou une photo de la commande.",
      );
    }
    const dataUrl = await readAsDataUrl(file);
    if (!dataUrl.startsWith("data:application/pdf;base64,")) {
      throw new Error("Ce fichier n'est pas un PDF lisible.");
    }
    return { kind: "pdf", dataUrl, name: file.name || "document.pdf" };
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Envoyez une image (photo de la liste) ou un PDF.");
  }
  const compressed = await compressImageForUpload(file, "product");
  const dataUrl = await readAsDataUrl(compressed);
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Format d'image non pris en charge.");
  }
  return { kind: "image", dataUrl, name: file.name || "photo" };
}

/** Envoie la discussion complète et récupère la liste d'articles à jour. */
export async function runAiCartVision(params: {
  companyId: string;
  storeId: string;
  messages: AiCartTurn[];
  signal?: AbortSignal;
}): Promise<AiCartResult> {
  const res = await fetch("/api/ai/cart-vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal: params.signal,
    body: JSON.stringify({
      companyId: params.companyId,
      storeId: params.storeId,
      messages: withRecentFilesOnly(params.messages).map((m) => ({
        role: m.role,
        text: m.text,
        file: m.file ?? null,
      })),
    }),
  });

  const json = (await res.json().catch(() => null)) as
    | (Partial<AiCartResult> & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(json?.error ?? "L'assistant IA n'a pas répondu.");
  }
  return {
    reply: String(json?.reply ?? ""),
    documentTotal:
      typeof json?.documentTotal === "number" && Number.isFinite(json.documentTotal)
        ? json.documentTotal
        : null,
    lines: Array.isArray(json?.lines) ? (json.lines as AiCartLine[]) : [],
  };
}

/**
 * Seules les dernières pièces jointes repartent au serveur. Sans ce garde-fou, une
 * discussion de dix tours renverrait dix photos (ou dix PDF) à chaque message : la
 * requête finirait par dépasser la taille admise par l'hébergeur, et la facture data
 * du commerçant avec. Les tours plus anciens gardent leur texte — la liste reconnue,
 * elle, est rappelée dans la réponse de l'assistant.
 */
const MAX_FILES_SENT = 2;

function withRecentFilesOnly(messages: AiCartTurn[]): AiCartTurn[] {
  let kept = 0;
  const out: AiCartTurn[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.file && kept < MAX_FILES_SENT) {
      kept += 1;
      out.unshift(m);
      continue;
    }
    if (m.file) {
      // Le tour reste dans l'historique, mais sans sa pièce jointe.
      if (m.text.trim()) out.unshift({ role: m.role, text: m.text, file: null });
      continue;
    }
    out.unshift(m);
  }
  return out;
}
