"use client";

import { CreateUserDialog } from "@/components/users/create-user-dialog";
import {
  FsCard,
  FsFab,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  FsSectionLabel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { P, PERMISSIONS_ALL, PERMISSION_LABELS_FR } from "@/lib/constants/permissions";
import {
  createCompanyUser,
  getUserPermissionKeys,
  listAssignableRoles,
  listCompanyUsers,
  removeCompanyMember,
  setCompanyUserActive,
  setUserPermissionOverride,
  updateCompanyUserRole,
} from "@/lib/features/users/api";
import type { CompanyUser } from "@/lib/features/users/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  MdAdd,
  MdDeleteOutline,
  MdManageAccounts,
  MdPerson,
  MdRefresh,
  MdSearch,
  MdToggleOff,
  MdToggleOn,
} from "react-icons/md";

function roleLabelFr(slug: string, fallback: string) {
  const m: Record<string, string> = {
    super_admin: "Super administrateur",
    owner: "Proprietaire",
    manager: "Gestionnaire",
    store_manager: "Gestionnaire de boutique",
    cashier: "Caissier",
    stock_manager: "Magasinier",
    accountant: "Comptable",
    viewer: "Lecture seule",
  };
  return m[slug] ?? fallback;
}

function nameInitial(name: string | null): string {
  const t = (name ?? "").trim();
  return t ? t[0]!.toUpperCase() : "?";
}

export function UsersScreen() {
  const qc = useQueryClient();
  const { data: ctx, isLoading, hasPermission } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  const roleSlug = ctx?.roleSlug ?? null;
  const stores = ctx?.stores ?? [];

  const canManage = hasPermission(P.usersManage) || roleSlug === "owner";
  const isOwner = roleSlug === "owner";
  const canView = canManage;

  const usersQ = useQuery({
    queryKey: queryKeys.companyUsers(companyId),
    queryFn: () => listCompanyUsers(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 20_000,
  });

  const rolesQ = useQuery({
    queryKey: ["assignable-roles"] as const,
    queryFn: listAssignableRoles,
    enabled: canManage,
    staleTime: 60_000,
  });

  const [q, setQ] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [rightsUserId, setRightsUserId] = useState<string | null>(null);

  const meQ = useQuery({
    queryKey: ["me-user-id"] as const,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    staleTime: 60_000,
  });
  const currentUserId = meQ.data ?? null;

  const rows = usersQ.data ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((u) => {
      return (
        (u.fullName ?? "").toLowerCase().includes(needle) ||
        u.roleName.toLowerCase().includes(needle) ||
        u.roleSlug.toLowerCase().includes(needle)
      );
    });
  }, [rows, q]);

  const rightsEligible = useMemo(
    () =>
      rows.filter((u) => {
        if (u.userId === currentUserId || !u.isActive) return false;
        if (!isOwner && u.roleSlug === "owner") return false;
        return true;
      }),
    [rows, currentUserId, isOwner],
  );

  /** Évite un sélecteur de droits pointant vers un membre retiré / désactivé. */
  useEffect(() => {
    if (!rightsUserId) return;
    if (!rightsEligible.some((u) => u.userId === rightsUserId)) {
      setRightsUserId(null);
    }
  }, [rightsEligible, rightsUserId]);

  const permissionKeysSorted = useMemo(
    () =>
      [...PERMISSIONS_ALL].sort((a, b) =>
        (PERMISSION_LABELS_FR[a] ?? a).localeCompare(
          PERMISSION_LABELS_FR[b] ?? b,
          "fr",
        ),
      ),
    [],
  );

  const invalidateUserRights = () =>
    qc.invalidateQueries({ queryKey: ["user-rights", companyId] });

  const createMut = useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      fullName: string;
      roleSlug: string;
      storeIds: string[];
    }) => {
      if (!companyId) throw new Error("Entreprise manquante.");
      await createCompanyUser({
        ...payload,
        companyId,
        storeIds: payload.storeIds,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.companyUsers(companyId) });
      await invalidateUserRights();
      toast.success("Utilisateur créé");
    },
    onError: (e) => toastMutationError("users", e),
  });

  const setActiveMut = useMutation({
    mutationFn: setCompanyUserActive,
    onSuccess: async (_d, vars) => {
      await qc.invalidateQueries({ queryKey: queryKeys.companyUsers(companyId) });
      await invalidateUserRights();
      toast.success(vars.isActive ? "Compte activé" : "Compte désactivé");
    },
    onError: (e) => toastMutationError("users", e),
  });

  const setRoleMut = useMutation({
    mutationFn: updateCompanyUserRole,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.companyUsers(companyId) });
      await invalidateUserRights();
      toast.success("Rôle mis à jour");
    },
    onError: (e) => toastMutationError("users", e),
  });

  const removeMut = useMutation({
    mutationFn: removeCompanyMember,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.companyUsers(companyId) });
      await invalidateUserRights();
      toast.success("Utilisateur retiré de l’entreprise");
    },
    onError: (e) => toastMutationError("users", e),
  });

  const rightsQ = useQuery({
    queryKey: rightsUserId
      ? queryKeys.userRights(companyId, rightsUserId)
      : ["user-rights", companyId, "__none__"],
    queryFn: () =>
      getUserPermissionKeys({
        companyId,
        userId: rightsUserId as string,
      }),
    enabled: Boolean(companyId) && Boolean(rightsUserId) && canManage,
    staleTime: 10_000,
  });

  const rightsMut = useMutation({
    mutationFn: setUserPermissionOverride,
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: queryKeys.userRights(companyId, rightsUserId as string),
      });
      toast.success("Droits personnalisés enregistrés");
    },
    onError: (e) => toastMutationError("users", e),
  });

  return (
    <FsPage>
      <FsScreenHeader
        title="Utilisateurs"
        subtitle="Gérez les rôles et l'accès des utilisateurs de l'entreprise."
      />

      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <div className="relative w-full sm:max-w-sm">
          <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            className={fsInputClass("pl-10")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (nom, rôle)…"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => usersQ.refetch()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/8 bg-fs-card text-neutral-800"
            aria-label="Rafraîchir"
          >
            <MdRefresh className="h-5 w-5" aria-hidden />
          </button>
          {canManage ? (
            <button
              type="button"
              onClick={() => setOpenCreate(true)}
              className="hidden items-center gap-2 rounded-[10px] bg-fs-accent px-3 py-2 text-xs font-semibold text-white shadow-sm sm:inline-flex sm:text-sm"
            >
              <MdAdd className="h-4 w-4" aria-hidden />
              Nouveau
            </button>
          ) : null}
        </div>
      </div>

      {canManage && filtered.length > 0 ? (
        <FsFab ariaLabel="Nouvel utilisateur" onClick={() => setOpenCreate(true)}>
          <MdAdd className="h-6 w-6" aria-hidden />
        </FsFab>
      ) : null}

      <FsCard padding="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            <MdPerson className="h-5 w-5 text-fs-accent" aria-hidden />
            <FsSectionLabel>Membres</FsSectionLabel>
          </div>
          <div className="inline-flex items-center gap-2">
            <p className="text-xs font-bold text-fs-text sm:text-sm">{filtered.length}</p>
            {canManage ? (
              <button
                type="button"
                onClick={() => setOpenCreate(true)}
                className="inline-flex items-center gap-2 rounded-[10px] border border-black/8 bg-fs-card px-2.5 py-1.5 text-xs font-semibold text-neutral-800"
              >
                <MdAdd className="h-4 w-4" aria-hidden />
                Creer un utilisateur
              </button>
            ) : null}
          </div>
        </div>
      </FsCard>

      <FsCard className="mt-3" padding="p-0">
        {isLoading || usersQ.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : null}

        {usersQ.isError ? (
          <div className="p-3 sm:p-4">
            <FsQueryErrorPanel error={usersQ.error} onRetry={() => usersQ.refetch()} />
          </div>
        ) : null}

        {!usersQ.isLoading && filtered.length === 0 ? (
          <div className="p-6 text-center">
            <MdPerson className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">Aucun utilisateur</p>
            <p className="mt-1 text-xs text-neutral-600">
              Ajoutez des utilisateurs et attribuez-leur un rôle.
            </p>
          </div>
        ) : null}

        {filtered.map((u: CompanyUser) => (
          <div
            key={u.roleRowId}
            className="border-b border-black/6 p-3 last:border-b-0 sm:p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fs-surface-container text-xs font-bold text-fs-accent">
                {nameInitial(u.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-xs font-bold text-fs-text sm:text-sm">
                    {u.fullName?.trim() || "Sans nom"}
                  </p>
                  {u.userId === currentUserId ? (
                    <span className="inline-flex rounded-md bg-fs-surface-container px-2 py-0.5 text-[11px] font-semibold text-neutral-700">
                      Vous
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] text-neutral-600">
                  {roleLabelFr(u.roleSlug, u.roleName)}
                </p>
                <span
                  className={cn(
                    "mt-2 inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold",
                    u.isActive
                      ? "bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
                      : "bg-fs-surface-container text-neutral-600",
                  )}
                >
                  {u.isActive ? "Actif" : "Inactif"}
                </span>
              </div>
            </div>

            {canManage ? (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2 sm:mt-3">
                <select
                  value={u.roleId}
                  onChange={(e) => {
                    const roleId = e.target.value;
                    setRoleMut.mutate({ roleRowId: u.roleRowId, roleId });
                  }}
                  className={cn(
                    "min-h-[40px] rounded-[10px] border border-black/8 bg-fs-card px-2 py-2 text-xs font-semibold text-neutral-800 sm:text-sm",
                    setRoleMut.isPending ? "opacity-70" : "",
                  )}
                  disabled={setRoleMut.isPending}
                >
                  {(rolesQ.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setActiveMut.mutate({
                      roleRowId: u.roleRowId,
                      isActive: !u.isActive,
                    })
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-fs-accent"
                  aria-label={u.isActive ? "Désactiver" : "Activer"}
                  disabled={setActiveMut.isPending}
                >
                  {u.isActive ? (
                    <MdToggleOn className="h-6 w-6" aria-hidden />
                  ) : (
                    <MdToggleOff className="h-6 w-6 text-neutral-500" aria-hidden />
                  )}
                </button>
                {isOwner && u.userId !== currentUserId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Retirer cet utilisateur de l'entreprise ?")) {
                        removeMut.mutate(u.roleRowId);
                      }
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-red-600"
                    aria-label="Retirer"
                    disabled={removeMut.isPending}
                  >
                    <MdDeleteOutline className="h-5 w-5" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </FsCard>

      {canManage ? (
        <FsCard className="mt-3" padding="p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <MdManageAccounts className="h-5 w-5 text-fs-accent" aria-hidden />
            <FsSectionLabel>Gestion des droits</FsSectionLabel>
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Propriétaire ou utilisateur avec « Gérer les utilisateurs » : vous pouvez affiner chaque
            permission (magasin, stock, produits, achats…). Décocher retire une permission même si
            le rôle la donne par défaut. Seul le propriétaire peut modifier un autre propriétaire.
          </p>
          <div className="mt-3">
            <select
              className={fsInputClass()}
              value={rightsUserId ?? ""}
              onChange={(e) => setRightsUserId(e.target.value || null)}
            >
              <option value="">— Choisir un utilisateur —</option>
              {rightsEligible.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {(u.fullName?.trim() || "Sans nom") +
                    ` (${roleLabelFr(u.roleSlug, u.roleName)})`}
                </option>
              ))}
            </select>
          </div>

          {rightsUserId ? (
            <div className="mt-3">
              {rightsQ.isLoading ? (
                <div className="flex min-h-[80px] items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                </div>
              ) : rightsQ.isError ? (
                <p className="text-xs font-semibold text-red-600">
                  {(rightsQ.error as Error)?.message ?? "Erreur chargement droits."}
                </p>
              ) : (
                <div className="space-y-1">
                  {permissionKeysSorted.map((key) => {
                    const checked = (rightsQ.data ?? []).includes(key);
                    const label = PERMISSION_LABELS_FR[key] ?? key;
                    const busy = rightsMut.isPending || rightsQ.isFetching;
                    return (
                      <label
                        key={key}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-[10px] border border-black/6 bg-fs-card px-3 py-2",
                          busy && "pointer-events-none opacity-60",
                        )}
                      >
                        <span className="text-xs text-neutral-800 sm:text-sm">{label}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          aria-label={label}
                          onChange={(e) =>
                            rightsMut.mutate({
                              companyId,
                              userId: rightsUserId,
                              permissionKey: key,
                              granted: e.target.checked,
                            })
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </FsCard>
      ) : null}

      <CreateUserDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        roles={rolesQ.data ?? []}
        stores={stores}
        onCreate={(payload) => createMut.mutateAsync(payload)}
      />
    </FsPage>
  );
}

