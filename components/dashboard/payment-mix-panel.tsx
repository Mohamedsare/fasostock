"use client";

import { useEffect, useId, useState } from "react";
import { MdExpandMore, MdInfoOutline } from "react-icons/md";
import type { PaymentDisplayKind } from "@/lib/features/payments/payment-display";
import type { PaymentMixEntry } from "@/lib/features/dashboard/types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

/**
 * Couleur pleine de chaque moyen de paiement — barre empilée + pastilles.
 * Même famille de teintes que les puces de `payment-display.ts` (Espèces vert,
 * Orange orange, Moov bleu, Wave cyan…) : le propriétaire retrouve les mêmes
 * couleurs ici et dans l'historique des ventes, sans avoir à réapprendre un code.
 */
const MIX_COLOR: Record<PaymentDisplayKind, string> = {
  cash: "#059669",
  orange_money: "#F97316",
  moov_money: "#2563EB",
  wave: "#06B6D4",
  mobile_money: "#7C3AED",
  card: "#4F46E5",
  transfer: "#64748B",
  credit: "#DC2626",
};

/** L'argent physiquement dans le tiroir, par opposition à l'argent sur un compte. */
function isDrawerCash(kind: PaymentDisplayKind): boolean {
  return kind === "cash";
}

/** « 0 % » pour un montant non nul serait un mensonge : on écrit « <1 % ». */
function formatShare(amount: number, total: number): string {
  if (total <= 0) return "0 %";
  const pct = (amount / total) * 100;
  if (pct > 0 && pct < 1) return "<1 %";
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace(/\.0$/, "")} %`;
}

function readStored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeStored(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? "1" : "0");
  } catch {
    /* navigation privée, stockage bloqué — le volet marche quand même */
  }
}

/**
 * Barre empilée : une part par moyen de paiement, dans l'ordre des montants.
 *
 * Bâtie en `<span>` (et non `<div>`) : l'aperçu replié vit à l'intérieur du `<button>`
 * d'en-tête, qui n'accepte que du contenu phrasing. Les classes `flex`/`block` donnent
 * exactement le même rendu.
 */
function StackedBar({
  entries,
  total,
  thin = false,
}: {
  entries: PaymentMixEntry[];
  total: number;
  thin?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex w-full overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/12",
        thin ? "h-1.5" : "h-3",
      )}
      role="img"
      aria-label={entries
        .map((e) => `${e.label} ${formatShare(e.amount, total)}`)
        .join(", ")}
    >
      {entries.map((e) => (
        <span
          key={e.kind}
          className="block h-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{
            width: `${total > 0 ? (e.amount / total) * 100 : 0}%`,
            backgroundColor: MIX_COLOR[e.kind],
          }}
        />
      ))}
    </span>
  );
}

export type PaymentMixPanelProps = {
  /** Ex. « Détail des encaissements du 21/08 ». */
  title: string;
  entries: PaymentMixEntry[];
  /** L'encaissé affiché par la tuile au-dessus — le volet doit annoncer le MÊME montant. */
  total: number;
  /**
   * Les chiffres au-dessus appartiennent encore à la sélection précédente : on n'affiche
   * aucune ventilation plutôt qu'une ventilation périmée sous un nouveau libellé.
   */
  loading?: boolean;
  /** Clé `localStorage` : le volet se rouvre là où le propriétaire l'avait laissé. */
  storageKey: string;
  emptyLabel: string;
};

/**
 * Volet repliable « Détail des encaissements » — extension d'une carte existante,
 * jamais un remplacement : replié, le tableau de bord garde exactement l'allure
 * qu'il avait. Affiché seulement si le propriétaire a ouvert le réglage
 * (`lib/features/settings/dashboard-payment-mix.ts`).
 *
 * UX :
 *  • Replié, l'en-tête porte déjà l'information : total + barre empilée fine. Un coup
 *    d'œil suffit à voir « c'est surtout du liquide » sans rien déplier.
 *  • Déplié, deux macro-totaux d'abord — le liquide du tiroir vs l'argent sur les
 *    comptes — parce que c'est la question que se pose réellement le commerçant le
 *    soir, avant le détail par opérateur.
 *  • Hauteur animée en `grid-template-rows` 0fr → 1fr : seule technique CSS qui anime
 *    une hauteur inconnue sans mesure JS (même procédé que la page Rapports).
 *  • Replié, le contenu sort du focus et des lecteurs d'écran (`inert`).
 */
export function PaymentMixPanel({
  title,
  entries,
  total,
  loading = false,
  storageKey,
  emptyLabel,
}: PaymentMixPanelProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  // Lu après le montage : le HTML serveur ne connaît pas le localStorage du visiteur,
  // l'initialiser dans `useState` provoquerait une erreur d'hydratation.
  useEffect(() => {
    setOpen(readStored(storageKey));
  }, [storageKey]);

  const toggle = () => {
    setOpen((v) => {
      writeStored(storageKey, !v);
      return !v;
    });
  };

  const sum = entries.reduce((s, e) => s + e.amount, 0);
  const drawer = entries
    .filter((e) => isDrawerCash(e.kind))
    .reduce((s, e) => s + e.amount, 0);
  const account = sum - drawer;
  const hasData = !loading && entries.length > 0 && sum > 0;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-fs-surface-container/50 dark:border-white/10 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-12 w-full touch-manipulation items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03] active:bg-black/[0.05] dark:hover:bg-white/[0.04] dark:active:bg-white/[0.06]"
      >
        <MdExpandMore
          className={cn(
            "h-5 w-5 shrink-0 text-neutral-400 transition-transform duration-300 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="min-w-0 text-[11px] font-extrabold leading-snug text-neutral-900 dark:text-fs-text min-[900px]:text-xs">
              {title}
            </span>
            {hasData ? (
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--owner-accent)] min-[900px]:text-xs">
                {formatCurrency(total)}
              </span>
            ) : null}
          </span>
          {/*
            Aperçu replié : la barre seule dit déjà « surtout du liquide » ou « surtout
            du mobile money ». Elle disparaît une fois déplié, où la grande barre prend
            le relais — deux barres identiques l'une sous l'autre ne diraient rien de plus.
          */}
          {hasData && !open ? (
            <span className="mt-1.5 block">
              <StackedBar entries={entries} total={sum} thin />
            </span>
          ) : null}
        </span>
      </button>

      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-black/[0.06] px-3 pb-3 pt-3 dark:border-white/10">
            {loading ? (
              <div
                className="h-16 w-full rounded-lg bg-black/[0.05] motion-safe:animate-pulse dark:bg-white/10"
                aria-label="Calcul en cours"
              />
            ) : !hasData ? (
              <p className="py-1 text-[11px] leading-snug text-neutral-500 min-[900px]:text-xs">
                {emptyLabel}
              </p>
            ) : (
              <>
                {/* 1. La question du soir : combien de liquide, combien sur les comptes. */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-emerald-500/10 px-2.5 py-2">
                    <p className="text-[9px] font-bold uppercase leading-tight tracking-wide text-emerald-800 dark:text-emerald-300 min-[900px]:text-[10px]">
                      En espèces
                    </p>
                    <p className="mt-0.5 break-words text-xs font-extrabold leading-snug tabular-nums text-emerald-900 dark:text-emerald-200 min-[900px]:text-sm">
                      {formatCurrency(drawer)}
                    </p>
                    <p className="text-[9px] font-semibold leading-tight text-emerald-700/80 tabular-nums dark:text-emerald-300/80 min-[900px]:text-[10px]">
                      {formatShare(drawer, sum)} · dans la caisse
                    </p>
                  </div>
                  <div className="rounded-lg bg-violet-500/10 px-2.5 py-2">
                    <p className="text-[9px] font-bold uppercase leading-tight tracking-wide text-violet-800 dark:text-violet-300 min-[900px]:text-[10px]">
                      Sur vos comptes
                    </p>
                    <p className="mt-0.5 break-words text-xs font-extrabold leading-snug tabular-nums text-violet-900 dark:text-violet-200 min-[900px]:text-sm">
                      {formatCurrency(account)}
                    </p>
                    <p className="text-[9px] font-semibold leading-tight text-violet-700/80 tabular-nums dark:text-violet-300/80 min-[900px]:text-[10px]">
                      {formatShare(account, sum)} · mobile money, carte…
                    </p>
                  </div>
                </div>

                {/* 2. La répartition complète, d'un seul regard. */}
                <div className="mt-3">
                  <StackedBar entries={entries} total={sum} />
                </div>

                {/* 3. Le détail chiffré, du plus gros au plus petit. */}
                <ul className="mt-2.5 divide-y divide-black/[0.05] dark:divide-white/[0.07]">
                  {entries.map((e) => (
                    <li
                      key={e.kind}
                      className="flex min-w-0 items-center gap-2.5 py-2 first:pt-1 last:pb-1"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: MIX_COLOR[e.kind] }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-bold leading-snug text-neutral-800 dark:text-fs-text min-[900px]:text-xs">
                          {e.label}
                        </span>
                        <span className="block text-[9px] font-semibold leading-tight text-neutral-500 tabular-nums min-[900px]:text-[10px]">
                          {e.count} règlement{e.count > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[11px] font-extrabold leading-snug tabular-nums text-neutral-900 dark:text-fs-text min-[900px]:text-xs">
                          {formatCurrency(e.amount)}
                        </span>
                        <span className="block text-[9px] font-semibold leading-tight text-neutral-500 tabular-nums min-[900px]:text-[10px]">
                          {formatShare(e.amount, sum)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-neutral-500 min-[900px]:text-[11px]">
                  <MdInfoOutline className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    Argent réellement entré, remboursements de crédits compris. Les
                    montants laissés à crédit n&apos;y figurent pas — ils ne sont pas
                    encore encaissés.
                  </span>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
