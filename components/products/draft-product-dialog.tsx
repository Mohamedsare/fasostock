"use client";

/**
 * « Ajouter un article » — la fiche que l'équipe peut créer, sans les prix.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN DIALOGUE SÉPARÉ, ET PAS LE FORMULAIRE PRODUIT AVEC DES CHAMPS CACHÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le formulaire produit complet fait 1 600 lignes et une trentaine de champs :
 * prix d'achat, prix de vente, prix de gros, seuil, marque, portée, conditionnements,
 * champs métier, alias de recherche, châssis moteur. Y masquer deux champs pour un rôle
 * donnerait un écran de vingt-huit champs à quelqu'un qui déballe un carton dans un
 * dépôt — c'est-à-dire un écran qu'il n'utilisera pas.
 *
 * Ce que l'employé peut saisir est exactement ce qu'il a sous les yeux : le nom écrit
 * sur l'emballage, l'unité, le code-barres qu'il scanne, et éventuellement une note.
 * Cinq champs, dont trois facultatifs. Le reste — les prix, la marque, la portée, le
 * seuil d'alerte — est le travail du patron, plus tard, à froid, dans la vraie fiche.
 *
 * La garantie ne repose de toute façon pas sur cet écran : `create_draft_product`
 * (migration 00210) écrit les prix, l'activation et l'état d'attente EN DUR. Ce qui
 * part d'ici ne peut pas arriver chiffré, quoi qu'on ajoute à la requête.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdCheck, MdClose, MdInfoOutline, MdQrCodeScanner } from "react-icons/md";

import { PosBarcodeScannerDialog } from "@/components/pos/pos-barcode-scanner-dialog";
import { createDraftProduct } from "@/lib/features/products/employee-catalog";
import type { ProductCategory } from "@/lib/features/products/types";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/** Unités proposées en un tap — celles qui couvrent presque tout le commerce de détail. */
const UNITS = ["pce", "kg", "L", "m", "sac", "carton", "paquet", "boîte"] as const;

export function DraftProductDialog({
  companyId,
  storeId,
  categories,
  onClose,
  onCreated,
}: {
  companyId: string;
  /** Boutique courante — rattachement du produit pour les catalogues par boutique. */
  storeId: string | null;
  categories: ProductCategory[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>("pce");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  /** Combien de fiches créées d'affilée — le carton en contient quarante. */
  const [createdCount, setCreatedCount] = useState(0);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  const mut = useMutation({
    mutationFn: () =>
      createDraftProduct({
        companyId,
        name: trimmedName,
        unit,
        barcode,
        description,
        categoryId: categoryId || null,
        storeId,
      }),
    onSuccess: () => {
      toast.success(`« ${trimmedName} » ajouté. Le patron y mettra le prix.`);
      setCreatedCount((n) => n + 1);
      /*
       * On vide le nom et le code-barres, on GARDE l'unité et la catégorie : celui qui
       * déballe un carton saisit vingt articles de la même famille à la suite. Tout
       * remettre à zéro lui ferait recocher la même catégorie vingt fois.
       */
      setName("");
      setBarcode("");
      setDescription("");
      onCreated();
    },
    onError: (e) => toastMutationError("products", e),
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter un article"
    >
      <button
        type="button"
        className="absolute inset-0 -z-0"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-fs-surface shadow-2xl sm:max-h-[88vh] sm:max-w-md sm:rounded-lg">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-neutral-300 sm:hidden" />

        <div className="flex items-start gap-3 border-b border-black/6 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fs-accent">
              Nouvel article
            </p>
            <h2 className="text-sm font-bold text-fs-text">
              Ajouter au catalogue, sans le prix
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-black/5"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/*
            Dit une fois, clairement, ce que l'employé va produire. Sans cette phrase il
            croit avoir mal fait son travail en ne trouvant pas les champs de prix.
          */}
          <p className="flex items-start gap-2 rounded-[10px] bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-900 dark:text-sky-200">
            <MdInfoOutline className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              L&apos;article sera enregistré <strong>sans prix</strong> : il n&apos;est
              pas vendable tout de suite. Le propriétaire le verra dans sa liste
              « à chiffrer » et il deviendra vendable dès qu&apos;il aura son prix.
            </span>
          </p>

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
              htmlFor="draft-product-name"
            >
              Nom de l&apos;article *
            </label>
            <input
              id="draft-product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Savon Omo 400 g"
              maxLength={160}
              autoFocus
              className="mt-1.5 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Recopiez le nom tel qu&apos;il est écrit sur l&apos;emballage.
            </p>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Unité
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
                    unit === u
                      ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                      : "border-black/10 bg-fs-card text-neutral-700 hover:border-fs-accent/40",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
              htmlFor="draft-product-barcode"
            >
              Code-barres
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="draft-product-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scannez ou saisissez"
                inputMode="numeric"
                maxLength={64}
                className="min-h-11 min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
              />
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-black/10 bg-fs-card px-3 text-xs font-semibold text-neutral-800"
                aria-label="Scanner le code-barres"
              >
                <MdQrCodeScanner className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </div>
          </div>

          {categories.length > 0 ? (
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
                htmlFor="draft-product-category"
              >
                Catégorie
              </label>
              <select
                id="draft-product-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-fs-text outline-none focus:border-fs-accent"
              >
                <option value="">— Aucune —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
              htmlFor="draft-product-note"
            >
              Précision pour le patron
            </label>
            <textarea
              id="draft-product-note"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. reçu du fournisseur Kaboré, 12 cartons"
              rows={2}
              maxLength={400}
              className="mt-1.5 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
            />
          </div>

          {createdCount > 0 ? (
            <p className="text-xs font-semibold text-emerald-700">
              {createdCount} article{createdCount > 1 ? "s" : ""} ajouté
              {createdCount > 1 ? "s" : ""} — vous pouvez continuer.
            </p>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-black/6 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border border-black/10 bg-fs-card text-sm font-semibold text-neutral-800"
          >
            {createdCount > 0 ? "Terminer" : "Annuler"}
          </button>
          <button
            type="button"
            disabled={!canSubmit || mut.isPending}
            onClick={() => mut.mutate()}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-fs-accent text-sm font-semibold text-white disabled:opacity-50"
          >
            {mut.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <MdCheck className="h-5 w-5" aria-hidden />
            )}
            Ajouter
          </button>
        </div>
      </div>

      <PosBarcodeScannerDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDecoded={(code) => {
          setBarcode(code.trim());
          setScanOpen(false);
        }}
      />
    </div>
  );
}
