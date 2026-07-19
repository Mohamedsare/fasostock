"use client";

import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { listProducts } from "@/lib/features/products/api";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import {
  listStoreProductIds,
  replaceStoreCatalog,
} from "@/lib/features/stores/store-catalog";
import { updateStore } from "@/lib/features/stores/api";
import type { Store } from "@/lib/features/stores/types";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MdSearch } from "react-icons/md";
import { X } from "lucide-react";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

type ProductLite = { id: string; name: string; imageUrl: string | null };

/**
 * Gestion du catalogue produits d'une boutique.
 * - Interrupteur « Partager tout le catalogue de l'entreprise ».
 * - Si catalogue personnalisé : sélection des produits vendus par la boutique.
 */
export function StoreCatalogDialog({
  open,
  store,
  companyId,
  onClose,
  onUpdated,
}: {
  open: boolean;
  store: Store | null;
  companyId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const [shares, setShares] = useState(true);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !store) return;
    let cancelled = false;
    setShares(store.shares_company_catalog);
    setSearch("");
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const [all, memberIds] = await Promise.all([
          listProducts(companyId),
          listStoreProductIds(store.id),
        ]);
        if (cancelled) return;
        const lite: ProductLite[] = all.map((p) => ({
          id: p.id,
          name: p.name,
          imageUrl: firstProductImageUrl(p),
        }));
        setProducts(lite);
        // Catalogue partagé : tout est coché par défaut (base de départ si on bascule en perso).
        setSelected(
          store.shares_company_catalog
            ? new Set(lite.map((p) => p.id))
            : memberIds,
        );
      } catch (e) {
        if (!cancelled) setError(messageFromUnknownError(e, "Chargement impossible."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, store, companyId]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return products;
    return products.filter((p) => normalize(p.name).includes(q));
  }, [products, search]);

  if (!open || !store) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!store) return;
    // Un catalogue personnalisé vide est autorisé (cohérent avec « Produits différents »
    // à la création) : la boutique ne vend simplement rien tant qu'on n'ajoute pas de produits.
    setSaving(true);
    setError(null);
    try {
      await updateStore(store.id, { shares_company_catalog: shares });
      if (!shares) {
        await replaceStoreCatalog(companyId, store.id, [...selected]);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.stores(companyId) }),
        qc.invalidateQueries({ queryKey: queryKeys.storesPage(companyId) }),
        qc.invalidateQueries({ queryKey: queryKeys.storeCatalog(store.id) }),
        qc.invalidateQueries({ queryKey: queryKeys.appContext }),
      ]);
      toast.success("Catalogue mis à jour");
      onUpdated();
      onClose();
    } catch (e) {
      setError(messageFromUnknownError(e, "Enregistrement impossible."));
      toastMutationError("store-catalog", e, "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 min-[500px]:items-center min-[500px]:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="store-catalog-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(92dvh,760px)] w-full max-w-lg flex-col rounded-t-2xl border border-black/8 bg-fs-card shadow-xl min-[500px]:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
          <h2 id="store-catalog-title" className="min-w-0 truncate text-lg font-bold text-neutral-900">
            Catalogue · {store.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="fs-touch-target rounded-lg p-2 text-neutral-500"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}

          <label className="flex items-start gap-3 rounded-xl border border-black/8 p-3">
            <input
              type="checkbox"
              checked={shares}
              onChange={(e) => setShares(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300"
            />
            <span>
              <span className="text-sm font-semibold text-neutral-800">
                Partager tout le catalogue de l’entreprise
              </span>
              <span className="block text-xs text-neutral-500">
                Décochez pour donner à cette boutique un catalogue de produits différent.
              </span>
            </span>
          </label>

          {!shares ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-800">
                  Produits vendus ({selected.size})
                </p>
                <div className="flex gap-2 text-xs font-semibold text-[var(--fs-accent)]">
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(products.map((p) => p.id)))}
                  >
                    Tout cocher
                  </button>
                  <span className="text-neutral-300">|</span>
                  <button type="button" onClick={() => setSelected(new Set())}>
                    Tout décocher
                  </button>
                </div>
              </div>

              {selected.size === 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Aucun produit sélectionné : cette boutique ne vendra aucun produit tant que
                  vous n’en ajoutez pas.
                </p>
              ) : null}

              <div className="relative">
                <MdSearch
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un produit…"
                  className="w-full rounded-lg border border-black/12 py-2.5 pl-10 pr-3 text-base"
                  aria-label="Rechercher un produit"
                />
              </div>

              <div className="max-h-[42dvh] overflow-y-auto rounded-xl border border-black/8">
                {loading ? (
                  <p className="px-3 py-8 text-center text-sm text-neutral-500">Chargement…</p>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-neutral-500">
                    Aucun produit trouvé
                  </p>
                ) : (
                  filtered.map((p) => {
                    const checked = selected.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-black/5 px-3 py-2 last:border-b-0 active:bg-fs-surface-container"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(p.id)}
                          className="h-4 w-4 shrink-0 rounded border-neutral-300"
                        />
                        <ProductListThumbnail
                          imageUrl={p.imageUrl}
                          className="h-9 w-9 shrink-0 rounded-lg"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                          {p.name}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <p className="rounded-lg bg-fs-surface-container px-3 py-3 text-xs text-neutral-600">
              Cette boutique vend les mêmes produits que les autres boutiques de l’entreprise.
              Le stock reste géré séparément par boutique.
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-black/6 p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-black/10 py-3 text-sm font-semibold"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void submit()}
            className="flex-1 rounded-xl bg-[#F97316] py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
