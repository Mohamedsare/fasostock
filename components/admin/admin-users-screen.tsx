"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminDeleteUser,
  adminGetUserCompanyIds,
  adminListCompanies,
  adminListLockedLogins,
  adminListUsers,
  adminSetUserActive,
  adminSetUserCompanies,
  adminUnlockLogin,
  adminUpdateProfile,
} from "@/lib/features/admin/api";
import type { AdminUser } from "@/lib/features/admin/types";
import { createClient } from "@/lib/supabase/client";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MdDelete, MdEdit, MdPersonAdd, MdPersonOff } from "react-icons/md";

export function AdminUsersScreen() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editSuper, setEditSuper] = useState(false);
  const [editCompanyIds, setEditCompanyIds] = useState<string[]>([]);

  const authQ = useQuery({
    queryKey: ["admin-current-user-id"] as const,
    queryFn: async () => {
      const { data: { user } } = await createClient().auth.getUser();
      return user?.id ?? null;
    },
  });

  const q = useQuery({
    queryKey: ["admin-users"] as const,
    queryFn: () => adminListUsers(),
  });

  const locksQ = useQuery({
    queryKey: ["admin-locked-logins"] as const,
    queryFn: () => adminListLockedLogins(),
  });

  const companiesQ = useQuery({
    queryKey: ["admin-companies-brief"] as const,
    queryFn: () => adminListCompanies(),
    enabled: Boolean(edit),
  });

  const filtered = useMemo(() => {
    let list = q.data ?? [];
    const needle = search.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (u) =>
          (u.fullName ?? "").toLowerCase().includes(needle) ||
          (u.email ?? "").toLowerCase().includes(needle) ||
          u.companyNames.some((c) => c.toLowerCase().includes(needle)),
      );
    }
    return list;
  }, [q.data, search]);

  async function openEdit(u: AdminUser) {
    setEdit(u);
    setEditName(u.fullName ?? "");
    setEditSuper(u.isSuperAdmin);
    setEditCompanyIds([]);
    try {
      const ids = await adminGetUserCompanyIds(u.id);
      setEditCompanyIds(ids);
    } catch {
      /* ignore */
    }
  }

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!edit) return;
      await adminUpdateProfile(edit.id, {
        fullName: editName.trim() || null,
        isSuperAdmin: editSuper,
      });
      await adminSetUserCompanies(edit.id, editCompanyIds);
    },
    onSuccess: () => {
      toast.success("Utilisateur mis à jour");
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const setActive = useMutation({
    mutationFn: async (p: { id: string; active: boolean }) => adminSetUserActive(p.id, p.active),
    onSuccess: (_, v) => {
      toast.success(v.active ? "Compte réactivé" : "Compte désactivé");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const delUser = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await createClient().auth.getUser();
      if (user?.id === id) {
        throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
      }
      await adminDeleteUser(id);
    },
    onSuccess: () => {
      toast.success("Utilisateur supprimé");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const unlock = useMutation({
    mutationFn: (email: string) => adminUnlockLogin(email),
    onSuccess: () => {
      toast.success("Compte débloqué");
      void qc.invalidateQueries({ queryKey: ["admin-locked-logins"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  /** `undefined` tant que la session n'est pas résolue — évite d'afficher « Supprimer » sur sa propre ligne pendant le chargement. */
  const myUserId = authQ.data ?? null;
  const authReady = authQ.isFetched;

  if (q.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  const locked = locksQ.data ?? [];

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Utilisateurs"
        description="Gestion complète des utilisateurs de la plateforme"
      />

      {locked.length > 0 ? (
        <AdminCard className="border-red-200 bg-red-50/50">
          <h3 className="flex items-center gap-2 text-sm font-bold text-red-800">
            Comptes bloqués (connexion)
          </h3>
          <p className="mt-1 text-xs text-red-700">
            Verrouillés après 5 tentatives. Débloquez pour permettre une nouvelle connexion.
          </p>
          <ul className="mt-3 space-y-2">
            {locked.map((l) => (
              <li key={l.emailLower} className="flex flex-wrap items-center gap-2 text-sm">
                <code className="text-slate-800">{l.emailLower}</code>
                <button
                  type="button"
                  className="rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-200"
                  onClick={() => unlock.mutate(l.emailLower)}
                >
                  Débloquer
                </button>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}

      <input
        className="w-full max-w-xl rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
        placeholder="Rechercher par nom, email, entreprise…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <AdminCard padding="p-0" className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Email</th>
              <th className="p-3">Entreprises</th>
              <th className="p-3">Rôle</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="p-3">{u.fullName ?? "—"}</td>
                <td className="p-3">{u.email ?? "—"}</td>
                <td className="max-w-[200px] truncate p-3 text-slate-600">
                  {u.companyNames.length ? u.companyNames.join(", ") : "—"}
                </td>
                <td className="p-3 font-medium text-orange-600">{u.isSuperAdmin ? "Super admin" : "Utilisateur"}</td>
                <td className="p-3">
                  <span className={u.isActive ? "text-emerald-600" : "text-slate-500"}>
                    {u.isActive ? "Actif" : "Désactivé"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded p-2 hover:bg-slate-100"
                      title="Modifier"
                      onClick={() => void openEdit(u)}
                    >
                      <MdEdit className="h-5 w-5 text-slate-700" />
                    </button>
                    {authReady && myUserId && myUserId !== u.id && u.isActive ? (
                      <button
                        type="button"
                        className="rounded p-2 hover:bg-amber-50"
                        title="Désactiver"
                        onClick={() => setActive.mutate({ id: u.id, active: false })}
                      >
                        <MdPersonOff className="h-5 w-5 text-amber-700" />
                      </button>
                    ) : null}
                    {authReady && myUserId && myUserId !== u.id && !u.isActive ? (
                      <button
                        type="button"
                        className="rounded p-2 hover:bg-emerald-50"
                        title="Réactiver"
                        onClick={() => setActive.mutate({ id: u.id, active: true })}
                      >
                        <MdPersonAdd className="h-5 w-5 text-emerald-700" />
                      </button>
                    ) : null}
                    {authReady && myUserId && myUserId !== u.id ? (
                      <button
                        type="button"
                        className="rounded p-2 hover:bg-red-50"
                        title="Supprimer"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Supprimer ${u.fullName ?? u.email ?? u.id} ? Irréversible.`,
                            )
                          )
                            return;
                          delUser.mutate(u.id);
                        }}
                      >
                        <MdDelete className="h-5 w-5 text-red-600" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>

      {edit ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Modifier l&apos;utilisateur</h3>
            <p className="mt-1 text-sm text-slate-500">{edit.email ?? "—"}</p>
            <label className="mt-4 block text-sm font-medium">
              Nom
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editSuper}
                onChange={(e) => setEditSuper(e.target.checked)}
              />
              Super admin
            </label>
            <p className="mt-4 text-sm font-medium text-slate-700">Entreprises rattachées</p>
            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {(companiesQ.data ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={editCompanyIds.includes(c.id)}
                    onChange={(e) => {
                      if (e.target.checked) setEditCompanyIds((x) => [...x, c.id]);
                      else setEditCompanyIds((x) => x.filter((id) => id !== c.id));
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                onClick={() => setEdit(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={saveEdit.isPending}
                onClick={() => saveEdit.mutate()}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
