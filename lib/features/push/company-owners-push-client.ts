"use client";

export type CompanyOwnersPushResult = {
  ok: boolean;
  status: number;
  ownerUserCount?: number;
  /** Nombre d’abonnements push trouvés (lignes `push_subscriptions`) pour ces owners */
  pushDeviceCount?: number;
  error?: string;
  /** Cause typée — sert à décider ce qui mérite d’atteindre l’écran (cf. `reportPushOutcome`). */
  code?: PushFailureCode;
};

/**
 * `push_not_configured` / `push_forbidden` / `push_failed` : problèmes serveur ou
 * de droits — invisibles pour le vendeur. `push_no_device` : seul cas réellement
 * actionnable (le propriétaire n’a pas activé les notifications sur son téléphone).
 */
export type PushFailureCode =
  | "push_not_configured"
  | "push_forbidden"
  | "push_failed"
  | "push_offline"
  | "push_no_device";

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
        code: failureCodeOf(parsed.code, res.status),
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
      code:
        typeof ownerUserCount === "number" &&
        ownerUserCount > 0 &&
        pushDeviceCount === 0
          ? "push_no_device"
          : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logPushDebug("erreur réseau", { error: msg });
    return { ok: false, status: 0, error: msg, code: "push_offline" };
  }
}

function failureCodeOf(raw: unknown, status: number): PushFailureCode {
  if (typeof raw === "string") {
    if (raw === "push_not_configured" || raw === "push_forbidden" || raw === "push_failed") {
      return raw;
    }
  }
  if (status === 403 || status === 401) return "push_forbidden";
  if (status === 503) return "push_not_configured";
  return "push_failed";
}

const HINT_STORAGE_KEY = "fs.push.owner-device-hint.at";
const HINT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Le rappel « activez les notifications » ne se répète pas à chaque vente. */
function hintAlreadyShownRecently(): boolean {
  try {
    const last = Number(window.localStorage.getItem(HINT_STORAGE_KEY) ?? "0");
    if (Number.isFinite(last) && Date.now() - last < HINT_INTERVAL_MS) return true;
    window.localStorage.setItem(HINT_STORAGE_KEY, String(Date.now()));
    return false;
  } catch {
    // Stockage indisponible (navigation privée) : mieux vaut se taire que radoter.
    return true;
  }
}

/**
 * Traite le résultat d'un push après une opération métier réussie (vente…).
 *
 * Règle d'UX : l'opération a abouti, le push n'est qu'un service d'arrière-plan.
 * On n'interrompt donc l'utilisateur que pour la seule chose qu'il peut corriger
 * — et au plus une fois par jour. Tout le reste (VAPID absent, droits, réseau)
 * part dans les logs, jamais à l'écran.
 */
export async function reportPushOutcome(result: CompanyOwnersPushResult): Promise<void> {
  if (result.ok && !result.code) return;

  if (result.code === "push_no_device") {
    if (typeof window === "undefined" || hintAlreadyShownRecently()) return;
    const { toastInfo } = await import("@/lib/toast");
    toastInfo(
      "Le propriétaire ne reçoit pas encore les alertes de vente. Sur son téléphone : Paramètres › Notifications sur cet appareil.",
      7000,
    );
    return;
  }

  logPushDebug("push non délivré (silencieux pour l’utilisateur)", {
    code: result.code,
    status: result.status,
    error: result.error,
  });
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
