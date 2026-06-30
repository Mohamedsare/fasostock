"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { ModuleIcon } from "@/components/tutorials/module-icon";
import {
  createTutorial,
  deleteTutorial,
  listAllTutorials,
  updateTutorial,
} from "@/lib/features/tutorials/api";
import { TUTORIAL_MODULES, tutorialModuleLabel } from "@/lib/features/tutorials/modules";
import { parseYouTubeId, youTubeThumbUrl } from "@/lib/features/tutorials/youtube";
import type { Tutorial, TutorialInput } from "@/lib/features/tutorials/types";
import { messageFromUnknownError, toast } from "@/lib/toast";

const EMPTY: TutorialInput = {
  moduleKey: TUTORIAL_MODULES[0]!.key,
  title: "",
  description: "",
  youtubeUrl: "",
  sortOrder: 0,
  isActive: true,
};

export function AdminTutorialsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-tutorials"], queryFn: listAllTutorials });
  const tutorials = useMemo(() => q.data ?? [], [q.data]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tutorial | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-tutorials"] });
    void qc.invalidateQueries({ queryKey: ["tutorials-active"] });
  };

  const createMut = useMutation({
    mutationFn: (input: TutorialInput) => createTutorial(input),
    onSuccess: () => {
      invalidate();
      toast.success("Tutoriel ajouté");
      setFormOpen(false);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const updateMut = useMutation({
    mutationFn: (p: { id: string; input: TutorialInput }) => updateTutorial(p.id, p.input),
    onSuccess: () => {
      invalidate();
      toast.success("Tutoriel mis à jour");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTutorial(id),
    onSuccess: () => {
      invalidate();
      toast.success("Tutoriel supprimé");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const modulesWithTutos = useMemo(
    () => TUTORIAL_MODULES.filter((m) => tutorials.some((t) => t.moduleKey === m.key)),
    [tutorials],
  );

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader
          title="Tuto"
          description="Gérez les tutoriels vidéo YouTube affichés aux utilisateurs dans la page Aide."
        />
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
        >
          + Ajouter un tutoriel
        </button>
      </div>

      {q.isLoading ? (
        <AdminCard>
          <p className="text-sm text-slate-500">Chargement…</p>
        </AdminCard>
      ) : tutorials.length === 0 ? (
        <AdminCard>
          <p className="py-6 text-center text-sm text-slate-500">
            Aucun tutoriel. Cliquez sur « Ajouter un tutoriel » pour commencer.
          </p>
        </AdminCard>
      ) : (
        <div className="space-y-6">
          {modulesWithTutos.map((m) => (
            <div key={m.key}>
              <div className="mb-2 flex items-center gap-2">
                <ModuleIcon moduleKey={m.key} className="h-4 w-4 text-orange-600" />
                <h2 className="text-sm font-bold text-slate-800">{m.label}</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {tutorials
                  .filter((t) => t.moduleKey === m.key)
                  .map((t) => {
                    const id = parseYouTubeId(t.youtubeUrl);
                    const busy = deleteMut.isPending && deleteMut.variables === t.id;
                    return (
                      <div
                        key={t.id}
                        className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          {id ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={youTubeThumbUrl(id)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start gap-2">
                            <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                              {t.title}
                            </p>
                            {!t.isActive ? (
                              <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                Masqué
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-auto flex gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(t);
                                setFormOpen(true);
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm("Supprimer ce tutoriel ?")) {
                                  deleteMut.mutate(t.id);
                                }
                              }}
                              className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen ? (
        <TutorialFormDialog
          initial={editing}
          busy={createMut.isPending || updateMut.isPending}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={(input) => {
            if (editing) updateMut.mutate({ id: editing.id, input });
            else createMut.mutate(input);
          }}
        />
      ) : null}
    </div>
  );
}

function TutorialFormDialog({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial: Tutorial | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: TutorialInput) => void;
}) {
  const [v, setV] = useState<TutorialInput>(
    initial
      ? {
          moduleKey: initial.moduleKey,
          title: initial.title,
          description: initial.description ?? "",
          youtubeUrl: initial.youtubeUrl,
          sortOrder: initial.sortOrder,
          isActive: initial.isActive,
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const previewId = parseYouTubeId(v.youtubeUrl);
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20";

  function submit() {
    if (!v.title.trim()) {
      setError("Titre requis.");
      return;
    }
    if (!previewId) {
      setError("Lien YouTube invalide. Collez l'URL de la vidéo (watch, youtu.be, shorts…).");
      return;
    }
    setError(null);
    onSubmit(v);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-bold text-slate-900">
            {initial ? "Modifier le tutoriel" : "Nouveau tutoriel"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Module</label>
            <select
              className={inputClass}
              value={v.moduleKey}
              onChange={(e) => setV((p) => ({ ...p, moduleKey: e.target.value }))}
            >
              {TUTORIAL_MODULES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Titre</label>
            <input
              className={inputClass}
              value={v.title}
              onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))}
              placeholder={`Ex. Bien démarrer avec ${tutorialModuleLabel(v.moduleKey)}`}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Lien YouTube
            </label>
            <input
              className={inputClass}
              value={v.youtubeUrl}
              onChange={(e) => setV((p) => ({ ...p, youtubeUrl: e.target.value }))}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            {v.youtubeUrl.trim() ? (
              previewId ? (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={youTubeThumbUrl(previewId)}
                    alt=""
                    className="h-12 w-20 rounded object-cover"
                  />
                  <span className="text-xs font-medium text-emerald-600">Lien valide ✓</span>
                </div>
              ) : (
                <p className="mt-1 text-xs font-medium text-red-600">Lien YouTube non reconnu.</p>
              )
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Description (optionnel)
            </label>
            <textarea
              className={`${inputClass} min-h-[72px] resize-none`}
              value={v.description}
              onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="w-28">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Ordre</label>
              <input
                type="number"
                className={inputClass}
                value={v.sortOrder}
                onChange={(e) => setV((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))}
              />
            </div>
            <label className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={v.isActive}
                onChange={(e) => setV((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Visible par les utilisateurs
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {busy ? "…" : initial ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
