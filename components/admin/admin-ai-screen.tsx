"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminListCompanies,
  adminListLandingChatMessages,
  adminUpdateCompany,
} from "@/lib/features/admin/api";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale/fr";
import { MdPowerSettingsNew } from "react-icons/md";

export function AdminAiScreen() {
  const qc = useQueryClient();

  const companiesQ = useQuery({
    queryKey: ["admin-ai-companies"] as const,
    queryFn: () => adminListCompanies(),
  });

  const chatQ = useQuery({
    queryKey: ["admin-landing-chat"] as const,
    queryFn: () => adminListLandingChatMessages(500),
  });

  const toggle = useMutation({
    mutationFn: async (p: { id: string; enabled: boolean }) => {
      await adminUpdateCompany(p.id, { aiPredictionsEnabled: p.enabled });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-ai-companies"] });
      toast.success("Entreprise mise à jour");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const companies = companiesQ.data ?? [];
  const enabledCount = companies.filter((c) => c.aiPredictionsEnabled).length;
  const msgs = chatQ.data ?? [];
  const userMsgs = msgs.filter((m) => m.role === "user");

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="IA"
        description="Prédictions IA par entreprise et questions du chatbot landing"
      />

      <AdminCard>
        <p className="text-sm text-slate-700">
          {enabledCount} entreprise(s) avec prédictions IA activées sur {companies.length}.
        </p>
      </AdminCard>

      <AdminCard padding="p-0" className="overflow-x-auto">
        <table className="min-w-[480px] w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="p-3 text-left">Entreprise</th>
              <th className="p-3 text-left">Prédictions IA</th>
              <th className="p-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3">{c.aiPredictionsEnabled ? "Activées" : "Désactivées"}</td>
                <td className="p-3">
                  <button
                    type="button"
                    className="rounded-lg p-2 hover:bg-slate-100"
                    onClick={() => toggle.mutate({ id: c.id, enabled: !c.aiPredictionsEnabled })}
                  >
                    <MdPowerSettingsNew className="h-5 w-5 text-slate-700" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>

      <h2 className="text-lg font-bold text-slate-900">Questions du chatbot (landing)</h2>
      <p className="text-sm text-slate-600">
        {userMsgs.length} question(s) posée(s) par les visiteurs.
      </p>
      <AdminCard padding="p-0" className="max-h-[400px] overflow-auto">
        <table className="min-w-[640px] w-full text-xs">
          <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Session</th>
              <th className="p-2 text-left">Rôle</th>
              <th className="p-2 text-left">Message</th>
            </tr>
          </thead>
          <tbody>
            {msgs.map((m) => {
              const created = m.created_at != null ? String(m.created_at) : null;
              let dateStr = "—";
              if (created) {
                try {
                  dateStr = format(new Date(created), "dd/MM/yyyy HH:mm", { locale: fr });
                } catch {
                  dateStr = created;
                }
              }
              return (
                <tr key={String(m.id)} className="border-b border-slate-100">
                  <td className="p-2 whitespace-nowrap text-slate-600">{dateStr}</td>
                  <td className="p-2 font-mono text-[10px] text-slate-500">
                    {String(m.session_id ?? "").slice(0, 12)}…
                  </td>
                  <td className="p-2">{String(m.role ?? "")}</td>
                  <td className="p-2 text-slate-800">{String(m.content ?? "").slice(0, 200)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}
