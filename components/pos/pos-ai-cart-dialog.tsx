"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MdAddPhotoAlternate,
  MdAutoAwesome,
  MdClose,
  MdPhotoCamera,
  MdSearch,
  MdSend,
} from "react-icons/md";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  imageFileToDataUrl,
  runAiCartVision,
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

type DraftLine = {
  label: string;
  /** Unité écrite par le client (« carton », « sac ») — affichée telle quelle. */
  unit: string;
  note: string;
  quantity: number;
  productId: string | null;
  /** Produits proposés par le rapprochement serveur, dans l'ordre. */
  candidateIds: string[];
  include: boolean;
};

type ChatBubble = { role: "user" | "assistant"; text: string; image: string | null };

/**
 * « Panier IA » — le client montre sa liste, le caissier la photographie, discute
 * si besoin (« le sucre c'est le paquet de 1 kg », « enlève le savon »), puis
 * envoie le tout au panier.
 *
 * Rien n'est ajouté sans que le caissier ait vu, ligne à ligne, QUEL produit du
 * catalogue a été retenu : le gain de temps ne doit pas se payer en erreurs de
 * facturation. Les lignes non reconnues restent visibles, décochées.
 */
export function PosAiCartDialog({
  open,
  onClose,
  companyId,
  storeId,
  products,
  stockByProductId,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  storeId: string;
  /** Catalogue réellement vendable dans cette boutique (déjà filtré par la caisse). */
  products: AiCartProduct[];
  stockByProductId: Map<string, number>;
  /** Ajoute les lignes retenues au panier. Renvoie le nombre de lignes acceptées. */
  onApply: (lines: Array<{ productId: string; quantity: number }>) => number;
}) {
  const [turns, setTurns] = useState<AiCartTurn[]>([]);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [searchFor, setSearchFor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const productById = useMemo(() => {
    const m = new Map<string, AiCartProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  // Réinitialisation à la fermeture : la liste d'un client ne doit jamais
  // réapparaître dans la commande du suivant.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setTurns([]);
    setBubbles([]);
    setDraft("");
    setPendingImage(null);
    setLines([]);
    setBusy(false);
    setSearchFor(null);
    setSearch("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, bubbles]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function pickImage(file: File | null | undefined) {
    if (!file) return;
    try {
      setPendingImage(await imageFileToDataUrl(file));
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    }
  }

  function applyServerLines(serverLines: AiCartLine[]) {
    setLines(
      serverLines.map((l) => {
        // On ne garde que des produits que CETTE caisse peut vendre : un produit
        // hors catalogue boutique n'a rien à faire dans une proposition.
        const candidateIds = l.candidates.map((c) => c.id).filter((id) => productById.has(id));
        const productId =
          l.productId && productById.has(l.productId) ? l.productId : null;
        return {
          label: l.label,
          unit: l.unit,
          note: l.note,
          quantity: Math.max(1, Math.floor(l.quantity || 1)),
          productId,
          candidateIds,
          include: productId != null,
        };
      }),
    );
  }

  async function send() {
    const text = draft.trim();
    if (!text && !pendingImage) {
      toast.info("Ajoutez une photo de la liste ou écrivez la demande.");
      return;
    }
    if (busy) return;

    const turn: AiCartTurn = { role: "user", text, image: pendingImage };
    const nextTurns = [...turns, turn];
    setTurns(nextTurns);
    setBubbles((b) => [...b, { role: "user", text, image: pendingImage }]);
    setDraft("");
    setPendingImage(null);
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
          : "Je n'ai rien pu lire sur cette image.");
      /*
       * L'historique garde la réponse ET un rappel compact de la liste retenue.
       * C'est lui qui permet de corriger au tour suivant (« mets 5 sacs », « enlève
       * le savon ») sans renvoyer la photo — qui, elle, finit par être écartée de
       * la requête pour ne pas la faire grossir sans fin.
       */
      setTurns((t) => [...t, { role: "assistant", text: reply + recapOf(res.lines) }]);
      setBubbles((b) => [...b, { role: "assistant", text: reply, image: null }]);
      applyServerLines(res.lines);
    } catch (e) {
      if (controller.signal.aborted) return;
      const msg = messageFromUnknownError(e);
      // Le tour qui a échoué ne reste pas dans l'historique : le caissier
      // renvoie sa photo sans se retrouver à la payer deux fois.
      setTurns(turns);
      setBubbles((b) => [...b, { role: "assistant", text: msg, image: null }]);
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
    return products
      .filter((p) => normalizeText(p.name).includes(q))
      .slice(0, 12);
  }, [products, search, searchFor]);

  const selected = lines.filter((l) => l.include && l.productId != null);
  const estimatedTotal = selected.reduce((sum, l) => {
    const p = l.productId ? productById.get(l.productId) : null;
    return sum + (p ? p.salePrice * l.quantity : 0);
  }, 0);

  function apply() {
    const payload = selected.map((l) => ({
      productId: l.productId as string,
      quantity: l.quantity,
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
        ? `${added} ligne${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""} au panier.`
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
      <div className="flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:h-[86dvh] sm:rounded-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.08] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <MdAutoAwesome className="h-5 w-5 shrink-0 text-[#F97316]" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#1F2937]">Panier IA</p>
              <p className="truncate text-[11px] text-neutral-600">
                Photographiez la liste du client, corrigez par écrit si besoin.
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

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-2 md:grid-rows-1">
          {/* Discussion */}
          <div className="flex min-h-0 flex-col border-b border-black/[0.08] md:border-b-0 md:border-r">
            <div ref={threadRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {bubbles.length === 0 ? (
                <div className="rounded-lg bg-[#F97316]/5 px-3 py-3 text-[12px] leading-relaxed text-[#1F2937]">
                  Prenez la liste en photo (papier, écran, message WhatsApp). L&apos;assistant
                  lit les articles et les quantités, puis les rapproche de votre catalogue.
                  Vous validez chaque ligne avant qu&apos;elle n&apos;entre au panier.
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
                  {b.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.image}
                      alt="Liste du client"
                      className="mb-1.5 max-h-40 w-full rounded object-contain"
                    />
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
              {pendingImage ? (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-black/[0.04] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingImage}
                    alt="Photo à envoyer"
                    className="h-12 w-12 rounded object-cover"
                  />
                  <span className="flex-1 text-[11px] text-neutral-600">Photo prête à envoyer</span>
                  <button
                    type="button"
                    onClick={() => setPendingImage(null)}
                    className="rounded-full p-1.5 text-[#1F2937]/70 hover:bg-black/5"
                    aria-label="Retirer la photo"
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
                    void pickImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void pickImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F97316] text-white hover:opacity-95"
                  aria-label="Prendre la liste en photo"
                  title="Prendre la liste en photo"
                >
                  <MdPhotoCamera className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] text-[#1F2937]/70 hover:bg-black/5"
                  aria-label="Choisir une image"
                  title="Choisir une image"
                >
                  <MdAddPhotoAlternate className="h-5 w-5" aria-hidden />
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
                  placeholder="Précisez (« 3 sacs de riz, pas de savon »)…"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy || (!draft.trim() && !pendingImage)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#1F2937] text-white disabled:opacity-40"
                  aria-label="Envoyer"
                >
                  <MdSend className="h-[18px] w-[18px]" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          {/* Lignes proposées */}
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {lines.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12px] text-neutral-600">
                  Les articles lus apparaîtront ici, avec le produit de votre catalogue
                  qui leur correspond.
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
                              Lu : « {l.label} »{l.unit ? ` (${l.unit})` : ""}
                            </p>
                            {l.note ? (
                              <p className="truncate text-[11px] italic text-neutral-500">{l.note}</p>
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
                              <input
                                type="number"
                                min={1}
                                className={fsInputClass(
                                  "h-8 w-16 shrink-0 rounded-md border-[#E5E7EB] bg-white px-1.5 text-center text-[12px] text-[#1F2937]",
                                )}
                                value={l.quantity}
                                onChange={(e) => {
                                  const q = Math.max(1, Math.floor(Number(e.target.value) || 1));
                                  setLine(i, { quantity: q });
                                }}
                                aria-label="Quantité"
                              />
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

                            {product == null ? (
                              <p className="mt-1 text-[11px] text-amber-800">
                                Non reconnu : choisissez le produit, ou laissez la ligne de côté.
                              </p>
                            ) : shortStock ? (
                              <p className="mt-1 text-[11px] text-red-600">
                                Stock disponible : {stock}. La quantité sera ajustée.
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
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="text-neutral-600">
                  {selected.length} ligne{selected.length > 1 ? "s" : ""} retenue
                  {selected.length > 1 ? "s" : ""}
                </span>
                <span className="font-semibold text-[#1F2937]">
                  ≈ {formatCurrency(estimatedTotal)}
                </span>
              </div>
              <button
                type="button"
                onClick={apply}
                disabled={busy || selected.length === 0}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#F97316] text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-40"
              >
                Remplir le panier
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Rappel de la liste courante, glissé dans l'historique envoyé au modèle. */
function recapOf(lines: AiCartLine[]): string {
  if (lines.length === 0) return "";
  const items = lines
    .map((l) => `${l.quantity} x ${l.label}${l.unit ? ` (${l.unit})` : ""}`)
    .join(" ; ");
  return `
[liste en cours] ${items}`;
}
