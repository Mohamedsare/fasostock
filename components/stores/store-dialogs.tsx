"use client";

import { useEffect, useState } from "react";
import {
  createStore,
  updateStore,
  uploadStoreLogo,
  type CreateStoreInput,
} from "@/lib/features/stores/api";
import type { Store } from "@/lib/features/stores/types";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { X } from "lucide-react";

function trimOrNull(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

/** Choix du catalogue produits pour une nouvelle boutique. */
type CatalogMode = "all" | "same_as" | "empty";

export function CreateStoreModal({
  open,
  companyId,
  existingStores = [],
  onClose,
  onCreated,
}: {
  open: boolean;
  companyId: string;
  /** Boutiques existantes de l'entreprise — pour l'option « mêmes produits que… ». */
  existingStores?: Array<Pick<Store, "id" | "name" | "shares_company_catalog">>;
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
  const [catalogMode, setCatalogMode] = useState<CatalogMode>("all");
  const [sameAsStoreId, setSameAsStoreId] = useState<string>("");
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
      setCatalogMode("all");
      setSameAsStoreId(existingStores[0]?.id ?? "");
      setError(null);
      setLoading(false);
    }
  }, [open, existingStores]);

  if (!open) return null;

  async function submit() {
    const n = name.trim();
    if (n.length < 2) {
      setError("Nom requis (2 caractères minimum)");
      return;
    }
    if (catalogMode === "same_as" && !sameAsStoreId) {
      setError("Choisissez la boutique dont copier les produits.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Résolution du choix de catalogue :
      //  - « all »      : partage tout le catalogue de l'entreprise.
      //  - « empty »    : catalogue personnalisé vierge.
      //  - « same_as X »: si X partage tout → la nouvelle partage aussi ; sinon copie le catalogue de X.
      let sharesCompanyCatalog = true;
      let copyCatalogFromStoreId: string | null = null;
      if (catalogMode === "empty") {
        sharesCompanyCatalog = false;
      } else if (catalogMode === "same_as") {
        const src = existingStores.find((s) => s.id === sameAsStoreId);
        if (src && src.shares_company_catalog) {
          sharesCompanyCatalog = true;
        } else {
          sharesCompanyCatalog = false;
          copyCatalogFromStoreId = sameAsStoreId;
        }
      }
      const input: CreateStoreInput = {
        companyId,
        name: n,
        address: trimOrNull(address),
        phone: trimOrNull(phone),
        email: trimOrNull(email),
        description: trimOrNull(description),
        isPrimary,
        logoFile,
        sharesCompanyCatalog,
        copyCatalogFromStoreId,
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

          {/* Choix du catalogue produits */}
          <fieldset className="rounded-xl border border-black/[0.08] p-3">
            <legend className="px-1 text-xs font-semibold text-neutral-700">
              Produits vendus
            </legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="catalog-mode"
                  className="mt-0.5 h-4 w-4"
                  checked={catalogMode === "all"}
                  onChange={() => setCatalogMode("all")}
                />
                <span>
                  <span className="font-medium text-neutral-800">
                    Tout le catalogue de l’entreprise
                  </span>
                  <span className="block text-xs text-neutral-500">
                    La boutique vend les mêmes produits que les autres (stock propre).
                  </span>
                </span>
              </label>

              {existingStores.length > 0 ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="catalog-mode"
                    className="mt-0.5 h-4 w-4"
                    checked={catalogMode === "same_as"}
                    onChange={() => setCatalogMode("same_as")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-neutral-800">
                      Les mêmes produits qu’une boutique
                    </span>
                    <span className="block text-xs text-neutral-500">
                      Copie le catalogue de la boutique choisie.
                    </span>
                    {catalogMode === "same_as" ? (
                      <select
                        value={sameAsStoreId}
                        onChange={(e) => setSameAsStoreId(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
                      >
                        {existingStores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </span>
                </label>
              ) : null}

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="catalog-mode"
                  className="mt-0.5 h-4 w-4"
                  checked={catalogMode === "empty"}
                  onChange={() => setCatalogMode("empty")}
                />
                <span>
                  <span className="font-medium text-neutral-800">
                    Produits différents
                  </span>
                  <span className="block text-xs text-neutral-500">
                    Catalogue vierge : vous ajouterez les produits de cette boutique.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

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

/**
 * Dialogue « Modifier » — infos de base de la boutique (logo, nom, adresse, téléphone,
 * e-mail, description) + réglages opérationnels. La personnalisation de la facture A4 et
 * le format du ticket thermique ont leurs propres dialogues (voir `store-config-dialogs`).
 */
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
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [posDiscountEnabled, setPosDiscountEnabled] = useState(false);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [logoFile]);

  useEffect(() => {
    if (!store || !open) return;
    setName(store.name);
    setAddress(store.address ?? "");
    setPhone(store.phone ?? "");
    setEmail(store.email ?? "");
    setDescription(store.description ?? "");
    setIsPrimary(store.is_primary);
    setPosDiscountEnabled(store.pos_discount_enabled);
    setLogoFile(null);
    setError(null);
    setLoading(false);
  }, [store, open]);

  if (!open || !store) return null;

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
        className="relative z-10 flex max-h-[min(92dvh,760px)] w-full max-w-lg flex-col rounded-t-2xl border border-black/[0.08] bg-fs-card shadow-xl min-[500px]:rounded-2xl"
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
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}

          {/* Logo */}
          <div className="flex gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-neutral-100">
              {logoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreviewUrl} alt="" className="h-full w-full object-cover" />
              ) : store.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full items-center justify-center text-2xl text-neutral-400"
                  aria-hidden
                >
                  +
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-800">Logo de la boutique</p>
              <p className="text-xs text-neutral-500">
                Affiché sur la carte, le ticket et la facture A4.
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                className="mt-2 min-h-11 w-full text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#F97316]"
              />
            </div>
          </div>

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
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
