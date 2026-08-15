"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { BUSINESS_TYPES, groupByCategory } from "@/lib/config/business-types";
import {
  adminCreateCompanyAccount,
  adminDeleteCompany,
  adminDeleteStore,
  adminListCompanies,
  adminListStores,
  adminUpdateCompany,
  adminUpdateStore,
} from "@/lib/features/admin/api";
import type { AdminCompany, AdminStore } from "@/lib/features/admin/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { MdDelete, MdExpandMore, MdChevronRight, MdAutoAwesome, MdPowerSettingsNew, MdWarehouse, MdAdd, MdRemove, MdStorefront, MdSupportAgent } from "react-icons/md";
import { useRouter } from "next/navigation";
import { startSupportSession } from "@/lib/features/support/api";
import { queryKeys } from "@/lib/query/query-keys";

type CreateForm = {
  companyName: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPassword: string;
  firstStoreName: string;
  firstStorePhone: string;
  businessTypeSlug: string;
};

const EMPTY_CREATE_FORM: CreateForm = {
  companyName: "",
  ownerFullName: "",
  ownerEmail: "",
  ownerPassword: "",
  firstStoreName: "",
  firstStorePhone: "",
  businessTypeSlug: "",
};

const SUPPORT_DURATIONS = [30, 60, 120, 240] as const;

export function AdminCompaniesScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [supportFor, setSupportFor] = useState<AdminCompany | null>(null);
  const [supportReason, setSupportReason] = useState("");
  const [supportMinutes, setSupportMinutes] = useState<number>(60);

  const q = useQuery({
    queryKey: ["admin-companies"] as const,
    queryFn: async () => {
      const [companies, stores] = await Promise.all([adminListCompanies(), adminListStores()]);
      return { companies, stores };
    },
  });

  const storesByCompany = useMemo(() => {
    const m = new Map<string, AdminStore[]>();
    for (const s of q.data?.stores ?? []) {
      const arr = m.get(s.companyId) ?? [];
      arr.push(s);
      m.set(s.companyId, arr);
    }
    return m;
  }, [q.data?.stores]);

  const phoneByCompany = useMemo(() => {
    const m = new Map<string, string>();
    for (const [companyId, stores] of storesByCompany) {
      m.set(companyId, resolveCompanyPhone(stores));
    }
    return m;
  }, [storesByCompany]);

  const mutCompany = useMutation({
    mutationFn: async (p: { id: string; isActive?: boolean; aiPredictionsEnabled?: boolean; warehouseQuota?: number }) => {
      await adminUpdateCompany(p.id, { isActive: p.isActive, aiPredictionsEnabled: p.aiPredictionsEnabled, warehouseQuota: p.warehouseQuota });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Entreprise mise à jour");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const mutStore = useMutation({
    mutationFn: async (p: { id: string; isActive: boolean }) => adminUpdateStore(p.id, p.isActive),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Boutique mise à jour");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const mutDelCompany = useMutation({
    mutationFn: (id: string) => adminDeleteCompany(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Supprimé définitivement");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const mutDelStore = useMutation({
    mutationFn: (id: string) => adminDeleteStore(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Supprimé définitivement");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const mutCreate = useMutation({
    mutationFn: async (form: CreateForm) => {
      return adminCreateCompanyAccount({
        companyName: form.companyName.trim(),
        ownerFullName: form.ownerFullName.trim() || undefined,
        ownerEmail: form.ownerEmail.trim(),
        ownerPassword: form.ownerPassword,
        firstStoreName: form.firstStoreName.trim(),
        firstStorePhone: form.firstStorePhone.trim() || undefined,
        businessTypeSlug: form.businessTypeSlug || null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Entreprise créée. Le propriétaire peut se connecter immédiatement.");
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  /**
   * Mode dépannage : on entre dans l'espace du client comme s'il s'agissait du nôtre.
   * Le motif est exigé ici ET en base — c'est lui qui rend l'intervention défendable
   * si le commerçant conteste plus tard une modification.
   */
  const mutSupport = useMutation({
    mutationFn: async (p: { companyId: string; reason: string; minutes: number }) =>
      startSupportSession(p),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
      setSupportFor(null);
      setSupportReason("");
      router.push("/dashboard");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function openSupport(c: AdminCompany) {
    setSupportFor(c);
    setSupportReason("");
    setSupportMinutes(60);
  }

  function submitSupport() {
    if (!supportFor) return;
    if (supportReason.trim().length < 5) {
      toast.error("Indiquez le motif de l'intervention (5 caractères minimum).");
      return;
    }
    mutSupport.mutate({
      companyId: supportFor.id,
      reason: supportReason.trim(),
      minutes: supportMinutes,
    });
  }

  function submitCreate() {
    const f = createForm;
    if (!f.companyName.trim() || !f.ownerEmail.trim() || !f.firstStoreName.trim()) {
      toast.error("Renseignez l'entreprise, l'email du propriétaire et la première boutique.");
      return;
    }
    if (f.ownerPassword.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    mutCreate.mutate(f);
  }

  function confirmDeleteCompany(c: AdminCompany) {
    if (!window.confirm(`Supprimer l'entreprise « ${c.name} » ? Irréversible.`)) return;
    mutDelCompany.mutate(c.id);
  }

  function confirmDeleteStore(s: AdminStore) {
    if (!window.confirm(`Supprimer la boutique « ${s.name} » ? Irréversible.`)) return;
    mutDelStore.mutate(s.id);
  }

  if (q.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-8">
        <p className="text-red-600">{(q.error as Error).message}</p>
      </div>
    );
  }

  // Jamais de `q.data!` : la requête peut être en attente sans être « loading »
  // (reprise hors ligne, cache réinitialisé) — on rend alors une liste vide.
  const companies = q.data?.companies ?? [];

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader
          title="Entreprises"
          description="Gestion des entreprises et de leurs boutiques"
        />
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"
          onClick={() => {
            setCreateForm(EMPTY_CREATE_FORM);
            setCreateOpen(true);
          }}
        >
          <MdStorefront className="h-5 w-5" />
          Nouvelle entreprise
        </button>
      </div>

      <AdminCard padding="p-0">
        <FsHorizontalScroll>
          <table className="min-w-[920px] w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="w-10 p-3" />
              <th className="p-3">Nom</th>
              <th className="p-3">Téléphone</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Préd.&nbsp;IA</th>
              <th className="p-3">Boutiques</th>
              <th className="p-3">Dépôts</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const subs = storesByCompany.get(c.id) ?? [];
              const isOpen = expanded === c.id;
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-slate-100">
                    <td className="p-2">
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                        disabled={subs.length === 0}
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                      >
                        {subs.length === 0 ? null : isOpen ? (
                          <MdExpandMore className="h-5 w-5" />
                        ) : (
                          <MdChevronRight className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                    <td className="max-w-[220px] p-3 font-medium text-slate-900">
                      <span className="block truncate" title={c.name}>
                        {c.name}
                      </span>
                    </td>
                    <td className="max-w-[160px] p-3 text-slate-600">
                      <CompanyPhoneCell phone={phoneByCompany.get(c.id) ?? "—"} />
                    </td>
                    <td className="max-w-[180px] p-3 text-slate-600">
                      <span className="block truncate" title={c.slug ?? undefined}>
                        {c.slug ?? "—"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={c.isActive ? "text-emerald-600" : "text-slate-500"}>
                        {c.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={c.aiPredictionsEnabled ? "text-emerald-600" : "text-slate-500"}>
                        {c.aiPredictionsEnabled ? "Oui" : "Non"}
                      </span>
                    </td>
                    <td className="p-3">{c.storeQuota}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"
                          title="Réduire quota dépôts"
                          disabled={c.warehouseQuota <= 1}
                          onClick={() => mutCompany.mutate({ id: c.id, warehouseQuota: c.warehouseQuota - 1 })}
                        >
                          <MdRemove className="h-4 w-4" />
                        </button>
                        <span className="flex w-6 items-center justify-center gap-1 font-semibold">
                          <MdWarehouse className="h-3.5 w-3.5 text-slate-400" />
                          {c.warehouseQuota}
                        </span>
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-slate-100"
                          title="Augmenter quota dépôts"
                          onClick={() => mutCompany.mutate({ id: c.id, warehouseQuota: c.warehouseQuota + 1 })}
                        >
                          <MdAdd className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-nowrap gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-2 hover:bg-slate-100"
                          title={c.isActive ? "Désactiver" : "Activer"}
                          onClick={() => mutCompany.mutate({ id: c.id, isActive: !c.isActive })}
                        >
                          <MdPowerSettingsNew className="h-5 w-5 text-slate-700" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 hover:bg-slate-100"
                          title={c.aiPredictionsEnabled ? "Désactiver IA" : "Activer IA"}
                          onClick={() =>
                            mutCompany.mutate({ id: c.id, aiPredictionsEnabled: !c.aiPredictionsEnabled })
                          }
                        >
                          <MdAutoAwesome className="h-5 w-5 text-slate-700" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 hover:bg-amber-50"
                          title="Dépanner (entrer dans cette entreprise)"
                          onClick={() => openSupport(c)}
                        >
                          <MdSupportAgent className="h-5 w-5 text-amber-600" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 hover:bg-red-50"
                          title="Supprimer"
                          onClick={() => confirmDeleteCompany(c)}
                        >
                          <MdDelete className="h-5 w-5 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen
                    ? subs.map((s) => (
                        <tr key={s.id} className="bg-slate-50">
                          <td />
                          <td colSpan={6} className="max-w-0 px-3 py-2 pl-10 text-slate-700">
                            <div className="flex min-w-0 flex-nowrap items-center gap-2">
                              <span className="truncate font-semibold" title={s.name}>
                                {s.name}
                              </span>
                              {s.isPrimary ? (
                                <span className="shrink-0 text-xs text-slate-500">Principale</span>
                              ) : null}
                              {s.phone ? (
                                <span className="shrink-0 text-xs text-slate-500">{s.phone}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex flex-nowrap items-center justify-end gap-1">
                              <span className={s.isActive ? "text-emerald-600" : "text-slate-500"}>
                                {s.isActive ? "Actif" : "Inactif"}
                              </span>
                              <button
                                type="button"
                                className="rounded p-1 hover:bg-white"
                                onClick={() => mutStore.mutate({ id: s.id, isActive: !s.isActive })}
                              >
                                <MdPowerSettingsNew className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 hover:bg-red-50"
                                onClick={() => confirmDeleteStore(s)}
                              >
                                <MdDelete className="h-4 w-4 text-red-600" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </FsHorizontalScroll>
      </AdminCard>

      {createOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Créer une entreprise</h3>
            <p className="mt-1 text-sm text-slate-500">
              Le compte propriétaire est créé avec email confirmé automatiquement — le
              client peut se connecter tout de suite avec l&apos;email et le mot de passe saisis.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Nom de l&apos;entreprise *
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createForm.companyName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, companyName: e.target.value }))}
                  placeholder="Ex. ETS COULIBALY"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Type d&apos;activité
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={createForm.businessTypeSlug}
                  onChange={(e) => setCreateForm((f) => ({ ...f, businessTypeSlug: e.target.value }))}
                >
                  <option value="">— Non précisé —</option>
                  {/* Regroupé par famille : la liste dépasse 40 activités. */}
                  {groupByCategory(BUSINESS_TYPES).map((group) => (
                    <optgroup key={group.category.id} label={group.category.label}>
                      {group.options.map((b) => (
                        <option key={b.slug} value={b.slug}>
                          {b.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {BUSINESS_TYPES.filter((b) => b.category === "autre").map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Nom de la première boutique *
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createForm.firstStoreName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, firstStoreName: e.target.value }))}
                  placeholder="Ex. Boutique principale"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Téléphone de la boutique
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createForm.firstStorePhone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, firstStorePhone: e.target.value }))}
                  placeholder="Ex. 70 00 00 00"
                />
              </label>

              <div className="mt-2 border-t border-slate-100 pt-3">
                <p className="text-sm font-semibold text-slate-800">Compte propriétaire</p>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Nom du propriétaire
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createForm.ownerFullName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerFullName: e.target.value }))}
                  placeholder="Ex. Amadou Coulibaly"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Email de connexion *
                <input
                  type="email"
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createForm.ownerEmail}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                  placeholder="proprietaire@entreprise.com"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Mot de passe * (min. 6 caractères)
                <input
                  type="text"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createForm.ownerPassword}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerPassword: e.target.value }))}
                  placeholder="À communiquer au client"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                disabled={mutCreate.isPending}
                onClick={() => setCreateOpen(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={mutCreate.isPending}
                onClick={submitCreate}
              >
                {mutCreate.isPending ? "Création…" : "Créer l'entreprise"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {supportFor ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              Dépanner « {supportFor.name} »
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Vous allez travailler dans les données réelles de ce client, avec les droits
              du propriétaire. L&apos;intervention et chacune de vos actions sont inscrites
              dans son journal d&apos;audit.
            </p>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Motif de l&apos;intervention *
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={supportReason}
                onChange={(e) => setSupportReason(e.target.value)}
                placeholder="Ex. Stock négatif signalé au téléphone"
                autoFocus
              />
            </label>

            <div className="mt-3 text-sm font-medium text-slate-700">
              Durée
              <div className="mt-1 flex flex-wrap gap-2">
                {SUPPORT_DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSupportMinutes(m)}
                    className={
                      supportMinutes === m
                        ? "rounded-xl bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white"
                        : "rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
                    }
                  >
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs font-normal text-slate-500">
                Passé ce délai, l&apos;accès se referme tout seul.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                disabled={mutSupport.isPending}
                onClick={() => setSupportFor(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={mutSupport.isPending}
                onClick={submitSupport}
              >
                {mutSupport.isPending ? "Ouverture…" : "Entrer dans l'entreprise"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function resolveCompanyPhone(stores: AdminStore[]): string {
  const primary = stores.find((s) => s.isPrimary && s.phone);
  if (primary?.phone) return primary.phone;
  const any = stores.find((s) => s.phone);
  return any?.phone ?? "—";
}

function CompanyPhoneCell({ phone }: { phone: string }) {
  if (phone === "—") return <span>—</span>;
  const tel = phone.replace(/\s/g, "");
  return (
    <a
      href={`tel:${tel}`}
      className="block truncate hover:text-orange-600 hover:underline"
      title={phone}
    >
      {phone}
    </a>
  );
}
