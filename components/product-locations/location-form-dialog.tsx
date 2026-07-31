"use client";

import { useState } from "react";
import { MdPlace } from "react-icons/md";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";

/**
 * Création / renommage d'un emplacement. Volontairement minimal : un nom, un code
 * court facultatif. Le parent (donc le niveau) est décidé par l'endroit d'où l'on
 * ouvre la boîte — jamais re-choisi ici, pour ne pas déplacer une branche par erreur.
 *
 * L'appelant passe une `key` distincte par ouverture : la boîte se remonte, donc
 * les champs repartent des valeurs initiales sans effet de synchronisation.
 */
export function LocationFormDialog({
  open,
  levelName,
  parentPath,
  initialName,
  initialCode,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Libellé du niveau concerné (« Étagère »). */
  levelName: string;
  /** Chemin du parent (« Boissons › Allée 2 »), `null` à la racine. */
  parentPath: string | null;
  initialName: string;
  initialCode: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (params: { name: string; code: string | null }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const editing = initialName !== "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Renommer l'emplacement" : "Nouvel emplacement"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <FsCard className="w-full max-w-md shadow-xl" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <MdPlace className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
          <h2 className="text-base font-bold text-fs-text">
            {editing ? `Renommer — ${levelName}` : `Nouveau : ${levelName}`}
          </h2>
        </div>
        {parentPath ? (
          <p className="mt-1.5 text-xs text-neutral-600">
            Dans <span className="font-semibold text-fs-text">{parentPath}</span>
          </p>
        ) : null}

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Nom du {levelName.toLowerCase()}
          </label>
          <input
            className={fsInputClass()}
            value={name}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() !== "") {
                onSubmit({ name: name.trim(), code: code.trim() || null });
              }
            }}
            placeholder="Boissons, Allée 2, Étagère B…"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Code court (facultatif)
          </label>
          <input
            className={fsInputClass()}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="A2, R-04…"
            maxLength={12}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            Affiché en pastille dans les listes. Pratique si vos rayons portent déjà
            une référence peinte au mur.
          </p>
        </div>

        {error ? (
          <p className="mt-3 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (name.trim() === "") {
                setError("Donnez un nom à cet emplacement.");
                return;
              }
              onSubmit({ name: name.trim(), code: code.trim() || null });
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden
              />
            ) : null}
            {editing ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </FsCard>
    </div>
  );
}
