"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdClose } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { savePartModel } from "@/lib/features/parts/api";
import type { PartModel } from "@/lib/features/parts/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/** Création / modification d'un modèle (moto, auto, appareil…). */
export function PartModelFormDialog({
  open,
  onClose,
  companyId,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  editing: PartModel | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [maker, setMaker] = useState("");
  const [years, setYears] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setMaker(editing?.maker ?? "");
    setYears(editing?.years ?? "");
    setNote(editing?.note ?? "");
  }, [open, editing]);

  const mut = useMutation({
    mutationFn: () =>
      savePartModel(companyId, {
        id: editing?.id ?? null,
        name: name.trim(),
        maker: maker.trim(),
        years: years.trim(),
        note: note.trim(),
      }),
    onSuccess: () => {
      toast.success(editing ? "Modèle mis à jour." : "Modèle ajouté.");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && !mut.isPending;

  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/40">
      <button
        type="button"
        className="min-w-0 flex-1 md:min-w-[120px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="flex h-dvh w-full max-w-md flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <h3 className="text-base font-bold text-fs-text">
            {editing ? "Modifier le modèle" : "Nouveau modèle"}
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
              Modèle
            </label>
            <input
              className={fsInputClass("rounded-sm")}
              placeholder="Ex. Crypton 115, Corolla E120"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">
                Marque (optionnel)
              </label>
              <input
                className={fsInputClass("rounded-sm")}
                placeholder="Ex. Yamaha"
                value={maker}
                onChange={(e) => setMaker(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">
                Années (optionnel)
              </label>
              <input
                className={fsInputClass("rounded-sm")}
                placeholder="Ex. 2008-2015"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-600">
              Note (optionnel)
            </label>
            <textarea
              className={fsInputClass("min-h-[60px] resize-y rounded-sm")}
              placeholder="Ex. Version carburateur uniquement"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <p className="rounded-sm bg-fs-surface-container px-3 py-2 text-xs leading-relaxed text-neutral-600">
            Un modèle sert de clé de recherche : une fois vos pièces rattachées, taper
            «&nbsp;{name.trim() || "Crypton"}&nbsp;» sort tout ce qui va dessus, avec le stock.
          </p>
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
            {mut.isPending ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter le modèle"}
          </button>
        </div>
      </div>
    </div>
  );
}
