"use client";

export type CompanyOwnersPushResult = {
  ok: boolean;
  status: number;
  ownerUserCount?: number;
  /** Nombre d’abonnements push trouvés (lignes `push_subscriptions`) pour ces owners */
  pushDeviceCount?: number;
  error?: string;
};

/**
 * Envoie un push Web aux propriétaires des entreprises indiquées (serveur vérifie l’appartenance).
 * Préférer `await` après une vente pour éviter qu’une navigation n’interrompe la requête.
 */
export async function notifyCompanyOwnersPush(params: {
  companyIds: string[];
  title: string;
  body?: string;
  url?: string;
}): Promise<CompanyOwnersPushResult> {
  const ids = [...new Set(params.companyIds.filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, status: 204, error: "Aucune entreprise ciblée." };
  }
  try {
    const res = await fetch("/api/push/notify-company-owners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        companyIds: ids,
        title: params.title,
        body: params.body ?? null,
        url: params.url ?? null,
      }),
    });
    const raw = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }
    const errMsg =
      typeof parsed.error === "string" ? parsed.error : !res.ok ? raw.slice(0, 200) : undefined;
    const ownerUserCount =
      typeof parsed.owners === "number" ? parsed.owners : typeof parsed.ownerUserCount === "number"
        ? (parsed.ownerUserCount as number)
        : undefined;
    const pushDeviceCount =
      typeof parsed.attempted === "number"
        ? (parsed.attempted as number)
        : typeof parsed.pushDeviceCount === "number"
          ? (parsed.pushDeviceCount as number)
          : undefined;

    if (!res.ok) {
      logPushDebug("échec HTTP", { status: res.status, error: errMsg });
      return {
        ok: false,
        status: res.status,
        ownerUserCount,
        pushDeviceCount,
        error: errMsg ?? `HTTP ${res.status}`,
      };
    }

    if (
      typeof pushDeviceCount === "number" &&
      typeof ownerUserCount === "number" &&
      ownerUserCount > 0 &&
      pushDeviceCount === 0
    ) {
      logPushDebug(
        "aucun appareil push pour les propriétaires — activer « Notifications sur cet appareil » (Paramètres) sur le téléphone du owner, avec la même base.",
        { ownerUserCount, pushDeviceCount },
      );
    }

    return {
      ok: true,
      status: res.status,
      ownerUserCount,
      pushDeviceCount,
      error: errMsg,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logPushDebug("erreur réseau", { error: msg });
    return { ok: false, status: 0, error: msg };
  }
}

function logPushDebug(message: string, extra?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[FasoStock push owners] ${message}`, extra ?? "");
  }
}

/** Variante non bloquante (ex. login juste avant navigation). */
export function fireAndForgetCompanyOwnersPush(params: {
  companyIds: string[];
  title: string;
  body?: string;
  url?: string;
}): void {
  void notifyCompanyOwnersPush(params).then((r) => {
    if (!r.ok) logPushDebug("fire-and-forget", { ...r });
  });
}
