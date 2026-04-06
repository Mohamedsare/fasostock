"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import { MdInventory2, MdLocalPrintshop, MdSearch } from "react-icons/md";
import { FsCard, FsPage, FsScreenHeader, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listProducts, setProductBarcode } from "@/lib/features/products/api";
import type { ProductItem } from "@/lib/features/products/types";
import {
  ProductListThumbnail,
  firstProductImageUrl,
} from "@/components/products/product-list-thumbnail";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

type SelectedMap = Record<string, number>;
const CODE_HEIGHT = 42;
type LabelPreset = "a4_3x8" | "40x25" | "50x30";
type LabelConfig = { cols: number; widthMm: number; heightMm: number };
const LABEL_CONFIGS: Record<LabelPreset, LabelConfig> = {
  a4_3x8: { cols: 3, widthMm: 63, heightMm: 33 },
  "40x25": { cols: 4, widthMm: 40, heightMm: 25 },
  "50x30": { cols: 3, widthMm: 50, heightMm: 30 },
};

function normalizedBarcode(product: ProductItem): string {
  const raw = (product.barcode ?? "").trim();
  if (raw) return raw;
  // Fallback compact + déterministe (court et stable) à partir de l'UUID produit.
  // Exemple: FS-3E7K9VQ2L1M (CODE128, lisible, sans chaîne longue SKU/nom).
  const hex = product.id.replace(/-/g, "").slice(0, 16);
  if (!hex) return `FS-${Date.now().toString(36).toUpperCase()}`;
  try {
    const token = BigInt(`0x${hex}`).toString(36).toUpperCase();
    return `FS-${token}`;
  } catch {
    return `FS-${product.id.slice(0, 10).toUpperCase()}`;
  }
}

function buildPersistedBarcode(product: ProductItem, usedUpper: Set<string>): string {
  const existing = (product.barcode ?? "").trim();
  if (existing) return existing;
  const base = normalizedBarcode(product);
  if (!usedUpper.has(base.toUpperCase())) {
    usedUpper.add(base.toUpperCase());
    return base;
  }
  let i = 2;
  while (i < 1296) {
    const candidate = `${base}-${i.toString(36).toUpperCase()}`;
    const key = candidate.toUpperCase();
    if (!usedUpper.has(key)) {
      usedUpper.add(key);
      return candidate;
    }
    i += 1;
  }
  const fallback = `${base}-${Date.now().toString(36).toUpperCase()}`;
  usedUpper.add(fallback.toUpperCase());
  return fallback;
}

function barcodeSvg(value: string): string | null {
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: false,
      width: 1.25,
      height: CODE_HEIGHT,
      margin: 0,
    });
    return svg.outerHTML;
  } catch {
    return null;
  }
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampQty(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 1) return 1;
  if (v > 500) return 500;
  return Math.floor(v);
}

export function BarcodesScreen() {
  const ctx = useAppContext();
  const { helpers } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedMap>({});
  const [printing, setPrinting] = useState(false);
  const [preset, setPreset] = useState<LabelPreset>("a4_3x8");
  const [pageMarginMm, setPageMarginMm] = useState(10);
  const [gapMm, setGapMm] = useState(3);
  const [showPrice, setShowPrice] = useState(false);

  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: !!companyId,
  });

  const products = useMemo(() => productsQ.data ?? [], [productsQ.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = p.name.toLowerCase();
      const sku = (p.sku ?? "").toLowerCase();
      const barcode = (p.barcode ?? "").toLowerCase();
      return name.includes(q) || sku.includes(q) || barcode.includes(q);
    });
  }, [products, search]);

  const selectedRows = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const out: Array<{ product: ProductItem; qty: number; barcode: string }> = [];
    for (const [id, qty] of Object.entries(selected)) {
      const p = byId.get(id);
      if (!p) continue;
      const barcode = normalizedBarcode(p);
      if (!barcode) continue;
      out.push({ product: p, qty: clampQty(qty), barcode });
    }
    return out;
  }, [products, selected]);
  const previewLabels = useMemo(() => {
    const items: Array<{ name: string; barcode: string; svg: string }> = [];
    for (const row of selectedRows) {
      const svg = barcodeSvg(row.barcode);
      if (!svg) continue;
      const price = Number(row.product.sale_price ?? 0);
      const name = showPrice
        ? `${row.product.name} (${price.toLocaleString("fr-FR")} FCFA)`
        : row.product.name;
      items.push({
        name,
        barcode: row.barcode,
        svg,
      });
      if (items.length >= 12) break;
    }
    return items;
  }, [selectedRows, showPrice]);

  const totalLabels = selectedRows.reduce((acc, r) => acc + r.qty, 0);
  const selectableFiltered = filtered;
  const allFilteredSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((p) => selected[p.id] && selected[p.id] > 0);
  const cfg = LABEL_CONFIGS[preset];
  const selectedMissing = useMemo(
    () =>
      selectedRows.filter((r) => !(r.product.barcode ?? "").trim()),
    [selectedRows],
  );
  const saveMissingMut = useMutation({
    mutationFn: async () => {
      const used = new Set(
        products
          .map((p) => (p.barcode ?? "").trim())
          .filter((s) => s.length > 0)
          .map((s) => s.toUpperCase()),
      );
      const targets = [...selectedMissing].sort((a, b) =>
        a.product.name.localeCompare(b.product.name, "fr", { sensitivity: "base" }),
      );
      for (const row of targets) {
        const next = buildPersistedBarcode(row.product, used);
        await setProductBarcode(row.product.id, next);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      toast.success("Codes-barres manquants enregistrés.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function toggleProduct(p: ProductItem, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        next[p.id] = clampQty(next[p.id] ?? 1);
      } else {
        delete next[p.id];
      }
      return next;
    });
  }

  function setQty(productId: string, qty: number) {
    setSelected((prev) => {
      if (!prev[productId]) return prev;
      return { ...prev, [productId]: clampQty(qty) };
    });
  }

  function toggleAllFiltered(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        for (const p of selectableFiltered) {
          next[p.id] = clampQty(next[p.id] ?? 1);
        }
      } else {
        for (const p of selectableFiltered) {
          delete next[p.id];
        }
      }
      return next;
    });
  }

  function onPrint() {
    if (selectedRows.length === 0) {
      toast.error("Sélectionnez au moins un produit avec code-barres.");
      return;
    }
    // Ouvre la fenêtre immédiatement dans le contexte du clic
    // pour éviter le blocage popup navigateur.
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Le navigateur a bloqué la fenêtre d'impression.");
      return;
    }
    setPrinting(true);
    try {
      const labels: Array<{ name: string; barcode: string; svg: string }> = [];
      for (const row of selectedRows) {
        const svg = barcodeSvg(row.barcode);
        if (!svg) continue;
        const name = row.product.name;
        const price = Number(row.product.sale_price ?? 0);
        for (let i = 0; i < row.qty; i += 1) {
          labels.push({
            name: showPrice ? `${name} (${price.toLocaleString("fr-FR")} FCFA)` : name,
            barcode: row.barcode,
            svg,
          });
        }
      }
      if (labels.length === 0) {
        toast.error("Impossible de générer les codes-barres pour cette sélection.");
        w.close();
        return;
      }

      const rowsHtml = labels
        .map(
          (item) => `
            <div class="label">
              <div class="name">${esc(item.name)}</div>
              <div class="barcode">${item.svg}</div>
              <div class="meta">${esc(item.barcode)}</div>
            </div>
          `,
        )
        .join("");

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Code Barre - Impression</title>
  <style>
    @page { size: A4; margin: ${Math.max(0, pageMarginMm)}mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111; }
    .sheet {
      display: grid;
      grid-template-columns: repeat(${cfg.cols}, ${cfg.widthMm}mm);
      gap: ${Math.max(0, gapMm)}mm;
      justify-content: center;
      padding: 0;
    }
    .label {
      width: ${cfg.widthMm}mm;
      height: ${cfg.heightMm}mm;
      border: 1px dashed #d1d5db;
      padding: 2mm;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .name {
      font-size: 10px;
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 1.5mm;
    }
    .barcode { display: flex; align-items: center; justify-content: center; min-height: 13mm; }
    .barcode svg { width: 100%; height: auto; }
    .meta {
      font-size: 9px;
      text-align: center;
      margin-top: 1mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="sheet">${rowsHtml}</div>
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`;

      w.document.open();
      w.document.write(html);
      w.document.close();
    } finally {
      setPrinting(false);
    }
  }

  if (ctx.isLoading || productsQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
      </div>
    );
  }

  if (productsQ.isError) {
    return (
      <FsPage>
        <FsScreenHeader title="Code Barre" subtitle="Impression d'étiquettes produits" className="mb-0" />
        <FsCard padding="p-4" className="mt-4 text-sm text-red-700">
          {messageFromUnknownError(productsQ.error)}
        </FsCard>
      </FsPage>
    );
  }

  if (!helpers?.canBarcodes) {
    return (
      <FsPage>
        <FsScreenHeader title="Code Barre" subtitle="Impression d'étiquettes produits" className="mb-0" />
        <FsCard padding="p-5" className="mt-4 text-sm text-neutral-600">
          Accès réservé au propriétaire, ou avec la permission &quot;Code Barre&quot;.
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage className="flex flex-col">
      <FsScreenHeader title="Code Barre" subtitle="Imprimer des étiquettes code-barres par produit" className="mb-0" />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => toggleAllFiltered(!allFilteredSelected)}
          className="rounded-xl border border-black/10 bg-fs-card px-3 py-2 text-sm font-semibold text-neutral-800"
        >
          {allFilteredSelected ? "Tout désélectionner" : "Tout sélectionner (filtre)"}
        </button>
        <button
          type="button"
          onClick={() => setSelected({})}
          className="rounded-xl border border-black/10 bg-fs-card px-3 py-2 text-sm font-semibold text-neutral-700"
        >
          Vider la sélection
        </button>
        <button
          type="button"
          onClick={onPrint}
          disabled={printing || totalLabels <= 0}
          className="inline-flex items-center gap-2 rounded-xl bg-fs-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <MdLocalPrintshop className="h-5 w-5" aria-hidden />
          {printing ? "Préparation..." : `Imprimer (${totalLabels})`}
        </button>
        <button
          type="button"
          onClick={() => saveMissingMut.mutate()}
          disabled={saveMissingMut.isPending || selectedMissing.length <= 0}
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
        >
          {saveMissingMut.isPending
            ? "Enregistrement..."
            : `Enregistrer codes manquants (${selectedMissing.length})`}
        </button>
      </div>
      <FsCard padding="p-4" className="mt-3">
        <div className="grid gap-3 min-[900px]:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700">Format</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as LabelPreset)}
              className={fsInputClass()}
            >
              <option value="a4_3x8">A4 3x8 (63x33 mm)</option>
              <option value="40x25">40x25 mm (4 colonnes)</option>
              <option value="50x30">50x30 mm (3 colonnes)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700">Marge page (mm)</span>
            <input
              type="number"
              min={0}
              max={20}
              value={pageMarginMm}
              onChange={(e) => setPageMarginMm(Number(e.target.value || "0"))}
              className={fsInputClass()}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700">Espacement (mm)</span>
            <input
              type="number"
              min={0}
              max={10}
              value={gapMm}
              onChange={(e) => setGapMm(Number(e.target.value || "0"))}
              className={fsInputClass()}
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm font-medium text-neutral-700">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(e) => setShowPrice(e.target.checked)}
            />
            Afficher le prix
          </label>
        </div>
        <div className="mt-3 text-xs text-neutral-500">
          Aperçu: {cfg.cols} colonnes, étiquette {cfg.widthMm}x{cfg.heightMm} mm.
        </div>
        <div className="mt-3 rounded-xl border border-black/10 bg-fs-surface p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Aperçu visuel (miniature)
          </div>
          {previewLabels.length > 0 ? (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` }}
            >
              {previewLabels.map((item, idx) => (
                <div
                  key={`${item.barcode}-${idx}`}
                  className="min-h-[84px] overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-white p-2"
                >
                  <div className="truncate text-[10px] font-bold text-neutral-800">
                    {item.name}
                  </div>
                  <div
                    className="mt-1 [&>svg]:h-7 [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: item.svg }}
                  />
                  <div className="truncate text-[10px] text-neutral-600">{item.barcode}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-4 text-xs text-neutral-500">
              Sélectionnez des produits pour voir l&apos;aperçu avant impression.
            </div>
          )}
        </div>
      </FsCard>

      <div className="relative mt-3">
        <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher nom, SKU, code-barres..."
          className={fsInputClass("pl-9")}
        />
      </div>

      <FsCard padding="p-0" className="mt-4 overflow-hidden">
        <div className="max-h-[64vh] overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-fs-surface-container">
              <tr className="text-left text-neutral-600">
                <th className="whitespace-nowrap px-3 py-2">Sel.</th>
                <th className="whitespace-nowrap px-3 py-2">Miniat</th>
                <th className="whitespace-nowrap px-3 py-2">Produit</th>
                <th className="whitespace-nowrap px-3 py-2">SKU</th>
                <th className="whitespace-nowrap px-3 py-2">Code-barres</th>
                <th className="whitespace-nowrap px-3 py-2">Qté étiquettes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const rawBarcode = (p.barcode ?? "").trim();
                const hasRawBarcode = rawBarcode.length > 0;
                const checked = !!selected[p.id];
                const thumbUrl = firstProductImageUrl(p);
                return (
                  <tr key={p.id} className="border-t border-black/6">
                    <td className="whitespace-nowrap px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleProduct(p, e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-[#f97316]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <ProductListThumbnail imageUrl={thumbUrl} className="h-10 w-10 rounded-lg" />
                    </td>
                    <td className="max-w-[320px] whitespace-nowrap px-3 py-2">
                      <div className="truncate whitespace-nowrap font-medium text-fs-text">{p.name}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-neutral-600">{p.sku ?? "—"}</td>
                    <td className="max-w-[260px] whitespace-nowrap px-3 py-2">
                      {hasRawBarcode ? (
                        <span className="block truncate whitespace-nowrap font-mono text-xs">{rawBarcode}</span>
                      ) : (
                        <span className="inline-block max-w-full truncate whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                          Auto: {normalizedBarcode(p)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={selected[p.id] ?? 1}
                        disabled={!checked}
                        onChange={(e) => setQty(p.id, Number(e.target.value || "1"))}
                        className={cn(fsInputClass("h-9 w-24"), !checked && "opacity-50")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-neutral-600">
              <MdInventory2 className="mx-auto mb-2 h-8 w-8 text-neutral-300" aria-hidden />
              Aucun produit trouvé.
            </div>
          ) : null}
        </div>
      </FsCard>
    </FsPage>
  );
}
