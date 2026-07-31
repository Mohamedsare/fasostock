"use client";

import { useState } from "react";
import {
  MdAdd,
  MdArrowBack,
  MdCheckCircle,
  MdClose,
  MdDragIndicator,
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdTune,
} from "react-icons/md";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  LOCATION_TEMPLATES,
  MAX_LOCATION_LEVELS,
  templateLevels,
} from "@/lib/features/product-locations/templates";
import type { LocationLevel } from "@/lib/features/product-locations/types";
import { cn } from "@/lib/utils/cn";

/** Aperçu « Rayon › Allée › Étagère » réutilisé par les gabarits et l'éditeur. */
function LevelChain({
  levels,
  className,
}: {
  levels: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {levels.map((l, i) => (
        <span key={`${l}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span className="text-neutral-400">›</span> : null}
          <span className="rounded-md bg-fs-surface-container px-1.5 py-0.5 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
            {l}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Construction du modèle d'organisation d'une boutique : choix d'un gabarit métier
 * puis ajustement des niveaux. Aucune boutique ne se range comme sa voisine — le
 * gabarit n'est qu'un raccourci, tout reste modifiable avant validation.
 */
export function SchemeSetup({
  storeName,
  initialLevels,
  initialTemplateSlug,
  /** `true` quand la boutique a déjà un plan (on modifie au lieu de créer). */
  editing,
  busy,
  onSubmit,
  onCancel,
}: {
  storeName: string;
  initialLevels: LocationLevel[];
  initialTemplateSlug: string | null;
  editing: boolean;
  busy: boolean;
  onSubmit: (params: { templateSlug: string | null; levels: LocationLevel[] }) => void;
  onCancel?: () => void;
}) {
  const [templateSlug, setTemplateSlug] = useState<string | null>(initialTemplateSlug);
  const [levels, setLevels] = useState<LocationLevel[]>(
    initialLevels.length > 0 ? initialLevels : [],
  );
  const [step, setStep] = useState<"template" | "levels">(
    initialLevels.length > 0 ? "levels" : "template",
  );
  const [error, setError] = useState<string | null>(null);

  const names = levels.map((l) => l.name);
  const canAdd = levels.length < MAX_LOCATION_LEVELS;

  function pickTemplate(slug: string) {
    setTemplateSlug(slug);
    setLevels(templateLevels(slug));
    setStep("levels");
    setError(null);
  }

  function startCustom() {
    setTemplateSlug("custom");
    setLevels([{ name: "" }]);
    setStep("levels");
    setError(null);
  }

  function updateLevel(index: number, name: string) {
    setLevels((prev) => prev.map((l, i) => (i === index ? { name } : l)));
    setError(null);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= levels.length) return;
    setLevels((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  }

  function submit() {
    const cleaned = levels.map((l) => ({ name: l.name.trim() })).filter((l) => l.name !== "");
    if (cleaned.length === 0) {
      setError("Donnez un nom à au moins un niveau (ex. « Rayon »).");
      return;
    }
    const lower = cleaned.map((l) => l.name.toLowerCase());
    if (new Set(lower).size !== lower.length) {
      setError("Deux niveaux ne peuvent pas porter le même nom.");
      return;
    }
    onSubmit({ templateSlug, levels: cleaned });
  }

  // ───────────────────────── Étape 1 : gabarit ─────────────────────────
  if (step === "template") {
    return (
      <div>
        <FsCard className="mb-3" padding="p-4 sm:p-5">
          <h2 className="text-base font-bold text-fs-text sm:text-lg">
            Comment est rangée « {storeName} » ?
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Choisissez l&apos;organisation la plus proche de la réalité de votre boutique.
            Vous pourrez renommer, ajouter ou retirer des niveaux juste après — rien
            n&apos;est figé tant que vous n&apos;avez pas activé le plan.
          </p>
        </FsCard>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {LOCATION_TEMPLATES.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => pickTemplate(t.slug)}
              className="group flex flex-col items-start rounded-xl border border-black/[0.08] bg-fs-card p-4 text-left shadow-sm transition-colors hover:border-fs-accent/60 hover:bg-fs-accent/[0.03]"
            >
              <span className="text-sm font-bold text-fs-text">{t.label}</span>
              <span className="mt-1 text-xs leading-relaxed text-neutral-600">
                {t.description}
              </span>
              <LevelChain levels={t.levels} className="mt-3" />
              <span className="mt-2 text-[11px] italic text-neutral-500">{t.example}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={startCustom}
            className="flex flex-col items-start rounded-xl border border-dashed border-fs-accent/50 bg-fs-accent/[0.04] p-4 text-left transition-colors hover:bg-fs-accent/[0.08]"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-fs-accent">
              <MdTune className="h-[18px] w-[18px]" aria-hidden />
              Créer mon propre modèle
            </span>
            <span className="mt-1 text-xs leading-relaxed text-neutral-600">
              Votre boutique ne ressemble à aucune des propositions ? Définissez vos
              niveaux avec vos mots à vous.
            </span>
          </button>
        </div>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-fs-text"
          >
            <MdArrowBack className="h-4 w-4" aria-hidden />
            Annuler
          </button>
        ) : null}
      </div>
    );
  }

  // ───────────────────────── Étape 2 : niveaux ─────────────────────────
  return (
    <FsCard padding="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-fs-text sm:text-lg">
            {editing ? "Modifier le modèle" : "Vos niveaux de rangement"}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Du plus grand au plus précis. C&apos;est l&apos;ordre dans lequel vous
            décrirez chaque emplacement de la boutique.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setStep("template")}
            className="shrink-0 rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-xs font-semibold text-neutral-700"
          >
            Changer de gabarit
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {levels.map((lvl, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-[10px] border border-black/[0.08] bg-fs-surface-container/50 p-2"
          >
            <MdDragIndicator className="h-5 w-5 shrink-0 text-neutral-300" aria-hidden />
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fs-accent/15 text-[11px] font-bold text-fs-accent">
              {i + 1}
            </span>
            <input
              className={fsInputClass("flex-1")}
              value={lvl.name}
              onChange={(e) => updateLevel(i, e.target.value)}
              placeholder={i === 0 ? "Rayon, Zone, Travée…" : "Étagère, Bac, Tiroir…"}
              aria-label={`Nom du niveau ${i + 1}`}
            />
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="rounded p-0.5 text-neutral-500 disabled:opacity-30"
                aria-label="Monter ce niveau"
              >
                <MdKeyboardArrowUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === levels.length - 1}
                className="rounded p-0.5 text-neutral-500 disabled:opacity-30"
                aria-label="Descendre ce niveau"
              >
                <MdKeyboardArrowDown className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setLevels((prev) => prev.filter((_, idx) => idx !== i))}
              disabled={levels.length <= 1}
              className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-600 disabled:opacity-30"
              aria-label="Retirer ce niveau"
            >
              <MdClose className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setLevels((prev) => [...prev, { name: "" }])}
        disabled={!canAdd}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-[10px] border border-dashed border-fs-accent/50 px-3 py-2 text-xs font-semibold text-fs-accent disabled:opacity-40"
      >
        <MdAdd className="h-4 w-4" aria-hidden />
        Ajouter un niveau
        {!canAdd ? <span className="font-normal">(maximum {MAX_LOCATION_LEVELS})</span> : null}
      </button>

      {names.some((n) => n.trim() !== "") ? (
        <div className="mt-4 rounded-[10px] bg-fs-surface-container/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Un emplacement ressemblera à
          </p>
          <LevelChain
            levels={names.map((n, i) => n.trim() || `Niveau ${i + 1}`)}
            className="mt-1.5"
          />
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-60"
          >
            Annuler
          </button>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              aria-hidden
            />
          ) : (
            <MdCheckCircle className="h-4 w-4" aria-hidden />
          )}
          {editing ? "Enregistrer le modèle" : "Continuer"}
        </button>
      </div>
    </FsCard>
  );
}
