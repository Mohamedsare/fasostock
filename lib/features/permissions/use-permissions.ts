"use client";

import { useAppContext } from "@/lib/features/common/app-context";
import {
  buildAccessHelpers,
  canAccessPathname,
  filterNavItemsForPermissions,
} from "@/lib/features/permissions/access";
import type { NavItem } from "@/lib/config/navigation";

export function usePermissions(): {
  data: ReturnType<typeof useAppContext>["data"];
  isLoading: boolean;
  helpers: ReturnType<typeof buildAccessHelpers>;
  hasPermission: (key: string) => boolean;
  canAccessPathname: (pathname: string) => boolean;
  filterNavItems: (items: NavItem[]) => NavItem[];
} {
  const q = useAppContext();
  const data = q.data;
  const helpers = buildAccessHelpers(data ?? null);

  const hasPermission = (key: string) => {
    if (!data) return false;
    if (data.isSuperAdmin) return true;
    return data.permissionKeys.includes(key);
  };

  const canAccess = (pathname: string) => {
    if (!data) return false;
    if (data.isSuperAdmin) return true;
    const h = buildAccessHelpers(data);
    if (!h) return false;
    return canAccessPathname(pathname, h);
  };

  const filterNavItems = (items: NavItem[]) =>
    filterNavItemsForPermissions(items, helpers, q.isLoading);

  return {
    data,
    isLoading: q.isLoading,
    helpers,
    hasPermission,
    canAccessPathname: canAccess,
    filterNavItems,
  };
}
