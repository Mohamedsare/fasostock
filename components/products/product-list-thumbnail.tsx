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
}: {
  imageUrl: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [imageUrl]);
  const showImg = Boolean(imageUrl) && !broken;

  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-fs-surface-container text-neutral-400",
        className,
      )}
    >
      {showImg ? (
        <img
          src={imageUrl!}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center"
          aria-hidden
        >
          <MdInventory2 className="h-7 w-7" />
        </span>
      )}
    </div>
  );
}
