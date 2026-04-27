"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminCreatePublicPartner,
  adminDeletePublicPartner,
  adminListPublicPartners,
} from "@/lib/features/admin/api";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MdAdd, MdDeleteOutline, MdUpload } from "react-icons/md";

export function AdminGPubliqueScreen() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [logoDataUrl, setLogoDataUrl] = useState("");

  const q = useQuery({
    queryKey: ["admin-public-partners"] as const,
    queryFn: adminListPublicPartners,
  });

  const addMut = useMutation({
    mutationFn: adminCreatePublicPartner,
    onSuccess: async () => {
      toast.success("Partenaire ajouté.");
      setName("");
      setSortOrder("0");
      setLogoDataUrl("");
      await qc.invalidateQueries({ queryKey: ["admin-public-partners"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const delMut = useMutation({
    mutationFn: adminDeletePublicPartner,
    onSuccess: async () => {
      toast.success("Partenaire supprimé.");
      await qc.invalidateQueries({ queryKey: ["admin-public-partners"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const canAdd = useMemo(
    () => name.trim().length >= 2 && logoDataUrl.trim().length > 0 && !addMut.isPending,
    [name, logoDataUrl, addMut.isPending],
  );

  function onPickLogo(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setLogoDataUrl(result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="GPublique"
        description="Gestion du contenu public de la landing (section Nos partenaires)."
      />

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Ajouter un partenaire</h3>
        <p className="mt-1 text-xs text-slate-500">
          Nom + logo. Le logo uploadé est stocké en base et affiché sur la landing.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_170px_170px_auto] md:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom partenaire"
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
          />
          <input
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Ordre"
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
          />
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
            <MdUpload className="h-4 w-4" aria-hidden />
            Uploader logo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onPickLogo(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() =>
              addMut.mutate({
                name,
                logoUrl: logoDataUrl,
                sortOrder: Number(sortOrder || "0"),
              })
            }
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <MdAdd className="h-4 w-4" aria-hidden />
            Ajouter
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {logoDataUrl ? "Logo prêt pour enregistrement." : "Choisissez une image (.png/.jpg/.webp)."}
        </p>
      </AdminCard>

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Partenaires publiés</h3>
        {q.isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Chargement…</p>
        ) : q.isError ? (
          <p className="mt-3 text-sm font-semibold text-red-600">
            {(q.error as Error)?.message ?? "Erreur de chargement"}
          </p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun partenaire.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(q.data ?? []).map((p) => (
              <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex h-16 items-center justify-center rounded-xl bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.logoUrl} alt={p.name} className="h-10 w-auto max-w-[160px] object-contain" />
                </div>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">Ordre: {p.sortOrder}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => delMut.mutate(p.id)}
                    disabled={delMut.isPending}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 disabled:opacity-50"
                    title="Supprimer"
                    aria-label={`Supprimer ${p.name}`}
                  >
                    <MdDeleteOutline className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
