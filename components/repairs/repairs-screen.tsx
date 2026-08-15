"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MdAdd,
  MdArrowForward,
  MdBuild,
  MdDirectionsCar,
  MdLock,
  MdPerson,
  MdReceiptLong,
  MdSearch,
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
import { ROUTES } from "@/lib/config/routes";
import {
  billRepairOrder,
  createRepairOrder,
  deleteRepairOrder,
  listRepairOrders,
  setRepairOrderStatus,
  updateRepairOrder,
} from "@/lib/features/repairs/api";
import {
  REPAIR_STATUS_FLOW,
  REPAIR_STATUS_LABELS,
  repairCustomerLabel,
  repairOrderTotal,
  vehicleLabel,
  type RepairOrder,
  type RepairOrderInput,
  type RepairOrderLineDraft,
  type RepairStatus,
} from "@/lib/features/repairs/types";
import { listProducts, listStoreInventory } from "@/lib/features/products/api";
import { listCustomers } from "@/lib/features/customers/api";
import { listCompanyUsers } from "@/lib/features/users/api";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { RepairOrderDialog } from "./repair-order-dialog";
import { RepairBillDialog } from "./repair-bill-dialog";

type Filter = "open" | RepairStatus | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "À l'atelier" },
  { id: "reception", label: "Reçus" },
  { id: "diagnostic", label: "Diagnostic" },
  { id: "in_progress", label: "En réparation" },
  { id: "ready", label: "Prêts" },
  { id: "delivered", label: "Livrés" },
  { id: "all", label: "Tous" },
];

function statusPillClass(status: RepairStatus): string {
  switch (status) {
    case "reception":
      return "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300";
    case "diagnostic":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "in_progress":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "ready":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "delivered":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
    default:
      return "bg-red-500/15 text-red-700 dark:text-red-300";
  }
}

function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy", { locale: fr });
  } catch {
    return "—";
  }
}

export function RepairsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const canView = h?.canRepairs ?? false;

  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RepairOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [billing, setBilling] = useState<RepairOrder | null>(null);
  const [deleting, setDeleting] = useState<RepairOrder | null>(null);

  const enabled = !!companyId && canView;

  const ordersQ = useQuery({
    queryKey: queryKeys.repairOrders(companyId, storeId),
    queryFn: () => listRepairOrders({ companyId, storeId }),
    enabled,
    staleTime: 30_000,
  });

  const productsQ = useQuery({
    queryKey: ["repairs", "products", companyId],
    queryFn: () => listProducts(companyId),
    enabled: enabled && (creating || editing != null),
    staleTime: 60_000,
  });

  const inventoryQ = useQuery({
    queryKey: ["repairs", "inventory", storeId],
    queryFn: () => listStoreInventory(storeId),
    enabled: enabled && (creating || editing != null) && !!storeId,
    staleTime: 30_000,
  });

  const customersQ = useQuery({
    queryKey: ["repairs", "customers", companyId],
    queryFn: () => listCustomers(companyId),
    enabled: enabled && (creating || editing != null),
    staleTime: 60_000,
  });

  const staffQ = useQuery({
    queryKey: ["repairs", "staff", companyId],
    queryFn: () => listCompanyUsers(companyId),
    enabled: enabled && (creating || editing != null),
    staleTime: 5 * 60_000,
  });

  const productOptions = useMemo(() => {
    const stock = inventoryQ.data ?? {};
    return (productsQ.data ?? [])
      .filter((p) => p.is_active !== false)
      .map((p) => ({
        id: p.id,
        name: p.name,
        salePrice: Number(p.sale_price ?? 0),
        stock: Math.trunc(Number(stock[p.id] ?? 0)),
      }));
  }, [productsQ.data, inventoryQ.data]);

  const customerOptions = useMemo(
    () => (customersQ.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    [customersQ.data],
  );

  const staffOptions = useMemo(
    () =>
      (staffQ.data ?? [])
        .filter((u) => u.isActive)
        .map((u) => ({
          id: u.userId,
          name: u.fullName?.trim() || u.roleName || "Employé",
        })),
    [staffQ.data],
  );

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "open") {
        if (o.status === "delivered" || o.status === "cancelled") return false;
      } else if (filter !== "all" && o.status !== filter) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        o.orderNumber,
        o.vehiclePlate,
        o.vehicleMake,
        o.vehicleModel,
        o.customerName,
        o.customerPhone,
        o.reportedIssue,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [orders, filter, search]);

  /** Compteurs d'atelier — ce que le patron regarde en arrivant le matin. */
  const counts = useMemo(() => {
    const open = orders.filter(
      (o) => o.status !== "delivered" && o.status !== "cancelled",
    );
    return {
      open: open.length,
      ready: orders.filter((o) => o.status === "ready").length,
      openValue: open.reduce((sum, o) => sum + repairOrderTotal(o.lines), 0),
    };
  }, [orders]);

  function invalidate() {
    void qc.invalidateQueries({ queryKey: queryKeys.repairOrders(companyId, storeId) });
  }

  const saveMut = useMutation({
    mutationFn: async (params: {
      order: RepairOrder | null;
      input: RepairOrderInput;
      lines: RepairOrderLineDraft[];
    }) => {
      if (params.order) {
        await updateRepairOrder({
          repairOrderId: params.order.id,
          companyId,
          input: params.input,
          lines: params.lines,
        });
        return params.order.id;
      }
      if (!storeId) throw new Error("Choisissez d'abord une boutique.");
      return createRepairOrder({
        companyId,
        storeId,
        input: params.input,
        lines: params.lines,
      });
    },
    onSuccess: (_id, params) => {
      invalidate();
      setCreating(false);
      setEditing(null);
      toast.success(
        params.order ? "Ordre de réparation mis à jour." : "Ordre de réparation créé.",
      );
    },
    onError: (e) =>
      toast.error(messageFromUnknownError(e, "L'ordre n'a pas pu être enregistré.")),
  });

  const statusMut = useMutation({
    mutationFn: (params: { id: string; status: RepairStatus }) =>
      setRepairOrderStatus({ repairOrderId: params.id, status: params.status }),
    onSuccess: () => {
      invalidate();
      toast.success("Étape mise à jour.");
    },
    onError: (e) =>
      toast.error(messageFromUnknownError(e, "L'étape n'a pas pu être changée.")),
  });

  const billMut = useMutation({
    mutationFn: (params: {
      id: string;
      payments: Array<{ method: "cash" | "mobile_money" | "card" | "other"; amount: number }>;
      discount: number;
    }) =>
      billRepairOrder({
        repairOrderId: params.id,
        payments: params.payments,
        discount: params.discount,
      }),
    onSuccess: () => {
      invalidate();
      // La facture est une vente réelle : le stock et les ventes ont bougé.
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      setBilling(null);
      toast.success("Réparation facturée. La vente est enregistrée et le stock à jour.");
    },
    onError: (e) =>
      toast.error(messageFromUnknownError(e, "La facturation n'a pas pu être enregistrée.")),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteRepairOrder(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success("Ordre supprimé.");
    },
    onError: (e) =>
      toast.error(messageFromUnknownError(e, "L'ordre n'a pas pu être supprimé.")),
  });

  if (!permLoading && !canView) {
    return (
      <FsPage>
        <FsScreenHeader title="Réparations" />
        <FsCard padding="p-5">
          <div className="flex items-start gap-3">
            <MdLock className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
            <div>
              <p className="text-sm font-bold text-fs-text">Accès réservé</p>
              <p className="mt-1 text-sm text-neutral-600">
                Les ordres de réparation sont réservés aux garages, et au sein du garage
                aux personnes ayant le droit « Gérer les réparations ».
              </p>
            </div>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Réparations"
        subtitle="Les véhicules à l'atelier : ce qu'ils ont, où ils en sont, ce qu'ils vous doivent."
      />

      {/* Compteurs d'atelier */}
      <div className="grid grid-cols-3 gap-2.5">
        <Tile label="À l'atelier" value={String(counts.open)} />
        <Tile label="Prêts à livrer" value={String(counts.ready)} tone="ready" />
        <Tile label="En cours de travaux" value={formatCurrency(counts.openValue)} tone="accent" />
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
            className={fsInputClass("pl-9")}
            placeholder="Plaque, client, panne…"
            aria-label="Rechercher un ordre de réparation"
          />
        </div>
        <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                filter === f.id
                  ? "border-transparent bg-fs-accent text-white"
                  : "border-black/[0.09] bg-fs-card text-neutral-600 hover:border-fs-accent/35 dark:border-white/10 dark:text-neutral-300",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!storeId}
          className="fs-touch-target ml-auto hidden shrink-0 items-center gap-1.5 rounded-xl bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 min-[720px]:inline-flex"
        >
          <MdAdd className="h-4 w-4" aria-hidden />
          Nouvel ordre
        </button>
      </div>

      {ordersQ.isError ? (
        <FsQueryErrorPanel
          className="mt-3"
          error={ordersQ.error}
          onRetry={() => void ordersQ.refetch()}
        />
      ) : ordersQ.isLoading ? (
        <div className="mt-6 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <FsCard className="mt-3" padding="p-6">
          <div className="text-center">
            <MdDirectionsCar className="mx-auto h-8 w-8 text-neutral-300" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">
              {orders.length === 0
                ? "Aucun véhicule à l'atelier"
                : "Aucun ordre ne correspond"}
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              {orders.length === 0
                ? "Créez un ordre dès qu'un véhicule entre : la panne notée à chaud évite les discussions à la livraison."
                : "Changez de filtre ou effacez la recherche."}
            </p>
          </div>
        </FsCard>
      ) : (
        <div className="mt-3 space-y-2.5">
          {visible.map((order) => (
            <RepairCard
              key={order.id}
              order={order}
              onEdit={() => setEditing(order)}
              onAdvance={(status) => statusMut.mutate({ id: order.id, status })}
              onBill={() => setBilling(order)}
              onDelete={() => setDeleting(order)}
              busy={statusMut.isPending}
            />
          ))}
        </div>
      )}

      {/* Bouton flottant mobile */}
      <button
        type="button"
        onClick={() => setCreating(true)}
        disabled={!storeId}
        aria-label="Nouvel ordre de réparation"
        className="fixed bottom-[calc(4.75rem+var(--fs-safe-bottom)+0.5rem)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-fs-accent text-white shadow-lg shadow-black/15 transition-transform active:scale-95 disabled:opacity-60 min-[720px]:hidden"
      >
        <MdAdd className="h-6 w-6" aria-hidden />
      </button>

      {creating || editing ? (
        <RepairOrderDialog
          initial={editing}
          products={productOptions}
          customers={customerOptions}
          staff={staffOptions}
          busy={saveMut.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(input, lines) =>
            saveMut.mutate({ order: editing, input, lines })
          }
        />
      ) : null}

      {billing ? (
        <RepairBillDialog
          order={billing}
          busy={billMut.isPending}
          onClose={() => setBilling(null)}
          onConfirm={({ payments, discount }) =>
            billMut.mutate({ id: billing.id, payments, discount })
          }
        />
      ) : null}

      {deleting ? (
        <FsConfirmDialog
          open
          title={`Supprimer l'ordre ${deleting.orderNumber} ?`}
          message="L'ordre et ses lignes seront effacés. Cette action est irréversible."
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
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent" | "ready";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-fs-card p-3 shadow-sm",
        tone === "accent"
          ? "border-fs-accent/25"
          : tone === "ready"
            ? "border-emerald-500/30"
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
          tone === "ready" && "text-emerald-600 dark:text-emerald-400",
          tone === "neutral" && "text-fs-text",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RepairCard({
  order,
  onEdit,
  onAdvance,
  onBill,
  onDelete,
  busy,
}: {
  order: RepairOrder;
  onEdit: () => void;
  onAdvance: (status: RepairStatus) => void;
  onBill: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const total = repairOrderTotal(order.lines);
  const billed = order.saleId != null;
  const stepIndex = REPAIR_STATUS_FLOW.indexOf(order.status);
  const nextStatus =
    stepIndex >= 0 && stepIndex < REPAIR_STATUS_FLOW.length - 2
      ? REPAIR_STATUS_FLOW[stepIndex + 1]
      : null;

  return (
    <FsCard padding="p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-fs-text">{order.orderNumber}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                statusPillClass(order.status),
              )}
            >
              {REPAIR_STATUS_LABELS[order.status]}
            </span>
            {billed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <MdReceiptLong className="h-3 w-3" aria-hidden />
                Facturé
              </span>
            ) : null}
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-fs-text">
            <MdDirectionsCar className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
            <span className="truncate">{vehicleLabel(order)}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
            <MdPerson className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
            <span className="truncate">{repairCustomerLabel(order)}</span>
          </p>
          {order.reportedIssue ? (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              « {order.reportedIssue} »
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[11px] text-neutral-500">Reçu le {dayLabel(order.receivedAt)}</p>
          <p className="mt-0.5 text-lg font-bold text-fs-text">{formatCurrency(total)}</p>
          {order.lines.length > 0 ? (
            <p className="text-[11px] text-neutral-500">
              {order.lines.filter((l) => l.kind === "part").length} pièce(s) ·{" "}
              {order.lines.filter((l) => l.kind === "labor").length} m.o.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-black/[0.05] pt-2.5 dark:border-white/[0.06]">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-black/[0.1] px-3 py-1.5 text-xs font-semibold text-fs-text hover:border-fs-accent/40 dark:border-white/10"
        >
          Ouvrir
        </button>

        {!billed && nextStatus ? (
          <button
            type="button"
            onClick={() => onAdvance(nextStatus)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-black/[0.1] px-3 py-1.5 text-xs font-semibold text-fs-text hover:border-fs-accent/40 disabled:opacity-50 dark:border-white/10"
          >
            {REPAIR_STATUS_LABELS[nextStatus]}
            <MdArrowForward className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}

        {!billed && order.lines.length > 0 ? (
          <button
            type="button"
            onClick={onBill}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fs-accent px-3 py-1.5 text-xs font-semibold text-white"
          >
            <MdBuild className="h-3.5 w-3.5" aria-hidden />
            Facturer
          </button>
        ) : null}

        {billed ? (
          <Link
            href={ROUTES.sales}
            className="inline-flex items-center gap-1 rounded-lg border border-black/[0.1] px-3 py-1.5 text-xs font-semibold text-fs-accent hover:border-fs-accent/40 dark:border-white/10"
          >
            Voir la facture
            <MdArrowForward className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:text-red-600"
          >
            Supprimer
          </button>
        )}
      </div>
    </FsCard>
  );
}
