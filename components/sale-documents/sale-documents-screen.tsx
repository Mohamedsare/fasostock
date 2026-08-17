"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdDescription,
  MdLock,
  MdPerson,
  MdSearch,
  MdSwapHoriz,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import {
  convertQuoteToInvoice,
  createSaleDocument,
  deleteSaleDocument,
  duplicateSaleDocument,
  expireDueSaleDocuments,
  issueSaleDocument,
  listSaleDocuments,
  setSaleDocumentStatus,
  updateSaleDocument,
} from "@/lib/features/sale-documents/api";
import {
  daysUntilExpiry,
  isSaleDocumentLocked,
  saleDocumentCustomerLabel,
  saleDocumentRemaining,
  type SaleDocument,
  type SaleDocumentInput,
  type SaleDocumentKind,
  type SaleDocumentLineDraft,
  type SaleDocumentStatus,
} from "@/lib/features/sale-documents/types";
import { listProducts, listStoreInventory } from "@/lib/features/products/api";
import { listCustomers } from "@/lib/features/customers/api";
import { listStores } from "@/lib/features/stores/api";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { SaleDocumentEditorDialog } from "./sale-document-editor-dialog";
import { SaleDocumentDetailDialog } from "./sale-document-detail-dialog";
import { SaleDocumentIssueDialog } from "./sale-document-issue-dialog";
import { SaleDocumentStatusPill } from "./sale-document-status-pill";

type Tab = SaleDocumentKind;

type QuoteFilter = "live" | "accepted" | "lost" | "all";
type InvoiceFilter = "todo" | "unpaid" | "issued" | "all";

const QUOTE_FILTERS: { id: QuoteFilter; label: string }[] = [
  { id: "live", label: "En cours" },
  { id: "accepted", label: "Acceptés" },
  { id: "lost", label: "Sans suite" },
  { id: "all", label: "Tous" },
];

const INVOICE_FILTERS: { id: InvoiceFilter; label: string }[] = [
  { id: "todo", label: "À émettre" },
  { id: "unpaid", label: "Impayées" },
  { id: "issued", label: "Émises" },
  { id: "all", label: "Toutes" },
];

function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function SaleDocumentsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const canView = h?.canSaleDocuments ?? false;

  const [tab, setTab] = useState<Tab>("quote");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("live");
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("todo");
  const [search, setSearch] = useState("");

  const [creating, setCreating] = useState<SaleDocumentKind | null>(null);
  const [editing, setEditing] = useState<SaleDocument | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<SaleDocument | null>(null);
  const [deleting, setDeleting] = useState<SaleDocument | null>(null);

  const enabled = !!companyId && canView;

  const documentsQ = useQuery({
    queryKey: queryKeys.saleDocuments(companyId, storeId),
    queryFn: () => listSaleDocuments({ companyId, storeId }),
    enabled,
    staleTime: 30_000,
  });

  /**
   * Les devis périmés sont marqués côté serveur à l'ouverture de la page.
   * Le faire à l'affichage aurait laissé un devis « en cours » sur un autre appareil
   * et sur le PDF — or la péremption n'est pas une nuance de présentation.
   */
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void expireDueSaleDocuments(companyId)
      .then((count) => {
        if (!cancelled && count > 0) {
          void qc.invalidateQueries({ queryKey: queryKeys.saleDocuments(companyId, storeId) });
        }
      })
      .catch(() => {
        // Sans conséquence : la page reste utilisable, seuls les libellés « expiré »
        // attendront le prochain passage.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, companyId, storeId, qc]);

  const dialogOpen = creating != null || editing != null;

  const productsQ = useQuery({
    queryKey: ["sale-documents", "products", companyId],
    queryFn: () => listProducts(companyId),
    enabled: enabled && dialogOpen,
    staleTime: 60_000,
  });

  const inventoryQ = useQuery({
    queryKey: ["sale-documents", "inventory", storeId],
    queryFn: () => listStoreInventory(storeId),
    enabled: enabled && dialogOpen && !!storeId,
    staleTime: 30_000,
  });

  const customersQ = useQuery({
    queryKey: ["sale-documents", "customers", companyId],
    queryFn: () => listCustomers(companyId),
    enabled: enabled && dialogOpen,
    staleTime: 60_000,
  });

  // Conditions de règlement de la boutique : pré-remplies plutôt que retapées à
  // chaque devis. C'est la mention que tout le monde oublie et que tout le monde veut.
  const storesQ = useQuery({
    queryKey: ["sale-documents", "stores", companyId],
    queryFn: () => listStores(companyId),
    enabled: enabled && dialogOpen,
    staleTime: 5 * 60_000,
  });

  const defaultTerms = useMemo(() => {
    const store = (storesQ.data ?? []).find((s) => s.id === storeId);
    return store?.payment_terms?.trim() || null;
  }, [storesQ.data, storeId]);

  const productOptions = useMemo(() => {
    const stock = inventoryQ.data ?? {};
    return (productsQ.data ?? [])
      .filter((p) => p.is_active !== false)
      .map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit || "u",
        salePrice: Number(p.sale_price ?? 0),
        stock: Math.trunc(Number(stock[p.id] ?? 0)),
      }));
  }, [productsQ.data, inventoryQ.data]);

  const customerOptions = useMemo(
    () =>
      (customersQ.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
      })),
    [customersQ.data],
  );

  const documents = useMemo(() => documentsQ.data ?? [], [documentsQ.data]);
  const openedDocument = useMemo(
    () => documents.find((d) => d.id === opened) ?? null,
    [documents, opened],
  );

  const quotes = useMemo(() => documents.filter((d) => d.kind === "quote"), [documents]);
  const invoices = useMemo(() => documents.filter((d) => d.kind === "invoice"), [documents]);

  const visible = useMemo(() => {
    const pool = tab === "quote" ? quotes : invoices;
    const needle = search.trim().toLowerCase();

    const filtered = pool.filter((d) => {
      if (tab === "quote") {
        if (quoteFilter === "live" && !["draft", "sent"].includes(d.status)) return false;
        if (quoteFilter === "accepted" && !["accepted", "converted"].includes(d.status)) {
          return false;
        }
        if (quoteFilter === "lost" && !["refused", "expired", "cancelled"].includes(d.status)) {
          return false;
        }
      } else {
        if (invoiceFilter === "todo" && (d.saleId != null || d.status === "cancelled")) {
          return false;
        }
        if (invoiceFilter === "unpaid" && !(d.saleId != null && saleDocumentRemaining(d) > 0)) {
          return false;
        }
        if (invoiceFilter === "issued" && d.saleId == null) return false;
      }
      if (!needle) return true;
      return [d.number, d.customerName, d.customerPhone, d.subject, d.clientReference]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return filtered;
  }, [tab, quotes, invoices, quoteFilter, invoiceFilter, search]);

  /** Les trois chiffres qu'un patron regarde en ouvrant la page. */
  const counts = useMemo(() => {
    const live = quotes.filter((d) => d.status === "draft" || d.status === "sent");
    const toIssue = invoices.filter((d) => d.saleId == null && d.status !== "cancelled");
    const unpaid = invoices.filter((d) => d.saleId != null && saleDocumentRemaining(d) > 0);
    return {
      liveCount: live.length,
      liveValue: live.reduce((sum, d) => sum + d.total, 0),
      toIssueCount: toIssue.length,
      toIssueValue: toIssue.reduce((sum, d) => sum + d.total, 0),
      unpaidValue: unpaid.reduce((sum, d) => sum + saleDocumentRemaining(d), 0),
    };
  }, [quotes, invoices]);

  function invalidate() {
    void qc.invalidateQueries({ queryKey: queryKeys.saleDocuments(companyId, storeId) });
  }

  const saveMut = useMutation({
    mutationFn: async (params: {
      document: SaleDocument | null;
      input: SaleDocumentInput;
      lines: SaleDocumentLineDraft[];
    }) => {
      if (params.document) {
        await updateSaleDocument({
          documentId: params.document.id,
          companyId,
          input: params.input,
          lines: params.lines,
        });
        return params.document.id;
      }
      if (!storeId) throw new Error("Choisissez d'abord une boutique.");
      return createSaleDocument({
        companyId,
        storeId,
        input: params.input,
        lines: params.lines,
      });
    },
    onSuccess: (id, params) => {
      invalidate();
      setCreating(null);
      setEditing(null);
      // Le document reste ouvert : après l'avoir écrit, on veut l'imprimer ou l'envoyer.
      setOpened(id);
      toast.success(
        params.document
          ? "Document mis à jour."
          : params.input.kind === "quote"
            ? "Devis créé."
            : "Facture créée en brouillon.",
      );
    },
    onError: (e) =>
      toast.error(messageFromUnknownError(e, "Le document n'a pas pu être enregistré.")),
  });

  const statusMut = useMutation({
    mutationFn: (params: { id: string; status: SaleDocumentStatus }) =>
      setSaleDocumentStatus({ documentId: params.id, status: params.status }),
    onSuccess: () => {
      invalidate();
      toast.success("Statut mis à jour.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Le statut n'a pas pu être changé.")),
  });

  const convertMut = useMutation({
    mutationFn: (id: string) => convertQuoteToInvoice(id),
    onSuccess: (newId) => {
      invalidate();
      setTab("invoice");
      setInvoiceFilter("todo");
      setOpened(newId);
      toast.success(
        "Facture créée à partir du devis. Vérifiez-la, puis émettez-la pour enregistrer la vente.",
      );
    },
    onError: (e) =>
      toast.error(messageFromUnknownError(e, "Le devis n'a pas pu être transformé.")),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => duplicateSaleDocument(id),
    onSuccess: (newId) => {
      invalidate();
      setOpened(newId);
      toast.success("Copie créée en brouillon.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "La copie n'a pas pu être créée.")),
  });

  const issueMut = useMutation({
    mutationFn: (params: {
      id: string;
      payments: Array<{ method: "cash" | "mobile_money" | "card" | "other"; amount: number }>;
    }) => issueSaleDocument({ documentId: params.id, payments: params.payments }),
    onSuccess: () => {
      invalidate();
      // L'émission est une vente réelle : stock, ventes et tableau de bord ont bougé.
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      setIssuing(null);
      toast.success("Facture émise. La vente est enregistrée et le stock à jour.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "La facture n'a pas pu être émise.")),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSaleDocument(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      setOpened(null);
      toast.success("Document supprimé.");
    },
    onError: (e) =>
      toast.error(messageFromUnknownError(e, "Le document n'a pas pu être supprimé.")),
  });

  const busyAction =
    statusMut.isPending || convertMut.isPending || duplicateMut.isPending || deleteMut.isPending;

  if (!permLoading && !canView) {
    return (
      <FsPage>
        <FsScreenHeader title="Devis & Factures" />
        <FsCard className="rounded-md sm:rounded-md" padding="p-5">
          <div className="flex items-start gap-3">
            <MdLock className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
            <div>
              <p className="text-sm font-bold text-fs-text">Accès réservé</p>
              <p className="mt-1 text-sm text-neutral-600">
                Les devis et les factures sont ouverts par le propriétaire dans Paramètres,
                puis accordés employé par employé avec le droit « Gérer les devis et
                factures ».
              </p>
            </div>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const isQuoteTab = tab === "quote";

  return (
    <FsPage>
      <FsScreenHeader
        title="Devis & Factures"
        subtitle="Le papier qui part chez le client : ce que vous proposez, puis ce que vous facturez."
      />

      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-2.5">
        <Tile
          label="Devis en attente"
          value={String(counts.liveCount)}
          sub={counts.liveValue > 0 ? formatCurrency(counts.liveValue) : undefined}
        />
        <Tile
          label="Factures à émettre"
          value={String(counts.toIssueCount)}
          sub={counts.toIssueValue > 0 ? formatCurrency(counts.toIssueValue) : undefined}
          tone="accent"
        />
        <Tile label="Reste à encaisser" value={formatCurrency(counts.unpaidValue)} tone="warn" />
      </div>

      {/* Onglets Devis / Factures */}
      <div className="mt-3 flex gap-1.5 rounded-md border border-black/[0.07] bg-fs-card p-1 dark:border-white/10">
        {(
          [
            { id: "quote" as const, label: `Devis (${quotes.length})` },
            { id: "invoice" as const, label: `Factures (${invoices.length})` },
          ]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
              tab === t.id
                ? "bg-fs-accent text-white"
                : "text-neutral-600 hover:text-fs-accent dark:text-neutral-300",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Recherche + filtres */}
      <div className="mt-3 flex flex-col gap-2 min-[720px]:flex-row min-[720px]:items-center">
        <div className="relative min-[720px]:max-w-xs min-[720px]:flex-1">
          <MdSearch
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={fsInputClass("rounded-md pl-9")}
            placeholder="Numéro, client, objet…"
            aria-label="Rechercher un document"
          />
        </div>
        <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(isQuoteTab ? QUOTE_FILTERS : INVOICE_FILTERS).map((f) => {
            const active = isQuoteTab ? quoteFilter === f.id : invoiceFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() =>
                  isQuoteTab
                    ? setQuoteFilter(f.id as QuoteFilter)
                    : setInvoiceFilter(f.id as InvoiceFilter)
                }
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-transparent bg-fs-accent text-white"
                    : "border-black/[0.09] bg-fs-card text-neutral-600 hover:border-fs-accent/35 dark:border-white/10 dark:text-neutral-300",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setCreating(tab)}
          disabled={!storeId}
          className="fs-touch-target ml-auto hidden shrink-0 items-center gap-1.5 rounded-md bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 min-[720px]:inline-flex"
        >
          <MdAdd className="h-4 w-4" aria-hidden />
          {isQuoteTab ? "Nouveau devis" : "Nouvelle facture"}
        </button>
      </div>

      {documentsQ.isError ? (
        <FsQueryErrorPanel
          className="mt-3"
          error={documentsQ.error}
          onRetry={() => void documentsQ.refetch()}
        />
      ) : documentsQ.isLoading ? (
        <div className="mt-6 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <FsCard className="mt-3 rounded-md sm:rounded-md" padding="p-6">
          <div className="text-center">
            <MdDescription className="mx-auto h-8 w-8 text-neutral-300" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">
              {(isQuoteTab ? quotes : invoices).length === 0
                ? isQuoteTab
                  ? "Aucun devis pour l'instant"
                  : "Aucune facture pour l'instant"
                : "Aucun document ne correspond"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              {(isQuoteTab ? quotes : invoices).length === 0
                ? isQuoteTab
                  ? "Un devis chiffré et remis le jour même fait souvent la différence face à un concurrent qui promet de rappeler."
                  : "Établissez une facture directement, ou transformez un devis accepté : les lignes et les prix sont repris tels quels."
                : "Changez de filtre ou effacez la recherche."}
            </p>
          </div>
        </FsCard>
      ) : (
        <div className="mt-3 space-y-2.5">
          {visible.map((doc) => (
            <DocumentCard key={doc.id} document={doc} onOpen={() => setOpened(doc.id)} />
          ))}
        </div>
      )}

      {/* Bouton flottant mobile */}
      <button
        type="button"
        onClick={() => setCreating(tab)}
        disabled={!storeId}
        aria-label={isQuoteTab ? "Nouveau devis" : "Nouvelle facture"}
        className="fixed bottom-[calc(4.75rem+var(--fs-safe-bottom)+0.5rem)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-fs-accent text-white shadow-lg shadow-black/15 transition-transform active:scale-95 disabled:opacity-60 min-[720px]:hidden"
      >
        <MdAdd className="h-6 w-6" aria-hidden />
      </button>

      {dialogOpen ? (
        <SaleDocumentEditorDialog
          initial={editing}
          kind={editing?.kind ?? creating ?? "quote"}
          products={productOptions}
          customers={customerOptions}
          defaultTerms={defaultTerms}
          busy={saveMut.isPending}
          onClose={() => {
            setCreating(null);
            setEditing(null);
          }}
          onSubmit={(input, lines) => saveMut.mutate({ document: editing, input, lines })}
        />
      ) : null}

      {openedDocument && !dialogOpen ? (
        <SaleDocumentDetailDialog
          document={openedDocument}
          canEdit={canView}
          busyAction={busyAction}
          onClose={() => setOpened(null)}
          onEdit={() => {
            setEditing(openedDocument);
            setOpened(null);
          }}
          onDuplicate={() => duplicateMut.mutate(openedDocument.id)}
          onConvert={() => convertMut.mutate(openedDocument.id)}
          onIssue={() => {
            setIssuing(openedDocument);
            setOpened(null);
          }}
          onSetStatus={(status) => statusMut.mutate({ id: openedDocument.id, status })}
          onDelete={() => setDeleting(openedDocument)}
        />
      ) : null}

      {issuing ? (
        <SaleDocumentIssueDialog
          document={issuing}
          busy={issueMut.isPending}
          onClose={() => setIssuing(null)}
          onConfirm={({ payments }) => issueMut.mutate({ id: issuing.id, payments })}
        />
      ) : null}

      {deleting ? (
        <FsConfirmDialog
          open
          title={`Supprimer ${deleting.number} ?`}
          message="Le document et ses lignes seront effacés. Cette action est irréversible."
          confirmLabel="Supprimer"
          tone="danger"
          busy={deleteMut.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMut.mutate(deleting.id)}
        />
      ) : null}
    </FsPage>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "accent" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-fs-card p-3 shadow-sm",
        tone === "accent"
          ? "border-fs-accent/25"
          : tone === "warn"
            ? "border-amber-500/30"
            : "border-black/[0.06]",
      )}
    >
      <p className="text-[11px] font-medium leading-snug text-neutral-600 dark:text-neutral-400">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-base font-bold leading-tight tracking-tight sm:text-lg",
          tone === "accent" && "text-fs-accent",
          tone === "warn" && "text-amber-700 dark:text-amber-400",
          tone === "neutral" && "text-fs-text",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p> : null}
    </div>
  );
}

function DocumentCard({
  document: doc,
  onOpen,
}: {
  document: SaleDocument;
  onOpen: () => void;
}) {
  const isQuote = doc.kind === "quote";
  const remaining = saleDocumentRemaining(doc);
  const expiresIn = isQuote ? daysUntilExpiry(doc.validUntil) : null;
  const locked = isSaleDocumentLocked(doc.status);

  return (
    <FsCard className="rounded-md sm:rounded-md" padding="p-0">
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-md p-3 text-left transition-colors hover:bg-black/[0.02] sm:p-4 dark:hover:bg-white/[0.03]"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-fs-text">{doc.number}</span>
              <SaleDocumentStatusPill status={doc.status} />
              {doc.convertedDocumentNumber ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                  <MdSwapHoriz className="h-3 w-3" aria-hidden />
                  {doc.convertedDocumentNumber}
                </span>
              ) : null}
            </div>

            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-fs-text">
              <MdPerson className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <span className="truncate">{saleDocumentCustomerLabel(doc)}</span>
            </p>
            {doc.subject ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-neutral-600 dark:text-neutral-400">
                {doc.subject}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-neutral-500">
              {doc.lines.length} ligne{doc.lines.length > 1 ? "s" : ""} · {dayLabel(doc.issueDate)}
              {isQuote && doc.validUntil ? ` · valable au ${dayLabel(doc.validUntil)}` : ""}
              {!isQuote && doc.dueDate ? ` · à régler au ${dayLabel(doc.dueDate)}` : ""}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-lg font-bold text-fs-text">{formatCurrency(doc.total)}</p>
            {doc.saleId != null ? (
              <p
                className={cn(
                  "text-[11px] font-semibold",
                  remaining > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {remaining > 0 ? `${formatCurrency(remaining)} dus` : "Soldée"}
              </p>
            ) : locked ? null : (
              <p className="text-[11px] text-neutral-500">
                {isQuote ? "Non facturé" : "Pas encore émise"}
              </p>
            )}
            {expiresIn != null && expiresIn < 0 && doc.status === "expired" ? (
              <p className="text-[11px] text-red-600 dark:text-red-400">Périmé</p>
            ) : null}
          </div>
        </div>
      </button>
    </FsCard>
  );
}
