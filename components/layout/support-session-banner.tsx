"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LifeBuoy, LogOut } from "lucide-react";

import {
  endSupportSession,
  getCurrentSupportSession,
  remainingLabel,
} from "@/lib/features/support/api";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";

/**
 * Même bandeau, mais autonome : pour les écrans (espace Admin) qui ne chargent pas
 * le contexte applicatif. Sans lui, revenir sur /admin pendant une intervention
 * donnerait l'illusion d'en être sorti.
 */
export function SupportSessionBannerStandalone() {
  const { data } = useQuery({
    queryKey: ["support-session"] as const,
    queryFn: getCurrentSupportSession,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  if (!data) return null;
  return (
    <SupportSessionBanner
      companyName={data.companyName}
      reason={data.reason}
      expiresAt={data.expiresAt}
    />
  );
}

type Props = {
  companyName: string;
  reason: string;
  expiresAt: string;
};

/**
 * Bandeau permanent du mode dépannage.
 *
 * Volontairement voyant et non refermable : travailler dans les données d'un client
 * ne doit jamais pouvoir se faire par inadvertance ni se confondre avec son propre
 * espace. Affiche le temps restant et referme l'intervention à l'expiration.
 */
export function SupportSessionBanner({ companyName, reason, expiresAt }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [left, setLeft] = useState<string | null>(() => remainingLabel(expiresAt));
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const tick = () => setLeft(remainingLabel(expiresAt));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [expiresAt]);

  // Expiration atteinte : on recharge le contexte, qui retombe sur l'espace admin.
  useEffect(() => {
    if (left !== null) return;
    void qc.invalidateQueries({ queryKey: queryKeys.appContext });
    void qc.invalidateQueries({ queryKey: ["support-session"] });
    router.replace("/admin/companies");
  }, [left, qc, router]);

  async function leave() {
    setLeaving(true);
    try {
      await endSupportSession();
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
      await qc.invalidateQueries({ queryKey: ["support-session"] });
      router.replace("/admin/companies");
    } catch (e) {
      toast.error(messageFromUnknownError(e));
      setLeaving(false);
    }
  }

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-amber-500 px-3 py-1.5 text-[13px] font-semibold text-amber-950"
    >
      <LifeBuoy className="h-4 w-4 shrink-0" aria-hidden />
      <span className="uppercase tracking-wide">Mode dépannage</span>
      <span className="min-w-0 flex-1 truncate font-normal" title={reason}>
        {companyName}
        <span className="opacity-70"> — {reason}</span>
      </span>
      {left ? <span className="font-normal tabular-nums">{left} restantes</span> : null}
      <button
        type="button"
        onClick={() => void leave()}
        disabled={leaving}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-950/15 px-2.5 py-1 text-[12px] font-semibold hover:bg-amber-950/25 disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Quitter
      </button>
    </div>
  );
}
