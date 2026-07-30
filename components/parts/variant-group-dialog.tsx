"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdClose, MdSearch } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { saveVariantGroup, setVariantGroupMembers } from "@/lib/features/parts/api";
import type { VariantGroup } from "@/lib/features/parts/types";
import type { ProductItem } from "@/lib/features/products/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

const MAX_AXES = 3;

type MemberDraft = {
  productId: string;
  /** Valeurs saisies, indexées par nom d'axe. */
  attributes: Record<string, string>;
};

/**
 * Famille de déclinaisons : on regroupe des fiches produit EXISTANTES.
 * Chaque variante garde sa ligne produit — donc son stock, son code-barres et son
 * historique de ventes. Rien à migrer, rien ne change en caisse.
 */
export function VariantGroupDialog({
  open,
  onClose,
  companyId,
  products,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  products: ProductItem[];
  editing: VariantGroup | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [axes, setAxes] = useState<string[]>(["Taille"]);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<MemberDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setAxes(editing && editing.attributeNames.length > 0 ? editing.attributeNames : ["Taille"]);
    setNote(editing?.note ?? "");
    setSearch("");
    setMembers(
      (editing?.members ?? []).map((m) => ({
        productId: m.productId,
        attributes: { ...m.attributes },
      })),
    );
  }, [open, editing]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const memberIds = useMemo(() => new Set(members.map((m) => m.productId)), [members]);

  const cleanAxes = useMemo(
    () => axes.map((a) => a.trim()).filter((a) => a !== ""),
    [axes],
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          !memberIds.has(p.id) &&
          (p.name.toLowerCase().includes(q) ||
            (p.sku ?? "").toLowerCase().includes(q) ||
            (p.barcode ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [products, search, memberIds]);

  function addMember(productId: string) {
    setMembers((prev) =>
      prev.some((m) => m.productId === productId)
        ? prev
        : [...prev, { productId, attributes: {} }],
    );
    setSearch("");
  }

  function removeMember(productId: string) {
    setMembers((prev) => prev.filter((m) => m.productId !== productId));
  }

  function setAttribute(productId: string, axis: string, value: string) {
    setMembers((prev) =>
      prev.map((m) =>
        m.productId === productId
          ? { ...m, attributes: { ...m.attributes, [axis]: value } }
          : m,
      ),
    );
  }

  const mut = useMutation({
    mutationFn: async () => {
      const groupId = await saveVariantGroup(companyId, {
        id: editing?.id ?? null,
        name: name.trim(),
        attributeNames: cleanAxes,
        note: note.trim(),
      });
      await setVariantGroupMembers(
        groupId,
        members.map((m) => ({
          productId: m.productId,
          // On ne conserve que les axes réellement définis, valeurs vides écartées.
          attributes: Object.fromEntries(
            cleanAxes
              .map((axis) => [axis, (m.attributes[axis] ?? "").trim()] as const)
              .filter(([, v]) => v !== ""),
          ),
        })),
      );
      return groupId;
    },
    onSuccess: () => {
      toast.success(editing ? "Famille mise à jour." : "Famille créée.");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && cleanAxes.length > 0 && !mut.isPending;

  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/40">
      <button
        type="button"
        className="min-w-0 flex-1 md:min-w-[120px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="flex h-dvh w-full max-w-xl flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <h3 className="text-base font-bold text-fs-text">
            {editing ? "Modifier la famille" : "Nouvelle famille de variantes"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-600">
              Nom de la famille
            </label>
            <input
              className={fsInputClass("rounded-sm")}
              placeholder="Ex. Tee-shirt col rond, Plaquette de frein avant"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">
              Axes de déclinaison ({cleanAxes.length}/{MAX_AXES})
            </p>
            <div className="space-y-2">
              {axes.map((axis, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={fsInputClass("rounded-sm")}
                    placeholder={i === 0 ? "Ex. Taille" : "Ex. Couleur"}
                    value={axis}
                    onChange={(e) =>
                      setAxes((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                    }
                  />
                  {axes.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setAxes((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-sm px-2 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10"
                    >
                      Retirer
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {axes.length < MAX_AXES ? (
              <button
                type="button"
                onClick={() => setAxes((prev) => [...prev, ""])}
                className="mt-2 text-xs font-bold text-fs-accent hover:underline"
              >
                + Ajouter un axe
              </button>
            ) : null}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">
              Déclinaisons ({members.length})
            </p>
            <p className="mb-2 rounded-sm bg-fs-surface-container px-3 py-2 text-xs leading-relaxed text-neutral-600">
              Chaque déclinaison reste une fiche produit à part entière : son stock, son
              code-barres et ses ventes ne changent pas. La famille sert à les voir
              ensemble au lieu de les chercher une par une.
            </p>

            {members.length === 0 ? (
              <p className="rounded-sm border border-dashed border-black/10 px-3 py-5 text-center text-xs text-neutral-500 dark:border-white/10">
                Aucune déclinaison. Cherchez vos fiches existantes ci-dessous.
              </p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const p = productById.get(m.productId);
                  return (
                    <li
                      key={m.productId}
                      className="rounded-sm border border-black/8 p-2.5 dark:border-white/10"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fs-text">
                          {p?.name ?? "Produit supprimé"}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeMember(m.productId)}
                          className="shrink-0 text-[11px] font-bold text-red-600 hover:underline"
                        >
                          Retirer
                        </button>
                      </div>
                      <div
                        className={cn(
                          "grid gap-2",
                          cleanAxes.length > 1 ? "sm:grid-cols-2" : "grid-cols-1",
                        )}
                      >
                        {cleanAxes.map((axis) => (
                          <div key={axis}>
                            <label className="mb-1 block text-[11px] font-semibold text-neutral-500">
                              {axis}
                            </label>
                            <input
                              className={fsInputClass("rounded-sm")}
                              placeholder={`Ex. ${axis === "Taille" ? "XL" : "Rouge"}`}
                              value={m.attributes[axis] ?? ""}
                              onChange={(e) => setAttribute(m.productId, axis, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="relative mt-3">
              <MdSearch
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                className={fsInputClass("pl-9 rounded-sm")}
                placeholder="Ajouter une fiche existante : tapez son nom…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {candidates.length > 0 ? (
              <div className="mt-1.5 max-h-52 overflow-y-auto rounded-sm border border-black/8 dark:border-white/10">
                <ul>
                  {candidates.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addMember(p.id)}
                        className="flex w-full items-center gap-3 border-b border-black/5 px-3 py-2 text-left last:border-b-0 hover:bg-black/4 dark:border-white/5 dark:hover:bg-white/5"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-fs-text">{p.name}</span>
                        {p.sku ? (
                          <span className="shrink-0 text-[11px] text-neutral-500">{p.sku}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-600">
              Note (optionnel)
            </label>
            <textarea
              className={fsInputClass("min-h-[60px] resize-y rounded-sm")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-black/10 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-sm border border-black/10 py-2.5 text-sm font-semibold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => mut.mutate()}
            className={cn(
              "flex-[2] rounded-sm py-2.5 text-sm font-bold text-white",
              canSubmit
                ? "bg-fs-accent"
                : "cursor-not-allowed bg-neutral-300 text-neutral-500 dark:bg-neutral-700",
            )}
          >
            {mut.isPending ? "Enregistrement…" : editing ? "Enregistrer" : "Créer la famille"}
          </button>
        </div>
      </div>
    </div>
  );
}
