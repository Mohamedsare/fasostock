"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { MdErrorOutline, MdRefresh, MdWifiOff } from "react-icons/md";
import { NoAccessScreen } from "@/components/permissions/no-access-screen";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { messageFromUnknownError } from "@/lib/toast";

export function AppRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const {
    isLoading,
    isError,
    error,
    data,
    refetch,
    isFetching,
    canAccessPathname,
  } = usePermissions();

  const [retryBusy, setRetryBusy] = useState(false);

  const onRetry = useCallback(async () => {
    setRetryBusy(true);
    try {
      await refetch();
    } finally {
      setRetryBusy(false);
    }
  }, [refetch]);

  /** Premier chargement sans donnée en cache */
  if (isLoading && data === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
      </div>
    );
  }

  /**
   * Échec sans donnée exploitable : ne pas confondre avec « aucune entreprise » (cas métier).
   * Si une donnée précédente existe encore (cache), on dégrade gracieusement vers l’app.
   */
  const hasStaleContext =
    data != null && (data.isSuperAdmin === true || Boolean(data.companyId));

  if (isError && !hasStaleContext) {
    const msg = messageFromUnknownError(
      error,
      "Impossible de charger votre espace. Vérifiez la connexion et réessayez.",
    );
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <MdWifiOff className="h-14 w-14 text-amber-600" aria-hidden />
        <h2 className="max-w-md text-lg font-semibold text-neutral-900">
          Chargement impossible
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-neutral-600">{msg}</p>
        <button
          type="button"
          disabled={retryBusy || isFetching}
          onClick={() => void onRetry()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          <MdRefresh
            className={`h-5 w-5 shrink-0 ${retryBusy || isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          Réessayer
        </button>
        <Link
          href="/login"
          className="text-sm font-medium text-fs-accent underline-offset-2 hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  /** Session absente côté client alors que le layout serveur a authentifié — incohérence à corriger par refetch ou reconnexion */
  if (data === null && !isError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <MdErrorOutline className="h-14 w-14 text-neutral-500" aria-hidden />
        <h2 className="max-w-md text-lg font-semibold text-neutral-900">
          Session non synchronisée
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-neutral-600">
          Actualisez la page ou reconnectez-vous pour continuer.
        </p>
        <button
          type="button"
          disabled={retryBusy || isFetching}
          onClick={() => void onRetry()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          <MdRefresh
            className={`h-5 w-5 shrink-0 ${retryBusy || isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          Réessayer
        </button>
        <Link
          href="/login"
          className="text-sm font-medium text-fs-accent underline-offset-2 hover:underline"
        >
          Se reconnecter
        </Link>
      </div>
    );
  }

  if (data?.isSuperAdmin) {
    return <>{children}</>;
  }

  if (!data?.companyId) {
    return (
      <div className="px-4 py-10 text-center text-sm text-neutral-600">
        <p>
          Aucune entreprise associée à ce compte ou accès désactivé. Si vous pensez qu’il s’agit
          d’une erreur, contactez l’administrateur.
        </p>
        <button
          type="button"
          disabled={retryBusy || isFetching}
          onClick={() => void onRetry()}
          className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-black/10 bg-fs-card px-4 text-sm font-semibold text-neutral-800 shadow-sm disabled:opacity-60"
        >
          <MdRefresh
            className={`h-4 w-4 shrink-0 ${retryBusy || isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          Actualiser
        </button>
      </div>
    );
  }

  if (!canAccessPathname(pathname)) {
    return <NoAccessScreen />;
  }

  return <>{children}</>;
}
