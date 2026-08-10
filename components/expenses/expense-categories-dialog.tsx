"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { useState } from "react";
import {
  MdAdd,
  MdCheck,
  MdClose,
  MdEdit,
  MdErrorOutline,
  MdRemoveCircleOutline,
  MdUndo,
} from "react-icons/md";
import type { CustomExpenseCategory } from "@/lib/features/expenses/types";

/**
 * « Mes catégories » — les postes de dépense du propriétaire.
 *
 * Retirer un poste l'ARCHIVE : il quitte le formulaire de saisie mais reste
 * affiché sur les dépenses passées qui le portent. On ne réécrit pas l'histoire
 * d'un commerce parce qu'un poste n'a plus cours.
 */

const inputOutline =
  "min-h-12 rounded-lg border border-black/8 px-3 text-base touch-manipulation sm:min-h-0 sm:text-sm";

export function ExpenseCategoriesDialog({
  open,
  onClose,
  categories,
  busy,
  onCreate,
  onRename,
  onSetActive,
}: {
  open: boolean;
  onClose: () => void;
  /** Tous les postes, archivés compris. */
  categories: CustomExpenseCategory[];
  busy: boolean;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onSetActive: (id: string, isActive: boolean) => Promise<void>;
}) {
  // L'état de saisie n'a pas à être remis à zéro : le parent ne monte ce dialogue
  // qu'à l'ouverture, la fermeture le démonte et emporte l'état avec lui.
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function existsAlready(name: string, exceptId?: string): boolean {
    const needle = name.trim().toLowerCase();
    return categories.some(
      (c) => c.id !== exceptId && c.name.trim().toLowerCase() === needle,
    );
  }

  async function submitNew() {
    const name = newName.trim();
    setError(null);
    if (name.length < 2) {
      setError("Donnez un nom d'au moins 2 caractères.");
      return;
    }
    if (existsAlready(name)) {
      setError(`« ${name} » existe déjà dans votre liste.`);
      return;
    }
    try {
      await onCreate(name);
      setNewName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    }
  }

  async function submitRename(id: string) {
    const name = editingName.trim();
    setError(null);
    if (name.length < 2) {
      setError("Donnez un nom d'au moins 2 caractères.");
      return;
    }
    if (existsAlready(name, id)) {
      setError(`« ${name} » existe déjà dans votre liste.`);
      return;
    }
    try {
      await onRename(id, name);
      setEditingId(null);
      setEditingName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Renommage impossible.");
    }
  }

  const active = categories.filter((c) => c.isActive);
  const archived = categories.filter((c) => !c.isActive);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-categories-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className={cn(
          "max-h-[min(94dvh,800px)] w-full max-w-[460px] shadow-xl",
          "rounded-t-xl rounded-b-none border-x-0 border-b-0 sm:rounded-xl sm:border-x sm:border-b",
        )}
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,800px)] flex-col">
          <div
            className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
            aria-hidden
          />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-4 pb-3 pt-3.5 sm:px-5 sm:pt-5">
            <div className="min-w-0">
              <h2
                id="expense-categories-title"
                className="text-lg font-semibold leading-snug text-fs-text"
              >
                Mes catégories
              </h2>
              <p className="mt-0.5 text-xs text-neutral-600">
                Vos propres postes de dépense. Ce sont les seuls proposés à la saisie.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container sm:h-10 sm:w-10"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {error ? (
              <div className="mb-3 rounded-lg border border-red-200/80 bg-red-50/90 p-3">
                <div className="flex gap-2.5">
                  <MdErrorOutline
                    className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
                    aria-hidden
                  />
                  <p className="text-xs font-medium leading-snug text-red-800 sm:text-sm">
                    {error}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Ajout */}
            <div className="flex gap-2">
              <input
                className={fsInputClass(inputOutline)}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitNew();
                }}
                placeholder="Ex. Carburant moto, Gardien de nuit…"
                maxLength={60}
                aria-label="Nom du nouveau poste de dépense"
              />
              <button
                type="button"
                onClick={() => void submitNew()}
                disabled={busy}
                className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg bg-fs-accent px-3 text-sm font-semibold text-white disabled:opacity-60 sm:min-h-0 sm:py-2.5"
              >
                <MdAdd className="h-4 w-4" aria-hidden />
                Ajouter
              </button>
            </div>

            {/* Postes actifs */}
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Mes postes ({active.length})
              </p>
              {active.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-black/[0.12] px-3 py-4 text-center text-xs text-neutral-500">
                  Aucun poste pour l&apos;instant. Ajoutez ceux qui correspondent
                  vraiment à vos sorties d&apos;argent.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {active.map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-black/[0.06] bg-fs-card px-2.5 py-2",
                        busy && "opacity-60",
                      )}
                    >
                      {editingId === c.id ? (
                        <>
                          <input
                            className={fsInputClass("min-h-10 rounded-md")}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void submitRename(c.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            maxLength={60}
                            autoFocus
                            aria-label={`Renommer ${c.name}`}
                          />
                          <button
                            type="button"
                            onClick={() => void submitRename(c.id)}
                            disabled={busy}
                            className="rounded-md p-2 text-fs-accent hover:bg-fs-surface-container"
                            aria-label="Valider"
                          >
                            <MdCheck className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md p-2 text-neutral-500 hover:bg-fs-surface-container"
                            aria-label="Annuler"
                          >
                            <MdClose className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate text-sm text-fs-text">
                            {c.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(c.id);
                              setEditingName(c.name);
                              setError(null);
                            }}
                            disabled={busy}
                            className="rounded-md p-2 text-fs-accent hover:bg-fs-surface-container"
                            aria-label={`Renommer ${c.name}`}
                          >
                            <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onSetActive(c.id, false)}
                            disabled={busy}
                            className="rounded-md p-2 text-red-600 hover:bg-fs-surface-container"
                            aria-label={`Retirer ${c.name}`}
                            title="Retirer de la liste (les dépenses déjà saisies sont conservées)"
                          >
                            <MdRemoveCircleOutline
                              className="h-[18px] w-[18px]"
                              aria-hidden
                            />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Postes retirés */}
            {archived.length > 0 ? (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Retirés ({archived.length})
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Absents du formulaire, mais toujours lisibles sur les dépenses passées.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {archived.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-black/[0.12] px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-neutral-500 line-through">
                        {c.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => void onSetActive(c.id, true)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-fs-accent hover:bg-fs-surface-container"
                      >
                        <MdUndo className="h-4 w-4" aria-hidden />
                        Remettre
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "shrink-0 border-t border-black/6 bg-fs-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4",
              "pb-[calc(5.75rem+var(--fs-safe-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-black/[0.08] bg-fs-card px-4 text-sm font-semibold text-neutral-800 sm:min-h-0 sm:py-2.5"
            >
              Terminé
            </button>
          </div>
        </div>
      </FsCard>
    </div>
  );
}
