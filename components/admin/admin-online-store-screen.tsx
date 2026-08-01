"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import {
  adminListCompanies,
  adminListOnlineStores,
  adminSetStoreOnlineStore,
  adminUpdateCompany,
} from "@/lib/features/admin/api";
import { onlineStorePath } from "@/lib/config/routes";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MdBolt,
  MdContentCopy,
  MdOpenInNew,
  MdRefresh,
  MdShoppingBag,
  MdStorefront,
  MdSync,
} from "react-icons/md";

const QK_COMPANIES = ["admin-online-store-companies"] as const;
const QK_STORES = ["admin-online-store-overview"] as const;

function fcfa(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

/**
 * Admin › Boutique en ligne.
 *
 * Le module ouvre une vitrine publique (/boutique/<lien>) adossée au stock réel d'une
 * boutique. Deux interrupteurs additifs : toute l'entreprise, ou boutique par boutique.
 * Tant qu'aucun des deux n'est actif, la page reste invisible pour le client et les RPC
 * publiques refusent de servir le catalogue.
 */
export function AdminOnlineStoreScreen() {
  const qc = useQueryClient();
  const [companySearch, setCompanySearch] = useState("");
  const [storeSearch, setStoreSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  const companiesQ = useQuery({ queryKey: QK_COMPANIES, queryFn: adminListCompanies });
  const storesQ = useQuery({ queryKey: QK_STORES, queryFn: adminListOnlineStores });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QK_COMPANIES });
    void qc.invalidateQueries({ queryKey: QK_STORES });
    void qc.invalidateQueries({ queryKey: queryKeys.appContext });
  };

  const companyMut = useMutation({
    mutationFn: (p: { id: string; enabled: boolean }) =>
      adminUpdateCompany(p.id, { onlineStoreEnabled: p.enabled }),
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(
        v.enabled
          ? "Boutique en ligne ouverte pour toute l'entreprise."
          : "Boutique en ligne fermée pour l'entreprise (les boutiques activées restent actives).",
      );
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const storeMut = useMutation({
    mutationFn: (p: { id: string; enabled: boolean }) => adminSetStoreOnlineStore(p.id, p.enabled),
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(
        v.enabled
          ? "Boutique en ligne activée pour cette boutique."
          : "Boutique en ligne désactivée pour cette boutique.",
      );
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const companies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    const rows = companiesQ.data ?? [];
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q));
  }, [companiesQ.data, companySearch]);

  const stores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    let rows = storesQ.data ?? [];
    if (companyFilter) rows = rows.filter((s) => s.companyId === companyFilter);
    if (onlyEnabled) rows = rows.filter((s) => s.storeEnabled || s.companyEnabled);
    if (!q) return rows;
    return rows.filter(
      (s) =>
        s.storeName.toLowerCase().includes(q) ||
        s.companyName.toLowerCase().includes(q) ||
        (s.slug ?? "").toLowerCase().includes(q),
    );
  }, [storesQ.data, storeSearch, companyFilter, onlyEnabled]);

  const stats = useMemo(() => {
    const rows = storesQ.data ?? [];
    const companiesOn = (companiesQ.data ?? []).filter((c) => c.onlineStoreEnabled).length;
    return {
      companiesOn,
      storesOn: rows.filter((s) => s.storeEnabled || s.companyEnabled).length,
      published: rows.filter((s) => s.isPublished).length,
      pending: rows.reduce((sum, s) => sum + s.ordersPending, 0),
      revenue: rows.reduce((sum, s) => sum + s.ordersTotal, 0),
    };
  }, [storesQ.data, companiesQ.data]);

  async function copyLink(slug: string) {
    const url = `${window.location.origin}${onlineStorePath(slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien catalogue copié.");
    } catch {
      toast.error("Copie impossible — sélectionnez le lien manuellement.");
    }
  }

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AdminPageHeader
          title="Boutique en ligne"
          description="Ouvrez la vitrine web (lien catalogue + commandes) pour une entreprise entière ou seulement pour certaines boutiques. Le stock reste celui de la boutique : ce qui part en caisse disparaît du catalogue, et une commande web devient une vente FasoStock normale."
        />
        <button
          type="button"
          onClick={() => {
            void companiesQ.refetch();
            void storesQ.refetch();
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <MdRefresh className="h-5 w-5" aria-hidden />
          Rafraîchir
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<MdStorefront className="h-5 w-5" aria-hidden />}
          label="Entreprises ouvertes"
          value={String(stats.companiesOn)}
          hint="drapeau entreprise"
          tone="emerald"
        />
        <StatTile
          icon={<MdBolt className="h-5 w-5" aria-hidden />}
          label="Boutiques actives"
          value={String(stats.storesOn)}
          hint={`${stats.published} vitrine${stats.published > 1 ? "s" : ""} publiée${stats.published > 1 ? "s" : ""}`}
          tone="sky"
        />
        <StatTile
          icon={<MdShoppingBag className="h-5 w-5" aria-hidden />}
          label="Commandes à traiter"
          value={String(stats.pending)}
          hint="en attente chez les clients"
          tone="amber"
        />
        <StatTile
          icon={<MdSync className="h-5 w-5" aria-hidden />}
          label="Encaissé via le web"
          value={fcfa(stats.revenue)}
          hint="commandes converties en ventes"
          tone="violet"
        />
      </div>

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Comment ça marche</h3>
        <ol className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
          <li className="rounded-xl bg-slate-50 p-3">
            <span className="font-bold text-slate-900">1. Stock synchronisé.</span> Le
            catalogue lit le stock réel de la boutique. Un article vendu en caisse
            disparaît du web : impossible de vendre en ligne ce qui n&apos;existe plus.
          </li>
          <li className="rounded-xl bg-slate-50 p-3">
            <span className="font-bold text-slate-900">2. Un seul écran.</span> Caisse,
            web et WhatsApp arrivent au même endroit. Le gestionnaire valide, encaisse,
            et le reçu part comme une vente normale.
          </li>
          <li className="rounded-xl bg-slate-50 p-3">
            <span className="font-bold text-slate-900">3. Lien catalogue.</span> Pas de
            site à construire : FasoStock génère un lien propre à partager sur WhatsApp
            ou Facebook.
          </li>
        </ol>
      </AdminCard>

      <AdminCard padding="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Par entreprise</h3>
            <p className="text-xs text-slate-500">
              Ouvre le module pour <span className="font-semibold">toutes</span> les
              boutiques de l&apos;entreprise, présentes et à venir.
            </p>
          </div>
          <input
            className="min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Rechercher une entreprise…"
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
          />
        </div>

        {companiesQ.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Chargement des entreprises…</p>
        ) : companies.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Aucune entreprise.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {c.isActive ? "Entreprise active" : "Entreprise désactivée"}
                    {c.slug ? ` · ${c.slug}` : ""}
                  </p>
                </div>
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    checked={c.onlineStoreEnabled}
                    disabled={companyMut.isPending}
                    onChange={() =>
                      companyMut.mutate({ id: c.id, enabled: !c.onlineStoreEnabled })
                    }
                  />
                  <span className="text-xs font-medium text-slate-600">
                    {c.onlineStoreEnabled ? "Ouverte" : "Fermée"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard padding="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Boutique par boutique</h3>
            <p className="text-xs text-slate-500">
              Activation ciblée. Une boutique dont l&apos;entreprise est déjà ouverte reste
              active même si son propre interrupteur est éteint.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="">Toutes les entreprises</option>
              {(companiesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="min-w-[180px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Rechercher une boutique / un lien…"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
            />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={onlyEnabled}
                onChange={(e) => setOnlyEnabled(e.target.checked)}
              />
              Actives seulement
            </label>
          </div>
        </div>

        {storesQ.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Chargement des boutiques…</p>
        ) : storesQ.isError ? (
          <p className="p-6 text-sm text-red-600">{(storesQ.error as Error).message}</p>
        ) : stores.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Aucune boutique pour ce filtre.</p>
        ) : (
          <FsHorizontalScroll>
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
                <tr>
                  <th className="p-3">Boutique</th>
                  <th className="p-3">Module</th>
                  <th className="p-3">Vitrine</th>
                  <th className="p-3">Commandes</th>
                  <th className="p-3">Encaissé</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => {
                  const activeByCompany = s.companyEnabled;
                  const active = activeByCompany || s.storeEnabled;
                  return (
                    <tr key={s.storeId} className="border-b border-slate-100">
                      <td className="p-3">
                        <p className="font-semibold text-slate-900">{s.storeName}</p>
                        <p className="text-xs text-slate-500">{s.companyName}</p>
                      </td>
                      <td className="p-3">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-600"
                            checked={s.storeEnabled}
                            disabled={storeMut.isPending}
                            onChange={() =>
                              storeMut.mutate({ id: s.storeId, enabled: !s.storeEnabled })
                            }
                          />
                          <span className="text-xs font-medium text-slate-600">
                            {s.storeEnabled ? "Activée" : "Désactivée"}
                          </span>
                        </label>
                        {activeByCompany ? (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                            Déjà ouverte par l&apos;entreprise
                          </p>
                        ) : null}
                      </td>
                      <td className="p-3">
                        {!active ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : s.slug ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                s.isPublished
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {s.isPublished ? "En ligne" : "Brouillon"}
                            </span>
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                              /boutique/{s.slug}
                            </code>
                            <button
                              type="button"
                              onClick={() => void copyLink(s.slug!)}
                              className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                              aria-label="Copier le lien"
                            >
                              <MdContentCopy className="h-4 w-4" aria-hidden />
                            </button>
                            <a
                              href={onlineStorePath(s.slug)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                              aria-label="Ouvrir le catalogue"
                            >
                              <MdOpenInNew className="h-4 w-4" aria-hidden />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">
                            À configurer par le commerçant
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-900">{s.ordersCount}</span>
                        {s.ordersPending > 0 ? (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            {s.ordersPending} à traiter
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">{fcfa(s.ordersTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </FsHorizontalScroll>
        )}
      </AdminCard>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "sky" | "amber" | "violet";
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}
