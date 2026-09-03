"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MdAddPhotoAlternate,
  MdAutoAwesome,
  MdClose,
  MdGraphicEq,
  MdMic,
  MdPhotoCamera,
  MdPictureAsPdf,
  MdSearch,
  MdSend,
  MdStop,
  MdUploadFile,
} from "react-icons/md";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  attachmentFromFile,
  attachmentFromRecording,
  MAX_RECORDING_MS,
  pickRecordingMimeType,
  runAiCartVision,
  type AiCartFile,
  type AiCartLine,
  type AiCartTurn,
} from "@/lib/features/pos/ai-cart-api";
import { normalizeText } from "@/lib/features/pos/ai-cart-match";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

/** Produit de la caisse, réduit à ce dont ce dialogue a besoin. */
export type AiCartProduct = {
  id: string;
  name: string;
  unit: string;
  salePrice: number;
};

/** Ce que le dialogue renvoie à la caisse pour remplir le tableau. */
export type AiCartApplyLine = {
  productId: string;
  quantity: number;
  /** P.U. repris du document, `null` = prix du catalogue. */
  unitPrice: number | null;
  unit: string | null;
};

type DraftLine = {
  label: string;
  /** Unité écrite sur le document (« carton », « sac ») — reprise dans le tableau. */
  unit: string;
  note: string;
  quantity: number;
  /** P.U. du document, éventuellement corrigé à l'écran. `null` = prix du catalogue. */
  unitPrice: number | null;
  /** P.U. tel que lu, gardé pour montrer ce que portait le document. */
  readUnitPrice: number | null;
  productId: string | null;
  /** Produits proposés par le rapprochement serveur, dans l'ordre. */
  candidateIds: string[];
  include: boolean;
};

type ChatBubble = { role: "user" | "assistant"; text: string; file: AiCartFile | null };

/**
 * « Panier IA » de la caisse Facture (tableau) — le client montre sa liste ou envoie
 * son bon de commande en PDF, le caissier le dépose ici, discute si besoin (« le
 * sucre c'est le paquet de 1 kg », « enlève la ligne 3 »), puis remplit le tableau.
 *
 * Deux principes tiennent tout l'écran :
 *  - le PRIX DU DOCUMENT fait foi quand il y en a un (un devis se refacture au prix
 *    promis), et il reste modifiable ligne à ligne comme dans le tableau lui-même ;
 *  - rien n'entre au panier sans que le caissier ait vu QUEL produit du catalogue a
 *    été retenu. Les lignes non reconnues restent visibles, décochées.
 */
export function PosAiCartDialog({
  open,
  onClose,
  companyId,
  storeId,
  products,
  stockByProductId,
  modelsByProduct,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  storeId: string;
  /** Catalogue réellement vendable dans cette boutique (déjà filtré par la caisse). */
  products: AiCartProduct[];
  stockByProductId: Map<string, number>;
  /**
   * Module Pièces : engins compatibles par produit. La caisse fait confirmer la
   * compatibilité avant d'ajouter une pièce ; ici on l'affiche sur la ligne, pour
   * que le vendeur voie sur quel engin elle se monte avant de cocher.
   */
  modelsByProduct?: Map<string, string[]> | null;
  /** Ajoute les lignes retenues au panier. Renvoie le nombre de lignes acceptées. */
  onApply: (lines: AiCartApplyLine[]) => number;
}) {
  const [turns, setTurns] = useState<AiCartTurn[]>([]);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<AiCartFile | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [documentTotal, setDocumentTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchFor, setSearchFor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [recordingMs, setRecordingMs] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const productById = useMemo(() => {
    const m = new Map<string, AiCartProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  // Réinitialisation à la fermeture : le document d'un client ne doit jamais
  // réapparaître dans la commande du suivant.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    stopAndReleaseMic();
    setRecordingMs(null);
    setTurns([]);
    setBubbles([]);
    setDraft("");
    setPendingFile(null);
    setLines([]);
    setDocumentTotal(null);
    setBusy(false);
    setSearchFor(null);
    setSearch("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, bubbles]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopAndReleaseMic();
    },
    [],
  );

  /**
   * Coupe l'enregistrement et rend le micro, sans passer par l'état React : appelé
   * au démontage et à la fermeture, là où plus aucun rendu ne suivra. Un micro laissé
   * ouvert après la fermeture du dialogue serait une caméra allumée en pire.
   */
  function stopAndReleaseMic() {
    if (recordingTimerRef.current != null) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder == null) return;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    recorder.stream.getTracks().forEach((t) => t.stop());
  }

  async function pickFile(file: File | null | undefined) {
    if (!file) return;
    try {
      setPendingFile(await attachmentFromFile(file));
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    }
  }

  /**
   * Dictée : on enregistre au micro, on s'arrête tout seul au bout du temps prévu,
   * et le micro est RELÂCHÉ dès l'arrêt (sinon le voyant du navigateur reste allumé
   * derrière le comptoir, ce qui n'est acceptable pour personne).
   */
  function releaseRecorder(recorder: MediaRecorder | null) {
    if (recordingTimerRef.current != null) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recorder?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setRecordingMs(null);
  }

  async function startRecording() {
    if (recorderRef.current || busy) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Ce navigateur ne permet pas d'enregistrer le micro.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Autorisez l'accès au micro pour dicter la commande.");
      return;
    }

    const mimeType = pickRecordingMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        // 24 kbit/s suffit largement pour de la parole, et garde la dictée légère
        // sur une connexion de terrain.
        audioBitsPerSecond: 24_000,
      });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      toast.error("Enregistrement audio non pris en charge par ce navigateur.");
      return;
    }

    const chunks: Blob[] = [];
    const startedAt = Date.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAt;
      releaseRecorder(recorder);
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      void attachmentFromRecording(blob, durationMs)
        .then(setPendingFile)
        .catch((e: unknown) => toast.error(messageFromUnknownError(e)));
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecordingMs(0);
    recordingTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setRecordingMs(elapsed);
      // Arrêt automatique : une dictée oubliée ne part pas en transcription.
      if (elapsed >= MAX_RECORDING_MS && recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, 250);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else releaseRecorder(recorder);
  }

  function applyServerLines(serverLines: AiCartLine[]) {
    setLines(
      serverLines.map((l) => {
        // On ne garde que des produits que CETTE caisse peut vendre : un produit
        // hors catalogue boutique n'a rien à faire dans une proposition.
        const candidateIds = l.candidates.map((c) => c.id).filter((id) => productById.has(id));
        const productId = l.productId && productById.has(l.productId) ? l.productId : null;
        const unitPrice =
          l.unitPrice != null && Number.isFinite(l.unitPrice) && l.unitPrice >= 0
            ? Math.round(l.unitPrice)
            : null;
        return {
          label: l.label,
          unit: l.unit,
          note: l.note,
          quantity: Math.max(1, Math.floor(l.quantity || 1)),
          unitPrice,
          readUnitPrice: unitPrice,
          productId,
          candidateIds,
          include: productId != null,
        };
      }),
    );
  }

  async function send() {
    const text = draft.trim();
    if (!text && !pendingFile) {
      toast.info("Ajoutez une photo ou un PDF, ou écrivez la demande.");
      return;
    }
    if (busy) return;

    const turn: AiCartTurn = { role: "user", text, file: pendingFile };
    const nextTurns = [...turns, turn];
    const userBubbleIndex = bubbles.length;
    setTurns(nextTurns);
    setBubbles((b) => [...b, { role: "user", text, file: pendingFile }]);
    setDraft("");
    setPendingFile(null);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await runAiCartVision({
        companyId,
        storeId,
        messages: nextTurns,
        signal: controller.signal,
      });
      const reply =
        res.reply.trim() ||
        (res.lines.length > 0
          ? "Voici ce que j'ai lu."
          : "Je n'ai rien pu lire sur ce document.");
      /*
       * L'historique garde la réponse ET un rappel compact de la liste retenue.
       * C'est lui qui permet de corriger au tour suivant (« mets 5 sacs », « enlève
       * le savon ») sans renvoyer le document — qui, lui, finit par être écarté de
       * la requête pour ne pas la faire grossir sans fin.
       */
      /*
       * Dictée : le texte transcrit REMPLACE l'audio dans l'historique. Sans cela
       * la même dictée repartait — et se refaisait transcrire — à chaque message
       * suivant de la discussion. Le caissier voit le transcrit sur sa bulle : c'est
       * sa seule occasion de constater qu'un mot a été mal entendu.
       */
      const settledTurns: AiCartTurn[] = res.transcript
        ? nextTurns.map((t) =>
            t.file?.kind === "audio"
              ? {
                  role: t.role,
                  text: t.text ? `${t.text}\n${res.transcript}` : (res.transcript as string),
                  file: null,
                }
              : t,
          )
        : nextTurns;
      setTurns([...settledTurns, { role: "assistant", text: reply + recapOf(res.lines) }]);
      if (res.transcript) {
        setBubbles((b) =>
          b.map((bubble, i) =>
            i === userBubbleIndex
              ? {
                  ...bubble,
                  text: bubble.text
                    ? `${bubble.text}\n${res.transcript}`
                    : (res.transcript as string),
                }
              : bubble,
          ),
        );
      }
      setBubbles((b) => [...b, { role: "assistant", text: reply, file: null }]);
      applyServerLines(res.lines);
      setDocumentTotal(res.documentTotal);
    } catch (e) {
      if (controller.signal.aborted) return;
      const msg = messageFromUnknownError(e);
      // Le tour qui a échoué ne reste pas dans l'historique : le caissier renvoie
      // son document sans se retrouver à le payer deux fois.
      setTurns(turns);
      setBubbles((b) => [...b, { role: "assistant", text: msg, file: null }]);
      toast.error(msg);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  function setLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const searchResults = useMemo(() => {
    if (searchFor == null) return [];
    const q = normalizeText(search);
    if (q.length < 2) return [];
    return products.filter((p) => normalizeText(p.name).includes(q)).slice(0, 12);
  }, [products, search, searchFor]);

  const selected = lines.filter((l) => l.include && l.productId != null);
  /** Ce que donnera le tableau : prix du document quand il y en a un, sinon catalogue. */
  const estimatedTotal = selected.reduce((sum, l) => {
    const p = l.productId ? productById.get(l.productId) : null;
    const unit = l.unitPrice ?? p?.salePrice ?? 0;
    return sum + unit * l.quantity;
  }, 0);

  /*
   * Contrôle de LECTURE, indépendant du rapprochement catalogue : les prix lus,
   * multipliés par les quantités lues, face au total écrit sur le document. C'est
   * la seule vérification qui dise « l'assistant a bien lu ce papier » — un prix
   * mal déchiffré (1 400 lu 1 400 000) saute immédiatement aux yeux. Un écart
   * ne bloque rien : beaucoup de documents portent une remise ou un transport
   * qui ne figure sur aucune ligne.
   */
  const pricedLines = lines.filter((l) => l.readUnitPrice != null);
  const readTotal = pricedLines.reduce(
    (sum, l) => sum + (l.readUnitPrice ?? 0) * l.quantity,
    0,
  );
  const readQuantity = lines.reduce((n, l) => n + l.quantity, 0);
  const readCheck =
    documentTotal != null && pricedLines.length === lines.length && lines.length > 0
      ? { total: readTotal, matches: Math.abs(documentTotal - readTotal) <= 1 }
      : null;

  function apply() {
    const payload: AiCartApplyLine[] = selected.map((l) => ({
      productId: l.productId as string,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      unit: l.unit || null,
    }));
    if (payload.length === 0) {
      toast.info("Aucune ligne à ajouter : cochez au moins un produit.");
      return;
    }
    const added = onApply(payload);
    if (added === 0) {
      toast.error("Aucune ligne ajoutée : stock insuffisant.");
      return;
    }
    toast.success(
      added === payload.length
        ? `${added} ligne${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""} au tableau.`
        : `${added} ligne(s) sur ${payload.length} ajoutées — stock insuffisant pour le reste.`,
    );
    onClose();
  }

  // Après TOUS les hooks : un retour anticipé plus haut les rendrait conditionnels.
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Panier IA"
    >
      <div className="flex h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:h-[88dvh] sm:rounded-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.08] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <MdAutoAwesome className="h-5 w-5 shrink-0 text-[#F97316]" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#1F2937]">Panier IA</p>
              <p className="truncate text-[11px] text-neutral-600">
                Photo ou PDF de la commande — les prix du document sont repris tels quels.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#1F2937]/70 hover:bg-black/5"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.25fr)] md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:grid-rows-1">
          {/* Discussion */}
          <div className="flex min-h-0 flex-col border-b border-black/[0.08] md:border-b-0 md:border-r">
            <div ref={threadRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {bubbles.length === 0 ? (
                <div className="rounded-lg bg-[#F97316]/5 px-3 py-3 text-[12px] leading-relaxed text-[#1F2937]">
                  Déposez le <b>PDF</b> du devis ou du bon de commande, prenez la liste{" "}
                  <b>en photo</b>, ou <b>dictez la commande</b> au micro. L&apos;assistant lit
                  les articles, les quantités et les prix écrits, les rapproche de votre
                  catalogue, et remplit le tableau. Vous validez chaque ligne avant
                  qu&apos;elle n&apos;y entre.
                </div>
              ) : null}
              {bubbles.map((b, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed",
                    b.role === "user"
                      ? "ml-auto bg-[#F97316] text-white"
                      : "mr-auto bg-black/[0.05] text-[#1F2937]",
                  )}
                >
                  {b.file?.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.file.dataUrl}
                      alt="Commande du client"
                      className="mb-1.5 max-h-40 w-full rounded object-contain"
                    />
                  ) : null}
                  {b.file?.kind === "pdf" ? (
                    <p className="mb-1.5 flex items-center gap-1.5 rounded bg-white/15 px-2 py-1.5">
                      <MdPictureAsPdf className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{b.file.name}</span>
                    </p>
                  ) : null}
                  {b.file?.kind === "audio" ? (
                    <p className="mb-1.5 flex items-center gap-1.5 rounded bg-white/15 px-2 py-1.5">
                      <MdGraphicEq className="h-4 w-4 shrink-0" aria-hidden />
                      <span>Dictée · {formatDuration(b.file.durationMs ?? 0)}</span>
                    </p>
                  ) : null}
                  {b.text ? <p className="whitespace-pre-wrap">{b.text}</p> : null}
                </div>
              ))}
              {busy ? (
                <div className="mr-auto flex max-w-[85%] items-center gap-2 rounded-lg bg-black/[0.05] px-3 py-2 text-[12px] text-[#1F2937]">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
                  Lecture en cours…
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-black/[0.08] p-2">
              {pendingFile ? (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-black/[0.04] p-2">
                  {pendingFile.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pendingFile.dataUrl}
                      alt="Document à envoyer"
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : pendingFile.kind === "audio" ? (
                    <span className="flex h-12 w-12 items-center justify-center rounded bg-[#F97316]/10 text-[#F97316]">
                      <MdGraphicEq className="h-6 w-6" aria-hidden />
                    </span>
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded bg-red-500/10 text-red-600">
                      <MdPictureAsPdf className="h-6 w-6" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-600">
                    {pendingFile.kind === "pdf"
                      ? pendingFile.name
                      : pendingFile.kind === "audio"
                        ? `Dictée de ${formatDuration(pendingFile.durationMs ?? 0)} prête à envoyer`
                        : "Photo prête à envoyer"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    className="rounded-full p-1.5 text-[#1F2937]/70 hover:bg-black/5"
                    aria-label="Retirer le document"
                  >
                    <MdClose className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    void pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  /* Les notes vocales WhatsApp arrivent en .ogg/.opus : le client
                     envoie sa commande à l'oral, le caissier la dépose telle quelle. */
                  accept="image/*,application/pdf,.pdf,audio/*,.ogg,.opus,.m4a"
                  className="hidden"
                  onChange={(e) => {
                    void pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F97316] text-white hover:opacity-95"
                  aria-label="Envoyer un PDF ou une image"
                  title="Envoyer un PDF ou une image"
                >
                  <MdUploadFile className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={recordingMs != null}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] text-[#1F2937]/70 hover:bg-black/5 disabled:opacity-40"
                  aria-label="Prendre la commande en photo"
                  title="Prendre la commande en photo"
                >
                  <MdPhotoCamera className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => (recordingMs == null ? void startRecording() : stopRecording())}
                  disabled={busy}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md border px-2 disabled:opacity-40",
                    recordingMs != null
                      ? "border-red-600 bg-red-600 text-white"
                      : "w-9 border-[#E5E7EB] text-[#1F2937]/70 hover:bg-black/5",
                  )}
                  aria-label={recordingMs != null ? "Arrêter la dictée" : "Dicter la commande"}
                  title={recordingMs != null ? "Arrêter la dictée" : "Dicter la commande"}
                >
                  {recordingMs != null ? (
                    <>
                      <MdStop className="h-5 w-5" aria-hidden />
                      <span className="text-[11px] font-semibold tabular-nums">
                        {formatDuration(recordingMs)}
                      </span>
                    </>
                  ) : (
                    <MdMic className="h-5 w-5" aria-hidden />
                  )}
                </button>
                <input
                  className={fsInputClass(
                    "h-9 min-w-0 flex-1 rounded-md border-[#E5E7EB] bg-white px-2 text-[12px] text-[#1F2937]",
                  )}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Précisez (« garde les prix du devis, enlève la ligne 3 »)…"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy || recordingMs != null || (!draft.trim() && !pendingFile)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#1F2937] text-white disabled:opacity-40"
                  aria-label="Envoyer"
                >
                  <MdSend className="h-[18px] w-[18px]" aria-hidden />
                </button>
              </div>
              <p className="mt-1.5 px-0.5 text-[10px] leading-snug text-neutral-500">
                <MdAddPhotoAlternate className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
                Photo, PDF (2 Mo max) ou dictée au micro (3 min max). Le document ou la
                dictée sont envoyés à un service d&apos;analyse externe.
              </p>
            </div>
          </div>

          {/* Lignes proposées */}
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {lines.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12px] text-neutral-600">
                  Les articles lus apparaîtront ici : produit du catalogue, quantité et prix
                  unitaire du document.
                </p>
              ) : (
                <ul className="space-y-2">
                  {lines.map((l, i) => {
                    const product = l.productId ? productById.get(l.productId) : null;
                    const stock = l.productId ? (stockByProductId.get(l.productId) ?? 0) : 0;
                    const shortStock = product != null && l.quantity > stock;
                    const options = l.candidateIds
                      .map((id) => productById.get(id))
                      .filter((p): p is AiCartProduct => p != null);
                    if (product && !options.some((o) => o.id === product.id)) {
                      options.unshift(product);
                    }
                    const effectivePrice = l.unitPrice ?? product?.salePrice ?? 0;
                    const models =
                      (product ? modelsByProduct?.get(product.id) : null) ?? [];
                    return (
                      <li
                        key={`${l.label}-${i}`}
                        className={cn(
                          "rounded-lg border p-2.5",
                          product == null
                            ? "border-amber-500/40 bg-amber-500/[0.06]"
                            : "border-black/[0.08] bg-white",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#F97316]"
                            checked={l.include}
                            disabled={product == null}
                            onChange={(e) => setLine(i, { include: e.target.checked })}
                            aria-label={`Ajouter ${l.label}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] text-neutral-600">
                              Lu : « {l.label} »{l.unit ? ` · ${l.unit}` : ""}
                              {l.readUnitPrice != null
                                ? ` · P.U. ${formatCurrency(l.readUnitPrice)}`
                                : " · sans prix"}
                            </p>
                            {l.note ? (
                              <p className="truncate text-[11px] italic text-neutral-500">
                                {l.note}
                              </p>
                            ) : null}

                            <div className="mt-1.5 flex items-center gap-1.5">
                              <select
                                className={fsInputClass(
                                  "h-8 min-w-0 flex-1 rounded-md border-[#E5E7EB] bg-white px-1.5 text-[12px] text-[#1F2937]",
                                )}
                                value={l.productId ?? ""}
                                onChange={(e) => {
                                  const id = e.target.value || null;
                                  setLine(i, { productId: id, include: id != null });
                                }}
                                aria-label="Produit du catalogue"
                              >
                                <option value="">— Aucun produit —</option>
                                {options.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name} · {formatCurrency(o.salePrice)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchFor(searchFor === i ? null : i);
                                  setSearch("");
                                }}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] text-[#1F2937]/70 hover:bg-black/5"
                                aria-label="Chercher un autre produit"
                                title="Chercher un autre produit"
                              >
                                <MdSearch className="h-4 w-4" aria-hidden />
                              </button>
                            </div>

                            <div className="mt-1.5 flex items-center gap-1.5">
                              <label className="flex shrink-0 items-center gap-1 text-[11px] text-neutral-600">
                                Qté
                                <input
                                  type="number"
                                  min={1}
                                  className={fsInputClass(
                                    "h-8 w-16 rounded-md border-[#E5E7EB] bg-white px-1.5 text-center text-[12px] text-[#1F2937]",
                                  )}
                                  value={l.quantity}
                                  onChange={(e) => {
                                    const q = Math.max(1, Math.floor(Number(e.target.value) || 1));
                                    setLine(i, { quantity: q });
                                  }}
                                  aria-label="Quantité"
                                />
                              </label>
                              <label className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-neutral-600">
                                P.U.
                                <input
                                  type="number"
                                  min={0}
                                  className={fsInputClass(
                                    "h-8 w-full min-w-0 rounded-md border-[#E5E7EB] bg-white px-1.5 text-right text-[12px] text-[#1F2937]",
                                  )}
                                  value={l.unitPrice ?? ""}
                                  placeholder={
                                    product ? String(Math.round(product.salePrice)) : "0"
                                  }
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    if (!raw) {
                                      setLine(i, { unitPrice: null });
                                      return;
                                    }
                                    setLine(i, {
                                      unitPrice: Math.max(0, Math.round(Number(raw) || 0)),
                                    });
                                  }}
                                  aria-label="Prix unitaire"
                                />
                              </label>
                              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#F97316]">
                                {formatCurrency(effectivePrice * l.quantity)}
                              </span>
                            </div>

                            {searchFor === i ? (
                              <div className="mt-1.5 rounded-md border border-[#E5E7EB] p-1.5">
                                <input
                                  className={fsInputClass(
                                    "h-8 w-full rounded-md border-[#E5E7EB] bg-white px-2 text-[12px] text-[#1F2937]",
                                  )}
                                  value={search}
                                  onChange={(e) => setSearch(e.target.value)}
                                  placeholder="Nom du produit…"
                                  autoFocus
                                />
                                <ul className="mt-1 max-h-40 overflow-y-auto">
                                  {searchResults.map((p) => (
                                    <li key={p.id}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLines((prev) =>
                                            prev.map((row, idx) =>
                                              idx === i
                                                ? {
                                                    ...row,
                                                    productId: p.id,
                                                    include: true,
                                                    candidateIds: row.candidateIds.includes(p.id)
                                                      ? row.candidateIds
                                                      : [p.id, ...row.candidateIds],
                                                  }
                                                : row,
                                            ),
                                          );
                                          setSearchFor(null);
                                          setSearch("");
                                        }}
                                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px] text-[#1F2937] hover:bg-black/5"
                                      >
                                        <span className="truncate">{p.name}</span>
                                        <span className="shrink-0 text-neutral-600">
                                          {formatCurrency(p.salePrice)}
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                  {search.trim().length >= 2 && searchResults.length === 0 ? (
                                    <li className="px-2 py-1.5 text-[11px] text-neutral-600">
                                      Aucun produit trouvé.
                                    </li>
                                  ) : null}
                                </ul>
                              </div>
                            ) : null}

                            {product != null && models.length > 0 ? (
                              <p className="mt-1 truncate text-[11px] text-neutral-600">
                                Compatible : {models.slice(0, 4).join(", ")}
                                {models.length > 4 ? ` +${models.length - 4}` : ""}
                              </p>
                            ) : null}

                            {product == null ? (
                              <p className="mt-1 text-[11px] text-amber-800">
                                Non reconnu : choisissez le produit, ou laissez la ligne de côté.
                              </p>
                            ) : shortStock ? (
                              <p className="mt-1 text-[11px] text-red-600">
                                Stock disponible : {stock}. La quantité sera ajustée.
                              </p>
                            ) : l.unitPrice != null &&
                              product.salePrice > 0 &&
                              l.unitPrice !== Math.round(product.salePrice) ? (
                              <p className="mt-1 text-[11px] text-neutral-600">
                                Prix du document — catalogue : {formatCurrency(product.salePrice)}.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="shrink-0 border-t border-black/[0.08] px-3 py-2.5">
              {readCheck ? (
                <p
                  className={cn(
                    "mb-2 rounded-md px-2.5 py-1.5 text-[11px] leading-snug",
                    readCheck.matches
                      ? "bg-emerald-500/10 text-emerald-900"
                      : "bg-amber-500/10 text-amber-900",
                  )}
                >
                  {readCheck.matches ? (
                    <>
                      Lecture vérifiée : {lines.length} lignes, {readQuantity} articles,{" "}
                      <b>{formatCurrency(readCheck.total)}</b> — le total du document tombe
                      juste.
                    </>
                  ) : (
                    <>
                      Total du document : <b>{formatCurrency(documentTotal ?? 0)}</b> — les lignes
                      lues donnent {formatCurrency(readCheck.total)}. Vérifiez les prix avant de
                      remplir (remise, transport ou taxe hors lignes, ou un chiffre mal lu).
                    </>
                  )}
                </p>
              ) : null}
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="text-neutral-600">
                  {selected.length} ligne{selected.length > 1 ? "s" : ""} retenue
                  {selected.length > 1 ? "s" : ""} sur {lines.length}
                </span>
                <span className="font-semibold text-[#1F2937]">
                  {formatCurrency(estimatedTotal)}
                </span>
              </div>
              <button
                type="button"
                onClick={apply}
                disabled={busy || selected.length === 0}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#F97316] text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-40"
              >
                Remplir le tableau
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Durée d'une dictée, en `m:ss`. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Rappel de la liste courante, glissé dans l'historique envoyé au modèle. */
function recapOf(lines: AiCartLine[]): string {
  if (lines.length === 0) return "";
  const items = lines
    .map(
      (l) =>
        `${l.quantity} x ${l.label}${l.unit ? ` (${l.unit})` : ""}${
          l.unitPrice != null ? ` @ ${l.unitPrice}` : ""
        }`,
    )
    .join(" ; ");
  return `\n[liste en cours] ${items}`;
}
