"use client";

import { useMemo, useState } from "react";
import { MdEdit, MdRestartAlt, MdVisibility, MdVisibilityOff } from "react-icons/md";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  groupElements,
  isDefaultLayout,
  labelMaxLength,
  type InvoiceElement,
  type InvoiceLayoutConfig,
} from "@/lib/features/invoices/invoice-layout";
import { cn } from "@/lib/utils/cn";

/**
 * « Ce qui apparaît sur le document » — la liste des éléments, chacun avec son
 * interrupteur et, quand il porte un texte, son libellé modifiable.
 *
 * Le parti pris tient en une ligne : l'écran montre le document TEL QU'IL EST
 * aujourd'hui, tout allumé. Le propriétaire éteint ce dont il ne veut pas. Il n'a
 * donc rien à reconstruire pour retrouver sa facture d'origine — « Tout rétablir »
 * la lui rend, et un badge lui dit en permanence s'il s'est éloigné du défaut.
 */
export function InvoiceLayoutEditor({
  elements,
  value,
  onChange,
  className,
}: {
  elements: InvoiceElement[];
  value: InvoiceLayoutConfig;
  onChange: (next: InvoiceLayoutConfig) => void;
  className?: string;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const groups = useMemo(() => groupElements(elements), [elements]);
  const hiddenCount = elements.filter((e) => value.hidden.includes(e.key)).length;
  const renamedCount = elements.filter((e) => (value.labels[e.key] ?? "").trim()).length;
  const untouched = isDefaultLayout(value);

  function setShown(key: string, shown: boolean) {
    const hidden = shown
      ? value.hidden.filter((k) => k !== key)
      : value.hidden.includes(key)
        ? value.hidden
        : [...value.hidden, key];
    onChange({ ...value, hidden });
  }

  function setLabel(key: string, text: string) {
    const labels = { ...value.labels };
    const t = text.slice(0, labelMaxLength(key));
    // Champ vidé = retour au libellé d'origine, pas un libellé vide.
    if (t.trim()) labels[key] = t;
    else delete labels[key];
    onChange({ ...value, labels });
  }

  function resetAll() {
    onChange({
      hidden: value.hidden.filter((k) => !elements.some((e) => e.key === k)),
      labels: Object.fromEntries(
        Object.entries(value.labels).filter(([k]) => !elements.some((e) => e.key === k)),
      ),
    });
    setRenaming(null);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">
          {untouched ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Mise en page d&apos;origine — rien n&apos;est modifié.
            </span>
          ) : (
            <>
              {hiddenCount > 0 ? `${hiddenCount} élément${hiddenCount > 1 ? "s" : ""} retiré${hiddenCount > 1 ? "s" : ""}` : null}
              {hiddenCount > 0 && renamedCount > 0 ? " · " : null}
              {renamedCount > 0 ? `${renamedCount} libellé${renamedCount > 1 ? "s" : ""} modifié${renamedCount > 1 ? "s" : ""}` : null}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={resetAll}
          disabled={untouched}
          className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] px-2 py-1 text-[11px] text-fs-text transition hover:bg-black/5 disabled:opacity-40"
        >
          <MdRestartAlt className="h-3.5 w-3.5" aria-hidden />
          Tout rétablir
        </button>
      </div>

      {groups.map((g) => (
        <div key={g.group} className="overflow-hidden rounded-[10px] border border-black/[0.08]">
          <p className="bg-black/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
            {g.group}
          </p>
          <ul>
            {g.items.map((el) => {
              const shown = !value.hidden.includes(el.key);
              const custom = value.labels[el.key] ?? "";
              const editing = renaming === el.key;
              const max = labelMaxLength(el.key);
              return (
                <li key={el.key} className="border-t border-black/[0.05] first:border-t-0">
                  <div className="flex items-start gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => !el.locked && setShown(el.key, !shown)}
                      disabled={el.locked}
                      className={cn(
                        "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition",
                        el.locked
                          ? "cursor-default text-neutral-300"
                          : shown
                            ? "text-[#F97316] hover:bg-[#F97316]/10"
                            : "text-neutral-400 hover:bg-black/5",
                      )}
                      aria-label={shown ? `Retirer ${el.name}` : `Afficher ${el.name}`}
                      title={
                        el.locked
                          ? "Cet élément ne peut pas être retiré"
                          : shown
                            ? "Retirer du document"
                            : "Afficher sur le document"
                      }
                    >
                      {shown ? (
                        <MdVisibility className="h-[18px] w-[18px]" aria-hidden />
                      ) : (
                        <MdVisibilityOff className="h-[18px] w-[18px]" aria-hidden />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span
                          className={cn(
                            "text-[13px] font-medium",
                            shown ? "text-fs-text" : "text-neutral-400 line-through",
                          )}
                        >
                          {el.name}
                        </span>
                        {custom && shown ? (
                          <span
                            className="max-w-full truncate rounded bg-[#F97316]/10 px-1.5 py-0.5 text-[10px] text-[#F97316]"
                            title={custom}
                          >
                            « {custom.length > 60 ? `${custom.slice(0, 60)}…` : custom} »
                          </span>
                        ) : null}
                        {el.locked ? (
                          <span className="text-[10px] text-neutral-400">obligatoire</span>
                        ) : null}
                      </div>
                      {el.hint ? (
                        <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{el.hint}</p>
                      ) : null}

                      {editing && el.defaultText ? (
                        <div className="mt-1.5">
                          <div className="flex items-start gap-1.5">
                            {el.multiline ? (
                              <textarea
                                className={fsInputClass(
                                  "min-h-[64px] min-w-0 flex-1 resize-y rounded-md border-[#E5E7EB] bg-white px-2 py-1.5 text-[12px] leading-snug text-fs-text",
                                )}
                                value={custom}
                                placeholder={el.defaultText}
                                maxLength={max}
                                rows={3}
                                autoFocus
                                onChange={(e) => setLabel(el.key, e.target.value)}
                                onKeyDown={(e) => {
                                  // Entrée sert à passer à la ligne ici : seule Échap ferme.
                                  if (e.key === "Escape") setRenaming(null);
                                }}
                              />
                            ) : (
                              <input
                                className={fsInputClass(
                                  "h-8 min-w-0 flex-1 rounded-md border-[#E5E7EB] bg-white px-2 text-[12px] text-fs-text",
                                )}
                                value={custom}
                                placeholder={el.defaultText}
                                maxLength={max}
                                autoFocus
                                onChange={(e) => setLabel(el.key, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "Escape") setRenaming(null);
                                }}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => setRenaming(null)}
                              className="shrink-0 rounded-md border border-[#E5E7EB] px-2 py-1 text-[11px] text-fs-text hover:bg-black/5"
                            >
                              OK
                            </button>
                          </div>
                          {/* Le compteur n'apparaît qu'à l'approche de la limite : le
                              rappeler dès le premier caractère ferait passer une liberté
                              pour une contrainte. */}
                          {custom.length > max - 40 ? (
                            <p className="mt-1 text-[10px] text-neutral-500">
                              {custom.length} / {max} caractères
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {el.defaultText && shown && !editing ? (
                      <button
                        type="button"
                        onClick={() => setRenaming(el.key)}
                        className="mt-0.5 inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-neutral-500 transition hover:bg-black/5 hover:text-fs-text"
                        aria-label={`Renommer ${el.name}`}
                        title="Renommer"
                      >
                        <MdEdit className="h-3.5 w-3.5" aria-hidden />
                        Renommer
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
