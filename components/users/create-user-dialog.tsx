"use client";

import { FsCard, FsSectionLabel, fsInputClass } from "@/components/ui/fs-screen-primitives";
import type { RoleOption } from "@/lib/features/users/types";
import { useEffect, useState } from "react";
import { MdClose, MdPersonAdd } from "react-icons/md";

export function CreateUserDialog({
  open,
  onClose,
  roles,
  stores,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleOption[];
  stores: Array<{ id: string; name: string }>;
  onCreate: (payload: {
    email: string;
    password: string;
    fullName: string;
    roleSlug: string;
    storeIds: string[];
  }) => Promise<void> | void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleSlug, setRoleSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeIds, setStoreIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPassword("");
    setFullName("");
    setRoleSlug(roles[0]?.slug ?? "store_manager");
    setStoreIds([]);
    setBusy(false);
    setError(null);
  }, [open, roles]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Nouveau utilisateur"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard className="w-full max-w-lg" padding="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-neutral-600">Nouvel utilisateur</p>
            <p className="mt-0.5 text-sm font-bold text-fs-text">Créer un compte entreprise</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-neutral-700"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FsSectionLabel>Nom complet</FsSectionLabel>
            <input className={fsInputClass()} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <FsSectionLabel>Email</FsSectionLabel>
            <input className={fsInputClass()} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <FsSectionLabel>Mot de passe</FsSectionLabel>
            <input type="password" className={fsInputClass()} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <FsSectionLabel>Rôle</FsSectionLabel>
            <select className={fsInputClass()} value={roleSlug} onChange={(e) => setRoleSlug(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-3 text-xs text-neutral-600">
          L'utilisateur pourra se connecter avec cet email et ce mot de passe.
          Communiquez-les de facon securisee.
        </p>

        {stores.length > 0 ? (
          <div className="mt-3">
            <FsSectionLabel>Boutiques (au moins une)</FsSectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {stores.map((s) => {
                const selected = storeIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setStoreIds((prev) =>
                        selected ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                      )
                    }
                    className={
                      selected
                        ? "min-h-[40px] rounded-full border border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)] px-3 py-1.5 text-xs font-semibold text-fs-accent"
                        : "min-h-[40px] rounded-full border border-black/8 bg-fs-card px-3 py-1.5 text-xs font-semibold text-neutral-700"
                    }
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[10px] border border-black/8 bg-fs-card px-3 py-2.5 text-xs font-semibold text-neutral-700 sm:text-sm"
            disabled={busy}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              if (!email.trim() || !password || !roleSlug) {
                setError("Email, mot de passe et rôle requis.");
                return;
              }
              if (stores.length > 0 && storeIds.length === 0) {
                setError("Choisissez au moins une boutique.");
                return;
              }
              if (password.length < 6) {
                setError("Mot de passe minimum 6 caractères.");
                return;
              }
              try {
                setBusy(true);
                await onCreate({
                  email: email.trim(),
                  password,
                  fullName: fullName.trim(),
                  roleSlug,
                  storeIds,
                });
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Création impossible.");
              } finally {
                setBusy(false);
              }
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-3 py-2.5 text-xs font-semibold text-white shadow-sm sm:text-sm"
            disabled={busy}
          >
            <MdPersonAdd className="h-4 w-4" aria-hidden />
            Creer et donner les identifiants
          </button>
        </div>
      </FsCard>
    </div>
  );
}

