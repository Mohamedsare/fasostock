"use client";

import { useCallback, useState } from "react";
import {
  getProductsCsvModelTemplate,
  parseProductsCsv,
} from "@/lib/features/products/csv";
import { importProductsFromCsv } from "@/lib/features/products/import-from-csv";
import { downloadCsv } from "@/lib/utils/csv";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { MdDownload, MdUploadFile } from "react-icons/md";

export function ImportProductsCsvDialog({
  companyId,
  storeId,
  onClose,
  onSuccess,
}: {
  companyId: string;
  storeId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result ?? "");
        const rows = parseProductsCsv(raw);
        setText(raw);
        setFileName(file.name);
        setPreviewCount(rows.length);
        setPreviewError(
          rows.length === 0
            ? "Aucune ligne produit valide. Vérifiez le format (header : nom, sku, …)."
            : null,
        );
        setImportErrors([]);
      } catch {
        setPreviewError("Fichier invalide.");
        setPreviewCount(null);
        setText(null);
      }
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const onPickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.txt,text/csv";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) parseFile(f);
    };
    input.click();
  };

  const onImport = async () => {
    if (!text || previewCount === null || previewCount === 0) return;
    const rows = parseProductsCsv(text);
    if (rows.length === 0) return;
    setImporting(true);
    setImportErrors([]);
    setProgress({ current: 0, total: rows.length });
    try {
      const result = await importProductsFromCsv(companyId, rows, {
        storeId,
        onProgress: (current, total) =>
          setProgress({ current, total }),
      });
      setImportErrors(result.errors);
      if (result.created > 0) {
        onSuccess();
        if (result.errors.length === 0) {
          toast.success(
            result.created === 1
              ? "1 produit importé"
              : `${result.created} produits importés`,
          );
          onClose();
        } else {
          toast.info(
            `Import partiel : ${result.created} produit(s) importé(s), ${result.errors.length} erreur(s).`,
          );
        }
      } else if (result.errors.length > 0) {
        toast.error(
          `${result.errors.length} erreur(s) lors de l’import. Vérifiez les détails ci-dessous.`,
        );
      }
    } catch (e) {
      const msg = messageFromUnknownError(e);
      setImportErrors([msg]);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-fs-card p-4 shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-labelledby="import-csv-title"
      >
        <h3 id="import-csv-title" className="text-lg font-bold text-fs-text">
          Importer des produits (CSV)
        </h3>
        <p className="mt-2 text-sm text-neutral-600">
          Colonnes : nom, sku, code_barres, unite, prix_achat, prix_vente,
          stock_min, description, actif, categorie, marque. Optionnel :{" "}
          stock_entrant.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv("modele-import-produits.csv", getProductsCsvModelTemplate())
            }
            className="fs-touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.12] px-4 py-3 text-sm font-semibold text-neutral-800"
          >
            <MdDownload className="h-5 w-5 shrink-0" aria-hidden />
            Télécharger le modèle CSV (exemple de remplissage)
          </button>
          <button
            type="button"
            onClick={onPickFile}
            disabled={importing}
            className="fs-touch-target inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-black/[0.12] px-4 py-3 text-sm font-semibold text-neutral-800"
          >
            <MdUploadFile className="h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate text-left">
              {fileName ?? "Choisir un fichier CSV"}
            </span>
          </button>
        </div>

        {importing && progress.total > 0 ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded bg-neutral-200">
              <div
                className="h-full bg-fs-accent transition-[width]"
                style={{
                  width: `${Math.min(1, progress.current / Math.max(1, progress.total)) * 100}%`,
                }}
              />
            </div>
            <p className="mt-2 text-center text-xs font-medium text-neutral-600">
              Import en cours… {progress.current} / {progress.total}
            </p>
          </div>
        ) : null}

        {previewCount != null && !importing ? (
          <p className="mt-3 text-sm text-neutral-600">
            {previewCount} ligne(s) produit(s) détectée(s)
          </p>
        ) : null}
        {previewError ? (
          <p className="mt-2 text-sm text-red-600">{previewError}</p>
        ) : null}
        {importErrors.length > 0 ? (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            <p className="font-semibold">Erreurs :</p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              {importErrors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            {importErrors.length > 10 ? (
              <p className="mt-1 text-neutral-600">
                … et {importErrors.length - 10} autre(s)
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="flex-1 rounded-xl border border-black/[0.1] px-3 py-3 text-sm font-semibold"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={
              importing ||
              previewCount == null ||
              previewCount === 0 ||
              !!previewError
            }
            onClick={() => void onImport()}
            className="flex-1 rounded-xl bg-fs-accent px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {importing ? "Import…" : "Importer"}
          </button>
        </div>
      </div>
    </div>
  );
}
