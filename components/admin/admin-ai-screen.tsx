"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminListCompanies,
  adminListLandingChatMessages,
  adminUpdateCompany,
} from "@/lib/features/admin/api";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { downloadProSpreadsheet } from "@/lib/utils/spreadsheet-export-pro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale/fr";
import { MdDownload, MdPowerSettingsNew } from "react-icons/md";

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700">
            {enabledCount} entreprise(s) avec prédictions IA activées sur {companies.length}.
          </p>
          {companies.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    const headers = ["Entreprise", "Prédictions IA"];
                    const rows = companies.map((c) => [
                      c.name,
                      c.aiPredictionsEnabled ? "Activées" : "Désactivées",
                    ]);
                    const d = new Date().toISOString().slice(0, 10);
                    await downloadProSpreadsheet(
                      `admin-ia-entreprises-${d}.xlsx`,
                      "Entreprises",
                      headers,
                      rows,
                      {
                        title: "FasoStock Admin — IA par entreprise",
                        subtitle: `${companies.length} ligne(s) · ${d}`,
                      },
                    );
                    toast.success("Excel enregistré");
                  } catch (e) {
                    toast.error(messageFromUnknownError(e, "Export impossible."));
                  }
                })();
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <MdDownload className="h-5 w-5 shrink-0" aria-hidden />
              Exporter Excel
            </button>
          ) : null}
        </div>
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Questions du chatbot (landing)</h2>
          <p className="text-sm text-slate-600">
            {userMsgs.length} question(s) posée(s) par les visiteurs.
          </p>
        </div>
        {msgs.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const headers = ["Date", "Session", "Rôle", "Message"];
                  const rows = msgs.map((m) => {
                    const created = m.created_at != null ? String(m.created_at) : "";
                    let dateStr = "—";
                    if (created) {
                      try {
                        dateStr = format(new Date(created), "dd/MM/yyyy HH:mm", { locale: fr });
                      } catch {
                        dateStr = created;
                      }
                    }
                    return [
                      dateStr,
                      String(m.session_id ?? "").slice(0, 36),
                      String(m.role ?? ""),
                      String(m.content ?? "").slice(0, 2000),
                    ];
                  });
                  const d = new Date().toISOString().slice(0, 10);
                  await downloadProSpreadsheet(
                    `admin-landing-chat-${d}.xlsx`,
                    "Messages",
                    headers,
                    rows,
                    {
                      title: "FasoStock Admin — Chat landing",
                      subtitle: `${msgs.length} message(s) · ${d}`,
                    },
                  );
                  toast.success("Excel enregistré");
                } catch (e) {
                  toast.error(messageFromUnknownError(e, "Export impossible."));
                }
              })();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <MdDownload className="h-5 w-5 shrink-0" aria-hidden />
            Exporter Excel
          </button>
        ) : null}
      </div>
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
