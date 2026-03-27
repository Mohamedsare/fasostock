"use client";

import { authSimpleFieldClass } from "@/components/auth/auth-page-shell";
import { authErrorToMessage } from "@/lib/auth/auth-errors";
import { registerCompany } from "@/lib/auth/register-company";
import { slugFromName } from "@/lib/auth/slug";
import { ROUTES } from "@/lib/config/routes";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { AlertCircle } from "lucide-react";
import Image from "next/image";
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

  const hasEnv =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0;

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
    <div className="w-full">
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:p-6">
        <div className="mb-3 text-center">
          <Link
            href={ROUTES.login}
            className="text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
          >
            ← Retour à la connexion
          </Link>
        </div>

        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo1.png"
            alt=""
            width={72}
            height={72}
            className="h-14 w-14 object-contain sm:h-16 sm:w-16"
            priority
          />
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.65rem]">
            Créer une entreprise
          </h1>
          <p className="mt-1 text-sm text-neutral-600 sm:text-[15px]">
            Entreprise, compte propriétaire et première boutique.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2.5">
          {!hasEnv ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              Config Supabase manquante. Ajoutez{" "}
              <code className="rounded bg-white/80 px-1">.env.local</code> puis
              redémarrez le serveur.
            </div>
          ) : null}

          {error ? (
            <div
              className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-950"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <p>{error}</p>
            </div>
          ) : null}

          <div>
            <label htmlFor="reg-company" className="sr-only">
              Nom de l&apos;entreprise
            </label>
            <input
              id="reg-company"
              className={authSimpleFieldClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              minLength={2}
              autoCapitalize="words"
              placeholder={"Nom de l'entreprise *"}
            />
          </div>

          <div>
            <p className="mb-1 text-left text-xs text-neutral-500">
              Slug URL (auto)
            </p>
            <input
              className={cn(
                authSimpleFieldClass,
                "cursor-default bg-neutral-200/70 text-neutral-700",
              )}
              value={companySlug}
              readOnly
              tabIndex={-1}
              aria-readonly
              title="Généré automatiquement à partir du nom"
            />
          </div>

          <div>
            <label htmlFor="reg-phone" className="sr-only">
              Téléphone
            </label>
            <input
              id="reg-phone"
              className={authSimpleFieldClass}
              type="tel"
              value={firstStorePhone}
              onChange={(e) => setFirstStorePhone(e.target.value)}
              required
              minLength={8}
              autoComplete="tel"
              placeholder="Téléphone *"
            />
          </div>

          <div>
            <label htmlFor="reg-name" className="sr-only">
              Nom complet
            </label>
            <input
              id="reg-name"
              className={authSimpleFieldClass}
              value={ownerFullName}
              onChange={(e) => setOwnerFullName(e.target.value)}
              required
              minLength={2}
              autoCapitalize="words"
              placeholder="Votre nom complet *"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="sr-only">
              Email
            </label>
            <input
              id="reg-email"
              className={authSimpleFieldClass}
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="Email *"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="sr-only">
              Mot de passe
            </label>
            <input
              id="reg-password"
              className={authSimpleFieldClass}
              type="password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mot de passe * (min. 8 caractères)"
            />
          </div>

          <div>
            <label htmlFor="reg-store" className="sr-only">
              Première boutique
            </label>
            <input
              id="reg-store"
              className={authSimpleFieldClass}
              value={firstStoreName}
              onChange={(e) => setFirstStoreName(e.target.value)}
              required
              minLength={2}
              autoCapitalize="words"
              placeholder="Nom de la première boutique *"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="fs-touch-target mt-1 flex w-full items-center justify-center rounded-lg bg-fs-accent py-3 text-base font-semibold text-white transition-opacity hover:opacity-[0.96] disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Créer mon entreprise"
            )}
          </button>
        </form>

        <div className="mt-4 text-center text-sm font-semibold text-fs-accent">
          <Link
            href={ROUTES.login}
            className="text-fs-accent underline-offset-4 hover:underline"
          >
            Déjà un compte ? Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}
