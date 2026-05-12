"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import { adminAskAiAssistant, adminExecuteAiAction, adminListCompanies } from "@/lib/features/admin/api";
import type { AdminCompany } from "@/lib/features/admin/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { MdSend } from "react-icons/md";

type ChatMsg = { role: "user" | "assistant"; content: string; at: string };
type StructuredAnswerUi = {
  intro: string;
  direct_answer: string;
  table_title: string;
  table_columns: string[];
  table_rows: string[][];
  key_figures: string[];
  recommended_actions: string[];
};
type ChatMsgUi = ChatMsg & { structured?: StructuredAnswerUi };
type PendingAction = {
  id: string;
  type: "set_company_active" | "set_company_ai_predictions";
  companyId: string;
  companyName: string;
  value: boolean;
  reason: string;
};

function resolveCompanyIdByExactName(
  companies: AdminCompany[],
  rawName: string,
): string | null {
  const want = rawName.trim().toLowerCase();
  if (!want) return null;
  const hits = companies.filter((c) => c.name.trim().toLowerCase() === want);
  return hits.length === 1 ? hits[0]!.id : null;
}

export function AdminAiScreen() {
  const qc = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState<ChatMsgUi[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const companiesQ = useQuery({
    queryKey: ["admin-ai-companies"] as const,
    queryFn: () => adminListCompanies(),
  });

  const ask = useMutation({
    mutationFn: async (p: {
      question: string;
      companyId: string | null;
      history: Array<{ role: "user" | "assistant"; content: string }>;
    }) =>
      adminAskAiAssistant({
        question: p.question,
        companyId: p.companyId,
        history: p.history,
      }),
    onSuccess: (res, vars) => {
      setChat((prev) => [
        ...prev,
        { role: "user", content: vars.question, at: new Date().toISOString() },
        {
          role: "assistant",
          content: res.answer,
          at: new Date().toISOString(),
          structured: res.structuredAnswer,
        },
      ]);
      if ((res.suggestedActions ?? []).length > 0) {
        const list = companiesQ.data ?? [];
        const mapped = (res.suggestedActions ?? [])
          .map((a, i) => {
            const companyId = resolveCompanyIdByExactName(list, a.company_name);
            if (!companyId) return null;
            return {
              id: `${Date.now()}-${i}-${a.type}`,
              type: a.type,
              companyId,
              companyName: a.company_name,
              value: a.value,
              reason: a.reason,
            } satisfies PendingAction;
          })
          .filter((x): x is PendingAction => x != null);
        if (mapped.length > 0) {
          setPendingActions((prev) => [...prev, ...mapped]);
        } else if ((res.suggestedActions ?? []).length > 0) {
          toast.error(
            "Actions IA non exécutables : nom d'entreprise ambigu ou inconnu. Vérifiez la liste des entreprises.",
          );
        }
      }
      setPrompt("");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const companies = companiesQ.data ?? [];
  const companyFilter = useMemo(
    () => (selectedCompanyId === "all" ? null : selectedCompanyId),
    [selectedCompanyId],
  );

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat, ask.isPending]);

  function onAsk() {
    const question = prompt.trim();
    if (!question) return;
    ask.mutate({
      question,
      companyId: companyFilter,
      history: chat.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    });
  }

  const runAction = useMutation({
    mutationFn: async (a: PendingAction) =>
      adminExecuteAiAction({
        type: a.type,
        companyId: a.companyId,
        value: a.value,
      }),
    onSuccess: (res, action) => {
      setChat((prev) => [
        ...prev,
        { role: "assistant", content: `Action executee: ${res.message}`, at: new Date().toISOString() },
      ]);
      setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
      void qc.invalidateQueries({ queryKey: ["admin-ai-companies"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const quickPrompts = [
    "Donne moi un bilan global ultra clair de la plateforme.",
    "Liste les entreprises et leur statut abonnement dans un tableau propre.",
    "Analyse ELOF MULTI SERVICES et propose 3 actions prioritaires.",
    "Quelles entreprises sont a risque de churn ce mois ?",
  ];

  return (
    <div className="h-[calc(100dvh-0.75rem)] bg-[#F7F7F5] p-1.5 md:h-[calc(100dvh-1rem)] md:p-2">
      <div className="mx-auto flex h-full w-full max-w-[99vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-200 px-3 py-2 md:px-4">
          <AdminPageHeader
            title="IA"
            description="Assistant conversationnel et actions Super Admin"
          />
          <div className="mt-1 flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
            <p className="text-xs font-medium text-slate-500">
              Discussion libre sur toutes les entreprises, avec execution d&apos;actions.
            </p>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm sm:w-[320px]"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
            >
              <option value="all">Toutes les entreprises (global)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          ref={chatScrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#FAFAF8] px-2.5 py-3 md:px-4"
        >
          {chat.length === 0 ? (
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Pose ta question sur le SaaS FasoStock (performance, abonnements, risques, entreprise specifique) puis execute les actions proposees si necessaire.
            </div>
          ) : null}
          {chat.map((m, idx) => (
            <div
              key={`${m.at}-${idx}`}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[78%] rounded-2xl bg-[#111827] px-4 py-3 text-sm text-white"
                  : "mr-auto w-full max-w-[99%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
              }
            >
              {m.role === "assistant" && m.structured ? (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-slate-900">{m.structured.intro}</p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reponse directe</p>
                    <p className="mt-1 text-sm leading-6 text-slate-900">{m.structured.direct_answer}</p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-900">{m.structured.table_title}</p>
                    <FsHorizontalScroll className="rounded-xl border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            {m.structured.table_columns.map((c) => (
                              <th key={c} className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {m.structured.table_rows.map((r, ridx) => (
                            <tr key={`${ridx}-${r.join("-")}`} className="odd:bg-white even:bg-slate-50/40">
                              {(m.structured?.table_columns ?? []).map((_, cidx) => (
                                <td key={`${ridx}-${cidx}`} className="border-b border-slate-100 px-3 py-2 text-slate-700">
                                  {r[cidx] ?? "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </FsHorizontalScroll>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Chiffres cles</p>
                      <ul className="mt-2 space-y-1">
                        {m.structured.key_figures.map((k, kidx) => (
                          <li key={`${kidx}-${k}`} className="text-sm text-slate-800">
                            {k}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Actions recommandees</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5">
                        {m.structured.recommended_actions.map((a, aidx) => (
                          <li key={`${aidx}-${a}`} className="text-sm text-slate-800">
                            {a}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap leading-6">{m.content}</p>
              )}
            </div>
          ))}
          {ask.isPending ? (
            <div className="mr-auto max-w-[94%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              L&apos;IA analyse les donnees...
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-4 md:px-6">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quickPrompts.map((q) => (
              <button
                key={q}
                type="button"
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setPrompt(q)}
              >
                {q}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              className="max-h-40 min-h-[46px] flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="Ecris ton message..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onAsk();
                }
              }}
            />
            <button
              type="button"
              onClick={onAsk}
              disabled={ask.isPending || !prompt.trim()}
              className="inline-flex h-[46px] items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
            >
              <MdSend className="h-5 w-5" />
              Envoyer
            </button>
          </div>

          {pendingActions.length > 0 ? (
            <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Actions proposees par l&apos;IA</p>
              {pendingActions.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm text-slate-800">
                    <p className="font-semibold">
                      {a.type === "set_company_active" ? "Statut entreprise" : "Predictions IA"} - {a.companyName}
                    </p>
                    <p className="text-slate-600">
                      Cible: {a.value ? "Activer" : "Desactiver"}{a.reason ? ` - ${a.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setPendingActions((prev) => prev.filter((x) => x.id !== a.id))}
                    >
                      Ignorer
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-60"
                      disabled={runAction.isPending}
                      onClick={() => runAction.mutate(a)}
                    >
                      Executer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
