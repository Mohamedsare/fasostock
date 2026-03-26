"use client";

import { NoAccessScreen } from "@/components/permissions/no-access-screen";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { isLoading, data, canAccessPathname } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
      </div>
    );
  }

  if (data?.isSuperAdmin) {
    return <>{children}</>;
  }

  if (!data?.companyId) {
    return (
      <div className="px-4 py-10 text-center text-sm text-neutral-600">
        Aucune entreprise. Contactez l&apos;administrateur.
      </div>
    );
  }

  if (!canAccessPathname(pathname)) {
    return <NoAccessScreen />;
  }

  return <>{children}</>;
}
