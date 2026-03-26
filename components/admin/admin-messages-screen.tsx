"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminListUsers,
  adminSendNotificationToAllOwners,
  adminSendNotificationToUser,
} from "@/lib/features/admin/api";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

export function AdminMessagesScreen() {
  const [toAllOwners, setToAllOwners] = useState(false);
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const usersQ = useQuery({
    queryKey: ["admin-users-msg"] as const,
    queryFn: () => adminListUsers(),
  });

  const send = useMutation({
    mutationFn: async (): Promise<number | null> => {
      const t = title.trim();
      if (!t) throw new Error("Le titre est obligatoire.");
      if (!toAllOwners && !userId) throw new Error("Choisissez un destinataire ou « tous les owners ».");
      if (toAllOwners) {
        return adminSendNotificationToAllOwners(t, body.trim() || null);
      }
      await adminSendNotificationToUser(userId, t, body.trim() || null);
      return null;
    },
    onSuccess: (count) => {
      if (typeof count === "number") {
        toast.success(`Message envoyé à ${count} owner(s).`);
      } else {
        toast.success("Message envoyé.");
      }
      setTitle("");
      setBody("");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="Envoyer un message"
        description="Notifications visibles dans l'espace Notifications des destinataires."
      />

      <AdminCard>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={toAllOwners}
            onChange={(e) => setToAllOwners(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-slate-900">Envoyer à tous les owners</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Chaque propriétaire d&apos;entreprise reçoit la notification.
            </span>
          </span>
        </label>

        {!toAllOwners ? (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Destinataire
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {(usersQ.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName ?? u.email ?? u.id} {u.email ? `(${u.email})` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Titre *
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Message (optionnel)
          <textarea
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="mt-6 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          disabled={send.isPending}
          onClick={() => send.mutate()}
        >
          Envoyer
        </button>
      </AdminCard>
    </div>
  );
}
