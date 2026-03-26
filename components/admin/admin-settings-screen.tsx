"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminGetPlatformSettings, adminSetPlatformSettings } from "@/lib/features/admin/api";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function AdminSettingsScreen() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["admin-platform-settings"] as const,
    queryFn: () => adminGetPlatformSettings(),
  });

  useEffect(() => {
    if (q.data) setForm({ ...q.data });
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => adminSetPlatformSettings(form),
    onSuccess: () => {
      toast.success("Paramètres enregistrés");
      void qc.invalidateQueries({ queryKey: ["admin-platform-settings"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  if (q.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  const get = (k: string) => form[k] ?? "";

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Paramètres"
        description="Configuration de la plateforme (nom, contact, options)"
      />

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Informations plateforme</h3>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Nom de la plateforme
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={get("platform_name")}
            onChange={(e) => set("platform_name", e.target.value)}
            placeholder="FasoStock"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Email de contact
          <input
            type="email"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={get("contact_email")}
            onChange={(e) => set("contact_email", e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Téléphone
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={get("contact_phone")}
            onChange={(e) => set("contact_phone", e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          WhatsApp (landing)
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={get("contact_whatsapp")}
            onChange={(e) => set("contact_whatsapp", e.target.value)}
          />
        </label>
      </AdminCard>

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Fonctionnalités</h3>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={get("registration_enabled") === "true"}
            onChange={(e) => set("registration_enabled", e.target.checked ? "true" : "false")}
          />
          Inscriptions publiques autorisées
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={get("landing_chat_enabled") === "true"}
            onChange={(e) => set("landing_chat_enabled", e.target.checked ? "true" : "false")}
          />
          Chatbot landing activé
        </label>
      </AdminCard>

      <button
        type="button"
        className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        Enregistrer les paramètres
      </button>
    </div>
  );
}
