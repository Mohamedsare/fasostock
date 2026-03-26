"use client";

import { createClient } from "@/lib/supabase/client";
import type { CompanyUser, RoleOption } from "./types";

export async function listCompanyUsers(companyId: string): Promise<CompanyUser[]> {
  const supabase = createClient();
  /**
   * Pas d’embed `profiles` : sans FK explicite `user_company_roles.user_id → profiles.id`
   * PostgREST renvoie « Could not find a relationship … in the schema cache ».
   */
  const { data, error } = await supabase
    .from("user_company_roles")
    .select("id, user_id, role_id, is_active, created_at, role:roles(id, slug, name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r) => String((r as { user_id: string }).user_id)))];

  const nameByUserId = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    if (pErr) throw pErr;
    for (const p of profiles ?? []) {
      const row = p as { id: string; full_name?: string | null };
      nameByUserId.set(String(row.id), row.full_name ?? null);
    }
  }

  return rows.map((r) => {
    const roleRaw = (r as unknown as { role?: { id?: string; slug?: string; name?: string } | { id?: string; slug?: string; name?: string }[] }).role;
    const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;
    const uid = String((r as { user_id: string }).user_id);
    return {
      roleRowId: String((r as { id: string }).id),
      userId: uid,
      fullName: nameByUserId.get(uid) ?? null,
      roleId: String(role?.id ?? (r as { role_id: string }).role_id),
      roleSlug: String(role?.slug ?? ""),
      roleName: String(role?.name ?? role?.slug ?? "role"),
      isActive: (r as { is_active?: boolean }).is_active === true,
      createdAt: String((r as { created_at: string }).created_at),
    };
  });
}

export async function listAssignableRoles(): Promise<RoleOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, slug, name")
    .neq("slug", "super_admin")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    slug: String((r as { slug: string }).slug),
    name: String((r as { name?: string }).name ?? (r as { slug: string }).slug),
  }));
}

export async function createCompanyUser(input: {
  email: string;
  password: string;
  fullName: string;
  roleSlug: string;
  companyId: string;
  storeIds?: string[] | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.functions.invoke("create-company-user", {
    body: {
      email: input.email,
      password: input.password,
      full_name: input.fullName || undefined,
      role_slug: input.roleSlug,
      company_id: input.companyId,
      store_ids: input.storeIds && input.storeIds.length > 0 ? input.storeIds : undefined,
    },
  });
  if (error) throw error;
}

export async function updateCompanyUserRole(input: {
  roleRowId: string;
  roleId: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("user_company_roles")
    .update({ role_id: input.roleId })
    .eq("id", input.roleRowId);
  if (error) throw error;
}

export async function setCompanyUserActive(input: {
  roleRowId: string;
  isActive: boolean;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("user_company_roles")
    .update({ is_active: input.isActive })
    .eq("id", input.roleRowId);
  if (error) throw error;
}

export async function removeCompanyMember(roleRowId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("remove_company_member", {
    p_ucr_id: roleRowId,
  });
  if (error) throw error;
}

export async function getUserPermissionKeys(params: {
  companyId: string;
  userId: string;
}): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_user_permission_keys", {
    p_company_id: params.companyId,
    p_user_id: params.userId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data.map((k) => String(k)) : [];
}

export async function setUserPermissionOverride(params: {
  companyId: string;
  userId: string;
  permissionKey: string;
  granted: boolean;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_user_permission_override", {
    p_company_id: params.companyId,
    p_user_id: params.userId,
    p_permission_key: params.permissionKey,
    p_granted: params.granted,
  });
  if (error) throw error;
}

