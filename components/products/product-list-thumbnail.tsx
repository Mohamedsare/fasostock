"use client";

import { useEffect, useState } from "react";
import { MdInventory2 } from "react-icons/md";
import { firstProductImageUrl as firstProductImageUrlFromLib } from "@/lib/features/products/product-images";
import type { ProductItem } from "@/lib/features/products/types";
import { cn } from "@/lib/utils/cn";

export function firstProductImageUrl(p: ProductItem): string | null {
  return firstProductImageUrlFromLib(p);
}

/** Miniature 48×48 comme `_ProductListTile` (Flutter) — 1re image ou icône inventaire. */
export function ProductListThumbnail({
  imageUrl,
  className,
  previewOnTap = false,
}: {
  imageUrl: string | null;
  className?: string;
  previewOnTap?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [imageUrl]);
  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);
  const showImg = Boolean(imageUrl) && !broken;

  return (
    <>
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-fs-surface-container text-neutral-400",
          className,
        )}
      >
        {showImg ? (
          previewOnTap ? (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="h-full w-full"
              aria-label="Agrandir la miniature"
            >
              <img
                src={imageUrl!}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                onError={() => setBroken(true)}
              />
            </button>
          ) : (
            <img
              src={imageUrl!}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
            />
          )
        ) : (
          <span
            className="flex h-full w-full items-center justify-center"
            aria-hidden
          >
            <MdInventory2 className="h-7 w-7" />
          </span>
        )}
      </div>

      {previewOnTap && showImg && previewOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-6"
          onClick={() => setPreviewOpen(false)}
          role="presentation"
        >
          <div
            className="h-[140px] w-[140px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl sm:h-[170px] sm:w-[170px]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageUrl!}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
