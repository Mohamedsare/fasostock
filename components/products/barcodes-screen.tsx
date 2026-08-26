"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCodeLib from "qrcode";
import QRCode from "react-qr-code";
import {
  MdDeleteSweep,
  MdInventory2,
  MdLocalPrintshop,
  MdQrCode2,
  MdSearch,
} from "react-icons/md";
import { FsCard, FsPage, FsScreenHeader, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { listProducts, setProductBarcode } from "@/lib/features/products/api";
import { productNameMatches } from "@/lib/features/products/search-aliases";
import type { ProductItem } from "@/lib/features/products/types";
import {
  ProductListThumbnail,
  firstProductImageUrl,
} from "@/components/products/product-list-thumbnail";
import { LabelPrintOptionsPanel } from "@/components/products/label-print-options";
import {
  buildLabelsPrintHtml,
  defaultLabelPrintOptions,
  labelPaddingMm,
  labelsPerPage,
  pageCountFor,
  sanitizeLabelPrintOptions,
  type LabelPrintData,
  type LabelPrintOptions,
} from "@/lib/features/products/label-print";
import { queryKeys } from "@/lib/query/query-keys";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { toFriendlyError } from "@/lib/utils/friendly-error";

type SelectedMap = Record<string, number>;

/** Réglages d'impression : propres à CE poste (l'imprimante n'est pas la même partout). */
const PRINT_OPTIONS_KEY = "fs.barcodes.print-options.v1";
/** Écritures simultanées lors des traitements en masse — assez pour aller vite, pas trop pour la base. */
const BULK_CHUNK = 8;

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

async function qrSvg(value: string): Promise<string | null> {
  try {
    return await QRCodeLib.toString(value, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

function clampQty(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 1) return 1;
  if (v > 500) return 500;
  return Math.floor(v);
}

/**
 * Traitement en masse par petits paquets : un catalogue entier peut compter des
 * milliers de produits, et les envoyer un par un prendrait plusieurs minutes.
 */
async function runInChunks<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
  onProgress: (done: number) => void,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
    onProgress(Math.min(i + size, items.length));
  }
}

function friendlyToast(e: unknown, fallbackTitle: string) {
  const f = toFriendlyError(e, fallbackTitle);
  toast.blocked({
    title: f.title,
    message: f.hint || "Réessayez dans un instant.",
  });
}

/** Aperçu à la taille réelle de l'étiquette, contenu compris. */
function LabelPreview({ item, options }: { item: LabelPrintData; options: LabelPrintOptions }) {
  const pad = labelPaddingMm(options);
  const qrPx = Math.max(24, Math.round(options.qrMm * (96 / 25.4)));
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-md bg-white text-black",
        options.showCutMarks ? "border border-dashed border-neutral-500" : "border border-dashed border-neutral-300",
      )}
      style={{
        width: `${options.widthMm}mm`,
        height: `${options.heightMm}mm`,
        padding: `${pad}mm`,
      }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center text-center">
        {options.showName ? (
          <div
            style={{
              fontSize: `${options.nameSizePt}pt`,
              fontWeight: 700,
              lineHeight: 1.15,
              width: "100%",
              wordBreak: "break-word",
              display: "-webkit-box",
              WebkitLineClamp: options.nameLines,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              marginBottom: "0.6mm",
            }}
          >
            {item.name}
          </div>
        ) : null}
        {options.showPrice ? (
          <div
            className="w-full truncate"
            style={{
              fontSize: `${options.nameSizePt + 0.5}pt`,
              fontWeight: 900,
              marginBottom: "0.6mm",
            }}
          >
            {item.priceLabel}
          </div>
        ) : null}
        <QRCode
          value={item.code}
          level="M"
          size={qrPx}
          style={{ width: `${options.qrMm}mm`, height: `${options.qrMm}mm` }}
        />
        {options.showCode ? (
          <div
            className="w-full truncate"
            style={{ fontSize: `${options.codeSizePt}pt`, marginTop: "0.6mm" }}
          >
            {item.code}
          </div>
        ) : null}
        {options.showSku && item.sku ? (
          <div
            className="w-full truncate"
            style={{ fontSize: `${Math.max(3, options.codeSizePt - 0.5)}pt` }}
          >
            {item.sku}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BarcodesScreen() {
  const ctx = useAppContext();
  const { helpers } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedMap>({});
  const [printing, setPrinting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveAllConfirm, setShowSaveAllConfirm] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [printOptions, setPrintOptions] = useState<LabelPrintOptions>(defaultLabelPrintOptions);

  // Lu après le montage : le HTML serveur ne connaît pas le localStorage du poste.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PRINT_OPTIONS_KEY);
      if (raw) setPrintOptions(sanitizeLabelPrintOptions(JSON.parse(raw)));
    } catch {
      /* réglage illisible : on garde le format par défaut */
    }
  }, []);

  const updatePrintOptions = useCallback((next: LabelPrintOptions) => {
    setPrintOptions(next);
    try {
      window.localStorage.setItem(PRINT_OPTIONS_KEY, JSON.stringify(next));
    } catch {
      /* navigation privée : le réglage ne survivra pas à la page, sans plus */
    }
  }, []);

  const productsQ = useQuery({
    queryKey: queryKeys.products(companyId),
    queryFn: () => listProducts(companyId),
    enabled: !!companyId,
  });

  const products = useMemo(() => productsQ.data ?? [], [productsQ.data]);
  // « Autres noms » : même recherche qu'ailleurs quand le propriétaire l'a activée.
  const productAliasesOn = ctx.data?.productAliasesEnabled === true;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const sku = (p.sku ?? "").toLowerCase();
      const barcode = (p.barcode ?? "").toLowerCase();
      return (
        productNameMatches(p, q, productAliasesOn) ||
        sku.includes(q) ||
        barcode.includes(q)
      );
    });
  }, [products, search, productAliasesOn]);

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
    const items: LabelPrintData[] = [];
    for (const row of selectedRows) {
      items.push({
        name: row.product.name,
        priceLabel: formatCurrency(Number(row.product.sale_price ?? 0)),
        code: row.barcode,
        sku: row.product.sku ?? "",
        svg: "",
      });
      if (items.length >= 6) break;
    }
    return items;
  }, [selectedRows]);

  const totalLabels = selectedRows.reduce((acc, r) => acc + r.qty, 0);
  const pageCount = pageCountFor(totalLabels, printOptions);
  const perPage = labelsPerPage(printOptions);
  const selectableFiltered = filtered;
  const allFilteredSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((p) => selected[p.id] && selected[p.id] > 0);
  const productsWithBarcodes = useMemo(
    () => products.filter((p) => (p.barcode ?? "").trim().length > 0),
    [products],
  );
  // Tout le catalogue, pas seulement la sélection : « enregistrer tous les codes manquants ».
  const productsMissingBarcode = useMemo(
    () => products.filter((p) => !(p.barcode ?? "").trim()),
    [products],
  );

  const busy = progress !== null;

  const clearAllBarcodesMut = useMutation({
    mutationFn: async () => {
      const targets = productsWithBarcodes;
      setProgress({ done: 0, total: targets.length });
      await runInChunks(
        targets,
        BULK_CHUNK,
        (p) => setProductBarcode(p.id, ""),
        (done) => setProgress({ done, total: targets.length }),
      );
      return targets.length;
    },
    onSuccess: async (count) => {
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      setShowClearConfirm(false);
      setProgress(null);
      toast.success(`${count} code(s)-barres supprimé(s) avec succès.`);
    },
    onError: (e) => {
      setProgress(null);
      setShowClearConfirm(false);
      friendlyToast(e, "Suppression impossible");
    },
  });

  /** Génère ET enregistre le code de TOUS les produits qui n'en ont pas encore. */
  const saveAllMissingMut = useMutation({
    mutationFn: async () => {
      const used = new Set(
        products
          .map((p) => (p.barcode ?? "").trim())
          .filter((s) => s.length > 0)
          .map((s) => s.toUpperCase()),
      );
      const jobs = [...productsMissingBarcode]
        .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
        .map((product) => ({ id: product.id, code: buildPersistedBarcode(product, used) }));
      setProgress({ done: 0, total: jobs.length });
      await runInChunks(
        jobs,
        BULK_CHUNK,
        (job) => setProductBarcode(job.id, job.code),
        (done) => setProgress({ done, total: jobs.length }),
      );
      return jobs.length;
    },
    onSuccess: async (count) => {
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      setShowSaveAllConfirm(false);
      setProgress(null);
      toast.success(`${count} code(s)-barres enregistré(s).`);
    },
    onError: (e) => {
      setProgress(null);
      setShowSaveAllConfirm(false);
      friendlyToast(e, "Enregistrement impossible");
    },
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

  async function onPrint() {
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

    // Auto-sauvegarde : les produits sans barcode enregistré reçoivent leur code généré.
    // Fait en arrière-plan (non-bloquant) pour ne pas retarder l'impression.
    const toSave = selectedRows.filter((r) => !(r.product.barcode ?? "").trim());
    if (toSave.length > 0) {
      void (async () => {
        try {
          await runInChunks(
            toSave,
            BULK_CHUNK,
            (row) => setProductBarcode(row.product.id, row.barcode),
            () => {},
          );
          await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
        } catch {
          /* non-bloquant */
        }
      })();
    }

    setPrinting(true);
    try {
      const svgByCode = new Map<string, string>();
      const labels: LabelPrintData[] = [];
      for (const row of selectedRows) {
        let svg = svgByCode.get(row.barcode);
        if (svg === undefined) {
          const generated = await qrSvg(row.barcode);
          if (!generated) continue;
          svg = generated;
          svgByCode.set(row.barcode, generated);
        }
        const item: LabelPrintData = {
          name: row.product.name,
          priceLabel: formatCurrency(Number(row.product.sale_price ?? 0)),
          code: row.barcode,
          sku: row.product.sku ?? "",
          svg,
        };
        for (let i = 0; i < row.qty; i += 1) labels.push(item);
      }
      if (labels.length === 0) {
        toast.error("Impossible de générer les codes QR pour cette sélection.");
        w.close();
        return;
      }

      const html = buildLabelsPrintHtml(labels, printOptions);
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
          {toFriendlyError(productsQ.error, "Chargement impossible").title}
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
          onClick={() => void onPrint()}
          disabled={printing || totalLabels <= 0}
          className="inline-flex items-center gap-2 rounded-xl bg-fs-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <MdLocalPrintshop className="h-5 w-5" aria-hidden />
          {printing ? "Préparation..." : `Imprimer (${totalLabels})`}
        </button>
        <button
          type="button"
          onClick={() => setShowSaveAllConfirm(true)}
          disabled={busy || productsMissingBarcode.length <= 0}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
        >
          <MdQrCode2 className="h-5 w-5" aria-hidden />
          {productsMissingBarcode.length > 0
            ? `Enregistrer tous les codes manquants (${productsMissingBarcode.length})`
            : "Tous les produits ont un code"}
        </button>
        <button
          type="button"
          title="Vider tous les codes-barres"
          aria-label="Vider tous les codes-barres"
          onClick={() => setShowClearConfirm(true)}
          disabled={busy || productsWithBarcodes.length === 0}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          <MdDeleteSweep className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <FsCard padding="p-4" className="mt-3">
        <LabelPrintOptionsPanel options={printOptions} onChange={updatePrintOptions} />

        <div className="mt-3 text-xs text-neutral-500">
          {totalLabels > 0
            ? printOptions.pageMode === "sheet"
              ? `${totalLabels} étiquette(s) — ${perPage} par feuille A4, soit ${pageCount} feuille(s).`
              : `${totalLabels} étiquette(s) — 1 par page de ${printOptions.widthMm} × ${printOptions.heightMm} mm.`
            : "Sélectionnez des produits dans la liste pour préparer l'impression."}
        </div>

        <div className="mt-3 rounded-xl border border-black/10 bg-fs-surface p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Aperçu à la taille réelle
          </div>
          {previewLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2 overflow-x-auto">
              {previewLabels.map((item, idx) => (
                <LabelPreview key={`${item.code}-${idx}`} item={item} options={printOptions} />
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
          className={fsInputClass("pl-10")}
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

      {showSaveAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-fs-card p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <MdQrCode2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
              </div>
              <div>
                <h3 className="font-black text-fs-text">Enregistrer tous les codes manquants ?</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Un code-barres sera généré et enregistré pour les{" "}
                  <span className="font-bold text-emerald-700">
                    {productsMissingBarcode.length} produit(s)
                  </span>{" "}
                  qui n&apos;en ont pas encore, dans tout le catalogue. Les produits qui ont déjà
                  un code ne sont pas touchés.
                </p>
              </div>
            </div>
            {progress ? (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-center text-xs font-semibold text-neutral-600">
                  {progress.done} / {progress.total}
                </div>
              </div>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowSaveAllConfirm(false)}
                disabled={saveAllMissingMut.isPending}
                className="flex-1 rounded-xl border border-black/10 bg-fs-surface px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-fs-surface-container disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => saveAllMissingMut.mutate()}
                disabled={saveAllMissingMut.isPending}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saveAllMissingMut.isPending ? "Enregistrement..." : "Oui, tout enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-fs-card p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <MdDeleteSweep className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden />
              </div>
              <div>
                <h3 className="font-black text-fs-text">Vider tous les codes-barres ?</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Cette action supprimera définitivement les codes-barres de{" "}
                  <span className="font-bold text-red-600">{productsWithBarcodes.length} produit(s)</span>.
                  Elle est irréversible.
                </p>
              </div>
            </div>
            {progress ? (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all"
                    style={{
                      width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-center text-xs font-semibold text-neutral-600">
                  {progress.done} / {progress.total}
                </div>
              </div>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearAllBarcodesMut.isPending}
                className="flex-1 rounded-xl border border-black/10 bg-fs-surface px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-fs-surface-container disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => clearAllBarcodesMut.mutate()}
                disabled={clearAllBarcodesMut.isPending}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
              >
                {clearAllBarcodesMut.isPending ? "Suppression..." : "Oui, tout vider"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FsPage>
  );
}
