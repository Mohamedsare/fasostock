"use client";

import { FsCard } from "@/components/ui/fs-screen-primitives";
import { usePushState } from "@/lib/features/push/use-push-state";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { MdNotificationsActive, MdNotificationsOff } from "react-icons/md";

/**
 * Carte « Notifications sur cet appareil » — le seul endroit d'où part une demande
 * de permission, et toujours sur clic : le navigateur bannit définitivement un site
 * qui demande à l'ouverture de page.
 */
export function PushActivationCard({ className }: { className?: string }) {
  const push = usePushState();

  // Sans clé VAPID au build, l'activation ne mènerait nulle part : on ne montre rien.
  if (push.status === "unconfigured") return null;

  const isOn = push.status === "subscribed";

  return (
    <FsCard className={className} padding="p-5">
      <div className="flex items-center gap-2.5">
        {isOn ? (
          <MdNotificationsActive className="h-[22px] w-[22px] shrink-0 text-fs-accent" aria-hidden />
        ) : (
          <MdNotificationsOff className="h-[22px] w-[22px] shrink-0 text-neutral-500" aria-hidden />
        )}
        <p className="text-base font-semibold text-fs-text">Notifications sur cet appareil</p>
        <StatusPill status={push.status} />
      </div>

      <p className="mt-3 text-sm text-neutral-600">{describe(push.status, push.deviceCount)}</p>

      {push.status === "loading" ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          Vérification…
        </div>
      ) : push.status === "denied" ? (
        <p className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
          Les notifications sont bloquées pour ce site dans les réglages du navigateur. Touchez
          l’icône à gauche de l’adresse du site, autorisez les notifications, puis revenez ici.
        </p>
      ) : push.status === "unsupported" ? (
        <p className="mt-4 rounded-lg border border-black/[0.06] bg-fs-surface-container/60 px-3 py-2.5 text-sm text-neutral-600">
          Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d’abord FasoStock à
          l’écran d’accueil (Partager › Sur l’écran d’accueil), puis rouvrez l’app depuis l’icône.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {isOn ? (
            <button
              type="button"
              disabled={push.busy}
              onClick={async () => {
                const r = await push.disable();
                if (r.ok) toastSuccess("Notifications désactivées sur cet appareil.");
                else if (r.error) toastError(r.error);
              }}
              className="inline-flex min-h-[40px] min-w-[200px] items-center justify-center gap-2 rounded-[10px] border border-black/10 bg-fs-card px-4 text-sm font-semibold text-neutral-800 shadow-sm disabled:opacity-60"
            >
              {push.busy ? <Spinner tone="neutral" label="Patientez…" /> : "Désactiver sur cet appareil"}
            </button>
          ) : (
            <button
              type="button"
              disabled={push.busy}
              onClick={async () => {
                const ok = await push.enable();
                if (ok) toastSuccess("Notifications activées sur cet appareil.");
                else if (push.error) toastError(push.error);
              }}
              className="inline-flex min-h-[40px] min-w-[160px] items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {push.busy ? <Spinner tone="accent" label="Activation…" /> : "Activer les notifications"}
            </button>
          )}
        </div>
      )}

      {push.error ? <p className="mt-3 text-sm text-red-600">{push.error}</p> : null}
    </FsCard>
  );
}

function Spinner({ tone, label }: { tone: "accent" | "neutral"; label: string }) {
  return (
    <>
      <span
        className={cn(
          "h-4 w-4 animate-spin rounded-full border-2 border-t-transparent",
          tone === "accent" ? "border-white" : "border-neutral-400",
        )}
      />
      {label}
    </>
  );
}

function StatusPill({ status }: { status: ReturnType<typeof usePushState>["status"] }) {
  const map: Record<string, { label: string; className: string } | null> = {
    subscribed: { label: "Activées", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    denied: { label: "Refusées", className: "bg-red-500/15 text-red-700 dark:text-red-300" },
    idle: { label: "Non configurées", className: "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300" },
    "granted-elsewhere": {
      label: "À réactiver",
      className: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    },
    unsupported: { label: "Indisponibles", className: "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300" },
    loading: null,
    unconfigured: null,
  };
  const pill = map[status];
  if (!pill) return null;
  return (
    <span className={cn("ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold", pill.className)}>
      {pill.label}
    </span>
  );
}

function describe(status: ReturnType<typeof usePushState>["status"], deviceCount: number): string {
  switch (status) {
    case "subscribed":
      return deviceCount > 1
        ? `Cet appareil recevra les alertes, ainsi que ${deviceCount - 1} autre(s) appareil(s) connecté(s) à votre compte.`
        : "Cet appareil recevra une alerte système dès qu’un message arrive (vente, message administrateur…).";
    case "granted-elsewhere":
      return deviceCount > 0
        ? `Vous avez ${deviceCount} appareil(s) abonné(s), mais pas celui-ci. Activez-le pour recevoir les alertes ici aussi.`
        : "L’autorisation est accordée mais aucun abonnement n’est enregistré. Activez pour recevoir les alertes sur cet appareil.";
    case "denied":
      return "Vous avez refusé les notifications pour ce site.";
    case "unsupported":
      return "Les notifications ne sont pas disponibles dans ce navigateur.";
    case "loading":
      return "Vérification de l’état des notifications…";
    default:
      return "Recevez une alerte sur cet appareil, même quand FasoStock est fermé : ventes, messages de l’administrateur, alertes de stock.";
  }
}
