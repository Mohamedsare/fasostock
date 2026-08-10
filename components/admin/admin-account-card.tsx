"use client";

import { AdminCard } from "@/components/admin/admin-page-header";
import { adminGetMyAccountEmail, adminUpdateMyAccount } from "@/lib/features/admin/api";
import { createClient } from "@/lib/supabase/client";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400";

/**
 * « Mon compte super admin » : changement de l'email de connexion et/ou du mot de
 * passe. Le mot de passe actuel est exigé (vérifié côté serveur), et le nouvel
 * email est confirmé automatiquement — aucun lien de validation à cliquer.
 * Après succès, la session est fermée : on se reconnecte avec les identifiants à jour.
 */
export function AdminAccountCard() {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const emailQ = useQuery({
    queryKey: ["admin-my-account-email"] as const,
    queryFn: () => adminGetMyAccountEmail(),
    staleTime: 60_000,
  });
  const currentEmail = emailQ.data ?? "";

  const mut = useMutation({
    mutationFn: () =>
      adminUpdateMyAccount({
        currentPassword,
        newEmail: newEmail.trim() || undefined,
        newPassword: newPassword || undefined,
      }),
    onSuccess: async (r) => {
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      setNewEmail("");
      toast.success(
        r.emailChanged && r.passwordChanged
          ? "Email et mot de passe mis à jour. Reconnectez-vous."
          : r.emailChanged
            ? `Email mis à jour (${r.email}). Reconnectez-vous.`
            : "Mot de passe mis à jour. Reconnectez-vous.",
      );
      // Les identifiants ont changé : on repart d'une session propre.
      try {
        await createClient().auth.signOut();
      } catch {
        /* la redirection suffit */
      }
      router.replace("/login");
    },
    onError: (e) => setErr(messageFromUnknownError(e)),
  });

  function submit() {
    setErr(null);
    const email = newEmail.trim().toLowerCase();
    const wantsEmail = email.length > 0 && email !== currentEmail.toLowerCase();
    const wantsPassword = newPassword.length > 0;

    if (!currentPassword) {
      setErr("Saisissez votre mot de passe actuel pour confirmer.");
      return;
    }
    if (!wantsEmail && !wantsPassword) {
      setErr("Indiquez un nouvel email ou un nouveau mot de passe.");
      return;
    }
    if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr("Adresse email invalide.");
      return;
    }
    if (wantsPassword && newPassword.length < 8) {
      setErr("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (wantsPassword && newPassword !== newPassword2) {
      setErr("Les deux mots de passe ne correspondent pas.");
      return;
    }
    mut.mutate();
  }

  return (
    <AdminCard>
      <h3 className="text-base font-bold text-slate-900">Mon compte super admin</h3>
      <p className="mt-1 text-sm text-slate-600">
        Changez votre email de connexion et votre mot de passe. Vous serez déconnecté après
        l&apos;enregistrement.
      </p>

      <p className="mt-4 text-xs font-medium text-slate-500">Email actuel</p>
      <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {emailQ.isLoading ? "…" : currentEmail || "—"}
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Nouvel email (facultatif)
        <input
          type="email"
          className={inputClass}
          value={newEmail}
          onChange={(e) => {
            setNewEmail(e.target.value);
            setErr(null);
          }}
          placeholder={currentEmail || "nouveau@exemple.com"}
          autoComplete="email"
        />
      </label>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Nouveau mot de passe (facultatif)
          <input
            type="password"
            className={inputClass}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setErr(null);
            }}
            placeholder="8 caractères minimum"
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Confirmer le mot de passe
          <input
            type="password"
            className={inputClass}
            value={newPassword2}
            onChange={(e) => {
              setNewPassword2(e.target.value);
              setErr(null);
            }}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Mot de passe actuel (obligatoire)
        <input
          type="password"
          className={inputClass}
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            setErr(null);
          }}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </label>

      <button
        type="button"
        className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        disabled={mut.isPending}
        onClick={submit}
      >
        {mut.isPending ? "Enregistrement…" : "Mettre à jour mes identifiants"}
      </button>
    </AdminCard>
  );
}
