"use client";

/**
 * Push Web vers tous les propriétaires des entreprises données (serveur vérifie l’appartenance).
 * Ne pas bloquer le flux métier en cas d’échec.
 */
export function fireAndForgetCompanyOwnersPush(params: {
  companyIds: string[];
  title: string;
  body?: string;
  url?: string;
}): void {
  const ids = [...new Set(params.companyIds.filter(Boolean))];
  if (ids.length === 0) return;
  void fetch("/api/push/notify-company-owners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      companyIds: ids,
      title: params.title,
      body: params.body ?? null,
      url: params.url ?? null,
    }),
  }).catch(() => {
    /* push optionnel */
  });
}
