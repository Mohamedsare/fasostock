"use client";

import { useEffect, useRef } from "react";
import { getSaleDetail } from "@/lib/features/sales/api";
import { buildReceiptTicketDataFromSale } from "@/lib/features/receipt/build-receipt-ticket-data";
import { generateReceiptThermalPdfBlob } from "@/lib/features/receipt/generate-receipt-thermal-pdf";
import { printInvoicePdf } from "@/lib/features/invoices/generate-invoice-pdf";
import type { Store } from "@/lib/features/stores/types";
import { toast } from "@/lib/toast";
import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";
import {
  claimPosPrintJob,
  completePosPrintJob,
  listMyPendingPrintJobs,
} from "./print-jobs";

/** Réglage d'APPAREIL (et non d'entreprise) : seul le poste qui a l'imprimante imprime. */
export const REMOTE_PRINT_PREF_KEY = "pos_remote_print_enabled";

export function readRemotePrintEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(REMOTE_PRINT_PREF_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeRemotePrintEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(REMOTE_PRINT_PREF_KEY, enabled ? "true" : "false");
  } catch {
    /* préférence non persistée : sans conséquence */
  }
}

/*
 * Cadence du guet.
 *
 * Ce n'est pas un rafraîchissement d'écran : entre le moment où le caissier demande le
 * ticket et celui où le poste vendeur s'en aperçoit, il y a un client debout. Quatre
 * secondes d'attente à vide s'ajoutaient à toute la fabrication du document qui suit.
 * Deux secondes coûtent une lecture indexée de plus par minute et par poste — la moitié
 * du temps mort pour un prix qui ne se voit nulle part.
 */
const POLL_MS = 2000;

/**
 * Écoute, sur le poste du VENDEUR, les tickets que le caissier lui envoie à imprimer.
 *
 * Trois précautions, chacune pour un accident observable en boutique :
 *
 *  1. `busyRef` — un cycle d'impression dure plus longtemps qu'un intervalle (génération
 *     du PDF côté serveur). Sans lui, deux cycles se chevaucheraient sur le même travail.
 *  2. `claimPosPrintJob` — le vendeur a souvent l'application ouverte sur le PC ET sur son
 *     téléphone. La prise est atomique côté base : un seul des deux imprime.
 *  3. Compte rendu systématique, succès comme échec — c'est ce qui permet au caissier de
 *     savoir qu'il doit imprimer chez lui plutôt que de laisser partir un client sans
 *     ticket.
 */
export function useRemotePrintListener(params: {
  enabled: boolean;
  userId: string | null;
  store: Store | null;
}): void {
  const { enabled, userId, store } = params;
  const busyRef = useRef(false);
  // Lues dans l'intervalle : évite de le recréer à chaque rendu de la caisse.
  const storeRef = useRef<Store | null>(store);
  storeRef.current = store;

  useEffect(() => {
    if (!enabled || !userId) return;

    let cancelled = false;

    async function runOnce(): Promise<void> {
      if (busyRef.current || cancelled) return;
      const currentStore = storeRef.current;
      if (!currentStore) return;
      if (!readRemotePrintEnabled()) return;

      busyRef.current = true;
      try {
        const jobs = await listMyPendingPrintJobs(userId!);
        for (const job of jobs) {
          if (cancelled) break;
          const mine = await claimPosPrintJob(job.id);
          if (!mine) continue; // un autre appareil s'en charge

          try {
            const sale = await getSaleDetail(job.saleId);
            if (!sale) throw new Error("Vente introuvable.");
            const data = buildReceiptTicketDataFromSale(currentStore, sale, job.saleId);
            const blob = await generateReceiptThermalPdfBlob(data, {
              paperWidthMm: job.paperWidthMm,
            });
            const launched = await printInvoicePdf(blob);
            if (!launched) {
              // Le poste n'a rien imprimé (pop-up bloquée) : c'est un échec, pas un succès.
              throw new Error(
                "Impression bloquée par le navigateur sur le poste du vendeur.",
              );
            }
            await completePosPrintJob(job.id, true);
            toast.info(`Ticket ${sale.sale_number ?? ""} envoyé à votre imprimante.`.trim());
          } catch (e) {
            // L'échec doit remonter au caissier : c'est lui qui a le client devant lui.
            await completePosPrintJob(
              job.id,
              false,
              formatUnknownErrorMessage(e, "Impression impossible."),
            ).catch(() => {
              /* le compte rendu lui-même a échoué : le caissier verra « sans réponse » */
            });
          }
        }
      } catch {
        /*
         * Réseau coupé, session expirée : silence volontaire. Ce poste est en train de
         * vendre ; une bannière d'erreur pour un ticket qu'il n'a pas demandé lui-même
         * l'interromprait pour rien. Le caissier, lui, voit que rien n'est parti.
         */
      } finally {
        busyRef.current = false;
      }
    }

    void runOnce();
    const t = window.setInterval(() => void runOnce(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [enabled, userId]);
}
