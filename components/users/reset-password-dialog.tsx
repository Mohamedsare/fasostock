"use client";

import { FsCard, FsSectionLabel, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { useEffect, useState } from "react";
import { MdClose, MdLockReset, MdVisibility, MdVisibilityOff } from "react-icons/md";

/**
 * Le propriétaire redéfinit le mot de passe d'un employé (oubli, départ,
 * identifiants partagés). Le nouveau mot de passe reste visible à l'écran le
 * temps de le communiquer à l'employé : c'est le propriétaire qui le choisit,
 * aucun email n'est envoyé.
 */
export function ResetPasswordDialog({
  open,
  userLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Nom (ou rôle) de l'employé concerné, pour éviter toute confusion. */
  userLabel: string;
  onClose: () => void;
  onSubmit: (newPassword: string) => Promise<void> | void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setShow(false);
    setBusy(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (password.length < 6) {
      setError("Mot de passe minimum 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit(password);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Changer le mot de passe"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className="w-full max-w-md rounded-b-none rounded-t-2xl border-x-0 border-b-0 sm:rounded-2xl sm:border-x sm:border-b"
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,760px)] flex-col">
          <div className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" aria-hidden />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-3 pb-3 pt-3 sm:px-4 sm:pt-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-600">Mot de passe</p>
              <p className="mt-0.5 truncate text-sm font-bold text-fs-text">{userLabel}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container sm:h-9 sm:w-9 sm:rounded-lg"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
            <div>
              <FsSectionLabel>Nouveau mot de passe</FsSectionLabel>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  className={fsInputClass("pr-12")}
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-600"
                  aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {show ? (
                    <MdVisibilityOff className="h-5 w-5" aria-hidden />
                  ) : (
                    <MdVisibility className="h-5 w-5" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-3">
              <FsSectionLabel>Confirmer</FsSectionLabel>
              <input
                type={show ? "text" : "password"}
                className={fsInputClass()}
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>

            <p className="mt-3 text-xs text-neutral-600">
              L&apos;employé se connectera avec ce nouveau mot de passe dès maintenant.
              Communiquez-le lui de façon sécurisée : ses sessions déjà ouvertes restent
              actives jusqu&apos;à leur expiration.
            </p>

            {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
          </div>

          <div className="shrink-0 border-t border-black/6 bg-fs-card/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-[10px] border border-black/8 bg-fs-card px-3 py-2.5 text-xs font-semibold text-neutral-700 sm:min-h-0 sm:text-sm"
                disabled={busy}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-3 py-2.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60 sm:min-h-0 sm:text-sm"
                disabled={busy}
              >
                <MdLockReset className="h-4 w-4" aria-hidden />
                {busy ? "Enregistrement…" : "Changer le mot de passe"}
              </button>
            </div>
          </div>
        </div>
      </FsCard>
    </div>
  );
}
