import type { Store } from "@/lib/features/stores/types";
import { fetchLogoBytes } from "@/lib/features/invoices/generate-invoice-pdf";
import { buildInvoiceA4Data } from "./build-invoice-a4-data";
import type { InvoiceA4Data } from "./invoice-a4-types";

function trimOrNull(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

/** Données formulaire « Modifier boutique » — pour aperçu PDF aligné Flutter `edit_store_dialog.dart`. */
export type StoreEditFormFields = {
  name: string;
  address: string;
  phone: string;
  email: string;
  description: string;
  isPrimary: boolean;
  posDiscountEnabled: boolean;
  invoiceShortTitle: string;
  commercialName: string;
  slogan: string;
  activity: string;
  mobileMoney: string;
  invoicePrefix: string;
  currency: string;
  primaryColor: string;
  secondaryColor: string;
  city: string;
  country: string;
  legalInfo: string;
  taxLabel: string;
  taxNumber: string;
  footerText: string;
  paymentTerms: string;
  signatureUrl: string;
  stampUrl: string;
  invoiceSignerTitle: string;
  invoiceSignerName: string;
  invoiceTemplate: "classic" | "elof";
};

/**
 * Boutique « telle qu’affichée » sur la facture : champs du formulaire fusionnés (équivalent `_buildStoreFromForm`).
 */
export function storeFromEditForm(base: Store, f: StoreEditFormFields): Store {
  return {
    ...base,
    name: trimOrNull(f.name) ?? base.name,
    address: trimOrNull(f.address),
    phone: trimOrNull(f.phone),
    email: trimOrNull(f.email),
    description: trimOrNull(f.description),
    is_primary: f.isPrimary,
    pos_discount_enabled: f.posDiscountEnabled,
    invoice_short_title: trimOrNull(f.invoiceShortTitle),
    commercial_name: trimOrNull(f.commercialName),
    slogan: trimOrNull(f.slogan),
    activity: trimOrNull(f.activity),
    mobile_money: trimOrNull(f.mobileMoney),
    invoice_prefix: trimOrNull(f.invoicePrefix),
    currency: trimOrNull(f.currency),
    primary_color: trimOrNull(f.primaryColor),
    secondary_color: trimOrNull(f.secondaryColor),
    city: trimOrNull(f.city),
    country: trimOrNull(f.country),
    legal_info: trimOrNull(f.legalInfo),
    tax_label: trimOrNull(f.taxLabel),
    tax_number: trimOrNull(f.taxNumber),
    footer_text: trimOrNull(f.footerText),
    payment_terms: trimOrNull(f.paymentTerms),
    signature_url: trimOrNull(f.signatureUrl),
    stamp_url: trimOrNull(f.stampUrl),
    invoice_signer_title: trimOrNull(f.invoiceSignerTitle),
    invoice_signer_name: trimOrNull(f.invoiceSignerName),
    invoice_template: f.invoiceTemplate === "elof" ? "elof" : "classic",
  };
}

/** Comme `_resolveLogoBytesForPreview` Flutter : fichier choisi d’abord, sinon URL logo. */
export async function resolveLogoBytesForStorePreview(
  store: Store,
  logoFile: File | null,
): Promise<Uint8Array | null> {
  if (logoFile && logoFile.size > 0) {
    const ab = await logoFile.arrayBuffer();
    return new Uint8Array(ab);
  }
  return fetchLogoBytes(store.logo_url);
}

/** Données démo identiques à `InvoiceA4Data(...)` dans `_previewInvoiceA4` Flutter. */
export function buildDemoInvoiceA4Data(
  storeForPreview: Store,
  invoicePrefix: string,
  logoBytes: Uint8Array | null,
): InvoiceA4Data {
  const year = new Date().getFullYear();
  const prefix = invoicePrefix.trim() || "FAC";
  const saleNumber = `${prefix}-${year}-001`;
  return buildInvoiceA4Data({
    store: storeForPreview,
    saleNumber,
    date: new Date(),
    lines: [
      { name: "Produit exemple", quantity: 2, unit: "pce", unitPrice: 5000 },
      { name: "Autre article (aperçu)", quantity: 1, unit: "pce", unitPrice: 2500 },
    ],
    subtotal: 12500,
    discount: 0,
    tax: 0,
    total: 12500,
    customerName: "Client test",
    customerPhone: "70 00 00 00",
    customerAddress: null,
    depositAmount: 0,
    logoBytes,
    amountInWords: "Douze mille cinq cents francs",
  });
}
