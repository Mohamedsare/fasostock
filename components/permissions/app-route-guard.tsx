"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MdLockOutline, MdRefresh, MdWifiOff } from "react-icons/md";
import { NoAccessScreen } from "@/components/permissions/no-access-screen";
import { ReconnectBanner } from "@/components/permissions/reconnect-banner";
import { signOutAndRedirect } from "@/lib/auth/sign-out-client";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { messageFromUnknownError } from "@/lib/toast";

/** Laps de temps pendant lequel on tente de se rétablir en silence avant d'alarmer l'utilisateur. */
const GRACE_MS = 6_000;

/**
 * Re-tentative automatique tant que le contexte n'est pas exploitable : back-off
 * exponentiel, plus une tentative immédiate au retour de l'onglet ou du réseau.
 * L'utilisateur n'a normalement jamais besoin de cliquer quoi que ce soit.
 */
function useAutoRecovery(active: boolean, refetch: () => void) {
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timer = setTimeout(
        () => {
          if (cancelled) return;
          attempt += 1;
          refetch();
          schedule();
        },
        Math.min(2_000 * 2 ** attempt, 30_000),
      );
    };
    schedule();

    /** Retour d'onglet / de réseau : la session est très souvent redevenue valide. */
    const retryNow = () => {
      if (document.visibilityState !== "visible") return;
      attempt = 0;
      if (timer) clearTimeout(timer);
      refetch();
      schedule();
    };
    window.addEventListener("focus", retryNow);
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", retryNow);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", retryNow);
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", retryNow);
    };
  }, [active, refetch]);
}

/** Passe à `true` après `ms` d'échec ininterrompu — évite de crier au loup sur un micro-incident. */
/**
 * Affiche `pending` pendant `ms`, puis `children`. Monté uniquement pendant un épisode
 * d'échec : le délai de grâce se réarme donc tout seul au rétablissement suivant.
 */
function GraceGate({
  ms,
  pending,
  children,
}: {
  ms: number;
  pending: ReactNode;
  children: ReactNode;
}) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return <>{elapsed ? children : pending}</>;
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent"
        role="status"
        aria-label={label}
      />
      <p className="text-sm text-neutral-600">{label}</p>
    </div>
  );
}

export function AppRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
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
  const [signOutBusy, setSignOutBusy] = useState(false);

  const onRetry = useCallback(async () => {
    setRetryBusy(true);
    try {
      await refetch();
    } finally {
      setRetryBusy(false);
    }
  }, [refetch]);

  const silentRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  /** Session réellement perdue : purger avant `/login`, sinon le layout serveur y renvoie en boucle. */
  const onSignOut = useCallback(async () => {
    setSignOutBusy(true);
    try {
      await signOutAndRedirect(router, { queryClient });
    } finally {
      setSignOutBusy(false);
    }
  }, [router, queryClient]);

  const busy = retryBusy || isFetching;

  /**
   * Une donnée déjà chargée reste exploitable même si le rafraîchissement échoue :
   * on continue de servir l'application plutôt que de la remplacer par un écran d'erreur.
   */
  const hasContext = data != null;
  const degraded = hasContext && isError;

  /** Rien d'exploitable : on tente de se rétablir tout seul, en tâche de fond. */
  const stuck = !hasContext && !isLoading;

  /** Dans les deux cas (bloqué ou dégradé) la reprise doit se faire sans intervention. */
  useAutoRecovery(stuck || degraded, silentRefetch);

  /** Premier chargement sans donnée en cache */
  if (isLoading && data === undefined) {
    return <CenteredSpinner label="Chargement…" />;
  }

  /**
   * Rien d'exploitable. Deux causes bien distinctes, deux messages : réseau/serveur
   * (réparable tout seul) ou jeton refusé (« aucune entreprise » reste un cas métier
   * traité plus bas). Dans les deux cas, un délai de grâce silencieux d'abord.
   */
  if (stuck && isError) {
    const msg = messageFromUnknownError(
      error,
      "Impossible de charger votre espace. Vérifiez la connexion — la reconnexion se fera automatiquement.",
    );
    return (
      <GraceGate ms={GRACE_MS} pending={<CenteredSpinner label="Reconnexion…" />}>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <MdWifiOff className="h-14 w-14 text-amber-600" aria-hidden />
        <h2 className="max-w-md text-lg font-semibold text-neutral-900">
          Connexion au serveur impossible
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-neutral-600">{msg}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRetry()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          <MdRefresh
            className={`h-5 w-5 shrink-0 ${busy ? "animate-spin" : ""}`}
            aria-hidden
          />
          Réessayer maintenant
        </button>
        <p className="text-xs text-neutral-500">
          Vos données ne sont pas perdues : la page se rétablit dès que la connexion revient.
        </p>
      </div>
      </GraceGate>
    );
  }

  /**
   * `data === null` = le serveur a explicitement refusé le jeton (déconnexion depuis un
   * autre onglet, session révoquée, cookie effacé). Le layout serveur, lui, nous avait
   * laissés entrer : il faut donc vraiment purger la session avant de renvoyer au login.
   */
  if (data === null) {
    return (
      <GraceGate ms={GRACE_MS} pending={<CenteredSpinner label="Reconnexion…" />}>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <MdLockOutline className="h-14 w-14 text-neutral-500" aria-hidden />
        <h2 className="max-w-md text-lg font-semibold text-neutral-900">
          Votre session a expiré
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-neutral-600">
          Pour votre sécurité, reconnectez-vous pour reprendre votre travail.
        </p>
        <button
          type="button"
          disabled={signOutBusy}
          onClick={() => void onSignOut()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          Se reconnecter
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRetry()}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-fs-accent underline-offset-2 hover:underline disabled:opacity-60"
        >
          <MdRefresh
            className={`h-4 w-4 shrink-0 ${busy ? "animate-spin" : ""}`}
            aria-hidden
          />
          Réessayer
        </button>
      </div>
      </GraceGate>
    );
  }

  /** Requête en attente sans erreur (ex. réseau coupé, React Query en pause) : patienter. */
  if (data === undefined) {
    return <CenteredSpinner label="Reconnexion…" />;
  }

  const guarded = (() => {
    if (data?.isSuperAdmin) return <>{children}</>;

    if (!data?.companyId) {
      return (
        <div className="px-4 py-10 text-center text-sm text-neutral-600">
          <p>
            Aucune entreprise associée à ce compte ou accès désactivé. Si vous pensez qu’il s’agit
            d’une erreur, contactez l’administrateur.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRetry()}
            className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-black/10 bg-fs-card px-4 text-sm font-semibold text-neutral-800 shadow-sm disabled:opacity-60"
          >
            <MdRefresh
              className={`h-4 w-4 shrink-0 ${busy ? "animate-spin" : ""}`}
              aria-hidden
            />
            Actualiser
          </button>
        </div>
      );
    }

    if (!canAccessPathname(pathname)) return <NoAccessScreen />;

    return <>{children}</>;
  })();

  return (
    <>
      {guarded}
      {degraded ? <ReconnectBanner onRetry={() => void onRetry()} busy={busy} /> : null}
    </>
  );
}
