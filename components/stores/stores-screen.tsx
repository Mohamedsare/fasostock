"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdArrowBack,
  MdDescription,
  MdEdit,
  MdEmail,
  MdErrorOutline,
  MdInfoOutline,
  MdLocationOn,
  MdLockPerson,
  MdPhone,
  MdReceiptLong,
  MdRefresh,
  MdPictureAsPdf,
  MdStore,
  MdTableChart,
} from "react-icons/md";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreateStoreModal, EditStoreModal } from "@/components/stores/store-dialogs";
import { FsCard, FsFab, FsPage } from "@/components/ui/fs-screen-primitives";
import { P } from "@/lib/constants/permissions";
import { ROUTES, storeFactureTabPath } from "@/lib/config/routes";
import type { AccessHelpers } from "@/lib/features/permissions/access";
import { useAppContext } from "@/lib/features/common/app-context";
import { fetchStoresPageData } from "@/lib/features/stores/api";
import { listProducts, listStoreInventory } from "@/lib/features/products/api";
import { downloadStoreProductsPdf } from "@/lib/features/stores/generate-store-products-pdf";
import type { Store } from "@/lib/features/stores/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import {
  fetchInvoiceTablePosEnabled,
  peekInvoiceTablePosEnabled,
} from "@/lib/features/settings/invoice-table-pos";
import { cn } from "@/lib/utils/cn";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { messageFromUnknownError, toast } from "@/lib/toast";

function getStoresFallbackRoute(h: AccessHelpers): string {
  if (h.canDashboard) return ROUTES.dashboard;
  if (h.canSales) return ROUTES.sales;
  if (h.canProducts) return ROUTES.products;
  if (h.canInventory) return h.isCashier ? ROUTES.stockCashier : ROUTES.inventory;
  if (h.canCustomers) return ROUTES.customers;
  return ROUTES.settings;
}

export function StoresScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { hasPermission, helpers, isLoading: permLoading } = usePermissions();
  const isWide = useMediaQuery("(min-width: 900px)");

  const [createOpen, setCreateOpen] = useState(false);
  const [editStore, setEditStore] = useState<Store | null>(null);

  const companyId = ctx.data?.companyId ?? "";
  const companyName = ctx.data?.companyName ?? "";
  const companyLogoUrl = ctx.data?.companyLogoUrl ?? null;

  const canViewOrCreate =
    hasPermission(P.storesView) || hasPermission(P.storesCreate);
  const canCreate = hasPermission(P.storesCreate);

  const storesQ = useQuery({
    queryKey: queryKeys.storesPage(companyId),
    queryFn: () => fetchStoresPageData(companyId),
    enabled: !!companyId && canViewOrCreate,
  });

  const peekInvoiceTable =
    companyId.length > 0 ? peekInvoiceTablePosEnabled(companyId) : undefined;
  const invoiceTableQ = useQuery({
    queryKey: queryKeys.invoiceTablePosEnabled(companyId),
    queryFn: () => fetchInvoiceTablePosEnabled(companyId),
    enabled: !!companyId && canViewOrCreate,
    staleTime: 60_000,
    ...(peekInvoiceTable !== undefined ? { initialData: peekInvoiceTable } : {}),
  });
  const invoiceTablePosEnabled = invoiceTableQ.data ?? false;
  const canPosInvoiceA4 =
    hasPermission(P.salesInvoiceA4) || hasPermission(P.salesCreate);
  const canFactureTab =
    hasPermission(P.salesInvoiceA4Table) &&
    canPosInvoiceA4 &&
    invoiceTablePosEnabled;

  const stores = storesQ.data?.stores ?? [];
  const quota = storesQ.data?.storeQuota ?? 1;
  const storeQuotaIncreaseEnabled = storesQ.data?.storeQuotaIncreaseEnabled ?? true;
  const atQuota = stores.length >= quota && quota > 0;
  const quotaIncreaseBlocked = atQuota && !storeQuotaIncreaseEnabled && canCreate;
  const canAdd =
    !!companyId &&
    canCreate &&
    (stores.length === 0 || stores.length < quota);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    await storesQ.refetch();
  }

  const headerDescription =
    companyName.length > 0
      ? `${companyName} — Quota : ${quota} boutique(s) · ${stores.length} créée(s)`
      : "Sélectionnez une entreprise";

  const btnPrimary =
    "touch-manipulation inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#F97316] px-4 text-sm font-semibold text-white shadow-sm active:opacity-95 min-[480px]:min-h-11 min-[480px]:w-auto";

  if (ctx.isLoading || permLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
      </div>
    );
  }

  if (!ctx.data) {
    return (
      <div className="rounded-xl border border-dashed border-black/[0.12] bg-fs-card px-4 py-8 text-center text-sm text-neutral-600 sm:rounded-2xl">
        Aucune entreprise disponible. Contactez l’administrateur.
      </div>
    );
  }

  if (helpers && !helpers.canStores) {
    const fallback = getStoresFallbackRoute(helpers);
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-black/8 bg-fs-card p-6 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <MdLockPerson className="h-14 w-14 text-red-600" aria-hidden />
            <h2 className="mt-3 text-xl font-extrabold text-neutral-900">
              Accès restreint
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Vous n&apos;avez pas accès à cette page.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                } else {
                  router.push(fallback);
                }
              }}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white"
            >
              <MdArrowBack className="h-4 w-4" aria-hidden />
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-neutral-600">
        Aucune entreprise. Contactez l’administrateur.
      </div>
    );
  }

  return (
    <FsPage className="relative flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-5 min-[900px]:px-7 min-[900px]:pt-7">
      <div className="flex flex-col gap-6">
        {/* En-tête aligné Flutter : headlineSmall + (≥560px) bouton à droite ; mobile = colonne */}
        <div className="flex flex-col gap-4 min-[560px]:flex-row min-[560px]:items-start min-[560px]:justify-between min-[560px]:gap-6">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-[-0.4px] text-fs-text min-[900px]:text-2xl">
              Boutiques
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600 min-[900px]:text-base">
              {headerDescription}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 min-[400px]:flex-row min-[400px]:flex-wrap min-[560px]:w-auto min-[560px]:justify-end">
            <button
              type="button"
              disabled={storesQ.isFetching}
              onClick={() => void refresh()}
              className="touch-manipulation inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-[10px] border border-black/10 bg-fs-card px-3 text-neutral-800 active:bg-neutral-50 disabled:opacity-40 min-[400px]:px-4"
              aria-label="Actualiser la liste"
            >
              <MdRefresh
                className={cn("h-5 w-5 shrink-0", storesQ.isFetching && "animate-spin")}
                aria-hidden
              />
              <span className="hidden text-sm font-semibold min-[400px]:inline">Actualiser</span>
            </button>
            {canAdd ? (
              <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}>
                <MdAdd className="h-5 w-5 shrink-0" aria-hidden />
                Nouvelle boutique
              </button>
            ) : null}
          </div>
        </div>

        {quotaIncreaseBlocked ? (
          <div
            className="rounded-xl border border-amber-300/80 bg-amber-50/90 p-4 text-sm text-amber-950"
            role="status"
          >
            <div className="flex gap-3">
              <MdInfoOutline className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
              <p>
                Quota de boutiques atteint ({quota}). L&apos;augmentation du nombre de boutiques autorisées n&apos;est
                pas disponible pour votre offre. Contactez l&apos;administrateur de la plateforme.
              </p>
            </div>
          </div>
        ) : null}

        {storesQ.isError ? (
          <div
            className="rounded-xl border border-red-300/80 bg-red-50/90 p-4 text-sm text-red-900"
            role="alert"
          >
            <div className="flex gap-3">
              <MdErrorOutline className="h-5 w-5 shrink-0 text-red-700" aria-hidden />
              <div className="min-w-0 flex-1">
                <p>
                  {(storesQ.error as Error)?.message ??
                    "Impossible de charger les boutiques."}
                </p>
                <button
                  type="button"
                  onClick={() => void storesQ.refetch()}
                  className="mt-3 text-sm font-semibold text-red-950 underline"
                >
                  Réessayer
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {storesQ.isLoading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : stores.length === 0 ? (
          <EmptyStoresState canAdd={canAdd} onCreate={() => setCreateOpen(true)} />
        ) : (
          <div
            className={cn(
              "grid gap-4 min-[600px]:gap-4",
              isWide
                ? "grid-cols-1 min-[900px]:grid-cols-3"
                : "grid-cols-1 min-[600px]:grid-cols-2",
            )}
          >
            {stores.map((s) => (
              <StoreCard
                key={s.id}
                store={s}
                companyId={companyId}
                companyName={companyName}
                companyLogoUrl={companyLogoUrl}
                canPosQuick={hasPermission(P.salesCreate)}
                canPosInvoice={canPosInvoiceA4}
                canFactureTab={canFactureTab}
                onEdit={() => setEditStore(s)}
              />
            ))}
          </div>
        )}

        {canAdd && stores.length > 0 ? (
          <FsFab ariaLabel="Nouvelle boutique" onClick={() => setCreateOpen(true)}>
            <MdAdd className="h-7 w-7" aria-hidden />
          </FsFab>
        ) : null}

        <CreateStoreModal
          open={createOpen}
          companyId={companyId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: queryKeys.stores(companyId) });
            void qc.invalidateQueries({ queryKey: queryKeys.appContext });
          }}
        />
        <EditStoreModal
          open={!!editStore}
          store={editStore}
          onClose={() => setEditStore(null)}
          onUpdated={() => {
            void qc.invalidateQueries({ queryKey: queryKeys.stores(companyId) });
            void qc.invalidateQueries({ queryKey: queryKeys.appContext });
          }}
        />
      </div>
    </FsPage>
  );
}

function EmptyStoresState({
  canAdd,
  onCreate,
}: {
  canAdd: boolean;
  onCreate: () => void;
}) {
  return (
    <FsCard className="text-center" padding="px-6 py-14 sm:py-16">
      <div
        className="mx-auto flex h-[104px] w-[104px] items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--fs-accent)_18%,transparent)]"
        aria-hidden
      >
        <MdStore className="h-14 w-14 text-[var(--fs-accent)]" />
      </div>
      <h2 className="mt-6 text-lg font-bold leading-snug text-neutral-900 sm:text-xl">
        Aucune boutique
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        {canAdd
          ? "Créez votre première boutique pour gérer le stock et les ventes (POS)."
          : "Quota atteint. Contactez l’administrateur pour augmenter le nombre de boutiques."}
      </p>
      {canAdd ? (
        <button
          type="button"
          onClick={onCreate}
          className="touch-manipulation mt-7 inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-[#F97316] px-6 py-3 text-sm font-semibold text-white active:opacity-95 sm:w-auto"
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Créer une boutique
        </button>
      ) : null}
    </FsCard>
  );
}

function StoreCard({
  store,
  companyId,
  companyName,
  companyLogoUrl,
  canPosQuick,
  canPosInvoice,
  canFactureTab,
  onEdit,
}: {
  store: Store;
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  canPosQuick: boolean;
  canPosInvoice: boolean;
  canFactureTab: boolean;
  onEdit: () => void;
}) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const posQuickHref = `${ROUTES.stores}/${store.id}/pos-quick`;
  const posInvoiceHref = `${ROUTES.stores}/${store.id}/pos`;
  const factureTabHref = storeFactureTabPath(store.id);

  async function exportProductsPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const [products, stockMap] = await Promise.all([
        listProducts(companyId),
        listStoreInventory(store.id),
      ]);
      const items = products
        .filter((p) => (stockMap.get(p.id) ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          imageUrl:
            p.product_images && p.product_images.length > 0
              ? p.product_images[0]?.url ?? null
              : null,
        }));
      await downloadStoreProductsPdf({
        companyName: companyName || "Entreprise",
        companyLogoUrl,
        storeName: store.name,
        items,
      });
      toast.success("PDF des produits exporté.");
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Export PDF impossible."));
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <article className="flex touch-manipulation flex-col overflow-hidden rounded-xl border border-black/[0.06] bg-fs-card shadow-sm">
      <div className="flex flex-1 flex-col p-4">
        <div className="flex gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL publique Supabase dynamique
              <img
                src={store.logo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <MdStore className="h-7 w-7 text-neutral-400" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <h3 className="min-w-0 flex-1 text-base font-bold leading-tight tracking-[-0.2px] text-neutral-900">
                {store.name}
              </h3>
              {store.is_primary ? (
                <span className="shrink-0 rounded-md bg-[color-mix(in_srgb,var(--fs-accent)_22%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--fs-accent)]">
                  Principale
                </span>
              ) : null}
            </div>
            {store.code ? (
              <p className="mt-0.5 font-mono text-xs text-neutral-500">{store.code}</p>
            ) : null}
            {store.address ? (
              <p className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-neutral-600">
                <MdLocationOn className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
                <span className="line-clamp-2">{store.address}</span>
              </p>
            ) : null}
            {store.phone ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600">
                <MdPhone className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
                <span className="truncate">{store.phone}</span>
              </p>
            ) : null}
            {store.email ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-600">
                <MdEmail className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
                <span className="truncate">{store.email}</span>
              </p>
            ) : null}
            {store.description ? (
              <p className="mt-2 line-clamp-2 text-xs leading-[1.35] text-neutral-600">
                {store.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={() => void exportProductsPdf()}
          disabled={exportingPdf}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 active:opacity-95 disabled:opacity-60"
          title="Exporter la liste des produits du magasin en PDF"
        >
          <MdPictureAsPdf className="h-5 w-5 shrink-0" aria-hidden />
          {exportingPdf ? "Export PDF en cours…" : "Exporter produits (PDF)"}
        </button>
      </div>
      <div className="flex border-t border-black/[0.06]">
        {canPosQuick ? (
          <>
            <Link
              href={posQuickHref}
              className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-center text-[var(--fs-accent)] active:bg-neutral-50/80"
            >
              <MdReceiptLong className="h-5 w-5 shrink-0" aria-hidden />
              <span className="px-1 text-[11px] font-semibold leading-tight">Caisse rapide</span>
            </Link>
            <div className="w-px shrink-0 self-stretch bg-black/[0.08]" />
          </>
        ) : null}
        {canPosInvoice ? (
          <>
            <Link
              href={posInvoiceHref}
              className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-center text-[var(--fs-accent)] active:bg-neutral-50/80"
            >
              <MdDescription className="h-5 w-5 shrink-0" aria-hidden />
              <span className="px-1 text-[11px] font-semibold leading-tight">Facture A4</span>
            </Link>
            <div className="w-px shrink-0 self-stretch bg-black/[0.08]" />
          </>
        ) : null}
        {canFactureTab ? (
          <>
            <Link
              href={factureTabHref}
              className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-center text-[var(--fs-accent)] active:bg-neutral-50/80"
            >
              <MdTableChart className="h-5 w-5 shrink-0" aria-hidden />
              <span className="px-1 text-[11px] font-semibold leading-tight">Facture tab.</span>
            </Link>
            <div className="w-px shrink-0 self-stretch bg-black/[0.08]" />
          </>
        ) : null}
        <div className="w-px shrink-0 self-stretch bg-black/[0.08]" />
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-neutral-600 active:bg-neutral-50/80"
        >
          <MdEdit className="h-5 w-5 shrink-0" aria-hidden />
          <span className="text-[11px] font-semibold">Modifier</span>
        </button>
      </div>
    </article>
  );
}
