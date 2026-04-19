"use client";

export type PushDispatchBody =
  | { userId: string; title: string; body?: string | null; url?: string | null }
  | { allOwners: true; title: string; body?: string | null; url?: string | null };

/**
 * Demande au serveur d’envoyer une notification Web Push (après création en base, ex. admin).
 * Les échecs sont ignorés côté appelant pour ne pas bloquer le flux métier.
 */
export async function requestWebPushDispatch(body: PushDispatchBody): Promise<void> {
  const res = await fetch("/api/push/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `Échec envoi push (${res.status})`);
  }
}

export function fireAndForgetWebPushDispatch(body: PushDispatchBody): void {
  void requestWebPushDispatch(body).catch((e) => {
    if (process.env.NODE_ENV === "development") {
      console.warn("[web push]", e);
    }
  });
}
