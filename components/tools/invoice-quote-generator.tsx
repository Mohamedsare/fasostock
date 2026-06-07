"use client";

import { InvoiceQuoteDocument } from "@/components/tools/invoice-quote-document";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import {
  FD_CURRENCIES,
  normalizeDraft,
  pdfFileName,
  suggestNumber,
  type FdDiscountMode,
  type FdDocType,
  type FdDocument,
  type FdLineItem,
} from "@/lib/tools/invoice-quote";
import {
  MdAdd,
  MdDeleteOutline,
  MdDownload,
  MdImage,
  MdRefresh,
  MdSave,
} from "react-icons/md";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const MAX_LOGO_BYTES = 1_500_000; // 1,5 Mo

function newItem(): FdLineItem {
  return {
    id: `it_${Math.random().toString(36).slice(2, 10)}`,
    designation: "",
    quantity: 1,
    unitPrice: null,
  };
}

/** Saisie numérique : vide → null, sinon nombre positif (négatifs ramenés à 0). */
function parseNonNeg(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n < 0 ? 0 : n;
}

function emptyDoc(): FdDocument {
  return {
    docType: "facture",
    currency: "XOF",
    number: "",
    date: "",
    dueDate: "",
    logoDataUrl: null,
    senderName: "",
    senderDetails: "",
    clientName: "",
    clientDetails: "",
    items: [newItem()],
    taxEnabled: false,
    taxRate: 18,
    discountMode: "amount",
    discountValue: 0,
    notes: "",
    signatureDataUrl: null,
    signatureLabel: "",
    secondaryCurrency: "",
    exchangeRate: 0,
  };
}

const DRAFT_KEY = "fd_draft_v1";

/* ---------- Champs (module-scope pour éviter de recréer des composants au render) ---------- */

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-fs-on-surface-variant">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-neutral-400">{hint}</span> : null}
    </label>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-fs-card p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 text-sm font-extrabold text-fs-text">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Lit un fichier image en data URL (validations type + taille). */
function readImageFile(file: File | null, onOk: (url: string) => void, onErr: (msg: string) => void) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    onErr("Choisissez un fichier image.");
    return;
  }
  if (file.size > MAX_LOGO_BYTES) {
    onErr("Image trop lourde (max 1,5 Mo).");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onOk(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => onErr("Impossible de lire l’image.");
  reader.readAsDataURL(file);
}

export function InvoiceQuoteGenerator() {
  const [doc, setDoc] = useState<FdDocument>(emptyDoc);
  const [hydrated, setHydrated] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);
  const logoErrorId = useId();
  const [logoError, setLogoError] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  // Au montage : recharge le brouillon local s'il existe, puis garantit date/numéro
  // (valeurs dépendantes du client → évite tout écart d'hydratation SSR).
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    let loaded: FdDocument | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) loaded = normalizeDraft(JSON.parse(raw), emptyDoc());
    } catch {
      /* brouillon illisible → ignoré */
    }
    setDoc((d) => {
      const base = loaded ?? d;
      return base.date
        ? base
        : { ...base, date: today, number: base.number || suggestNumber(base.docType, today) };
    });
    setHydrated(true);
  }, []);

  // Sauvegarde automatique du brouillon (après hydratation pour ne pas écraser le brouillon chargé).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
    } catch {
      // Quota dépassé (souvent à cause des images) → on persiste sans les images.
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ ...doc, logoDataUrl: null, signatureDataUrl: null }),
        );
      } catch {
        /* abandon silencieux */
      }
    }
  }, [doc, hydrated]);

  const set = <K extends keyof FdDocument>(key: K, value: FdDocument[K]) =>
    setDoc((d) => ({ ...d, [key]: value }));

  const setDocType = (docType: FdDocType) =>
    setDoc((d) => ({
      ...d,
      docType,
      // Régénère le numéro avec le bon préfixe s'il suit encore le format auto.
      number: /^(FAC|DEV)-/.test(d.number) ? suggestNumber(docType, d.date) : d.number,
    }));

  const updateItem = (id: string, patch: Partial<FdLineItem>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  const addItem = () => setDoc((d) => ({ ...d, items: [...d.items, newItem()] }));

  const removeItem = (id: string) =>
    setDoc((d) => ({
      ...d,
      items: d.items.length > 1 ? d.items.filter((it) => it.id !== id) : d.items,
    }));

  const onPickLogo = (file: File | null) => {
    setLogoError(null);
    readImageFile(file, (url) => set("logoDataUrl", url), setLogoError);
  };

  const onPickSignature = (file: File | null) => {
    setSignatureError(null);
    readImageFile(file, (url) => set("signatureDataUrl", url), setSignatureError);
  };

  const reset = () => {
    setLogoError(null);
    setSignatureError(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
    if (signatureInputRef.current) signatureInputRef.current.value = "";
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    const today = new Date().toISOString().slice(0, 10);
    const fresh = emptyDoc();
    setDoc({ ...fresh, date: today, number: suggestNumber(fresh.docType, today) });
  };

  const downloadPdf = () => {
    const previousTitle = document.title;
    document.title = pdfFileName(doc);
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const isFacture = doc.docType === "facture";

  return (
    <div className="space-y-5">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="inline-flex rounded-xl border border-black/[0.08] bg-fs-surface-container p-1">
          {(["facture", "devis"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDocType(t)}
              aria-pressed={doc.docType === t}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-bold capitalize transition-colors",
                doc.docType === t
                  ? "bg-fs-accent text-white shadow-sm"
                  : "text-fs-on-surface-variant hover:text-fs-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-fs-card px-3 py-2 text-sm font-semibold text-fs-text transition-colors hover:bg-black/5"
          >
            <MdRefresh className="h-4 w-4" aria-hidden />
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            className="inline-flex items-center gap-2 rounded-xl bg-fs-accent px-4 py-2 text-sm font-bold text-white shadow-[0_8px_22px_-8px_rgba(232,93,44,0.7)] transition-transform active:scale-95"
          >
            <MdDownload className="h-4.5 w-4.5" aria-hidden />
            Télécharger / Imprimer PDF
          </button>
        </div>
      </div>

      <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-fs-on-surface-variant print:hidden">
        <MdSave className="h-3.5 w-3.5 text-fs-accent" aria-hidden />
        Brouillon enregistré automatiquement sur cet appareil.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Formulaire */}
        <div className="space-y-4 print:hidden">
          <SectionCard title="Vos informations (émetteur)">
            <Field label="Nom / Entreprise">
              <input
                className={fsInputClass()}
                value={doc.senderName}
                onChange={(e) => set("senderName", e.target.value)}
                placeholder="Ex. Boutique FasoStock"
              />
            </Field>
            <Field label="Coordonnées" hint="Adresse, téléphone, email, RCCM/IFU…">
              <textarea
                className={fsInputClass("min-h-[72px] resize-y")}
                value={doc.senderDetails}
                onChange={(e) => set("senderDetails", e.target.value)}
                placeholder={"Avenue Kwamé N'Krumah, Ouagadougou\n+226 70 00 00 00\ncontact@exemple.bf"}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-describedby={logoError ? logoErrorId : undefined}
                onChange={(e) => onPickLogo(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-fs-surface-container px-3 py-2 text-sm font-semibold text-fs-text hover:bg-black/5"
              >
                <MdImage className="h-4 w-4 text-fs-accent" aria-hidden />
                {doc.logoDataUrl ? "Changer le logo" : "Ajouter un logo"}
              </button>
              {doc.logoDataUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    set("logoDataUrl", null);
                    if (logoInputRef.current) logoInputRef.current.value = "";
                  }}
                  className="text-sm font-semibold text-red-600 hover:underline"
                >
                  Retirer
                </button>
              ) : null}
            </div>
            {logoError ? (
              <p id={logoErrorId} className="text-[12px] font-semibold text-red-600">
                {logoError}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title={isFacture ? "Client (destinataire)" : "Destinataire du devis"}>
            <Field label="Nom / Entreprise du client">
              <input
                className={fsInputClass()}
                value={doc.clientName}
                onChange={(e) => set("clientName", e.target.value)}
                placeholder="Ex. M. Ouédraogo"
              />
            </Field>
            <Field label="Coordonnées du client">
              <textarea
                className={fsInputClass("min-h-[60px] resize-y")}
                value={doc.clientDetails}
                onChange={(e) => set("clientDetails", e.target.value)}
                placeholder={"Adresse, téléphone, email…"}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Détails du document">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Numéro">
                <input
                  className={fsInputClass()}
                  value={doc.number}
                  onChange={(e) => set("number", e.target.value)}
                  placeholder="FAC-20260101-001"
                />
              </Field>
              <Field label="Devise">
                <select
                  className={fsInputClass()}
                  value={doc.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  {FD_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date d’émission">
                <input
                  type="date"
                  className={fsInputClass()}
                  value={doc.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
              <Field label={isFacture ? "Date d’échéance" : "Valable jusqu’au"}>
                <input
                  type="date"
                  className={fsInputClass()}
                  value={doc.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Articles & prestations">
            <div className="space-y-2">
              {doc.items.map((it, idx) => (
                <div
                  key={it.id}
                  className="rounded-xl border border-black/[0.06] bg-fs-surface-container p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-fs-on-surface-variant">
                      Ligne {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      disabled={doc.items.length <= 1}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-30"
                      aria-label={`Supprimer la ligne ${idx + 1}`}
                    >
                      <MdDeleteOutline className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <input
                    className={fsInputClass("mb-2")}
                    value={it.designation}
                    onChange={(e) => updateItem(it.id, { designation: e.target.value })}
                    placeholder="Désignation (ex. Sac de riz 25 kg)"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Quantité">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        className={fsInputClass()}
                        value={it.quantity ?? ""}
                        onChange={(e) => updateItem(it.id, { quantity: parseNonNeg(e.target.value) })}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="Prix unitaire">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        className={fsInputClass()}
                        value={it.unitPrice ?? ""}
                        onChange={(e) => updateItem(it.id, { unitPrice: parseNonNeg(e.target.value) })}
                        placeholder="0"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-fs-accent/40 bg-fs-accent/[0.04] py-2.5 text-sm font-bold text-fs-accent transition-colors hover:bg-fs-accent/10"
            >
              <MdAdd className="h-4 w-4" aria-hidden />
              Ajouter une ligne
            </button>
          </SectionCard>

          <SectionCard title="Remise & taxes">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Remise">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    className={fsInputClass()}
                    value={doc.discountValue || ""}
                    onChange={(e) => set("discountValue", Math.max(0, Number(e.target.value) || 0))}
                  />
                  <select
                    className={fsInputClass("w-24")}
                    value={doc.discountMode}
                    onChange={(e) => set("discountMode", e.target.value as FdDiscountMode)}
                    aria-label="Type de remise"
                  >
                    <option value="amount">Montant</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </Field>
              <Field label="TVA">
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-fs-text">
                    <input
                      type="checkbox"
                      checked={doc.taxEnabled}
                      onChange={(e) => set("taxEnabled", e.target.checked)}
                      className="h-4 w-4 accent-fs-accent"
                    />
                    Activer
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    disabled={!doc.taxEnabled}
                    className={fsInputClass("disabled:opacity-50")}
                    value={doc.taxRate || ""}
                    onChange={(e) => set("taxRate", Math.max(0, Number(e.target.value) || 0))}
                    aria-label="Taux de TVA en %"
                  />
                  <span className="text-sm font-semibold text-fs-on-surface-variant">%</span>
                </div>
              </Field>
            </div>
            <Field label="Notes & conditions">
              <textarea
                className={fsInputClass("min-h-[60px] resize-y")}
                value={doc.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder={"Conditions de paiement, mentions légales, message de remerciement…"}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Conversion (devise secondaire)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Devise secondaire" hint="Affiche le total converti sur le document.">
                <select
                  className={fsInputClass()}
                  value={doc.secondaryCurrency}
                  onChange={(e) => set("secondaryCurrency", e.target.value)}
                >
                  <option value="">Aucune</option>
                  {FD_CURRENCIES.filter((c) => c.code !== doc.currency).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Taux de change"
                hint={
                  doc.secondaryCurrency
                    ? `1 ${doc.currency} = ? ${doc.secondaryCurrency}`
                    : "Choisissez d’abord une devise secondaire."
                }
              >
                <input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  disabled={!doc.secondaryCurrency}
                  className={fsInputClass("disabled:opacity-50")}
                  value={doc.exchangeRate || ""}
                  onChange={(e) => set("exchangeRate", Math.max(0, Number(e.target.value) || 0))}
                  placeholder="Ex. 0.00152"
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Signature & cachet">
            <Field label="Libellé sous la signature">
              <input
                className={fsInputClass()}
                value={doc.signatureLabel}
                onChange={(e) => set("signatureLabel", e.target.value)}
                placeholder="Ex. Le gérant · Awa Traoré"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickSignature(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => signatureInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-fs-surface-container px-3 py-2 text-sm font-semibold text-fs-text hover:bg-black/5"
              >
                <MdImage className="h-4 w-4 text-fs-accent" aria-hidden />
                {doc.signatureDataUrl ? "Changer l’image" : "Importer signature / cachet"}
              </button>
              {doc.signatureDataUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    set("signatureDataUrl", null);
                    if (signatureInputRef.current) signatureInputRef.current.value = "";
                  }}
                  className="text-sm font-semibold text-red-600 hover:underline"
                >
                  Retirer
                </button>
              ) : null}
            </div>
            {signatureError ? (
              <p className="text-[12px] font-semibold text-red-600">{signatureError}</p>
            ) : null}
          </SectionCard>
        </div>

        {/* Aperçu live */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-fs-on-surface-variant print:hidden">
            Aperçu en direct
          </p>
          <div className="overflow-x-auto rounded-2xl bg-neutral-200/40 p-3 sm:p-5 print:overflow-visible print:bg-transparent print:p-0">
            <InvoiceQuoteDocument doc={doc} />
          </div>
        </div>
      </div>
    </div>
  );
}
