"use client";

import { OFFLINE_SALE_ID_PREFIX } from "@/lib/offline/constants";
import { getSaleDetail } from "@/lib/features/sales/api";
import { buildInvoiceA4FromSaleDetail } from "@/lib/features/invoices/build-invoice-a4-from-sale-detail";
import {
  fetchLogoBytes,
  generateInvoicePdfBlob,
  printInvoicePdf,
} from "@/lib/features/invoices/generate-invoice-pdf";
import { buildReceiptTicketDataFromSale } from "@/lib/features/receipt/build-receipt-ticket-data";
import { generateReceiptThermalPdfBlob } from "@/lib/features/receipt/generate-receipt-thermal-pdf";
import type { Store } from "@/lib/features/stores/types";

export type SalePrintFormat = "a4" | "thermal";

/** Largeur du rouleau configurée sur la boutique ; 80 mm à défaut, comme la caisse. */
export function thermalWidthForStore(store: Store): 58 | 80 {
  return store.receipt_paper_width_mm === 58 ? 58 : 80;
}

/**
 * Une vente déjà enregistrée peut-elle être imprimée dans l'autre format ?
 *
 * Non tant qu'elle est en file d'attente hors ligne : les deux documents sont fabriqués
 * à partir de la vente relue au serveur, qui ne la connaît pas encore. Mieux vaut ne pas
 * proposer le bouton que de le laisser échouer devant le client.
 */
export function canPrintSaleInOtherFormat(saleId: string | null | undefined): boolean {
  return Boolean(saleId) && !saleId!.startsWith(OFFLINE_SALE_ID_PREFIX);
}

/**
 * Imprime une vente dans le format demandé, quel que soit celui de la caisse d'origine.
 *
 * Le document est reconstruit depuis la vente enregistrée, jamais depuis l'écran : le
 * ticket et la facture portent alors exactement les mêmes montants, les mêmes règlements
 * et le même numéro — c'est la condition pour que les deux papiers puissent circuler
 * ensemble sans se contredire.
 *
 * Réservé au réglage propriétaire « Choisir le format d'impression »
 * (cf. `lib/features/settings/print-format-choice.ts`).
 */
export async function printSaleInFormat({
  saleId,
  store,
  format,
}: {
  saleId: string;
  store: Store;
  format: SalePrintFormat;
}): Promise<void> {
  if (!canPrintSaleInOtherFormat(saleId)) {
    throw new Error(
      "Vente en file d'attente : ce format sera disponible après la synchronisation.",
    );
  }
  const sale = await getSaleDetail(saleId);
  if (!sale) throw new Error("Vente introuvable.");

  if (format === "a4") {
    const logoBytes = await fetchLogoBytes(store.logo_url);
    const data = buildInvoiceA4FromSaleDetail(sale, store, logoBytes);
    printInvoicePdf(await generateInvoicePdfBlob(data, { saleId }));
    return;
  }

  const data = buildReceiptTicketDataFromSale(store, sale, saleId);
  printInvoicePdf(
    await generateReceiptThermalPdfBlob(data, {
      paperWidthMm: thermalWidthForStore(store),
    }),
  );
}
