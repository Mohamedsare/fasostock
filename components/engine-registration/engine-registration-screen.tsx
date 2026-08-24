"use client";

import { EngineRegistrationDialog } from "@/components/engine-registration/engine-registration-dialog";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { FsCard, FsPage, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { listEngineRegistrations } from "@/lib/features/engine-registration/api";
import {
  REGISTRATION_STEP_LABELS,
  type EngineRegistrationListItem,
  type RegistrationStep,
} from "@/lib/features/engine-registration/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { P } from "@/lib/constants/permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  MdAccountBalance,
  MdAssignmentTurnedIn,
  MdBadge,
  MdCheckCircle,
  MdClose,
  MdCreditCard,
  MdEditDocument,
  MdFilterAltOff,
  MdLayers,
  MdPayments,
  MdPendingActions,
  MdReceiptLong,
  MdSchedule,
  MdSearch,
  MdTaskAlt,
  MdWarningAmber,
} from "react-icons/md";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      timeZone: getActiveTimeZone(),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const STEP_CLASSES: Record<RegistrationStep, string> = {
  awaiting_payment: "bg-red-50 text-red-700",
  ww_to_issue: "bg-amber-50 text-amber-700",
  ww_issued: "bg-blue-50 text-blue-700",
  deposited: "bg-indigo-50 text-indigo-700",
  recepisse: "bg-cyan-50 text-cyan-700",
  recepisse_delivered: "bg-sky-50 text-sky-700",
  carte_grise: "bg-teal-50 text-teal-700",
  delivered: "bg-emerald-100 text-emerald-800",
};

function StepBadge({ step }: { step: RegistrationStep }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        STEP_CLASSES[step],
      )}
    >
      {REGISTRATION_STEP_LABELS[step]}
    </span>
  );
}

function PaymentCell({ row }: { row: EngineRegistrationListItem }) {
  if (row.paid) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        Soldé
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        {row.amountPaid > 0 ? "Partiel" : "Impayé"}
      </span>
      <span className="text-[10px] font-medium text-amber-700">
        Reste {formatCurrency(row.remaining)}
      </span>
    </span>
  );
}

/**
 * Cellule document (WW / Récépissé / Carte grise) — n°, date de réception, et
 * badge de remise au client (traçabilité anti-litige). Vide tant que non émis.
 */
function DocCell({
  number,
  date,
  delivered,
  deliveredDate,
}: {
  number: string | null;
  date: string | null;
  delivered: boolean;
  deliveredDate: string | null;
}) {
  if (!number) {
    return <span className="text-xs font-medium text-neutral-300">—</span>;
  }
  return (
    <div className="flex min-w-30 flex-col items-start gap-1">
      <span className="font-mono text-xs font-semibold text-fs-text">{number}</span>
      {date ? (
        <span className="text-[10px] text-neutral-500">le {formatDate(date)}</span>
      ) : null}
      {delivered ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          <MdCheckCircle className="h-3 w-3" aria-hidden />
          Remis{deliveredDate ? ` ${formatDate(deliveredDate)}` : ""}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          <MdSchedule className="h-3 w-3" aria-hidden />
          Non remis
        </span>
      )}
    </div>
  );
}

type StatFilter = RegistrationStep | "cmc_missing";

const TILE_TONES = {
  neutral: { box: "bg-neutral-100 text-neutral-600", value: "text-fs-text" },
  amber: { box: "bg-amber-50 text-amber-700", value: "text-amber-700" },
  blue: { box: "bg-blue-50 text-blue-700", value: "text-blue-700" },
  indigo: { box: "bg-indigo-50 text-indigo-700", value: "text-indigo-700" },
  cyan: { box: "bg-cyan-50 text-cyan-700", value: "text-cyan-700" },
  emerald: { box: "bg-emerald-50 text-emerald-700", value: "text-emerald-700" },
  green: { box: "bg-emerald-100 text-emerald-800", value: "text-emerald-800" },
  red: { box: "bg-red-50 text-red-700", value: "text-red-700" },
} as const;
type TileTone = keyof typeof TILE_TONES;

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string | null;
  icon: ComponentType<{ className?: string }>;
  tone: TileTone;
  active: boolean;
  onClick: () => void;
}) {
  const t = TILE_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-fs-card p-3 text-left shadow-sm transition-colors",
        active
          ? "border-fs-accent ring-1 ring-fs-accent"
          : "border-black/[0.06] hover:border-black/[0.12]",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          t.box,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className={cn("text-xl font-bold leading-none", t.value)}>{value}</p>
        <p className="mt-1 truncate text-xs font-medium text-neutral-600">{label}</p>
        {sub ? <p className="mt-0.5 truncate text-[10px] text-neutral-500">{sub}</p> : null}
      </div>
    </button>
  );
}

export function EngineRegistrationScreen() {
  const { data: ctx, helpers, hasPermission, isLoading } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const currentStoreId = ctx?.storeId ?? null;
  const stores = useMemo(() => ctx?.stores ?? [], [ctx?.stores]);
  const canEdit = hasPermission(P.salesUpdate) || Boolean(helpers?.isOwner);

  const [target, setTarget] = useState<EngineRegistrationListItem | null>(null);
  const [stepFilter, setStepFilter] = useState<StatFilter | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 180);
    return () => clearTimeout(t);
  }, [search]);

  const activeStore = stores.find((s) => s.id === currentStoreId);
  const registrationOn = currentStoreId
    ? activeStore?.engineRegistrationEnabled === true
    : stores.some((s) => s.engineRegistrationEnabled === true);

  const listQ = useQuery({
    queryKey: queryKeys.engineRegistrations({ companyId, storeId: currentStoreId }),
    queryFn: () => listEngineRegistrations({ companyId, storeId: currentStoreId }),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });

  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  // Un dossier « sans CMC » = CMC non disponible et pas encore déposé au ministère (bloque la suite).
  const isCmcMissing = (r: EngineRegistrationListItem) =>
    !r.registration.cmcAvailable && !r.registration.depositDate && r.step !== "delivered";

  const stats = useMemo(() => {
    const c = {
      total: rows.length,
      awaiting_payment: 0,
      ww_to_issue: 0,
      ww_issued: 0,
      deposited: 0,
      recepisse: 0,
      recepisse_delivered: 0,
      carte_grise: 0,
      delivered: 0,
      cmcMissing: 0,
      remaining: 0,
    };
    for (const r of rows) {
      c[r.step] += 1;
      if (isCmcMissing(r)) c.cmcMissing += 1;
      c.remaining += r.remaining;
    }
    return c;
  }, [rows]);

  const q = normalize(debouncedSearch);
  const filteredRows = useMemo(() => {
    let list = rows;
    if (stepFilter) {
      list =
        stepFilter === "cmc_missing"
          ? list.filter(isCmcMissing)
          : list.filter((r) => r.step === stepFilter);
    }
    if (q) {
      list = list.filter((r) =>
        normalize(
          [r.saleNumber, r.clientName, r.clientPhone, r.engineDesignation, r.engineChassis]
            .filter(Boolean)
            .join(" "),
        ).includes(q),
      );
    }
    return list;
  }, [rows, stepFilter, q]);

  const toggleFilter = (k: StatFilter) => setStepFilter((cur) => (cur === k ? null : k));

  if (isLoading && rows.length === 0) {
    return (
      <FsPage className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-5 min-[900px]:px-7 min-[900px]:pt-7">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if ((!helpers?.canEngineRegistration || !registrationOn) && rows.length === 0) {
    return (
      <FsPage className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-5 min-[900px]:px-7 min-[900px]:pt-7">
        <FsCard className="mt-6" padding="p-8">
          <p className="text-center text-base text-neutral-600">
            Le module « Immatriculation Engins » n&apos;est pas activé pour cette boutique.
          </p>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-5 min-[900px]:px-7 min-[900px]:pt-7">
      {/* Marge basse mobile : rien ne doit passer sous la barre de navigation fixe. */}
      <div className="flex flex-col gap-6 pb-[calc(4.75rem+var(--fs-safe-bottom))] min-[1024px]:pb-0">
        <div className="flex items-center gap-2.5">
          <MdBadge className="h-7 w-7 text-fs-accent" aria-hidden />
          <h1 className="text-xl font-bold text-fs-text min-[900px]:text-2xl">
            Immatriculation Engins
          </h1>
        </div>

        {rows.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-fs-text">
              Vue d&apos;ensemble
              <span className="ml-2 font-normal text-neutral-500">
                — cliquez une carte pour filtrer
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-2.5 min-[560px]:grid-cols-3 min-[820px]:grid-cols-4 min-[1100px]:grid-cols-5">
              <StatTile
                label="Total"
                value={stats.total}
                icon={MdLayers}
                tone="neutral"
                active={stepFilter === null}
                onClick={() => setStepFilter(null)}
              />
              <StatTile
                label="En attente paiement"
                value={stats.awaiting_payment}
                sub={stats.remaining > 0 ? `${formatCurrency(stats.remaining)} dû` : null}
                icon={MdPayments}
                tone="amber"
                active={stepFilter === "awaiting_payment"}
                onClick={() => toggleFilter("awaiting_payment")}
              />
              <StatTile
                label="WW à émettre"
                value={stats.ww_to_issue}
                icon={MdPendingActions}
                tone="amber"
                active={stepFilter === "ww_to_issue"}
                onClick={() => toggleFilter("ww_to_issue")}
              />
              <StatTile
                label="WW émis"
                value={stats.ww_issued}
                icon={MdCreditCard}
                tone="blue"
                active={stepFilter === "ww_issued"}
                onClick={() => toggleFilter("ww_issued")}
              />
              <StatTile
                label="Déposé au ministère"
                value={stats.deposited}
                icon={MdAccountBalance}
                tone="indigo"
                active={stepFilter === "deposited"}
                onClick={() => toggleFilter("deposited")}
              />
              <StatTile
                label="Récépissé à remettre"
                value={stats.recepisse}
                sub="reçu, pas encore remis"
                icon={MdReceiptLong}
                tone="cyan"
                active={stepFilter === "recepisse"}
                onClick={() => toggleFilter("recepisse")}
              />
              <StatTile
                label="Récépissé remis"
                value={stats.recepisse_delivered}
                icon={MdAssignmentTurnedIn}
                tone="blue"
                active={stepFilter === "recepisse_delivered"}
                onClick={() => toggleFilter("recepisse_delivered")}
              />
              <StatTile
                label="Carte grise à remettre"
                value={stats.carte_grise}
                icon={MdAssignmentTurnedIn}
                tone="emerald"
                active={stepFilter === "carte_grise"}
                onClick={() => toggleFilter("carte_grise")}
              />
              <StatTile
                label="Terminés"
                value={stats.delivered}
                icon={MdTaskAlt}
                tone="green"
                active={stepFilter === "delivered"}
                onClick={() => toggleFilter("delivered")}
              />
              <StatTile
                label="Sans CMC"
                value={stats.cmcMissing}
                icon={MdWarningAmber}
                tone="red"
                active={stepFilter === "cmc_missing"}
                onClick={() => toggleFilter("cmc_missing")}
              />
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-3 flex flex-col gap-3 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-fs-text">
                Dossiers d&apos;immatriculation
                {(q || stepFilter) && rows.length > 0 ? (
                  <span className="ml-2 font-normal text-neutral-500">
                    · {filteredRows.length} résultat{filteredRows.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </h2>
              {stepFilter ? (
                <button
                  type="button"
                  onClick={() => setStepFilter(null)}
                  className="inline-flex items-center gap-1 rounded-full bg-fs-accent/10 px-2.5 py-1 text-xs font-semibold text-fs-accent hover:bg-fs-accent/15"
                >
                  {stepFilter === "cmc_missing"
                    ? "Sans CMC"
                    : REGISTRATION_STEP_LABELS[stepFilter]}
                  <MdFilterAltOff className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
            {rows.length > 0 ? (
              <div className="relative w-full min-[560px]:w-80">
                <MdSearch
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher (réf, client, châssis…)"
                  className={fsInputClass("rounded-lg pl-10 pr-9")}
                  aria-label="Rechercher un dossier"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Effacer la recherche"
                    className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 hover:text-neutral-600"
                  >
                    <MdClose className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {rows.length === 0 ? (
            listQ.isSuccess ? (
              <FsCard padding="px-4 py-12">
                <p className="text-center text-base text-neutral-600">
                  Aucune vente d&apos;engin à immatriculer.
                </p>
              </FsCard>
            ) : (
              <FsCard padding="p-8">
                <div className="flex justify-center">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                </div>
              </FsCard>
            )
          ) : filteredRows.length === 0 ? (
            <FsCard padding="px-4 py-12">
              <p className="text-center text-base text-neutral-600">
                {q
                  ? `Aucun dossier ne correspond à « ${debouncedSearch} ».`
                  : "Aucun dossier dans cette catégorie."}
              </p>
            </FsCard>
          ) : (
            <FsCard className="overflow-hidden p-0" padding="p-0">
              <FsHorizontalScroll className="touch-pan-x">
                <table className="w-full min-w-310 border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/6 bg-fs-surface-container/80">
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Réf.</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Date</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Client</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Châssis</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Paiement</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <MdCreditCard className="h-4 w-4 text-blue-600" aria-hidden />
                          WW
                        </span>
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <MdReceiptLong className="h-4 w-4 text-cyan-600" aria-hidden />
                          Récépissé
                        </span>
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <MdAssignmentTurnedIn className="h-4 w-4 text-teal-600" aria-hidden />
                          Carte grise
                        </span>
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Étape</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr key={r.saleId} className="border-b border-black/4 last:border-0">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-fs-text">
                          {r.saleNumber}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                          {formatDate(r.createdAt)}
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3">{r.clientName || "—"}</td>
                        <td className="max-w-[160px] truncate px-4 py-3">
                          {r.engineChassis || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <PaymentCell row={r} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <DocCell
                            number={r.registration.wwNumber}
                            date={r.registration.wwDate}
                            delivered={r.registration.wwDelivered}
                            deliveredDate={r.registration.wwDeliveredDate}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <DocCell
                            number={r.registration.recepisseNumber}
                            date={r.registration.recepisseDate}
                            delivered={r.registration.recepisseDelivered}
                            deliveredDate={r.registration.recepisseDeliveredDate}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <DocCell
                            number={r.registration.carteGriseNumber}
                            date={r.registration.carteGriseDate}
                            delivered={r.registration.carteGriseDelivered}
                            deliveredDate={r.registration.deliveredToClientDate}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StepBadge step={r.step} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <button
                            type="button"
                            onClick={() => setTarget(r)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-fs-accent px-3 text-xs font-semibold text-white transition-colors hover:opacity-95"
                          >
                            <MdEditDocument className="h-4 w-4" aria-hidden />
                            Gérer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </FsHorizontalScroll>
            </FsCard>
          )}
        </div>
      </div>

      {target ? (
        <EngineRegistrationDialog
          key={target.saleId}
          row={target}
          companyId={companyId}
          canEdit={canEdit}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </FsPage>
  );
}
