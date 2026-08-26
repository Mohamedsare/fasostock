"use client";

import { useEffect, useState } from "react";
import { MdRestartAlt, MdTune } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  applyLabelPreset,
  defaultLabelPrintOptions,
  labelsPerPage,
  LABEL_PRESETS,
  patchLabelGeometry,
  sanitizeLabelPrintOptions,
  sheetFitMessage,
  type LabelPrintOptions,
} from "@/lib/features/products/label-print";

/**
 * Champ numérique qui laisse taper.
 *
 * La valeur n'est remontée que si elle tient dans les bornes : sans cela, effacer le
 * champ pour saisir « 50 » ferait bondir la valeur à la borne basse dès le premier
 * chiffre, et l'utilisateur ne pourrait plus rien écrire.
 */
function NumField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  // Resynchronise quand la valeur change AILLEURS (changement de préréglage, remise à
  // zéro) — pas pendant la frappe, où `draft` et `value` sont déjà d'accord.
  useEffect(() => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n !== value) setDraft(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
      <span className="whitespace-nowrap">
        {label}
        {suffix ? <span className="font-normal text-neutral-400"> ({suffix})</span> : null}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? 1}
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setDraft(String(value))}
        className={fsInputClass("h-9 w-full")}
      />
    </label>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-[#f97316]"
      />
      {children}
    </label>
  );
}

/** Réglages d'impression des étiquettes : format, contenu, dimensions fines. */
export function LabelPrintOptionsPanel({
  options,
  onChange,
}: {
  options: LabelPrintOptions;
  onChange: (next: LabelPrintOptions) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isSheet = options.pageMode === "sheet";
  const perPage = labelsPerPage(options);
  const known = LABEL_PRESETS.some((p) => p.id === options.presetId);
  const preset = LABEL_PRESETS.find((p) => p.id === options.presetId);
  const fitMessage = sheetFitMessage(options);

  function setContent(patch: Partial<LabelPrintOptions>) {
    onChange(sanitizeLabelPrintOptions({ ...options, ...patch }));
  }

  function setGeometry(patch: Partial<LabelPrintOptions>) {
    onChange(patchLabelGeometry(options, patch));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-semibold text-neutral-600">
          Format d&apos;impression
          <select
            value={known ? options.presetId : "custom"}
            onChange={(e) => {
              const id = e.target.value;
              if (id === "custom") return;
              onChange(applyLabelPreset(options, id));
            }}
            className={fsInputClass("h-10 w-full")}
          >
            {LABEL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {!known ? <option value="custom">Format personnalisé</option> : null}
          </select>
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-fs-surface px-3 py-2 text-sm font-semibold text-neutral-800">
          {isSheet ? "📄" : "🖨️"}{" "}
          {`${options.widthMm} × ${options.heightMm} mm`}
          <span className="font-normal text-neutral-500">
            {isSheet
              ? `· planche A4 ${options.cols} × ${options.rows} (${perPage}/feuille)`
              : "· 1 étiquette par page"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-fs-card px-3 py-2 text-sm font-semibold text-neutral-700"
        >
          <MdTune className="h-4 w-4" aria-hidden />
          {showAdvanced ? "Masquer les réglages fins" : "Réglages fins"}
        </button>
        <button
          type="button"
          title="Revenir au format d'origine (40 × 30 mm)"
          onClick={() => onChange(defaultLabelPrintOptions())}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-fs-card text-neutral-600"
        >
          <MdRestartAlt className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {preset ? <div className="text-xs text-neutral-500">{preset.hint}</div> : null}

      {fitMessage ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          ⚠️ {fitMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-black/10 bg-fs-surface px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Sur l&apos;étiquette
        </span>
        <Check checked={options.showName} onChange={(v) => setContent({ showName: v })}>
          Nom du produit
        </Check>
        <Check checked={options.showPrice} onChange={(v) => setContent({ showPrice: v })}>
          Prix
        </Check>
        <Check checked={options.showCode} onChange={(v) => setContent({ showCode: v })}>
          Code sous le QR
        </Check>
        <Check checked={options.showSku} onChange={(v) => setContent({ showSku: v })}>
          SKU
        </Check>
        <Check checked={options.showCutMarks} onChange={(v) => setContent({ showCutMarks: v })}>
          Traits de découpe
        </Check>
      </div>

      {showAdvanced ? (
        <div className="rounded-xl border border-black/10 bg-fs-surface p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <NumField
              label="Largeur"
              suffix="mm"
              value={options.widthMm}
              min={15}
              max={210}
              step={0.5}
              onChange={(v) => setGeometry({ widthMm: v })}
            />
            <NumField
              label="Hauteur"
              suffix="mm"
              value={options.heightMm}
              min={10}
              max={297}
              step={0.5}
              onChange={(v) => setGeometry({ heightMm: v })}
            />
            <NumField
              label="Taille du QR"
              suffix="mm"
              value={options.qrMm}
              min={5}
              max={Math.min(options.widthMm, options.heightMm)}
              step={0.5}
              onChange={(v) => setGeometry({ qrMm: v })}
            />
            <NumField
              label="Texte du nom"
              suffix="pt"
              value={options.nameSizePt}
              min={3}
              max={20}
              step={0.5}
              onChange={(v) => setGeometry({ nameSizePt: v })}
            />
            <NumField
              label="Texte du code"
              suffix="pt"
              value={options.codeSizePt}
              min={3}
              max={16}
              step={0.5}
              onChange={(v) => setGeometry({ codeSizePt: v })}
            />
            <NumField
              label="Lignes du nom"
              value={options.nameLines}
              min={1}
              max={3}
              onChange={(v) => setContent({ nameLines: v })}
            />
          </div>

          {isSheet ? (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-black/10 pt-3 sm:grid-cols-3 lg:grid-cols-5">
              <NumField
                label="Colonnes"
                value={options.cols}
                min={1}
                max={10}
                onChange={(v) => setGeometry({ cols: v })}
              />
              <NumField
                label="Lignes"
                value={options.rows}
                min={1}
                max={20}
                onChange={(v) => setGeometry({ rows: v })}
              />
              <NumField
                label="Écart"
                suffix="mm"
                value={options.gapMm}
                min={0}
                max={20}
                step={0.5}
                onChange={(v) => setGeometry({ gapMm: v })}
              />
              <NumField
                label="Marge feuille"
                suffix="mm"
                value={options.marginMm}
                min={0}
                max={30}
                step={0.5}
                onChange={(v) => setGeometry({ marginMm: v })}
              />
              <NumField
                label="Sauter des cases"
                suffix="feuille entamée"
                value={options.startOffset}
                min={0}
                max={Math.max(0, perPage - 1)}
                onChange={(v) => setContent({ startOffset: v })}
              />
            </div>
          ) : null}

          <div className="mt-3 text-xs text-neutral-500">
            {isSheet
              ? "Planche A4 : imprimez à 100 % (« taille réelle »), sans « ajuster à la page ». Les traits de découpe aident à couper droit sur du papier ordinaire."
              : "Rouleau : le pilote de l'imprimante doit être réglé sur le même support (portrait, 100 %, marges 0) que les dimensions ci-dessus."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
