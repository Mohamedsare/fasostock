"use client";

/**
 * Enregistrer une expédition.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RACCOURCI QUI FAIT TOUT L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Le geste réel est « je viens de facturer, j'expédie ». Le formulaire commence donc
 * par la liste des factures récentes de la boutique : un tap, et le nom du client, son
 * téléphone et le montant de la marchandise sont remplis. Sans ce raccourci, le vendeur
 * retape un nom légèrement différent de celui de la facture — et le jour où le patron
 * cherche « qu'est-ce que j'ai envoyé à ce client », le rapprochement ne se fait plus.
 *
 * Le rattachement reste FACULTATIF : on expédie aussi sans facture préalable (un
 * dépannage, un échange, un colis rattrapé le lendemain). Exiger le lien ferait
 * abandonner la saisie au moment où le car s'en va — c'est-à-dire exactement quand les
 * frais se perdent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST OBLIGATOIRE, ET POURQUOI SEULEMENT ÇA
 * ─────────────────────────────────────────────────────────────────────────────
 * Le destinataire et la destination. Un colis sans nom ne se réclame pas, un colis sans
 * ville ne se suit pas. Tout le reste — transporteur, bordereau, frais, date d'arrivée —
 * arrive souvent APRÈS le départ (le bordereau est remis à la gare routière) et se
 * complète plus tard : la liste laisse rouvrir la fiche.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MdCheck, MdClose, MdReceiptLong, MdSearch } from "react-icons/md";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createShipment, listShippableSales } from "@/lib/features/shipments/api";
import type { ShippableSale, ShippingPaidBy } from "@/lib/features/shipments/types";
import { toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

/**
 * Clé d'idempotence — envoyée à un paramètre `uuid` de PostgreSQL, qui refuse tout ce
 * qui n'a pas la forme d'un UUID. D'où un vrai repli v4 : sur un navigateur ancien ou un
 * contexte non sécurisé, `crypto.randomUUID` n'existe pas, et une clé mal formée ferait
 * échouer CHAQUE validation.
 */
function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (Math.floor(Math.random() * 256) & (15 >> (n / 4)))).toString(16);
  });
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function saleLabel(s: ShippableSale): string {
  const d = new Date(s.createdAt);
  const when = Number.isFinite(d.getTime())
    ? d.toLocaleDateString("fr-FR", {
        timeZone: getActiveTimeZone(),
        day: "2-digit",
        month: "2-digit",
      })
    : "";
  return `${s.saleNumber}${when ? ` · ${when}` : ""}`;
}

export function ShipmentFormDialog({
  companyId,
  storeId,
  onClose,
  onCreated,
}: {
  companyId: string;
  storeId: string;
  onClose: () => void;
  onCreated: (shipmentId: string) => void | Promise<void>;
}) {
  const [linkedSale, setLinkedSale] = useState<ShippableSale | null>(null);
  const [saleQuery, setSaleQuery] = useState("");
  const [salePickerOpen, setSalePickerOpen] = useState(false);

  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [destination, setDestination] = useState("");

  const [carrier, setCarrier] = useState("");
  const [carrierPhone, setCarrierPhone] = useState("");
  const [trackingRef, setTrackingRef] = useState("");
  const [packageCount, setPackageCount] = useState("1");
  const [packageNote, setPackageNote] = useState("");
  const [expectedAt, setExpectedAt] = useState("");

  const [goodsText, setGoodsText] = useState("");
  const [shippingText, setShippingText] = useState("");
  const [paidBy, setPaidBy] = useState<ShippingPaidBy>("company");
  const [note, setNote] = useState("");

  const requestId = useMemo(() => newRequestId(), []);

  const salesQ = useQuery({
    queryKey: ["shipments", companyId, "shippable-sales", storeId],
    queryFn: () => listShippableSales({ companyId, storeId }),
    enabled: salePickerOpen,
    staleTime: 60_000,
  });

  const filteredSales = useMemo(() => {
    const rows = salesQ.data ?? [];
    const q = norm(saleQuery);
    if (!q) return rows;
    return rows.filter(
      (s) => norm(s.saleNumber).includes(q) || norm(s.customerName ?? "").includes(q),
    );
  }, [salesQ.data, saleQuery]);

  function attachSale(s: ShippableSale) {
    setLinkedSale(s);
    setSalePickerOpen(false);
    // On ne REMPLACE jamais ce que l'utilisateur a déjà tapé : il a pu corriger le nom
    // du destinataire (c'est le frère qui vient retirer) ou saisir un autre téléphone.
    if (recipientName.trim() === "" && s.customerName) setRecipientName(s.customerName);
    if (recipientPhone.trim() === "" && s.customerPhone) setRecipientPhone(s.customerPhone);
    if (goodsText.trim() === "" && s.total > 0) setGoodsText(String(Math.round(s.total)));
  }

  const mut = useMutation({
    mutationFn: () =>
      createShipment({
        companyId,
        storeId,
        recipientName: recipientName.trim(),
        destination: destination.trim(),
        recipientPhone: recipientPhone.trim() || null,
        customerId: linkedSale?.customerId ?? null,
        saleId: linkedSale?.id ?? null,
        offtakeId: null,
        carrier: carrier.trim() || null,
        carrierPhone: carrierPhone.trim() || null,
        trackingRef: trackingRef.trim() || null,
        packageCount: Math.max(1, Math.floor(toNumber(packageCount) || 1)),
        packageNote: packageNote.trim() || null,
        goodsAmount: Math.max(0, toNumber(goodsText)),
        shippingCost: Math.max(0, toNumber(shippingText)),
        shippingPaidBy: paidBy,
        expectedAt: expectedAt || null,
        note: note.trim() || null,
        clientRequestId: requestId,
      }),
    onSuccess: (id) => {
      void onCreated(id);
    },
    onError: (e) => toastMutationError("shipments", e),
  });

  const canSubmit =
    recipientName.trim().length > 0 && destination.trim().length > 0 && !mut.isPending;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nouvelle expédition"
    >
      <button type="button" className="absolute inset-0 -z-0" aria-label="Fermer" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-fs-surface shadow-2xl sm:max-h-[88vh] sm:max-w-lg sm:rounded-lg">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-neutral-300 sm:hidden" />

        <div className="flex items-start gap-3 border-b border-black/6 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fs-accent">
              Nouvelle expédition
            </p>
            <h2 className="text-sm font-bold text-fs-text">
              Le colis qui part, et ce qu&apos;il vous coûte
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
          {/* Rattachement facture — le raccourci, en premier. */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Facture liée (facultatif)
            </span>
            {linkedSale ? (
              <div className="mt-1.5 flex items-center gap-2 rounded-md border border-fs-accent/40 bg-fs-accent/5 px-3 py-2">
                <MdReceiptLong className="h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fs-text">
                  {saleLabel(linkedSale)}
                  {linkedSale.customerName ? ` · ${linkedSale.customerName}` : ""} ·{" "}
                  {formatCurrency(linkedSale.total)}
                </span>
                <button
                  type="button"
                  onClick={() => setLinkedSale(null)}
                  className="shrink-0 rounded p-1 text-neutral-500"
                  aria-label="Détacher la facture"
                >
                  <MdClose className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSalePickerOpen((v) => !v)}
                className="mt-1.5 flex min-h-11 w-full items-center gap-2 rounded-md border border-black/10 bg-fs-card px-3 text-left text-xs font-semibold text-neutral-700"
              >
                <MdReceiptLong className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                Choisir une facture récente — remplit le client et le montant
              </button>
            )}

            {salePickerOpen && !linkedSale ? (
              <div className="mt-2 rounded-md border border-black/10 bg-fs-card p-2">
                <div className="relative">
                  <MdSearch
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                    aria-hidden
                  />
                  <input
                    value={saleQuery}
                    onChange={(e) => setSaleQuery(e.target.value)}
                    placeholder="N° de facture ou nom du client"
                    className={fsInputClass("w-full pl-8 text-xs")}
                    aria-label="Chercher une facture"
                  />
                </div>
                {salesQ.isPending ? (
                  <p className="mt-2 text-center text-xs text-neutral-500">Chargement…</p>
                ) : filteredSales.length === 0 ? (
                  <p className="mt-2 text-center text-xs text-neutral-500">
                    Aucune facture récente ne correspond.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {filteredSales.slice(0, 20).map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => attachSale(s)}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-black/[0.04]"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold text-fs-text">
                              {saleLabel(s)}
                            </span>
                            {s.customerName ? (
                              <span className="text-neutral-500"> · {s.customerName}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-neutral-600">
                            {formatCurrency(s.total)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          {/* Destinataire — obligatoire. */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Destinataire *
            </span>
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Nom de la personne ou de la boutique"
              className={fsInputClass("mt-1.5 w-full")}
              aria-label="Nom du destinataire"
            />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Destination (ex. Fada N'Gourma) *"
                className={fsInputClass("min-w-0 flex-1")}
                aria-label="Destination"
              />
              <input
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="Téléphone"
                inputMode="tel"
                className={fsInputClass("min-w-0 sm:w-40")}
                aria-label="Téléphone du destinataire"
              />
            </div>
          </div>

          {/* Transport. */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Transport
            </span>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Transporteur (ex. STAF, Rakieta, le car de 6 h)"
                className={fsInputClass("min-w-0 flex-1")}
                aria-label="Transporteur"
              />
              <input
                value={carrierPhone}
                onChange={(e) => setCarrierPhone(e.target.value)}
                placeholder="Son téléphone"
                inputMode="tel"
                className={fsInputClass("min-w-0 sm:w-40")}
                aria-label="Téléphone du transporteur"
              />
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={trackingRef}
                onChange={(e) => setTrackingRef(e.target.value)}
                placeholder="N° de bordereau / colis"
                className={fsInputClass("min-w-0 flex-1")}
                aria-label="Numéro de bordereau"
              />
              <label className="min-w-0 sm:w-32">
                <input
                  value={packageCount}
                  onChange={(e) => setPackageCount(e.target.value)}
                  inputMode="numeric"
                  placeholder="Colis"
                  className={fsInputClass("w-full text-center tabular-nums")}
                  aria-label="Nombre de colis"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={packageNote}
                onChange={(e) => setPackageNote(e.target.value)}
                placeholder="Contenu (ex. 3 cartons savon, 1 sac riz)"
                className={fsInputClass("min-w-0 flex-1")}
                aria-label="Contenu des colis"
              />
              <label className="min-w-0 sm:w-44">
                <span className="sr-only">Arrivée annoncée</span>
                <input
                  type="date"
                  value={expectedAt}
                  onChange={(e) => setExpectedAt(e.target.value)}
                  className={fsInputClass("w-full")}
                  aria-label="Arrivée annoncée"
                />
              </label>
            </div>
          </div>

          {/* Argent — le cœur du module. */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Montants
            </span>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium text-neutral-600">
                  Valeur de la marchandise
                </span>
                <input
                  value={goodsText}
                  onChange={(e) => setGoodsText(e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                  className={fsInputClass("mt-1 w-full text-right tabular-nums")}
                />
              </label>
              <label className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium text-neutral-600">
                  Frais payés au transporteur
                </span>
                <input
                  value={shippingText}
                  onChange={(e) => setShippingText(e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                  className={fsInputClass("mt-1 w-full text-right tabular-nums")}
                />
              </label>
            </div>

            <div className="mt-2 flex gap-1.5">
              {(
                [
                  { v: "company", label: "J'ai avancé les frais" },
                  { v: "customer", label: "Le client a payé le car" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setPaidBy(opt.v)}
                  className={cn(
                    "min-h-11 flex-1 rounded-md border px-2 text-xs font-semibold transition-colors",
                    paidBy === opt.v
                      ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                      : "border-black/10 bg-fs-card text-neutral-700",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">
              {paidBy === "company"
                ? "Ces frais seront suivis à part et vous pourrez les réclamer par message — ils ne se mélangent pas à la dette sur la marchandise."
                : "Le client a réglé le transport à l'arrivée : rien à réclamer. Le montant reste noté pour savoir ce que coûte cette destination."}
            </p>
          </div>

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
              htmlFor="shipment-note"
            >
              Note
            </label>
            <textarea
              id="shipment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ex. à retirer chez le gérant de la gare"
              className={fsInputClass("mt-1.5 w-full")}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-black/6 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border border-black/10 bg-fs-card text-sm font-semibold text-neutral-800"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => mut.mutate()}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-fs-accent text-sm font-semibold text-white disabled:opacity-50"
          >
            {mut.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <MdCheck className="h-5 w-5" aria-hidden />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
