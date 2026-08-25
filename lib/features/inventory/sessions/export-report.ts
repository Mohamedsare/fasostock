"use client";

import { printInvoicePdf } from "@/lib/features/invoices/generate-invoice-pdf";
import { fetchInventorySessionPdfBlob } from "@/lib/features/pdf/pdf-api-client";
import { toast } from "@/lib/toast";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

export type InventoryReportMode = "print" | "download";

const STATUS_LABELS: Record<"open" | "closed" | "cancelled", string> = {
  open: "En cours",
  closed: "Validé",
  cancelled: "Annulé",
};

/** Date + heure au fuseau de l'entreprise : le serveur de rendu n'en a aucun. */
export function formatInventoryDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", {
    timeZone: getActiveTimeZone(),
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileSlug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "inventaire"
  );
}

export type InventoryReportParams = {
  companyId: string;
  companyName: string;
  companyLogoUrl?: string | null;
  /** « Boutique » ou « Dépôt ». */
  scopeKind: string;
  scopeName: string;
  sessionNote: string | null;
  status: "open" | "closed" | "cancelled";
  startedAt: string;
  closedAt: string | null;
  countedByLabel?: string | null;
  rows: Array<{
    productName: string;
    expectedQty: number;
    countedQty: number | null;
    unitPurchasePrice: number;
  }>;
};

/**
 * Sort le rapport d'inventaire : impression directe ou téléchargement.
 *
 * Le même document dans les deux cas — imprimer et archiver doivent donner la même
 * pièce, sinon deux personnes comparant leur copie ne parlent pas du même inventaire.
 * Les erreurs remontent à l'appelant, qui les affiche avec son écran d'origine.
 */
export async function exportInventorySessionReport(
  mode: InventoryReportMode,
  params: InventoryReportParams,
): Promise<void> {
  const startedLabel = formatInventoryDateTime(params.startedAt) ?? "—";
  const closedLabel = formatInventoryDateTime(params.closedAt);
  const sessionTitle =
    params.sessionNote?.trim() ||
    `Inventaire du ${formatInventoryDateTime(params.startedAt) ?? "—"}`;

  const blob = await fetchInventorySessionPdfBlob({
    companyId: params.companyId,
    companyName: params.companyName || "Entreprise",
    companyLogoUrl: params.companyLogoUrl ?? null,
    scopeName: params.scopeName || params.scopeKind,
    scopeKind: params.scopeKind,
    sessionTitle,
    statusLabel: STATUS_LABELS[params.status],
    status: params.status,
    startedLabel,
    closedLabel,
    generatedLabel: formatInventoryDateTime(new Date().toISOString()) ?? "",
    countedByLabel: params.countedByLabel ?? null,
    rows: params.rows,
  });

  if (mode === "print") {
    printInvoicePdf(blob);
    toast.success(
      "Fenêtre d'impression lancée. Si rien ne sort, utilisez Ctrl+P dans l'onglet PDF.",
    );
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inventaire-${fileSlug(params.scopeName)}-${params.startedAt.slice(0, 10)}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("Rapport d'inventaire téléchargé.");
}
