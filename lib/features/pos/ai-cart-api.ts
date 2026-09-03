"use client";

import { compressImageForUpload } from "@/lib/utils/image-compress";

/** Un tour de la discussion tel qu'il part au serveur (`/api/ai/cart-vision`). */
export type AiCartTurn = {
  role: "user" | "assistant";
  text: string;
  /** Data URL (`data:image/...;base64,...`) — uniquement sur un tour utilisateur. */
  image?: string | null;
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
  /** Le libellé lu sur la photo / dicté, avant rapprochement. */
  label: string;
  quantity: number;
  unit: string;
  note: string;
  /** Produit retenu par le rapprochement, `null` si rien de sûr. */
  productId: string | null;
  candidates: AiCartCandidate[];
};

export type AiCartResult = {
  reply: string;
  lines: AiCartLine[];
};

/**
 * Photo → data URL, redimensionnée avant l'envoi. Une photo de téléphone brute
 * (4 à 8 Mo) part sur un forfait data payé par le commerçant et n'apporte rien :
 * le modèle lit aussi bien une image bornée à ~1 280 px.
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  const compressed = await compressImageForUpload(file, "product");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Image illisible."));
    reader.onload = () => {
      const r = String(reader.result ?? "");
      if (!r.startsWith("data:image/")) {
        reject(new Error("Format d'image non pris en charge."));
        return;
      }
      resolve(r);
    };
    reader.readAsDataURL(compressed);
  });
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
      messages: withRecentImagesOnly(params.messages).map((m) => ({
        role: m.role,
        text: m.text,
        image: m.image ?? null,
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
    lines: Array.isArray(json?.lines) ? (json.lines as AiCartLine[]) : [],
  };
}

/**
 * Seules les dernières photos repartent au serveur. Sans ce garde-fou, une
 * discussion de dix tours renverrait dix photos à chaque message : la requête
 * finirait par dépasser la taille admise par l'hébergeur (et la facture data du
 * commerçant avec). Les tours plus anciens gardent leur texte — la liste
 * reconnue, elle, est rappelée dans la réponse de l'assistant.
 */
const MAX_IMAGES_SENT = 2;

function withRecentImagesOnly(messages: AiCartTurn[]): AiCartTurn[] {
  let kept = 0;
  const out: AiCartTurn[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.image && kept < MAX_IMAGES_SENT) {
      kept += 1;
      out.unshift(m);
      continue;
    }
    if (m.image) {
      // Le tour reste dans l'historique, mais sans sa photo.
      if (m.text.trim()) out.unshift({ role: m.role, text: m.text, image: null });
      continue;
    }
    out.unshift(m);
  }
  return out;
}
