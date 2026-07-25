"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MdClose, MdOpenInFull, MdPictureAsPdf, MdRefresh } from "react-icons/md";
import { InvoicePdfPreviewDialog } from "@/components/invoices/invoice-pdf-preview-dialog";
import { ReceiptTicketPreview } from "@/components/pos/receipt-ticket-preview";
import {
  buildDemoInvoiceA4Data,
  resolveLogoBytesForStorePreview,
  storeFromEditForm,
  type StoreEditFormFields,
} from "@/lib/features/invoices/invoice-a4-store-preview";
import { generateInvoicePdfBlob } from "@/lib/features/invoices/generate-invoice-pdf";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import { getStore, updateStore } from "@/lib/features/stores/api";
import type { Store } from "@/lib/features/stores/types";
import { cn } from "@/lib/utils/cn";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";

function trimOrNull(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

/** Valeur pour `input type="color"` (#rrggbb). Vide/invalide → `#000000` (affichage seul). */
function hexForNativeColorInput(raw: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return `#${t.slice(1).toLowerCase()}`;
  if (/^#[0-9A-Fa-f]{3}$/i.test(t)) {
    const r = t[1]!.toLowerCase();
    const g = t[2]!.toLowerCase();
    const b = t[3]!.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#000000";
}

const fieldCls =
  "mt-1 w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2.5 text-base text-neutral-900 outline-none focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 dark:bg-neutral-900 dark:text-neutral-100";
const smallFieldCls =
  "mt-1 w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 dark:bg-neutral-900 dark:text-neutral-100";
const labelCls = "block text-xs font-semibold text-neutral-600";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wide text-[#F97316]">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogue « Facture A4 » — personnalisation ultra complète + aperçu  */
/* ------------------------------------------------------------------ */

export function StoreInvoiceA4Dialog({
  open,
  store,
  onClose,
  onUpdated,
}: {
  open: boolean;
  store: Store | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");

  const [invoiceShortTitle, setInvoiceShortTitle] = useState("");
  const [commercialName, setCommercialName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [activity, setActivity] = useState("");
  const [mobileMoney, setMobileMoney] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("FAC");
  const [currency, setCurrency] = useState("XOF");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [legalInfo, setLegalInfo] = useState("");
  const [taxLabel, setTaxLabel] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [footerText, setFooterText] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [stampUrl, setStampUrl] = useState("");
  const [invoiceSignerTitle, setInvoiceSignerTitle] = useState("");
  const [invoiceSignerName, setInvoiceSignerName] = useState("");
  const [engineSignatory, setEngineSignatory] = useState("");
  const [engineExtraPhones, setEngineExtraPhones] = useState("");
  const [invoiceTemplate, setInvoiceTemplate] = useState<
    "classic" | "elof" | "model3"
  >("classic");

  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewStale, setPreviewStale] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Initialise depuis la boutique à l'ouverture.
  useEffect(() => {
    if (!store || !open) return;
    setInvoiceShortTitle(store.invoice_short_title ?? "");
    setCommercialName(store.commercial_name ?? "");
    setSlogan(store.slogan ?? "");
    setActivity(store.activity ?? "");
    setMobileMoney(store.mobile_money ?? "");
    setInvoicePrefix(store.invoice_prefix ?? "FAC");
    setCurrency(store.currency ?? "XOF");
    setPrimaryColor(store.primary_color ?? "");
    setSecondaryColor(store.secondary_color ?? "");
    setCity(store.city ?? "");
    setCountry(store.country ?? "");
    setLegalInfo(store.legal_info ?? "");
    setTaxLabel(store.tax_label ?? "");
    setTaxNumber(store.tax_number ?? "");
    setFooterText(store.footer_text ?? "");
    setPaymentTerms(store.payment_terms ?? "");
    setSignatureUrl(store.signature_url ?? "");
    setStampUrl(store.stamp_url ?? "");
    setInvoiceSignerTitle(store.invoice_signer_title ?? "");
    setInvoiceSignerName(store.invoice_signer_name ?? "");
    setEngineSignatory(store.engine_invoice_signatory ?? "");
    setEngineExtraPhones(store.engine_invoice_extra_phones ?? "");
    const t = (store.invoice_template ?? "classic").toLowerCase().trim();
    setInvoiceTemplate(t === "elof" ? "elof" : t === "model3" ? "model3" : "classic");
    setError(null);
    setLoading(false);
    setMobileTab("form");
    setPreviewBlob(null);
    setPreviewStale(false);
    setExpanded(false);
  }, [store, open]);

  // Rafraîchit `invoice_template` depuis l'API (cache liste périmé).
  useEffect(() => {
    if (!open || !store?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await getStore(store.id);
        if (cancelled || !fresh) return;
        const t = (fresh.invoice_template ?? "classic").toLowerCase().trim();
        setInvoiceTemplate(t === "elof" ? "elof" : t === "model3" ? "model3" : "classic");
      } catch {
        /* garde la valeur issue de la liste */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, store?.id]);

  // Object URL du PDF d'aperçu.
  useEffect(() => {
    if (!previewBlob) {
      setPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(previewBlob);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [previewBlob]);

  function getFormSnapshot(): StoreEditFormFields {
    if (!store) throw new Error("store manquant");
    return {
      name: store.name,
      address: store.address ?? "",
      phone: store.phone ?? "",
      email: store.email ?? "",
      description: store.description ?? "",
      isPrimary: store.is_primary,
      posDiscountEnabled: store.pos_discount_enabled,
      invoiceShortTitle,
      commercialName,
      slogan,
      activity,
      mobileMoney,
      invoicePrefix,
      currency,
      primaryColor,
      secondaryColor,
      city,
      country,
      legalInfo,
      taxLabel,
      taxNumber,
      footerText,
      paymentTerms,
      signatureUrl,
      stampUrl,
      invoiceSignerTitle,
      invoiceSignerName,
      invoiceTemplate,
    };
  }

  async function buildPreview() {
    if (!store || previewLoading) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const merged = storeFromEditForm(store, getFormSnapshot());
      const logoBytes = await resolveLogoBytesForStorePreview(merged, null);
      const data = buildDemoInvoiceA4Data(
        merged,
        invoicePrefix.trim() || "FAC",
        logoBytes,
      );
      const blob = await generateInvoicePdfBlob(data, { previewOnly: true });
      setPreviewBlob(blob);
      setPreviewStale(false);
    } catch (e) {
      const msg = messageFromUnknownError(
        e,
        "Impossible de générer l'aperçu de la facture.",
      );
      setError(msg);
      toastMutationError("store-a4-preview", e, msg);
    } finally {
      setPreviewLoading(false);
    }
  }

  // Aperçu initial à l'ouverture.
  const openedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current || !store) return;
    openedRef.current = true;
    void buildPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, store?.id]);

  function markStale() {
    if (!previewStale) setPreviewStale(true);
  }

  async function submit() {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      await updateStore(store.id, {
        invoice_short_title: trimOrNull(invoiceShortTitle),
        commercial_name: trimOrNull(commercialName),
        slogan: trimOrNull(slogan),
        activity: trimOrNull(activity),
        mobile_money: trimOrNull(mobileMoney),
        invoice_prefix: trimOrNull(invoicePrefix),
        currency: trimOrNull(currency),
        primary_color: trimOrNull(primaryColor),
        secondary_color: trimOrNull(secondaryColor),
        city: trimOrNull(city),
        country: trimOrNull(country),
        legal_info: trimOrNull(legalInfo),
        tax_label: trimOrNull(taxLabel),
        tax_number: trimOrNull(taxNumber),
        footer_text: trimOrNull(footerText),
        payment_terms: trimOrNull(paymentTerms),
        signature_url: trimOrNull(signatureUrl),
        stamp_url: trimOrNull(stampUrl),
        invoice_signer_title: trimOrNull(invoiceSignerTitle),
        invoice_signer_name: trimOrNull(invoiceSignerName),
        engine_invoice_signatory: trimOrNull(engineSignatory),
        engine_invoice_extra_phones: trimOrNull(engineExtraPhones),
        invoice_template:
          invoiceTemplate === "elof"
            ? "elof"
            : invoiceTemplate === "model3"
              ? "model3"
              : "classic",
      });
      toast.success("Facture A4 mise à jour");
      onUpdated();
      onClose();
    } catch (e) {
      const msg = messageFromUnknownError(e, "Échec de l'enregistrement.");
      setError(msg);
      toastMutationError("store-a4-update", e, msg);
    } finally {
      setLoading(false);
    }
  }

  if (!open || !store) return null;

  const previewPane = (
    <div className="flex h-full min-h-0 flex-col bg-neutral-100 dark:bg-neutral-900/60">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] bg-white/70 px-3 py-2 dark:bg-neutral-900/70">
        <span className="text-xs font-semibold text-neutral-600">
          Aperçu facture A4
          {previewStale ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              à rafraîchir
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {previewBlob ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Ouvrir en grand (zoom, rotation, imprimer…)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5 text-xs font-bold text-neutral-700 disabled:opacity-50"
            >
              <MdOpenInFull className="h-4 w-4" aria-hidden />
              Agrandir
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void buildPreview()}
            disabled={previewLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#F97316]/40 bg-orange-50 px-2.5 py-1.5 text-xs font-bold text-[#F97316] disabled:opacity-50"
          >
            {previewLoading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
            ) : (
              <MdRefresh className="h-4 w-4" aria-hidden />
            )}
            Rafraîchir
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 p-2 sm:p-3">
        {previewUrl ? (
          <iframe
            title="Aperçu facture A4"
            src={`${previewUrl}#toolbar=1&view=Fit`}
            className="h-full min-h-[360px] w-full rounded-lg border border-neutral-200 bg-white"
          />
        ) : (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-300 text-center text-sm text-neutral-500">
            {previewLoading ? (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
                Génération de l&apos;aperçu…
              </>
            ) : (
              <>
                <MdPictureAsPdf className="h-10 w-10 text-neutral-300" aria-hidden />
                <span>Aucun aperçu pour le moment.</span>
                <button
                  type="button"
                  onClick={() => void buildPreview()}
                  className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white"
                >
                  Générer l&apos;aperçu
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const formPane = (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="space-y-3">
        <SectionTitle>Modèle &amp; en-tête</SectionTitle>
        <label className={labelCls}>
          Modèle de facture A4
          <select
            value={invoiceTemplate}
            onChange={(e) => {
              setInvoiceTemplate(
                e.target.value as "classic" | "elof" | "model3",
              );
              markStale();
            }}
            className={cn(fieldCls, "min-h-12")}
          >
            <option value="classic">Classique (en-tête actuel)</option>
            <option value="elof">Modèle ELOF</option>
            <option value="model3">Modèle 3</option>
          </select>
        </label>
        <label className={labelCls}>
          Titre court / Acronyme
          <input
            value={invoiceShortTitle}
            onChange={(e) => {
              setInvoiceShortTitle(e.target.value);
              markStale();
            }}
            placeholder="ex. ELOF"
            className={fieldCls}
          />
        </label>
        <p className="text-[11px] leading-relaxed text-neutral-500">
          Le logo de la boutique s&apos;affiche automatiquement sur la facture. Modifiez-le
          via le bouton « Modifier ».
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-black/[0.08] bg-fs-surface p-3">
        <SectionTitle>Identité commerciale</SectionTitle>
        <label className={labelCls}>
          Nom commercial
          <input
            value={commercialName}
            onChange={(e) => {
              setCommercialName(e.target.value);
              markStale();
            }}
            className={smallFieldCls}
          />
        </label>
        <label className={labelCls}>
          Slogan
          <input
            value={slogan}
            onChange={(e) => {
              setSlogan(e.target.value);
              markStale();
            }}
            className={smallFieldCls}
          />
        </label>
        <label className={labelCls}>
          Activité
          <input
            value={activity}
            onChange={(e) => {
              setActivity(e.target.value);
              markStale();
            }}
            placeholder="Ex. Commerce général"
            className={smallFieldCls}
          />
        </label>
        <label className={labelCls}>
          Mobile money (optionnel)
          <input
            value={mobileMoney}
            onChange={(e) => {
              setMobileMoney(e.target.value);
              markStale();
            }}
            inputMode="tel"
            className={smallFieldCls}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-black/[0.08] bg-fs-surface p-3">
        <SectionTitle>Numérotation &amp; couleurs</SectionTitle>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <label className={labelCls}>
            Préfixe facture
            <input
              value={invoicePrefix}
              onChange={(e) => {
                setInvoicePrefix(e.target.value);
                markStale();
              }}
              placeholder="FAC"
              className={smallFieldCls}
            />
          </label>
          <label className={labelCls}>
            Devise
            <input
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                markStale();
              }}
              placeholder="XOF"
              className={smallFieldCls}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <label className={labelCls}>
            Couleur primaire
            <input
              type="color"
              value={hexForNativeColorInput(primaryColor)}
              onChange={(e) => {
                setPrimaryColor(e.target.value);
                markStale();
              }}
              className="mt-1 h-11 w-full min-h-11 cursor-pointer rounded-lg border border-black/[0.12] bg-white p-1"
              aria-label="Couleur primaire (facture A4)"
            />
          </label>
          <label className={labelCls}>
            Couleur secondaire
            <input
              type="color"
              value={hexForNativeColorInput(secondaryColor)}
              onChange={(e) => {
                setSecondaryColor(e.target.value);
                markStale();
              }}
              className="mt-1 h-11 w-full min-h-11 cursor-pointer rounded-lg border border-black/[0.12] bg-white p-1"
              aria-label="Couleur secondaire (facture A4)"
            />
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-black/[0.08] bg-fs-surface p-3">
        <SectionTitle>Localisation &amp; mentions légales</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <label className={labelCls}>
            Ville
            <input
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                markStale();
              }}
              className={smallFieldCls}
            />
          </label>
          <label className={labelCls}>
            Pays
            <input
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                markStale();
              }}
              className={smallFieldCls}
            />
          </label>
        </div>
        <label className={labelCls}>
          Infos légales
          <textarea
            value={legalInfo}
            onChange={(e) => {
              setLegalInfo(e.target.value);
              markStale();
            }}
            rows={3}
            className={cn(smallFieldCls, "resize-none")}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={labelCls}>
            Libellé taxe
            <input
              value={taxLabel}
              onChange={(e) => {
                setTaxLabel(e.target.value);
                markStale();
              }}
              className={smallFieldCls}
            />
          </label>
          <label className={labelCls}>
            N° fiscal
            <input
              value={taxNumber}
              onChange={(e) => {
                setTaxNumber(e.target.value);
                markStale();
              }}
              className={smallFieldCls}
            />
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-black/[0.08] bg-fs-surface p-3">
        <SectionTitle>Pied de page &amp; signature</SectionTitle>
        <label className={labelCls}>
          Pied de page
          <textarea
            value={footerText}
            onChange={(e) => {
              setFooterText(e.target.value);
              markStale();
            }}
            rows={2}
            className={cn(smallFieldCls, "resize-none")}
          />
        </label>
        <label className={labelCls}>
          Conditions de paiement
          <textarea
            value={paymentTerms}
            onChange={(e) => {
              setPaymentTerms(e.target.value);
              markStale();
            }}
            rows={2}
            className={cn(smallFieldCls, "resize-none")}
          />
        </label>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <label className={labelCls}>
            URL signature
            <input
              value={signatureUrl}
              onChange={(e) => {
                setSignatureUrl(e.target.value);
                markStale();
              }}
              className={smallFieldCls}
            />
          </label>
          <label className={labelCls}>
            URL cachet
            <input
              value={stampUrl}
              onChange={(e) => {
                setStampUrl(e.target.value);
                markStale();
              }}
              className={smallFieldCls}
            />
          </label>
        </div>
        <label className={labelCls}>
          Titre signataire
          <input
            value={invoiceSignerTitle}
            onChange={(e) => {
              setInvoiceSignerTitle(e.target.value);
              markStale();
            }}
            className={smallFieldCls}
          />
        </label>
        <label className={labelCls}>
          Nom signataire
          <input
            value={invoiceSignerName}
            onChange={(e) => {
              setInvoiceSignerName(e.target.value);
              markStale();
            }}
            className={smallFieldCls}
          />
        </label>
        <label className={labelCls}>
          Signataire facture engin
          <input
            value={engineSignatory}
            onChange={(e) => setEngineSignatory(e.target.value)}
            placeholder="Ex. COULIBALY Soungalo"
            className={smallFieldCls}
          />
        </label>
        <label className={labelCls}>
          Téléphones facture engin
          <input
            value={engineExtraPhones}
            onChange={(e) => setEngineExtraPhones(e.target.value)}
            placeholder="Numéros séparés par des virgules"
            className={smallFieldCls}
          />
        </label>
      </div>
    </div>
  );

  return (
    <>
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 min-[600px]:items-center min-[600px]:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="store-a4-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-black/[0.08] bg-fs-card shadow-2xl min-[600px]:h-[min(92dvh,780px)] min-[600px]:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3">
          <div className="min-w-0">
            <h2 id="store-a4-title" className="truncate text-lg font-bold text-neutral-900">
              Facture A4
            </h2>
            <p className="truncate text-xs text-neutral-500">{store.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="fs-touch-target rounded-lg p-2 text-neutral-500 hover:bg-black/5"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        {/* Onglets (mobile uniquement) */}
        <div className="flex shrink-0 gap-1 border-b border-black/[0.06] p-1.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("form")}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold",
              mobileTab === "form"
                ? "bg-[#F97316] text-white"
                : "text-neutral-600",
            )}
          >
            Réglages
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold",
              mobileTab === "preview"
                ? "bg-[#F97316] text-white"
                : "text-neutral-600",
            )}
          >
            Aperçu
          </button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          {/* Formulaire */}
          <div
            className={cn(
              "flex min-h-0 flex-col lg:border-r lg:border-black/[0.06]",
              mobileTab === "form" ? "flex" : "hidden lg:flex",
            )}
          >
            {formPane}
          </div>
          {/* Aperçu */}
          <div
            className={cn(
              "min-h-0",
              mobileTab === "preview" ? "block" : "hidden lg:block",
            )}
          >
            {previewPane}
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-black/[0.06] p-3 pb-[calc(0.75rem+var(--fs-safe-bottom))] min-[600px]:pb-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-black/[0.12] py-3 text-sm font-semibold text-neutral-700"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void submit()}
            className="flex-[1.4] rounded-xl bg-[#F97316] py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
    {expanded && previewBlob ? (
      <InvoicePdfPreviewDialog
        blob={previewBlob}
        title="Aperçu facture A4"
        onClose={() => setExpanded(false)}
      />
    ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogue « Caisse rapide » — format ticket thermique 58/80 + aperçu */
/* ------------------------------------------------------------------ */

export function StoreReceiptFormatDialog({
  open,
  store,
  onClose,
  onUpdated,
}: {
  open: boolean;
  store: Store | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [width, setWidth] = useState<58 | 80>(80);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!store || !open) return;
    setWidth(store.receipt_paper_width_mm === 58 ? 58 : 80);
    setError(null);
    setLoading(false);
  }, [store, open]);

  const demo: ReceiptTicketData | null = useMemo(() => {
    if (!store) return null;
    const prefix = (store.invoice_prefix ?? "FAC").trim() || "FAC";
    return {
      storeName: store.name,
      storeLogoUrl: store.logo_url,
      storeAddress: store.address,
      storePhone: store.phone,
      saleNumber: `${prefix}-${new Date().getFullYear()}-001`,
      saleId: "apercu-demo",
      items: [
        { name: "Article exemple", quantity: 2, unitPrice: 5000, total: 10000 },
        { name: "Autre produit (aperçu)", quantity: 1, unitPrice: 2500, total: 2500 },
      ],
      subtotal: 12500,
      discount: 0,
      total: 12500,
      paymentMethod: "ESPECES",
      amountReceived: 15000,
      change: 2500,
      date: new Date(),
    };
  }, [store]);

  async function submit() {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      await updateStore(store.id, { receipt_paper_width_mm: width });
      toast.success(`Format ticket : ${width} mm enregistré`);
      onUpdated();
      onClose();
    } catch (e) {
      const msg = messageFromUnknownError(e, "Échec de l'enregistrement.");
      setError(msg);
      toastMutationError("store-receipt-format", e, msg);
    } finally {
      setLoading(false);
    }
  }

  if (!open || !store || !demo) return null;

  // 80 mm ≈ 296 px (largeur du composant d'aperçu) ; 58 mm mis à l'échelle.
  const scale = width === 58 ? 58 / 80 : 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 min-[600px]:items-center min-[600px]:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="store-receipt-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-black/[0.08] bg-fs-card shadow-2xl min-[600px]:h-[min(90dvh,760px)] min-[600px]:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="store-receipt-title"
              className="truncate text-lg font-bold text-neutral-900"
            >
              Caisse rapide — format ticket
            </h2>
            <p className="truncate text-xs text-neutral-500">{store.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="fs-touch-target rounded-lg p-2 text-neutral-500 hover:bg-black/5"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* Choix du format */}
          <div className="shrink-0 space-y-3 overflow-y-auto border-b border-black/[0.06] p-4 lg:border-b-0 lg:border-r">
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            <p className="text-sm text-neutral-600">
              Choisissez la largeur du ticket thermique. Ce format sera utilisé pour
              l&apos;impression des tickets de <strong>{store.name}</strong> en Caisse
              rapide.
            </p>
            <div className="space-y-2.5">
              {([80, 58] as const).map((w) => {
                const active = width === w;
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWidth(w)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition",
                      active
                        ? "border-[#F97316] bg-orange-50"
                        : "border-black/[0.1] bg-white hover:border-[#F97316]/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                        active ? "border-[#F97316]" : "border-neutral-300",
                      )}
                    >
                      {active ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-neutral-900">
                        {w} mm
                        {w === 80 ? (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            Recommandé
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {w === 80
                          ? "Standard le plus courant (Xprinter, Epson…)."
                          : "Mini-imprimantes compactes / portables."}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aperçu du ticket */}
          <div className="min-h-0 overflow-y-auto bg-neutral-100 p-4 dark:bg-neutral-900/60">
            <p className="mb-3 text-center text-xs font-semibold text-neutral-500">
              Aperçu ticket — {width} mm
            </p>
            <div className="flex justify-center">
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top center",
                }}
              >
                <ReceiptTicketPreview data={demo} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-black/[0.06] p-3 pb-[calc(0.75rem+var(--fs-safe-bottom))] min-[600px]:pb-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-black/[0.12] py-3 text-sm font-semibold text-neutral-700"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void submit()}
            className="flex-[1.4] rounded-xl bg-[#F97316] py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {loading ? "Enregistrement…" : `Enregistrer (${width} mm)`}
          </button>
        </div>
      </div>
    </div>
  );
}
