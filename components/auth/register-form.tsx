"use client";

import { AuthCard, AuthPageShell, authInputClass } from "@/components/auth/auth-page-shell";
import { authErrorToMessage } from "@/lib/auth/auth-errors";
import { registerCompany } from "@/lib/auth/register-company";
import { slugFromName } from "@/lib/auth/slug";
import { ROUTES } from "@/lib/config/routes";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [firstStorePhone, setFirstStorePhone] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [firstStoreName, setFirstStoreName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const name = companyName.trim();
    if (!name) return;
    const s = slugFromName(name);
    if (s && s !== companySlug) setCompanySlug(s);
  }, [companyName, companySlug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      await registerCompany(supabase, {
        companyName: companyName.trim(),
        companySlug: companySlug.trim() || slugFromName(companyName.trim()),
        ownerEmail: ownerEmail.trim(),
        ownerPassword,
        ownerFullName: ownerFullName.trim(),
        firstStoreName: firstStoreName.trim(),
        firstStorePhone: firstStorePhone.trim(),
      });
      try {
        await supabase.auth.signOut();
      } catch {
        /* session parfois absente si confirmation email */
      }
      router.push(`${ROUTES.login}?registered=1`);
    } catch (err: unknown) {
      reportHandledClientError(err, { source: "auth:register" });
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "";
      setError(msg ? authErrorToMessage({ message: msg }) : "Inscription impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      backHref={ROUTES.login}
      backLabel="Retour à la connexion"
      title="Créer une entreprise"
      subtitle="Inscription : entreprise, compte propriétaire et première boutique."
    >
      <AuthCard>
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-800">
            Nom de l&apos;entreprise *
          </span>
          <input
            className={authInputClass}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            minLength={2}
            autoCapitalize="words"
            placeholder="Ma société"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-800">
            Slug (rempli automatiquement)
          </span>
          <input
            className={cn(authInputClass, "bg-neutral-100/90 text-neutral-700")}
            value={companySlug}
            readOnly
            tabIndex={-1}
            aria-readonly
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-800">
            Téléphone *
          </span>
          <input
            className={authInputClass}
            type="tel"
            value={firstStorePhone}
            onChange={(e) => setFirstStorePhone(e.target.value)}
            required
            minLength={8}
            placeholder="70 00 00 00 ou +226 70 00 00 00"
            autoComplete="tel"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-800">
            Votre nom complet *
          </span>
          <input
            className={authInputClass}
            value={ownerFullName}
            onChange={(e) => setOwnerFullName(e.target.value)}
            required
            minLength={2}
            autoCapitalize="words"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-800">
            Email *
          </span>
          <input
            className={authInputClass}
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="vous@exemple.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-800">
            Mot de passe *
          </span>
          <input
            className={authInputClass}
            type="password"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Minimum 8 caractères
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-800">
            Première boutique — nom *
          </span>
          <input
            className={authInputClass}
            value={firstStoreName}
            onChange={(e) => setFirstStoreName(e.target.value)}
            required
            minLength={2}
            autoCapitalize="words"
            placeholder="Ma boutique"
          />
        </label>

        {error ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="fs-touch-target mt-3 flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-fs-accent to-[#d94f1a] py-3.5 text-base font-semibold text-white shadow-[0_4px_14px_-2px_rgba(232,93,44,0.45)] disabled:opacity-60"
        >
          {loading ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            "Créer mon entreprise"
          )}
        </button>

        <p className="border-t border-black/[0.05] pt-5 text-center">
          <Link
            href={ROUTES.login}
            className="text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
          >
            Déjà un compte ? Se connecter
          </Link>
        </p>
      </form>
      </AuthCard>
    </AuthPageShell>
  );
}
