"use client";

import { fetchPackagingsPdfBlob } from "@/lib/features/pdf/pdf-api-client";
import {
  packagingPiecePrice,
  packagingPriceProblem,
  packagingTotalPrice,
} from "@/lib/features/products/packaging-price";
import type { ProductItem } from "@/lib/features/products/types";

/**
 * Une ligne de lot telle qu'elle sera imprimée. Les montants sont calculés ICI, avec
 * les mêmes helpers que l'écran et la caisse : le PDF sert à vérifier, il ne doit donc
 * jamais raconter autre chose que ce que le vendeur voit au comptoir.
 */
function lotsOf(p: ProductItem) {
  return [...(p.product_packagings ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((pk) => {
      const total = packagingTotalPrice(pk.price, pk.factor, p.sale_price);
      const piecePrice = packagingPiecePrice(total, pk.factor);
      const unitPrice = Number(p.sale_price ?? 0);
      return {
        label: pk.label,
        factor: pk.factor,
        total,
        piecePrice,
        // Écart avec le prix de détail : négatif = la pièce coûte moins cher au lot.
        deltaPercent:
          unitPrice > 0 ? ((piecePrice - unitPrice) / unitPrice) * 100 : null,
        suspicious:
          packagingPriceProblem({
            label: pk.label,
            factor: pk.factor,
            price: pk.price ?? null,
            unitSalePrice: p.sale_price,
            purchasePrice: p.purchase_price,
          }) != null,
        barcode: pk.barcode ?? null,
      };
    });
}

export function packagingsPdfItems(products: ProductItem[]) {
  return products.map((p) => ({
    name: p.name,
    sku: p.sku ?? null,
    unit: p.unit || "pce",
    unitPrice: Number(p.sale_price ?? 0),
    lots: lotsOf(p),
  }));
}

/** Génère la feuille de vérification et la remet au navigateur. */
export async function downloadPackagingsPdf(params: {
  companyId: string;
  companyName: string;
  companyLogoUrl?: string | null;
  storeName: string;
  /** Ce qui était affiché à l'écran (« À remplir », catégorie…) — imprimé en en-tête. */
  scopeLabel: string;
  products: ProductItem[];
}): Promise<void> {
  const blob = await fetchPackagingsPdfBlob({
    companyId: params.companyId,
    companyName: params.companyName,
    companyLogoUrl: params.companyLogoUrl ?? null,
    storeName: params.storeName,
    scopeLabel: params.scopeLabel,
    items: packagingsPdfItems(params.products),
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conditionnements-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
