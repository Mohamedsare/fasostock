"use client";

import { useEffect, useState } from "react";
import { InvoicePdfPreviewDialog } from "@/components/invoices/invoice-pdf-preview-dialog";
import {
  buildDemoInvoiceA4Data,
  resolveLogoBytesForStorePreview,
  storeFromEditForm,
  type StoreEditFormFields,
} from "@/lib/features/invoices/invoice-a4-store-preview";
import { generateInvoicePdfBlob } from "@/lib/features/invoices/generate-invoice-pdf";
import {
  createStore,
  getStore,
  updateStore,
  uploadStoreLogo,
  type CreateStoreInput,
} from "@/lib/features/stores/api";
import type { Store } from "@/lib/features/stores/types";
import { cn } from "@/lib/utils/cn";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { X } from "lucide-react";
import { MdPictureAsPdf } from "react-icons/md";

function trimOrNull(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

/** Valeur pour `input type="color"` (#rrggbb). Vide ou invalide → `#000000` (affichage seulement ; l’état peut rester vide). */
function hexForNativeColorInput(raw: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) {
    return `#${t.slice(1).toLowerCase()}`;
  }
  if (/^#[0-9A-Fa-f]{3}$/i.test(t)) {
    const r = t[1]!.toLowerCase();
    const g = t[2]!.toLowerCase();
    const b = t[3]!.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#000000";
}

export function CreateStoreModal({
  open,
  companyId,
  onClose,
  onCreated,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setAddress("");
      setPhone("");
      setEmail("");
      setDescription("");
      setIsPrimary(false);
      setLogoFile(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    const n = name.trim();
    if (n.length < 2) {
      setError("Nom requis (2 caractères minimum)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const input: CreateStoreInput = {
        companyId,
        name: n,
        address: trimOrNull(address),
        phone: trimOrNull(phone),
        email: trimOrNull(email),
        description: trimOrNull(description),
        isPrimary,
        logoFile,
      };
      await createStore(input);
      toast.success("Boutique créée");
      onCreated();
      onClose();
    } catch (e) {
      const msg = messageFromUnknownError(e, "Échec de la création.");
      setError(msg);
      toastMutationError("stores-create", e, "Échec de la création.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 min-[500px]:items-center min-[500px]:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="create-store-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col rounded-t-2xl border border-black/[0.08] bg-fs-card shadow-xl min-[500px]:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
          <h2 id="create-store-title" className="text-lg font-bold text-neutral-900">
            Nouvelle boutique
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="fs-touch-target rounded-lg p-2 text-neutral-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          <label className="block text-xs font-medium text-neutral-600">
            Nom *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
              autoComplete="organization"
            />
          </label>
          <label className="block text-xs font-medium text-neutral-600">
            Adresse
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-600">
              Téléphone
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
                inputMode="tel"
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              E-mail
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
                inputMode="email"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-neutral-600">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Définir comme boutique principale
          </label>
          <label className="block text-xs font-medium text-neutral-600">
            Logo (optionnel)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
            />
          </label>
        </div>
        <div className="flex gap-2 border-t border-black/[0.06] p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-black/[0.1] py-3 text-sm font-semibold"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void submit()}
            className="flex-1 rounded-xl bg-[#F97316] py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Création…" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EditStoreModal({
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
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [posDiscountEnabled, setPosDiscountEnabled] = useState(false);
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
  const [invoiceTemplate, setInvoiceTemplate] = useState<"classic" | "elof">(
    "classic",
  );
  const [invoicePreviewBlob, setInvoicePreviewBlob] = useState<Blob | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [logoFile]);

  /** Rafraîchit `invoice_template` depuis l’API (cache périmé), comme Flutter `_refetchStoreTemplate`. */
  useEffect(() => {
    if (!open || !store?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await getStore(store.id);
        if (cancelled || !fresh) return;
        const t = (fresh.invoice_template ?? "classic").toLowerCase().trim();
        setInvoiceTemplate(t === "elof" ? "elof" : "classic");
      } catch {
        /* garde la valeur issue du store list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, store?.id]);

  useEffect(() => {
    if (!store || !open) return;
    setName(store.name);
    setAddress(store.address ?? "");
    setPhone(store.phone ?? "");
    setEmail(store.email ?? "");
    setDescription(store.description ?? "");
    setIsPrimary(store.is_primary);
    setPosDiscountEnabled(store.pos_discount_enabled);
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
    const t = (store.invoice_template ?? "classic").toLowerCase().trim();
    setInvoiceTemplate(t === "elof" ? "elof" : "classic");
    setLogoFile(null);
    setInvoicePreviewBlob(null);
    setError(null);
    setLoading(false);
  }, [store, open]);

  if (!open || !store) return null;

  function getFormSnapshot(): StoreEditFormFields {
    return {
      name,
      address,
      phone,
      email,
      description,
      isPrimary,
      posDiscountEnabled,
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

  async function handlePreviewInvoiceA4() {
    if (!store) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const merged = storeFromEditForm(store, getFormSnapshot());
      const logoBytes = await resolveLogoBytesForStorePreview(merged, logoFile);
      const data = buildDemoInvoiceA4Data(
        merged,
        invoicePrefix.trim() || "FAC",
        logoBytes,
      );
      const blob = await generateInvoicePdfBlob(data);
      setInvoicePreviewBlob(blob);
    } catch (e) {
      const msg = messageFromUnknownError(
        e,
        "Impossible d'afficher l'aperçu de la facture.",
      );
      setError(msg);
      toastMutationError("stores-invoice-preview", e, msg);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submit() {
    if (!store) return;
    const n = name.trim();
    if (n.length < 2) {
      setError("Nom requis (2 caractères minimum)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let logoUrl: string | null | undefined = store.logo_url;
      if (logoFile && logoFile.size > 0) {
        logoUrl = await uploadStoreLogo(store.id, logoFile);
      }
      const patch: Record<string, unknown> = {
        name: n,
        address: trimOrNull(address),
        phone: trimOrNull(phone),
        email: trimOrNull(email),
        description: trimOrNull(description),
        is_primary: isPrimary,
        pos_discount_enabled: posDiscountEnabled,
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
        invoice_template: invoiceTemplate === "elof" ? "elof" : "classic",
      };
      if (logoUrl != null) patch.logo_url = logoUrl;
      await updateStore(store.id, patch);
      toast.success("Boutique mise à jour");
      onUpdated();
      onClose();
    } catch (e) {
      const msg = messageFromUnknownError(e, "Échec de l’enregistrement.");
      setError(msg);
      toastMutationError("stores-update", e, "Échec de l’enregistrement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 min-[500px]:items-center min-[500px]:p-4"
        role="dialog"
        aria-modal
        aria-labelledby="edit-store-title"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Fermer"
          onClick={onClose}
        />
        <div
          className="relative z-10 flex max-h-[min(92dvh,800px)] w-full max-w-lg flex-col rounded-t-2xl border border-black/[0.08] bg-fs-card shadow-xl min-[500px]:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
          <h2 id="edit-store-title" className="text-lg font-bold text-neutral-900">
            Modifier la boutique
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="fs-touch-target rounded-lg p-2 text-neutral-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          <label className="block text-xs font-medium text-neutral-600">
            Nom *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
            />
          </label>
          <label className="block text-xs font-medium text-neutral-600">
            Adresse
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-600">
              Téléphone
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              E-mail
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-neutral-600">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              Boutique principale
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={posDiscountEnabled}
                onChange={(e) => setPosDiscountEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              Remise POS
            </label>
          </div>
          <div className="border-t border-black/[0.08] pt-4" role="region" aria-label="Paramètres facture A4">
            <p className="text-sm font-bold text-[#F97316]">Paramètres facture A4</p>
            <p className="mt-1 text-xs text-neutral-500">
              Logo et identité affichés sur la facture A4.
            </p>
            <label className="mt-3 block text-xs font-medium text-neutral-600">
              Modèle de facture A4
              <select
                value={invoiceTemplate}
                onChange={(e) =>
                  setInvoiceTemplate(e.target.value as "classic" | "elof")
                }
                className="mt-1 min-h-12 w-full rounded-lg border border-black/[0.12] bg-white px-3 py-3 text-base"
              >
                <option value="classic">Classique (en-tête actuel)</option>
                <option value="elof">
                  ELOF (E L O F, ordre fixe, Orange money en orange)
                </option>
              </select>
            </label>
            <button
              type="button"
              disabled={previewLoading}
              onClick={() => void handlePreviewInvoiceA4()}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#F97316] bg-white px-4 py-3 text-sm font-semibold text-[#F97316] disabled:opacity-50"
            >
              {previewLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
              ) : (
                <MdPictureAsPdf className="h-5 w-5 shrink-0" aria-hidden />
              )}
              Aperçu facture A4
            </button>
            <label className="mt-3 block text-xs font-medium text-neutral-600">
              Titre court / Acronyme
              <input
                value={invoiceShortTitle}
                onChange={(e) => setInvoiceShortTitle(e.target.value)}
                placeholder="ex. ELOF"
                className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2.5 text-base"
              />
            </label>
            <div className="mt-3 flex gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-neutral-100">
                {logoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreviewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : store.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={store.logo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl text-neutral-400" aria-hidden>
                    +
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-800">Logo entreprise</p>
                <p className="text-xs text-neutral-500">
                  Affiché sur la facture A4. Choisissez une image.
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  className="mt-2 w-full min-h-11 text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#F97316]"
                />
              </div>
            </div>
            <div className="mt-4 space-y-3 rounded-xl border border-black/[0.08] bg-fs-surface p-3">
              <label className="block text-xs font-medium text-neutral-600">
                Nom commercial
                <input
                  value={commercialName}
                  onChange={(e) => setCommercialName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                Slogan
                <input
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                Activité
                <input
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  placeholder="Ex. Commerce général"
                  className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                Mobile money (optionnel)
                <input
                  value={mobileMoney}
                  onChange={(e) => setMobileMoney(e.target.value)}
                  inputMode="tel"
                  className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <label className="block text-xs font-medium text-neutral-600">
                  Préfixe facture
                  <input
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    placeholder="FAC"
                    className="mt-1 w-full rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-600">
                  Devise
                  <input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="XOF"
                    className="mt-1 w-full rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <label className="block text-xs font-medium text-neutral-600">
                  Couleur primaire
                  <input
                    type="color"
                    value={hexForNativeColorInput(primaryColor)}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="mt-1 h-11 w-full min-h-11 cursor-pointer rounded-lg border border-black/[0.12] bg-white p-1"
                    aria-label="Couleur primaire (facture A4)"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-600">
                  Couleur secondaire
                  <input
                    type="color"
                    value={hexForNativeColorInput(secondaryColor)}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="mt-1 h-11 w-full min-h-11 cursor-pointer rounded-lg border border-black/[0.12] bg-white p-1"
                    aria-label="Couleur secondaire (facture A4)"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-neutral-600">
                  Ville
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-600">
                  Pays
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-neutral-600">
                Infos légales
                <textarea
                  value={legalInfo}
                  onChange={(e) => setLegalInfo(e.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-neutral-600">
                  Libellé taxe
                  <input
                    value={taxLabel}
                    onChange={(e) => setTaxLabel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-600">
                  N° fiscal
                  <input
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-neutral-600">
                Pied de page
                <textarea
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                Conditions de paiement
                <textarea
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                <label className="block text-xs font-medium text-neutral-600">
                  URL signature
                  <input
                    value={signatureUrl}
                    onChange={(e) => setSignatureUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-600">
                  URL cachet
                  <input
                    value={stampUrl}
                    onChange={(e) => setStampUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/[0.12] px-2 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-neutral-600">
                Titre signataire
                <input
                  value={invoiceSignerTitle}
                  onChange={(e) => setInvoiceSignerTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                Nom signataire
                <input
                  value={invoiceSignerName}
                  onChange={(e) => setInvoiceSignerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-black/[0.06] p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-black/[0.1] py-3 text-sm font-semibold"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void submit()}
            className={cn(
              "flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60",
              "bg-[#F97316]",
            )}
          >
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
    {invoicePreviewBlob ? (
      <InvoicePdfPreviewDialog
        blob={invoicePreviewBlob}
        title="Aperçu facture A4"
        onClose={() => setInvoicePreviewBlob(null)}
      />
    ) : null}
  </>
  );
}
