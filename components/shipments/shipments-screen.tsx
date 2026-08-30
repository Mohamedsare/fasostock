"use client";

/**
 * « Expéditions » — le colis qui part en province, et les frais qu'on avance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN EXISTE POUR RATTRAPER
 * ─────────────────────────────────────────────────────────────────────────────
 * Un grossiste vend à des boutiquiers de Fada, de Dori, de Gaoua. Ils commandent au
 * téléphone, il facture, il porte le colis à la gare routière, il paie le car — trois à
 * dix mille francs — et il attend d'être remboursé.
 *
 * Ces frais-là ne sont dans aucune facture (le montant n'était pas connu quand elle a
 * été faite), ce ne sont pas des dépenses de la maison (ils sont censés revenir), et ils
 * sont individuellement trop petits pour qu'on y pense. Vingt colis par semaine, et
 * c'est le bénéfice d'une journée qui est resté à la gare routière.
 *
 * L'écran est donc organisé autour d'UN chiffre : « frais avancés non remboursés ». Le
 * reste — statut du colis, transporteur, bordereau — sert à ce que ce chiffre soit
 * réclamable : sans la date d'envoi et le numéro de bordereau, une relance trois
 * semaines plus tard n'a aucun poids.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne touche pas au stock. Jamais. La marchandise est déjà sortie par la vente à
 * laquelle l'expédition se rattache — déduire une seconde fois créerait un manquant
 * fantôme à chaque colis. C'est le piège évident du module, et il est fermé en base
 * (aucune fonction de 00213 n'écrit dans `store_inventory`).
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdCheckCircle,
  MdClose,
  MdInventory2,
  MdLocalShipping,
  MdLock,
  MdOutlinePayments,
  MdPictureAsPdf,
  MdReceiptLong,
  MdSearch,
  MdWhatsapp,
} from "react-icons/md";

import { ShipmentFormDialog } from "@/components/shipments/shipment-form-dialog";
import { ShipmentReimbursementDialog } from "@/components/shipments/shipment-reimbursement-dialog";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  FsSectionLabel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsPager } from "@/components/ui/fs-pager";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { whatsappUrl } from "@/lib/features/share/share-document";
import {
  addShipmentReimbursement,
  listShipments,
  logShipmentReminder,
  setShipmentStatus,
  SHIPMENT_AMOUNT_EPS,
} from "@/lib/features/shipments/api";
import {
  buildShipmentDispatchMessage,
  buildShipmentFeeReminderMessage,
} from "@/lib/features/shipments/messages";
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENTS_PAGE_SIZE,
  type Shipment,
  type ShipmentStatus,
} from "@/lib/features/shipments/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, getActiveCurrency } from "@/lib/utils/currency";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function dateTimeLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    timeZone: getActiveTimeZone(),
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Ouvre le bordereau A4. Le serveur relit tout en base — rien de chiffré ne part d'ici. */
async function openShipmentPdf(shipmentId: string): Promise<void> {
  const res = await fetch("/api/pdf/shipment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ shipmentId, currencyCode: getActiveCurrency() }),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* texte brut */
    }
    throw new Error(msg || "Le bordereau n'a pas pu être généré.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const STATUS_STYLES: Record<ShipmentStatus, string> = {
  preparing: "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300",
  shipped: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-neutral-400/20 text-neutral-500",
};

type Tab = "fees" | "transit" | "all";

export function ShipmentsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const contextStoreId = ctx.data?.storeId ?? null;
  const stores = useMemo(() => ctx.data?.stores ?? [], [ctx.data?.stores]);
  const companyName = ctx.data?.companyName ?? "";
  const canView = h?.canShipments ?? false;

  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const storeId = contextStoreId ?? pickedStoreId ?? stores[0]?.id ?? null;
  const storeName = stores.find((s) => s.id === storeId)?.name ?? companyName;

  const [tab, setTab] = useState<Tab>("fees");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reimbursing, setReimbursing] = useState<Shipment | null>(null);
  const [created, setCreated] = useState<Shipment | null>(null);

  /*
   * PAGINÉ CÔTÉ SERVEUR. Un grossiste qui expédie en province fait plusieurs colis par
   * jour : au bout d'un an, tout charger d'un coup revient à envoyer des milliers de
   * lignes à un téléphone pour en afficher vingt.
   *
   * `placeholderData` garde la page précédente affichée pendant que la suivante arrive :
   * sans lui, chaque clic vide la liste et fait sauter la mise en page — sur une
   * connexion lente, l'écran clignote à chaque changement de page.
   */
  const [page, setPage] = useState(0);
  const listQ = useQuery({
    queryKey: queryKeys.shipmentsPage(companyId, contextStoreId, page),
    queryFn: () =>
      listShipments({
        companyId,
        storeId: contextStoreId,
        limit: SHIPMENTS_PAGE_SIZE,
        offset: page * SHIPMENTS_PAGE_SIZE,
      }),
    enabled: Boolean(companyId) && canView,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  /*
   * Changer de boutique remet la pagination à sa première page — sinon on atterrit
   * « page 4 » d'une boutique qui n'a que douze lignes, donc sur un écran vide.
   *
   * Différé d'un tour de boucle : remettre l'état à plat en plein corps d'effet
   * déclenche la cascade de rendus que `react-hooks/set-state-in-effect` interdit.
   */
  useEffect(() => {
    const t = setTimeout(() => setPage(0), 0);
    return () => clearTimeout(t);
  }, [contextStoreId]);

  const shipments = useMemo(() => listQ.data?.rows ?? [], [listQ.data]);
  const hasMore = listQ.data?.hasMore ?? false;

  /** Le chiffre autour duquel l'écran est construit. */
  const summary = useMemo(() => {
    let advanced = 0;
    let recovered = 0;
    let open = 0;
    let inTransit = 0;
    for (const s of shipments) {
      if (s.status === "cancelled") continue;
      if (s.shippingPaidBy === "company") {
        advanced += s.shippingCost;
        recovered += s.shippingReimbursed;
        open += s.shippingRemaining;
      }
      if (s.status === "shipped") inTransit += 1;
    }
    return { advanced, recovered, open, inTransit };
  }, [shipments]);

  const rows = useMemo(() => {
    const q = norm(query);
    return shipments.filter((s) => {
      if (tab === "fees") {
        if (s.status === "cancelled") return false;
        if (s.shippingPaidBy !== "company") return false;
        if (s.shippingRemaining <= SHIPMENT_AMOUNT_EPS) return false;
      }
      if (tab === "transit" && s.status !== "shipped" && s.status !== "preparing") {
        return false;
      }
      if (!q) return true;
      return (
        norm(s.recipientName).includes(q) ||
        norm(s.destination).includes(q) ||
        norm(s.shipmentNumber).includes(q) ||
        norm(s.carrier ?? "").includes(q) ||
        norm(s.trackingRef ?? "").includes(q)
      );
    });
  }, [shipments, tab, query]);

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: ShipmentStatus }) =>
      setShipmentStatus(v.id, v.status),
    onSuccess: async (_d, v) => {
      toast.success(
        v.status === "shipped"
          ? "Colis marqué expédié."
          : v.status === "delivered"
            ? "Colis marqué livré."
            : "Expédition mise à jour.",
      );
      await qc.invalidateQueries({ queryKey: ["shipments", companyId] });
    },
    onError: (e) => toastMutationError("shipments", e),
  });

  const reimburseMut = useMutation({
    mutationFn: (v: {
      shipmentId: string;
      amount: number;
      method: string;
      reference: string | null;
      note: string | null;
    }) => addShipmentReimbursement(v),
    onSuccess: async (remaining) => {
      toast.success(
        remaining <= SHIPMENT_AMOUNT_EPS
          ? "Remboursement enregistré. Les frais sont soldés."
          : `Remboursement enregistré. Reste ${formatCurrency(remaining)}.`,
      );
      setReimbursing(null);
      await qc.invalidateQueries({ queryKey: ["shipments", companyId] });
    },
    onError: (e) => toastMutationError("shipments", e),
  });

  const pdfMut = useMutation({
    mutationFn: (id: string) => openShipmentPdf(id),
    onError: (e) => toastMutationError("shipments", e),
  });

  function sendDispatch(s: Shipment) {
    const message = buildShipmentDispatchMessage({
      shipment: s,
      storeName: s.storeName ?? storeName,
    });
    window.open(whatsappUrl(s.recipientPhone, message), "_blank", "noopener,noreferrer");
  }

  function sendFeeReminder(s: Shipment) {
    const message = buildShipmentFeeReminderMessage({
      shipment: s,
      storeName: s.storeName ?? storeName,
    });
    window.open(whatsappUrl(s.recipientPhone, message), "_blank", "noopener,noreferrer");
    /*
     * Trace posée à l'OUVERTURE de WhatsApp : le navigateur ne saura jamais si le
     * message est réellement parti. Le pire cas est une relance comptée pour rien —
     * sans gravité. Le cas inverse (réclamer trois fois les mêmes 4 500 F à un client
     * qu'on vient de contacter) coûte, lui, un client de province.
     */
    void logShipmentReminder({
      companyId,
      shipmentId: s.id,
      amountDue: s.shippingRemaining,
      message,
    }).then(() => qc.invalidateQueries({ queryKey: ["shipments", companyId] }));
  }

  if (permLoading) {
    return (
      <FsPage>
        <FsScreenHeader title="Expéditions" />
        <div className="flex justify-center py-10" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!canView) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Expéditions"
          subtitle="Les colis qui partent en province, et les frais avancés."
        />
        <FsCard padding="p-6">
          <div className="text-center">
            <MdLock className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">Accès réservé</p>
            <p className="mt-1 text-xs text-neutral-600">
              {h?.shipmentsOn
                ? "Demandez au propriétaire le droit « Gérer les expéditions » (page Employés)."
                : "Le propriétaire n'a pas encore activé les expéditions (Paramètres)."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Expéditions"
        subtitle="Ce qui est parti, chez qui, et ce que le transport vous doit encore."
      />

      {/* Le chiffre central, en premier. */}
      <FsCard padding="p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-neutral-500">
              Frais de transport avancés, non remboursés
            </p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-fs-accent">
              {formatCurrency(summary.open)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-fs-accent px-3.5 py-2.5 text-sm font-semibold text-white"
          >
            <MdAdd className="h-5 w-5" aria-hidden />
            Nouvelle expédition
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-2.5">
          <div>
            <p className="text-[11px] font-medium text-neutral-500">Total avancé</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-fs-text">
              {formatCurrency(summary.advanced)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-neutral-500">Déjà récupéré</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">
              {formatCurrency(summary.recovered)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-neutral-500">En route</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-sky-700">
              {summary.inTransit}
            </p>
          </div>
        </div>
      </FsCard>

      {contextStoreId == null && stores.length > 1 ? (
        <FsCard className="mt-3" padding="p-3">
          <FsSectionLabel>Boutique expéditrice</FsSectionLabel>
          <select
            value={storeId ?? ""}
            onChange={(e) => setPickedStoreId(e.target.value)}
            className={fsInputClass("mt-1.5")}
            aria-label="Boutique"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FsCard>
      ) : null}

      {created ? (
        <FsCard className="mt-3 border-emerald-500/40 bg-emerald-500/[0.06]" padding="p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <MdCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fs-text">
                {created.shipmentNumber} — {created.recipientName} ({created.destination})
              </p>
              <p className="mt-0.5 text-xs text-neutral-600">
                Prévenez le destinataire : un colis dont personne ne sait qu&apos;il est
                arrivé dort à la gare routière.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => sendDispatch(created)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#25D366] px-3 py-2 text-xs font-semibold text-white"
                >
                  <MdWhatsapp className="h-4 w-4" aria-hidden />
                  Prévenir le destinataire
                </button>
                <button
                  type="button"
                  disabled={pdfMut.isPending}
                  onClick={() => pdfMut.mutate(created.id)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-black/[0.1] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-60"
                >
                  <MdPictureAsPdf className="h-4 w-4" aria-hidden />
                  Bordereau A4
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="shrink-0 rounded-md p-1 text-neutral-500"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </FsCard>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <FsFilterChip
          icon={MdOutlinePayments}
          label="Frais à récupérer"
          selected={tab === "fees"}
          onClick={() => setTab("fees")}
        />
        <FsFilterChip
          icon={MdLocalShipping}
          label="En cours"
          selected={tab === "transit"}
          onClick={() => setTab("transit")}
        />
        <FsFilterChip
          icon={MdInventory2}
          label="Toutes"
          selected={tab === "all"}
          onClick={() => setTab("all")}
        />
      </div>

      <div className="relative mt-2">
        <MdSearch
          className="pointer-events-none absolute left-2.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un destinataire, une ville, un bordereau…"
          className={fsInputClass("w-full pl-9")}
          aria-label="Chercher une expédition"
        />
      </div>

      {listQ.isError ? (
        <div className="mt-3">
          <FsQueryErrorPanel error={listQ.error} onRetry={() => void listQ.refetch()} />
        </div>
      ) : null}

      {listQ.isPending ? (
        <div className="flex justify-center py-10" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : null}

      {!listQ.isPending && !listQ.isError && rows.length === 0 ? (
        <FsCard className="mt-3" padding="p-6">
          <div className="text-center">
            <MdCheckCircle className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">
              {tab === "fees"
                ? "Aucun frais de transport à récupérer"
                : "Aucune expédition ici"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              {tab === "fees"
                ? "Tout ce que vous avez avancé au transporteur vous a été rendu."
                : "Enregistrez une expédition pour suivre le colis et les frais avancés."}
            </p>
          </div>
        </FsCard>
      ) : null}

      <div className="mt-3 space-y-2">
        {rows.map((s) => {
          const open = expanded === s.id;
          const feesOpen =
            s.shippingPaidBy === "company" && s.shippingRemaining > SHIPMENT_AMOUNT_EPS;
          return (
            <FsCard key={s.id} padding="p-3">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : s.id)}
                className="flex w-full items-start gap-2 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-fs-text">{s.recipientName}</span>
                    <span className="text-sm text-neutral-500">·</span>
                    <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                      {s.destination}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        STATUS_STYLES[s.status],
                      )}
                    >
                      {SHIPMENT_STATUS_LABELS[s.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {s.shipmentNumber} · {dateTimeLabel(s.createdAt)}
                    {s.carrier ? ` · ${s.carrier}` : ""}
                    {s.trackingRef ? ` · bordereau ${s.trackingRef}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {s.packageCount} colis
                    {s.saleNumber ? ` · facture ${s.saleNumber}` : ""}
                    {s.expectedAt ? ` · arrivée ${dayLabel(s.expectedAt)}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-medium text-neutral-500">
                    {feesOpen ? "Transport dû" : "Transport"}
                  </p>
                  <p
                    className={cn(
                      "text-base font-black tabular-nums",
                      feesOpen ? "text-fs-accent" : "text-emerald-700",
                    )}
                  >
                    {formatCurrency(feesOpen ? s.shippingRemaining : s.shippingCost)}
                  </p>
                </div>
              </button>

              {open ? (
                <div className="mt-2.5 space-y-2 border-t border-black/[0.06] pt-2.5">
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-neutral-500">Téléphone</dt>
                      <dd className="font-semibold text-fs-text">
                        {s.recipientPhone ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-neutral-500">Transporteur</dt>
                      <dd className="font-semibold text-fs-text">{s.carrier ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-neutral-500">Marchandise</dt>
                      <dd className="font-semibold tabular-nums text-fs-text">
                        {s.goodsAmount > 0 ? formatCurrency(s.goodsAmount) : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-neutral-500">Frais avancés par</dt>
                      <dd className="font-semibold text-fs-text">
                        {s.shippingPaidBy === "company" ? "La maison" : "Le client"}
                      </dd>
                    </div>
                    {s.shippingReimbursed > 0 ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">Déjà remboursé</dt>
                        <dd className="font-semibold tabular-nums text-emerald-700">
                          {formatCurrency(s.shippingReimbursed)}
                        </dd>
                      </div>
                    ) : null}
                    {s.shippedAt ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">Expédié le</dt>
                        <dd className="font-semibold text-fs-text">
                          {dateTimeLabel(s.shippedAt)}
                        </dd>
                      </div>
                    ) : null}
                    {s.deliveredAt ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">Livré le</dt>
                        <dd className="font-semibold text-fs-text">
                          {dateTimeLabel(s.deliveredAt)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {s.packageNote ? (
                    <p className="rounded-[8px] bg-black/[0.03] px-2.5 py-1.5 text-xs text-neutral-600">
                      {s.packageNote}
                    </p>
                  ) : null}
                  {s.note ? (
                    <p className="rounded-[8px] bg-black/[0.03] px-2.5 py-1.5 text-xs text-neutral-600">
                      {s.note}
                    </p>
                  ) : null}

                  {s.reminderCount > 0 ? (
                    <p className="text-[11px] text-neutral-500">
                      {s.reminderCount} relance{s.reminderCount > 1 ? "s" : ""} envoyée
                      {s.reminderCount > 1 ? "s" : ""} · dernière le{" "}
                      {dateTimeLabel(s.lastReminderAt)}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-1.5">
                    {s.status === "preparing" ? (
                      <button
                        type="button"
                        disabled={statusMut.isPending}
                        onClick={() => statusMut.mutate({ id: s.id, status: "shipped" })}
                        className="inline-flex items-center gap-1.5 rounded-[8px] bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        <MdLocalShipping className="h-4 w-4" aria-hidden />
                        C&apos;est parti
                      </button>
                    ) : null}
                    {s.status === "shipped" ? (
                      <button
                        type="button"
                        disabled={statusMut.isPending}
                        onClick={() => statusMut.mutate({ id: s.id, status: "delivered" })}
                        className="inline-flex items-center gap-1.5 rounded-[8px] bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        <MdCheckCircle className="h-4 w-4" aria-hidden />
                        Retiré par le client
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => sendDispatch(s)}
                      className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#25D366] px-3 py-2 text-xs font-semibold text-white"
                    >
                      <MdWhatsapp className="h-4 w-4" aria-hidden />
                      Avis d&apos;expédition
                    </button>
                    {feesOpen ? (
                      <>
                        <button
                          type="button"
                          onClick={() => sendFeeReminder(s)}
                          className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#25D366] px-3 py-2 text-xs font-semibold text-[#128C7E]"
                        >
                          <MdWhatsapp className="h-4 w-4" aria-hidden />
                          Réclamer le transport
                        </button>
                        <button
                          type="button"
                          onClick={() => setReimbursing(s)}
                          className="inline-flex items-center gap-1.5 rounded-[8px] bg-fs-accent px-3 py-2 text-xs font-semibold text-white"
                        >
                          <MdOutlinePayments className="h-4 w-4" aria-hidden />
                          Frais remboursés
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      disabled={pdfMut.isPending}
                      onClick={() => pdfMut.mutate(s.id)}
                      className="inline-flex items-center gap-1.5 rounded-[8px] border border-black/[0.1] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-60"
                    >
                      <MdReceiptLong className="h-4 w-4" aria-hidden />
                      Bordereau A4
                    </button>
                  </div>
                </div>
              ) : null}
            </FsCard>
          );
        })}
      </div>

      {/*
        Le pager compte la PAGE SERVEUR (« Expéditions 21 – 40 »). Les puces et la
        recherche affinent ensuite cette page — même convention que partout ailleurs,
        et l'on ne promet pas une recherche qui fouillerait un an d'archives sans les
        charger.
      */}
      <FsPager
        page={page}
        hasMore={hasMore}
        pageSize={SHIPMENTS_PAGE_SIZE}
        rowsOnPage={shipments.length}
        busy={listQ.isFetching}
        onPageChange={setPage}
        itemLabel="Expéditions"
      />

      {formOpen && storeId ? (
        <ShipmentFormDialog
          companyId={companyId}
          storeId={storeId}
          onClose={() => setFormOpen(false)}
          onCreated={async (id) => {
            setFormOpen(false);
            const fresh = await listShipments({ companyId, storeId, limit: 5 });
            setCreated(fresh.rows.find((s) => s.id === id) ?? null);
            await qc.invalidateQueries({ queryKey: ["shipments", companyId] });
          }}
        />
      ) : null}

      {reimbursing ? (
        <ShipmentReimbursementDialog
          shipment={reimbursing}
          busy={reimburseMut.isPending}
          onClose={() => setReimbursing(null)}
          onSubmit={(v) => reimburseMut.mutate({ shipmentId: reimbursing.id, ...v })}
        />
      ) : null}
    </FsPage>
  );
}
