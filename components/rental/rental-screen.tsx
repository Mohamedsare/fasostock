"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAddHome,
  MdApartment,
  MdBuild,
  MdCheckCircle,
  MdDelete,
  MdEdit,
  MdGroups,
  MdHomeWork,
  MdInsights,
  MdLock,
  MdMeetingRoom,
  MdPayments,
  MdPersonAdd,
  MdRefresh,
  MdSearch,
  MdSpaceDashboard,
  MdWarningAmber,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { RentalChargeDialog } from "@/components/rental/rental-charge-dialog";
import { RentalEndLeaseDialog } from "@/components/rental/rental-end-lease-dialog";
import { RentalLeaseDetail } from "@/components/rental/rental-lease-detail";
import { RentalLeaseDialog } from "@/components/rental/rental-lease-dialog";
import { RentalPaymentDialog } from "@/components/rental/rental-payment-dialog";
import { RentalPropertyDialog } from "@/components/rental/rental-property-dialog";
import { RentalReceiptDialog } from "@/components/rental/rental-receipt-dialog";
import { RentalTenantDialog } from "@/components/rental/rental-tenant-dialog";
import { RentalUnitDialog } from "@/components/rental/rental-unit-dialog";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  deleteRentalCharge,
  deleteRentalLease,
  deleteRentalProperty,
  deleteRentalTenant,
  deleteRentalUnit,
  fetchRentalStats,
  generateRentalInvoices,
  listRentalCharges,
  listRentalLeases,
  listRentalProperties,
  listRentalTenants,
  listRentalUnits,
  reopenRentalLease,
} from "@/lib/features/rental/api";
import {
  RENTAL_HEALTH_LABELS,
  balanceLabel,
  formatDateFr,
  formatMonthFr,
  leaseHealth,
} from "@/lib/features/rental/rental-format";
import {
  RENTAL_CHARGE_CATEGORY_LABELS,
  RENTAL_PROPERTY_KIND_LABELS,
  type RentalCharge,
  type RentalLease,
  type RentalProperty,
  type RentalTenant,
  type RentalUnit,
} from "@/lib/features/rental/types";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

type Tab = "dashboard" | "leases" | "properties" | "tenants" | "charges";
type LeaseFilter = "all" | "late" | "due" | "current" | "closed";

const TABS: { key: Tab; label: string; icon: typeof MdSpaceDashboard }[] = [
  { key: "dashboard", label: "Tableau de bord", icon: MdSpaceDashboard },
  { key: "leases", label: "Loyers & baux", icon: MdPayments },
  { key: "properties", label: "Biens", icon: MdHomeWork },
  { key: "tenants", label: "Locataires", icon: MdGroups },
  { key: "charges", label: "Charges", icon: MdBuild },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/**
 * Page « Location » — gestion locative immobilière, en parallèle du commerce.
 *
 * Le bailleur y suit ses maisons, ses locataires et surtout ses loyers : qui est
 * en retard, qui a payé jusqu'à quand, et à chaque encaissement une quittance
 * thermique 58 / 80 mm à remettre au locataire. Module autonome, activé par
 * boutique depuis Admin › Paramètres.
 */
export function RentalScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const store = ctx.data?.stores.find((s) => s.id === storeId) ?? null;
  const storeEnabled = store?.rentalModuleEnabled === true;
  const canManage = (h?.canRental ?? false) && storeEnabled;
  const isOwner = h?.isOwner ?? false;

  const [tab, setTab] = useState<Tab>("dashboard");
  const [search, setSearch] = useState("");
  const [leaseFilter, setLeaseFilter] = useState<LeaseFilter>("all");

  // Dialogues
  const [leaseFormOpen, setLeaseFormOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<RentalLease | null>(null);
  const [presetUnitId, setPresetUnitId] = useState<string | null>(null);
  const [detailLeaseId, setDetailLeaseId] = useState<string | null>(null);
  const [payingLeaseId, setPayingLeaseId] = useState<string | null>(null);
  const [endingLeaseId, setEndingLeaseId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [propertyFormOpen, setPropertyFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<RentalProperty | null>(null);
  const [unitFormFor, setUnitFormFor] = useState<RentalProperty | null>(null);
  const [editingUnit, setEditingUnit] = useState<RentalUnit | null>(null);
  const [tenantFormOpen, setTenantFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<RentalTenant | null>(null);
  const [chargeFormOpen, setChargeFormOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<RentalCharge | null>(null);

  // Confirmations
  const [toDeleteLease, setToDeleteLease] = useState<RentalLease | null>(null);
  const [toDeleteProperty, setToDeleteProperty] = useState<RentalProperty | null>(null);
  const [toDeleteUnit, setToDeleteUnit] = useState<RentalUnit | null>(null);
  const [toDeleteTenant, setToDeleteTenant] = useState<RentalTenant | null>(null);
  const [toDeleteCharge, setToDeleteCharge] = useState<RentalCharge | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const enabled = !!companyId && canManage;

  const leasesQ = useQuery({
    queryKey: queryKeys.rentalLeases({ companyId, storeId }),
    queryFn: () => listRentalLeases({ companyId, storeId }),
    enabled,
    staleTime: 10_000,
  });
  const propertiesQ = useQuery({
    queryKey: queryKeys.rentalProperties({ companyId, storeId }),
    queryFn: () => listRentalProperties({ companyId, storeId }),
    enabled,
    staleTime: 30_000,
  });
  const unitsQ = useQuery({
    queryKey: queryKeys.rentalUnits({ companyId, storeId }),
    queryFn: () => listRentalUnits({ companyId, storeId }),
    enabled,
    staleTime: 30_000,
  });
  const tenantsQ = useQuery({
    queryKey: queryKeys.rentalTenants(companyId),
    queryFn: () => listRentalTenants(companyId),
    enabled,
    staleTime: 30_000,
  });
  const chargesQ = useQuery({
    queryKey: queryKeys.rentalCharges({ companyId, storeId }),
    queryFn: () => listRentalCharges({ companyId, storeId }),
    enabled: enabled && tab === "charges",
    staleTime: 30_000,
  });
  const statsQ = useQuery({
    queryKey: queryKeys.rentalStats({ companyId, storeId, month: null }),
    queryFn: () => fetchRentalStats({ companyId, storeId }),
    enabled,
    staleTime: 30_000,
  });

  const leases = useMemo(() => leasesQ.data ?? [], [leasesQ.data]);
  const properties = useMemo(() => propertiesQ.data ?? [], [propertiesQ.data]);
  const units = useMemo(() => unitsQ.data ?? [], [unitsQ.data]);
  const tenants = useMemo(() => tenantsQ.data ?? [], [tenantsQ.data]);

  function refreshAll(leaseId?: string) {
    void qc.invalidateQueries({ queryKey: queryKeys.rentalLeases({ companyId, storeId }) });
    void qc.invalidateQueries({ queryKey: queryKeys.rentalProperties({ companyId, storeId }) });
    void qc.invalidateQueries({ queryKey: queryKeys.rentalUnits({ companyId, storeId }) });
    void qc.invalidateQueries({ queryKey: queryKeys.rentalTenants(companyId) });
    void qc.invalidateQueries({ queryKey: queryKeys.rentalCharges({ companyId, storeId }) });
    void qc.invalidateQueries({
      queryKey: queryKeys.rentalStats({ companyId, storeId, month: null }),
    });
    if (leaseId) {
      void qc.invalidateQueries({ queryKey: queryKeys.rentalSchedule(leaseId) });
      void qc.invalidateQueries({ queryKey: queryKeys.rentalPayments(leaseId) });
    }
  }

  /**
   * Le mois tourne tout seul : à l'ouverture de la page, les échéances des
   * périodes déjà commencées sont créées si elles manquent. Une seule fois par
   * montage — le bouton « Actualiser » permet de rejouer manuellement.
   */
  const generatedRef = useRef(false);
  useEffect(() => {
    if (!enabled || generatedRef.current) return;
    generatedRef.current = true;
    void generateRentalInvoices({ companyId, storeId })
      .then((created) => {
        if (created > 0) refreshAll();
      })
      .catch(() => {
        /* silencieux : la page reste utilisable, le bouton Actualiser réessaie */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, companyId, storeId]);

  async function handleRefresh() {
    try {
      const created = await generateRentalInvoices({ companyId, storeId });
      refreshAll();
      toast.success(
        created > 0
          ? `${created} échéance${created > 1 ? "s" : ""} ajoutée${created > 1 ? "s" : ""}.`
          : "Tout est à jour.",
      );
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Mise à jour impossible."));
    }
  }

  const filteredLeases = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\s/g, "");
    return leases.filter((l) => {
      const health = leaseHealth(l);
      if (leaseFilter === "closed" && l.status === "active") return false;
      if (leaseFilter !== "all" && leaseFilter !== "closed" && health !== leaseFilter) return false;
      if (!q) return true;
      return (
        l.tenantName.toLowerCase().includes(q) ||
        l.propertyName.toLowerCase().includes(q) ||
        l.unitLabel.toLowerCase().includes(q) ||
        l.leaseNumber.toLowerCase().includes(q) ||
        (l.tenantPhone ?? "").replace(/\s/g, "").includes(digits)
      );
    });
  }, [leases, leaseFilter, search]);

  const detailLease = leases.find((l) => l.id === detailLeaseId) ?? null;
  const payingLease = leases.find((l) => l.id === payingLeaseId) ?? null;
  const endingLease = leases.find((l) => l.id === endingLeaseId) ?? null;

  async function runAction(fn: () => Promise<void>, done: () => void, fallback: string) {
    setActionBusy(true);
    try {
      await fn();
      done();
      refreshAll();
    } catch (e) {
      toast.error(messageFromUnknownError(e, fallback));
    } finally {
      setActionBusy(false);
    }
  }

  if (permLoading || ctx.isLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
            aria-hidden
          />
        </div>
      </FsPage>
    );
  }

  if (!canManage) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Location"
          subtitle="Gestion des maisons en location : baux, loyers et quittances"
        />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-400" aria-hidden />
            <p className="max-w-md text-sm font-medium text-neutral-600">
              {storeEnabled
                ? "Vous n'avez pas le droit de gérer la location."
                : "Le module Location n'est pas activé pour cette boutique. Demandez son activation à FasoStock."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const stats = statsQ.data;
  const collectionRate =
    stats && stats.expectedMonth > 0
      ? Math.min(100, Math.round((stats.collectedMonth / stats.expectedMonth) * 100))
      : null;

  return (
    <FsPage>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 sm:mb-3">
        <FsScreenHeader
          className="mb-0"
          title="Location"
          subtitle={`Vos maisons en location — ${store?.name ?? "boutique"}`}
          titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-fs-surface-container text-neutral-600 dark:border-white/10 dark:text-neutral-300"
            aria-label="Actualiser les échéances"
          >
            <MdRefresh
              className={cn("h-5 w-5", leasesQ.isFetching && "animate-spin")}
              aria-hidden
            />
          </button>
          <PrimaryAction
            tab={tab}
            onLease={() => {
              setEditingLease(null);
              setPresetUnitId(null);
              setLeaseFormOpen(true);
            }}
            onProperty={() => {
              setEditingProperty(null);
              setPropertyFormOpen(true);
            }}
            onTenant={() => {
              setEditingTenant(null);
              setTenantFormOpen(true);
            }}
            onCharge={() => {
              setEditingCharge(null);
              setChargeFormOpen(true);
            }}
          />
        </div>
      </div>

      {/* Onglets */}
      <div className="mb-3 -mx-2 overflow-x-auto px-2">
        <div className="flex min-w-max gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                  tab === t.key
                    ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                    : "border-black/10 text-neutral-600 hover:bg-black/[0.04] dark:border-white/10 dark:text-neutral-300",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tableau de bord ─────────────────────────────────────────────── */}
      {tab === "dashboard" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 min-[900px]:grid-cols-4">
            <Kpi
              label={`Encaissé en ${formatMonthFr(stats?.monthStart ?? null)}`}
              value={formatCurrency(stats?.collectedMonth ?? 0)}
              hint={
                stats
                  ? `sur ${formatCurrency(stats.expectedMonth)} attendus${
                      collectionRate != null ? ` · ${collectionRate} %` : ""
                    }`
                  : undefined
              }
              tone="accent"
              icon={<MdPayments className="h-5 w-5" aria-hidden />}
            />
            <Kpi
              label="Impayés cumulés"
              value={formatCurrency(stats?.outstandingTotal ?? 0)}
              hint={
                stats && stats.lateLeases > 0
                  ? `${stats.lateLeases} locataire${stats.lateLeases > 1 ? "s" : ""} en retard`
                  : "aucun retard"
              }
              tone={stats && stats.outstandingTotal > 0.5 ? "danger" : "success"}
              icon={<MdWarningAmber className="h-5 w-5" aria-hidden />}
            />
            <Kpi
              label="Occupation"
              value={
                stats ? `${stats.occupiedUnits} / ${stats.unitsCount}` : "—"
              }
              hint={
                stats
                  ? `${stats.vacantUnits} lot${stats.vacantUnits > 1 ? "s" : ""} libre${stats.vacantUnits > 1 ? "s" : ""} · ${stats.propertiesCount} bien${stats.propertiesCount > 1 ? "s" : ""}`
                  : undefined
              }
              icon={<MdApartment className="h-5 w-5" aria-hidden />}
            />
            <Kpi
              label="Charges du mois"
              value={formatCurrency(stats?.chargesMonth ?? 0)}
              hint={
                stats
                  ? `net du mois : ${formatCurrency(stats.collectedMonth - stats.chargesMonth)}`
                  : undefined
              }
              icon={<MdBuild className="h-5 w-5" aria-hidden />}
            />
          </div>

          {collectionRate != null ? (
            <FsCard padding="p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-neutral-600">
                  Recouvrement de {formatMonthFr(stats?.monthStart ?? null)}
                </p>
                <p className="text-sm font-extrabold tabular-nums text-fs-text">
                  {collectionRate} %
                </p>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    collectionRate >= 90
                      ? "bg-emerald-500"
                      : collectionRate >= 60
                        ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                  style={{ width: `${collectionRate}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-neutral-500">
                Caution détenue : {formatCurrency(stats?.depositsHeld ?? 0)} · encaissé depuis
                janvier : {formatCurrency(stats?.collectedYear ?? 0)}
              </p>
            </FsCard>
          ) : null}

          {/* Ce qu'il faut faire maintenant : les retards, en tête. */}
          <FsCard padding="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-fs-text">À relancer</p>
              <button
                type="button"
                onClick={() => {
                  setTab("leases");
                  setLeaseFilter("late");
                }}
                className="text-xs font-bold text-fs-accent hover:underline"
              >
                Tout voir
              </button>
            </div>
            {(() => {
              const late = leases
                .filter((l) => leaseHealth(l) === "late")
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 5);
              if (late.length === 0) {
                return (
                  <p className="flex items-center gap-2 py-4 text-sm text-emerald-700 dark:text-emerald-300">
                    <MdCheckCircle className="h-5 w-5" aria-hidden />
                    Aucun loyer en retard — tous vos locataires sont à jour.
                  </p>
                );
              }
              return (
                <ul className="space-y-1.5">
                  {late.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => setDetailLeaseId(l.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-fs-text">
                            {l.tenantName}
                          </p>
                          <p className="truncate text-[11px] text-neutral-500">
                            {l.propertyName} — {l.unitLabel} · {balanceLabel(l)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-extrabold tabular-nums text-red-600">
                          {formatCurrency(l.balance)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </FsCard>

          {/* Lots vides : de l'argent qui dort. */}
          {(() => {
            const vacant = units.filter((u) => u.isActive && !u.activeLeaseId);
            if (vacant.length === 0) return null;
            const potential = vacant.reduce((s, u) => s + u.baseRent, 0);
            return (
              <FsCard padding="p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-fs-text">
                    {vacant.length} lot{vacant.length > 1 ? "s" : ""} libre
                    {vacant.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatCurrency(potential)} / mois de manque à gagner
                  </p>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {vacant.slice(0, 8).map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLease(null);
                          setPresetUnitId(u.id);
                          setLeaseFormOpen(true);
                        }}
                        className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-bold text-neutral-700 hover:border-fs-accent hover:text-fs-accent dark:border-white/10 dark:text-neutral-200"
                      >
                        {u.propertyName} — {u.label}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Cliquez sur un lot pour y installer un locataire.
                </p>
              </FsCard>
            );
          })()}
        </div>
      ) : null}

      {/* ── Loyers & baux ───────────────────────────────────────────────── */}
      {tab === "leases" ? (
        <>
          <FsCard className="mb-3" padding="p-2.5 sm:p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <MdSearch
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  className={fsInputClass("pl-9")}
                  placeholder="Rechercher un locataire, une maison, un téléphone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { key: "all" as const, label: "Tous" },
                    { key: "late" as const, label: "En retard" },
                    { key: "due" as const, label: "À encaisser" },
                    { key: "current" as const, label: "À jour" },
                    { key: "closed" as const, label: "Clôturés" },
                  ]
                ).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setLeaseFilter(f.key)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                      leaseFilter === f.key
                        ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
                        : "border-black/10 text-neutral-600 hover:bg-black/[0.04] dark:border-white/10 dark:text-neutral-300",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </FsCard>

          {leasesQ.isError ? (
            <FsQueryErrorPanel error={leasesQ.error} onRetry={() => void leasesQ.refetch()} />
          ) : leasesQ.isLoading ? (
            <Loading />
          ) : filteredLeases.length === 0 ? (
            <FsCard padding="p-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <MdPayments className="h-12 w-12 text-neutral-300" aria-hidden />
                <p className="text-sm font-semibold text-fs-text">
                  {leases.length === 0 ? "Aucun bail enregistré" : "Aucun bail pour ce filtre"}
                </p>
                <p className="max-w-md text-xs text-neutral-500">
                  Créez d&apos;abord un bien et ses lots dans l&apos;onglet « Biens », puis
                  installez-y un locataire. Les échéances de loyer se génèrent ensuite toutes
                  seules, mois après mois.
                </p>
              </div>
            </FsCard>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-2 min-[1400px]:grid-cols-3">
              {filteredLeases.map((l) => (
                <LeaseCard
                  key={l.id}
                  lease={l}
                  onOpen={() => setDetailLeaseId(l.id)}
                  onPay={() => setPayingLeaseId(l.id)}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}

      {/* ── Biens ───────────────────────────────────────────────────────── */}
      {tab === "properties" ? (
        propertiesQ.isError ? (
          <FsQueryErrorPanel
            error={propertiesQ.error}
            onRetry={() => void propertiesQ.refetch()}
          />
        ) : propertiesQ.isLoading ? (
          <Loading />
        ) : properties.length === 0 ? (
          <FsCard padding="p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <MdHomeWork className="h-12 w-12 text-neutral-300" aria-hidden />
              <p className="text-sm font-semibold text-fs-text">Aucun bien enregistré</p>
              <p className="max-w-md text-xs text-neutral-500">
                Commencez par déclarer une maison, une villa ou un immeuble, puis ajoutez-y
                les lots que vous louez.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingProperty(null);
                  setPropertyFormOpen(true);
                }}
                className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-fs-accent px-5 text-sm font-bold text-white"
              >
                <MdAddHome className="h-5 w-5" aria-hidden />
                Ajouter mon premier bien
              </button>
            </div>
          </FsCard>
        ) : (
          <ul className="space-y-2.5">
            {properties.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                units={units.filter((u) => u.propertyId === p.id)}
                onEdit={() => {
                  setEditingProperty(p);
                  setPropertyFormOpen(true);
                }}
                onDelete={() => setToDeleteProperty(p)}
                onAddUnit={() => {
                  setEditingUnit(null);
                  setUnitFormFor(p);
                }}
                onEditUnit={(u) => {
                  setEditingUnit(u);
                  setUnitFormFor(p);
                }}
                onDeleteUnit={(u) => setToDeleteUnit(u)}
                onRentUnit={(u) => {
                  setEditingLease(null);
                  setPresetUnitId(u.id);
                  setLeaseFormOpen(true);
                }}
                onOpenLease={(leaseId) => setDetailLeaseId(leaseId)}
              />
            ))}
          </ul>
        )
      ) : null}

      {/* ── Locataires ──────────────────────────────────────────────────── */}
      {tab === "tenants" ? (
        tenantsQ.isError ? (
          <FsQueryErrorPanel error={tenantsQ.error} onRetry={() => void tenantsQ.refetch()} />
        ) : tenantsQ.isLoading ? (
          <Loading />
        ) : tenants.length === 0 ? (
          <FsCard padding="p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <MdGroups className="h-12 w-12 text-neutral-300" aria-hidden />
              <p className="text-sm font-semibold text-fs-text">Aucun locataire</p>
              <p className="max-w-md text-xs text-neutral-500">
                Enregistrez vos locataires (nom, téléphone, pièce d&apos;identité) : la fiche
                sert de dossier en cas de litige.
              </p>
            </div>
          </FsCard>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-2 min-[1400px]:grid-cols-3">
            {tenants.map((t) => (
              <li key={t.id}>
                <FsCard className="h-full" padding="p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] text-sm font-black text-fs-accent">
                      {initials(t.fullName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-fs-text">{t.fullName}</p>
                      <p className="truncate text-[11px] text-neutral-500">
                        {t.phone ?? "sans téléphone"}
                        {t.idNumber ? ` · ${t.idType ?? "Pièce"} ${t.idNumber}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconBtn
                        label="Modifier"
                        onClick={() => {
                          setEditingTenant(t);
                          setTenantFormOpen(true);
                        }}
                      >
                        <MdEdit className="h-4 w-4" aria-hidden />
                      </IconBtn>
                      {t.activeLeases === 0 ? (
                        <IconBtn label="Supprimer" onClick={() => setToDeleteTenant(t)} danger>
                          <MdDelete className="h-4 w-4" aria-hidden />
                        </IconBtn>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-black/[0.05] px-2 py-0.5 font-bold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                      {t.activeLeases} bail{t.activeLeases > 1 ? "s" : ""} en cours
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-bold",
                        t.totalBalance > 0.5
                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {t.totalBalance > 0.5
                        ? `doit ${formatCurrency(t.totalBalance)}`
                        : "à jour"}
                    </span>
                    {!t.isActive ? (
                      <span className="rounded-full bg-neutral-500/15 px-2 py-0.5 font-bold text-neutral-600 dark:text-neutral-300">
                        fiche archivée
                      </span>
                    ) : null}
                  </div>
                  {t.profession || t.emergencyPhone ? (
                    <p className="mt-2 truncate text-[11px] text-neutral-500">
                      {t.profession ?? ""}
                      {t.profession && t.emergencyPhone ? " · " : ""}
                      {t.emergencyPhone ? `à prévenir : ${t.emergencyPhone}` : ""}
                    </p>
                  ) : null}
                </FsCard>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* ── Charges ─────────────────────────────────────────────────────── */}
      {tab === "charges" ? (
        chargesQ.isError ? (
          <FsQueryErrorPanel error={chargesQ.error} onRetry={() => void chargesQ.refetch()} />
        ) : chargesQ.isLoading ? (
          <Loading />
        ) : (chargesQ.data ?? []).length === 0 ? (
          <FsCard padding="p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <MdBuild className="h-12 w-12 text-neutral-300" aria-hidden />
              <p className="text-sm font-semibold text-fs-text">Aucune charge enregistrée</p>
              <p className="max-w-md text-xs text-neutral-500">
                Notez ici vos dépenses sur les biens (réparations, eau, taxes) pour connaître
                le revenu réellement net de chaque maison.
              </p>
            </div>
          </FsCard>
        ) : (
          <ul className="space-y-1.5">
            {(chargesQ.data ?? []).map((c) => (
              <li key={c.id}>
                <FsCard padding="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fs-text">{c.label}</p>
                      <p className="truncate text-[11px] text-neutral-500">
                        {c.propertyName}
                        {c.unitLabel ? ` — ${c.unitLabel}` : ""} ·{" "}
                        {RENTAL_CHARGE_CATEGORY_LABELS[c.category]} · {formatDateFr(c.spentOn)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
                        −{formatCurrency(c.amount)}
                      </span>
                      <IconBtn
                        label="Modifier"
                        onClick={() => {
                          setEditingCharge(c);
                          setChargeFormOpen(true);
                        }}
                      >
                        <MdEdit className="h-4 w-4" aria-hidden />
                      </IconBtn>
                      <IconBtn label="Supprimer" onClick={() => setToDeleteCharge(c)} danger>
                        <MdDelete className="h-4 w-4" aria-hidden />
                      </IconBtn>
                    </div>
                  </div>
                </FsCard>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* ── Dialogues ───────────────────────────────────────────────────── */}
      {leaseFormOpen ? (
        <RentalLeaseDialog
          companyId={companyId}
          storeId={storeId ?? ""}
          units={units}
          tenants={tenants}
          editing={editingLease}
          presetUnitId={presetUnitId}
          onClose={() => setLeaseFormOpen(false)}
          onSaved={(leaseId, isNew) => {
            refreshAll(leaseId);
            // Nouveau bail : on enchaîne sur la caution / le premier loyer.
            if (isNew) setPayingLeaseId(leaseId);
          }}
          onCreateTenant={() => {
            setEditingTenant(null);
            setTenantFormOpen(true);
          }}
        />
      ) : null}

      {propertyFormOpen ? (
        <RentalPropertyDialog
          companyId={companyId}
          storeId={storeId ?? ""}
          editing={editingProperty}
          onClose={() => setPropertyFormOpen(false)}
          onSaved={(propertyId, isNew) => {
            refreshAll();
            // Un bien sans lot ne se loue pas : on enchaîne sur son premier lot.
            if (isNew) {
              setEditingUnit(null);
              setUnitFormFor({
                id: propertyId,
                storeId: storeId ?? "",
                name: "",
                kind: "house",
                address: null,
                city: null,
                district: null,
                description: null,
                notes: null,
                isActive: true,
                createdAt: "",
                unitsCount: 0,
                occupiedCount: 0,
                vacantCount: 0,
                monthlyExpected: 0,
                monthlyPotential: 0,
                outstanding: 0,
                chargesTotal: 0,
              });
            }
          }}
        />
      ) : null}

      {unitFormFor ? (
        <RentalUnitDialog
          property={unitFormFor}
          editing={editingUnit}
          onClose={() => setUnitFormFor(null)}
          onSaved={() => refreshAll()}
        />
      ) : null}

      {tenantFormOpen ? (
        <RentalTenantDialog
          companyId={companyId}
          storeId={storeId ?? ""}
          editing={editingTenant}
          onClose={() => setTenantFormOpen(false)}
          onSaved={() => refreshAll()}
        />
      ) : null}

      {chargeFormOpen ? (
        <RentalChargeDialog
          properties={properties}
          units={units}
          editing={editingCharge}
          onClose={() => setChargeFormOpen(false)}
          onSaved={() => refreshAll()}
        />
      ) : null}

      {detailLease ? (
        <RentalLeaseDetail
          lease={detailLease}
          isOwner={isOwner}
          onClose={() => setDetailLeaseId(null)}
          onPay={() => setPayingLeaseId(detailLease.id)}
          onEdit={() => {
            setEditingLease(detailLease);
            setPresetUnitId(null);
            setLeaseFormOpen(true);
          }}
          onEndLease={() => setEndingLeaseId(detailLease.id)}
          onReopen={() =>
            void runAction(
              () => reopenRentalLease(detailLease.id),
              () => toast.success("Bail réactivé."),
              "Réactivation impossible.",
            )
          }
          onDelete={isOwner ? () => setToDeleteLease(detailLease) : undefined}
          onReprint={(paymentId) => setReceiptId(paymentId)}
        />
      ) : null}

      {payingLease ? (
        <RentalPaymentDialog
          lease={payingLease}
          onClose={() => setPayingLeaseId(null)}
          onDone={(paymentId) => {
            const leaseId = payingLease.id;
            setPayingLeaseId(null);
            refreshAll(leaseId);
            setReceiptId(paymentId);
          }}
        />
      ) : null}

      {endingLease ? (
        <RentalEndLeaseDialog
          lease={endingLease}
          onClose={() => setEndingLeaseId(null)}
          onDone={() => {
            setDetailLeaseId(null);
            refreshAll(endingLease.id);
          }}
        />
      ) : null}

      {receiptId ? (
        <RentalReceiptDialog paymentId={receiptId} onClose={() => setReceiptId(null)} />
      ) : null}

      {/* ── Confirmations ───────────────────────────────────────────────── */}
      <FsConfirmDialog
        open={toDeleteLease !== null}
        title="Supprimer ce bail ?"
        message={
          toDeleteLease
            ? `Le bail ${toDeleteLease.leaseNumber} de ${toDeleteLease.tenantName} et son échéancier seront effacés. Cette action est irréversible.\n\nUn bail ayant déjà reçu des encaissements ne peut pas être supprimé : clôturez-le à la place.`
            : undefined
        }
        tone="danger"
        confirmLabel="Supprimer définitivement"
        cancelLabel="Retour"
        busy={actionBusy}
        onCancel={() => setToDeleteLease(null)}
        onConfirm={() => {
          const lease = toDeleteLease;
          if (!lease) return;
          void runAction(
            () => deleteRentalLease(lease.id),
            () => {
              toast.success("Bail supprimé.");
              setToDeleteLease(null);
              setDetailLeaseId(null);
            },
            "Suppression impossible.",
          );
        }}
      />

      <FsConfirmDialog
        open={toDeleteProperty !== null}
        title="Supprimer ce bien ?"
        message={
          toDeleteProperty
            ? `« ${toDeleteProperty.name} » et ses ${toDeleteProperty.unitsCount} lot(s) seront effacés.\n\nUn bien avec un bail en cours ou un historique d'encaissements ne peut pas être supprimé — décochez « Bien actif » pour l'archiver.`
            : undefined
        }
        tone="danger"
        confirmLabel="Supprimer"
        cancelLabel="Retour"
        busy={actionBusy}
        onCancel={() => setToDeleteProperty(null)}
        onConfirm={() => {
          const p = toDeleteProperty;
          if (!p) return;
          void runAction(
            () => deleteRentalProperty(p.id),
            () => {
              toast.success("Bien supprimé.");
              setToDeleteProperty(null);
            },
            "Suppression impossible.",
          );
        }}
      />

      <FsConfirmDialog
        open={toDeleteUnit !== null}
        title="Supprimer ce lot ?"
        message={
          toDeleteUnit
            ? `Le lot « ${toDeleteUnit.label} » sera effacé. Un lot ayant déjà été loué ne peut pas être supprimé : décochez « disponible » pour le retirer de la location.`
            : undefined
        }
        tone="danger"
        confirmLabel="Supprimer"
        cancelLabel="Retour"
        busy={actionBusy}
        onCancel={() => setToDeleteUnit(null)}
        onConfirm={() => {
          const u = toDeleteUnit;
          if (!u) return;
          void runAction(
            () => deleteRentalUnit(u.id),
            () => {
              toast.success("Lot supprimé.");
              setToDeleteUnit(null);
            },
            "Suppression impossible.",
          );
        }}
      />

      <FsConfirmDialog
        open={toDeleteTenant !== null}
        title="Supprimer ce locataire ?"
        message={
          toDeleteTenant
            ? `La fiche de ${toDeleteTenant.fullName} sera effacée. Un locataire ayant un historique de bail ne peut pas être supprimé : décochez « Fiche active » pour l'archiver.`
            : undefined
        }
        tone="danger"
        confirmLabel="Supprimer"
        cancelLabel="Retour"
        busy={actionBusy}
        onCancel={() => setToDeleteTenant(null)}
        onConfirm={() => {
          const t = toDeleteTenant;
          if (!t) return;
          void runAction(
            () => deleteRentalTenant({ id: t.id, storeId: storeId ?? "" }),
            () => {
              toast.success("Locataire supprimé.");
              setToDeleteTenant(null);
            },
            "Suppression impossible.",
          );
        }}
      />

      <FsConfirmDialog
        open={toDeleteCharge !== null}
        title="Supprimer cette charge ?"
        message={toDeleteCharge ? `« ${toDeleteCharge.label} » sera effacée.` : undefined}
        tone="danger"
        confirmLabel="Supprimer"
        cancelLabel="Retour"
        busy={actionBusy}
        onCancel={() => setToDeleteCharge(null)}
        onConfirm={() => {
          const c = toDeleteCharge;
          if (!c) return;
          void runAction(
            () => deleteRentalCharge(c.id),
            () => {
              toast.success("Charge supprimée.");
              setToDeleteCharge(null);
            },
            "Suppression impossible.",
          );
        }}
      />
    </FsPage>
  );
}

/** Action principale contextualisée par onglet. */
function PrimaryAction({
  tab,
  onLease,
  onProperty,
  onTenant,
  onCharge,
}: {
  tab: Tab;
  onLease: () => void;
  onProperty: () => void;
  onTenant: () => void;
  onCharge: () => void;
}) {
  const config =
    tab === "properties"
      ? { label: "Nouveau bien", icon: MdAddHome, onClick: onProperty }
      : tab === "tenants"
        ? { label: "Nouveau locataire", icon: MdPersonAdd, onClick: onTenant }
        : tab === "charges"
          ? { label: "Nouvelle charge", icon: MdBuild, onClick: onCharge }
          : { label: "Nouveau bail", icon: MdInsights, onClick: onLease };
  const Icon = config.icon;
  return (
    <button
      type="button"
      onClick={config.onClick}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-fs-accent px-3.5 text-xs font-bold text-white shadow-sm sm:text-sm"
    >
      <Icon className="h-4.5 w-4.5" aria-hidden />
      {config.label}
    </button>
  );
}

function Loading() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
        aria-hidden
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "success" | "danger";
  icon: React.ReactNode;
}) {
  return (
    <FsCard padding="p-3 sm:p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            tone === "accent"
              ? "bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)] text-fs-accent"
              : tone === "success"
                ? "bg-emerald-500/15 text-emerald-600"
                : tone === "danger"
                  ? "bg-red-500/15 text-red-600"
                  : "bg-black/[0.05] text-neutral-500 dark:bg-white/10 dark:text-neutral-300",
          )}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-neutral-500">{label}</p>
          <p
            className={cn(
              "truncate text-lg font-extrabold tabular-nums sm:text-xl",
              tone === "danger"
                ? "text-red-600"
                : tone === "success"
                  ? "text-emerald-600"
                  : "text-fs-text",
            )}
          >
            {value}
          </p>
          {hint ? <p className="truncate text-[11px] text-neutral-400">{hint}</p> : null}
        </div>
      </div>
    </FsCard>
  );
}

function LeaseCard({
  lease,
  onOpen,
  onPay,
}: {
  lease: RentalLease;
  onOpen: () => void;
  onPay: () => void;
}) {
  const health = leaseHealth(lease);
  const isActive = lease.status === "active";

  return (
    <li>
      <FsCard
        className={cn(
          "h-full transition-shadow hover:shadow-md",
          health === "late" && "ring-1 ring-red-500/40",
        )}
        padding="p-3"
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_12%,transparent)] text-sm font-black text-fs-accent"
            aria-label={`Ouvrir le bail de ${lease.tenantName}`}
          >
            {initials(lease.tenantName)}
          </button>
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-bold text-fs-text">{lease.tenantName}</p>
            <p className="truncate text-[11px] text-neutral-500">
              {lease.propertyName} — {lease.unitLabel}
              {lease.tenantPhone ? ` · ${lease.tenantPhone}` : ""}
            </p>
          </button>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              health === "late"
                ? "bg-red-500/15 text-red-700 dark:text-red-300"
                : health === "due"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : health === "advance"
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : health === "closed"
                      ? "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300"
                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {RENTAL_HEALTH_LABELS[health]}
          </span>
        </div>

        <button type="button" onClick={onOpen} className="mt-3 block w-full text-left">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "text-xl font-extrabold tabular-nums",
                lease.balance > 0.5 ? "text-red-600" : "text-fs-text",
              )}
            >
              {lease.balance > 0.5
                ? formatCurrency(lease.balance)
                : formatCurrency(lease.rentAmount)}
            </span>
            <span className="text-[11px] text-neutral-500">
              {lease.balance > 0.5
                ? `dû · loyer ${formatCurrency(lease.rentAmount)}`
                : "loyer mensuel"}
            </span>
          </div>
          <p className="mt-1.5 truncate text-[11px] text-neutral-500">
            {balanceLabel(lease)}
            {lease.paidThrough ? ` · à jour jusqu'au ${formatDateFr(lease.paidThrough)}` : ""}
          </p>
          {isActive && lease.nextDueDate ? (
            <p className="truncate text-[11px] text-neutral-400">
              Prochaine échéance : {formatDateFr(lease.nextDueDate)}
            </p>
          ) : lease.endedAt ? (
            <p className="truncate text-[11px] text-neutral-400">
              Sorti le {formatDateFr(lease.endedAt)}
            </p>
          ) : null}
        </button>

        {isActive ? (
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={onPay}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white"
            >
              <MdPayments className="h-4 w-4" aria-hidden />
              Encaisser
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-black/10 px-3 text-xs font-bold text-neutral-600 dark:border-white/10 dark:text-neutral-300"
            >
              Détails
            </button>
          </div>
        ) : null}
      </FsCard>
    </li>
  );
}

function PropertyCard({
  property,
  units,
  onEdit,
  onDelete,
  onAddUnit,
  onEditUnit,
  onDeleteUnit,
  onRentUnit,
  onOpenLease,
}: {
  property: RentalProperty;
  units: RentalUnit[];
  onEdit: () => void;
  onDelete: () => void;
  onAddUnit: () => void;
  onEditUnit: (u: RentalUnit) => void;
  onDeleteUnit: (u: RentalUnit) => void;
  onRentUnit: (u: RentalUnit) => void;
  onOpenLease: (leaseId: string) => void;
}) {
  return (
    <li>
      <FsCard padding="p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-fs-text">
              {property.name}
              {!property.isActive ? (
                <span className="ml-2 rounded-full bg-neutral-500/15 px-2 py-0.5 text-[10px] font-bold text-neutral-600 dark:text-neutral-300">
                  archivé
                </span>
              ) : null}
            </p>
            <p className="truncate text-[11px] text-neutral-500">
              {RENTAL_PROPERTY_KIND_LABELS[property.kind]}
              {property.district ? ` · ${property.district}` : ""}
              {property.city ? `, ${property.city}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <IconBtn label="Ajouter un lot" onClick={onAddUnit}>
              <MdMeetingRoom className="h-4 w-4" aria-hidden />
            </IconBtn>
            <IconBtn label="Modifier" onClick={onEdit}>
              <MdEdit className="h-4 w-4" aria-hidden />
            </IconBtn>
            <IconBtn label="Supprimer" onClick={onDelete} danger>
              <MdDelete className="h-4 w-4" aria-hidden />
            </IconBtn>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
          <Tile label="Lots" value={`${property.occupiedCount} / ${property.unitsCount}`} />
          <Tile label="Loyers du mois" value={formatCurrency(property.monthlyExpected)} />
          <Tile
            label="Impayés"
            value={formatCurrency(property.outstanding)}
            tone={property.outstanding > 0.5 ? "danger" : "success"}
          />
          <Tile label="Charges cumulées" value={formatCurrency(property.chargesTotal)} />
        </div>

        {units.length === 0 ? (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            Aucun lot : ajoutez-en un pour pouvoir louer ce bien.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {units.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[0.07] px-3 py-2 dark:border-white/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fs-text">{u.label}</p>
                  <p className="truncate text-[11px] text-neutral-500">
                    {u.activeLeaseId ? `Loué à ${u.tenantName}` : "Libre"}
                    {" · "}
                    {formatCurrency(u.currentRent ?? u.baseRent)} / mois
                    {u.rooms != null ? ` · ${u.rooms} pièce(s)` : ""}
                    {!u.isActive ? " · retiré de la location" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {u.activeLeaseId ? (
                    <button
                      type="button"
                      onClick={() => onOpenLease(u.activeLeaseId!)}
                      className="inline-flex min-h-9 items-center rounded-lg border border-black/10 px-3 text-xs font-bold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
                    >
                      Voir le bail
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRentUnit(u)}
                      className="inline-flex min-h-9 items-center rounded-lg bg-fs-accent px-3 text-xs font-bold text-white"
                    >
                      Louer
                    </button>
                  )}
                  <IconBtn label="Modifier le lot" onClick={() => onEditUnit(u)}>
                    <MdEdit className="h-4 w-4" aria-hidden />
                  </IconBtn>
                  {!u.activeLeaseId ? (
                    <IconBtn label="Supprimer le lot" onClick={() => onDeleteUnit(u)} danger>
                      <MdDelete className="h-4 w-4" aria-hidden />
                    </IconBtn>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </FsCard>
    </li>
  );
}

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="rounded-xl bg-black/[0.03] px-2.5 py-2 dark:bg-white/[0.05]">
      <p className="truncate text-[10px] font-medium text-neutral-500">{label}</p>
      <p
        className={cn(
          "truncate text-sm font-extrabold tabular-nums",
          tone === "danger"
            ? "text-red-600"
            : tone === "success"
              ? "text-emerald-600"
              : "text-fs-text",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 transition-colors hover:bg-black/[0.04] dark:border-white/10",
        danger ? "text-red-600" : "text-neutral-600 dark:text-neutral-300",
      )}
    >
      {children}
    </button>
  );
}
