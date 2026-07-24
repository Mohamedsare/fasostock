"use client";

import { useEffect, useMemo, useState } from "react";
import { MdAutoAwesome, MdClose, MdDownload, MdImage } from "react-icons/md";
import { applyPromoPercent } from "@/lib/features/promotions/promo-math";
import {
  downloadImageDataUrl,
  generatePromoAd,
  type PromoAd,
} from "@/lib/features/promotions/poster-api";
import type { Promotion } from "@/lib/features/promotions/types";
import type { ProductItem } from "@/lib/features/products/types";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

const MAX_ADS = 3;

type AdItem = {
  productId: string;
  name: string;
  imageUrl: string;
  oldPrice: number;
  newPrice: number;
  ad: PromoAd | null;
};

function frDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(p: Promotion): string | null {
  const s = frDate(p.startsAt);
  const e = frDate(p.endsAt);
  if (s && e) return `Du ${s} au ${e}`;
  if (e) return `Jusqu'au ${e}`;
  if (s) return `À partir du ${s}`;
  return null;
}

export function PromoPosterDialog({
  open,
  onClose,
  promotion,
  products,
  companyId,
  companyName,
  storeNameById,
}: {
  open: boolean;
  onClose: () => void;
  promotion: Promotion | null;
  products: ProductItem[];
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  storeNameById: Map<string, string>;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AdItem[]>([]);

  const storeName = useMemo(() => {
    if (!promotion || promotion.storeIds.length !== 1) return null;
    return storeNameById.get(promotion.storeIds[0]!) ?? null;
  }, [promotion, storeNameById]);

  const shopName = [companyName, storeName].filter(Boolean).join(" · ") || "Notre boutique";
  const period = promotion ? periodLabel(promotion) : null;

  // Produits éligibles : ceux qui ont une VRAIE photo (image-to-image), plafonné à 3 affiches.
  const baseItems = useMemo<AdItem[]>(() => {
    if (!promotion) return [];
    const byId = new Map(products.map((p) => [p.id, p]));
    return promotion.productIds
      .map((id) => byId.get(id))
      .filter((p): p is ProductItem => Boolean(p))
      .map((p) => ({
        productId: p.id,
        name: p.name,
        imageUrl: p.product_images?.[0]?.url ?? "",
        oldPrice: Math.round(p.sale_price),
        newPrice: applyPromoPercent(p.sale_price, promotion.discountPercent),
        ad: null as PromoAd | null,
      }))
      .filter((it) => it.imageUrl.length > 0)
      .slice(0, MAX_ADS);
  }, [promotion, products]);

  const totalPromoProducts = promotion?.productCount ?? 0;
  const withoutPhoto = totalPromoProducts - baseItems.length;

  useEffect(() => {
    if (!open) return;
    setItems(baseItems);
    setError(null);
    setBusy(false);
    setProgress({ done: 0, total: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promotion?.id]);

  async function runGenerate() {
    if (!promotion || baseItems.length === 0) return;
    setBusy(true);
    setError(null);
    setItems(baseItems.map((it) => ({ ...it, ad: null })));
    setProgress({ done: 0, total: baseItems.length });
    for (let i = 0; i < baseItems.length; i++) {
      const it = baseItems[i]!;
      try {
        const ad = await generatePromoAd({
          companyId,
          productId: it.productId,
          imageUrl: it.imageUrl,
          shopName,
          productName: it.name,
          oldPrice: it.oldPrice,
          newPrice: it.newPrice,
          discountPercent: promotion.discountPercent,
          periodLabel: period,
        });
        setItems((prev) => {
          const next = [...prev];
          const idx = next.findIndex((x) => x.productId === it.productId);
          if (idx >= 0) next[idx] = { ...next[idx]!, ad };
          return next;
        });
      } catch (e) {
        if (i === 0) {
          setError(messageFromUnknownError(e, "Génération impossible."));
          setBusy(false);
          setProgress({ done: 0, total: 0 });
          return;
        }
        toast.error(messageFromUnknownError(e, "Une affiche a échoué."));
      }
      setProgress({ done: i + 1, total: baseItems.length });
    }
    setBusy(false);
    toast.success("Affiche(s) générée(s).");
  }

  if (!open || !promotion) return null;

  const generatedCount = items.filter((it) => it.ad).length;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40">
      <button type="button" className="min-w-0 flex-1 md:min-w-[120px]" aria-label="Fermer" onClick={onClose} />
      <div className="flex h-dvh w-full max-w-2xl flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-base font-bold text-fs-text">
              <MdAutoAwesome className="h-5 w-5 text-fs-accent" aria-hidden />
              Affiches publicitaires IA
            </h3>
            <p className="truncate text-xs text-neutral-500">
              {promotion.name} · -{promotion.discountPercent}% · {baseItems.length} affiche(s) carrée(s)
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-sm p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Fermer">
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {baseItems.length === 0 ? (
            <p className="rounded-sm bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Aucun produit avec photo dans cette promotion. Ajoutez une photo au produit pour générer une affiche.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-neutral-500">
                  ChatGPT crée une affiche carrée par produit (vraie photo + prix exacts).
                  {withoutPhoto > 0 ? ` ${withoutPhoto} produit(s) sans photo ignoré(s).` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => void runGenerate()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-linear-to-r from-fuchsia-600 to-fs-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
                      Création {progress.done}/{progress.total}…
                    </>
                  ) : (
                    <>
                      <MdAutoAwesome className="h-4 w-4" aria-hidden />
                      {generatedCount > 0 ? "Regénérer" : "Générer les affiches"}
                    </>
                  )}
                </button>
              </div>

              {error ? (
                <div className="mb-3 rounded-sm bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {items.map((it) => (
                  <div key={it.productId} className="flex flex-col gap-2">
                    <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-black/10 bg-fs-surface-low dark:border-white/10">
                      {it.ad ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.ad.dataUrl} alt={it.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={it.imageUrl} alt="" className="h-16 w-16 rounded-sm object-cover opacity-70" />
                          <span className="text-xs font-semibold text-neutral-600">{it.name}</span>
                          <span className="text-[11px] text-neutral-400">
                            {formatCurrency(it.oldPrice)} → {formatCurrency(it.newPrice)}
                          </span>
                          {busy ? (
                            <span className="mt-1 flex items-center gap-1 text-[11px] text-fs-accent">
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
                              En création…
                            </span>
                          ) : (
                            <span className="mt-1 flex items-center gap-1 text-[11px] text-neutral-400">
                              <MdImage className="h-3.5 w-3.5" aria-hidden /> En attente
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        it.ad && downloadImageDataUrl(it.ad.dataUrl, `affiche_${promotion.name}_${it.name}`)
                      }
                      disabled={!it.ad}
                      className="inline-flex items-center justify-center gap-1.5 rounded-sm bg-fs-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                    >
                      <MdDownload className="h-4 w-4" aria-hidden />
                      Télécharger (image)
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
