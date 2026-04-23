"use client";

import { authSimpleFieldClass } from "@/components/auth/auth-page-shell";
import { authErrorToMessage } from "@/lib/auth/auth-errors";
import { registerCompany } from "@/lib/auth/register-company";
import { slugFromName } from "@/lib/auth/slug";
import { ROUTES } from "@/lib/config/routes";
import { reportHandledClientError } from "@/lib/monitoring/remote-error-logger";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  getBusinessTypeBySlug,
  getFirstStoreNamePlaceholder,
  isValidBusinessTypeSlug,
} from "@/lib/config/business-types";

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessTypeSlug = searchParams.get("businessType");
  const businessType = getBusinessTypeBySlug(businessTypeSlug);
  const firstStorePlaceholder = getFirstStoreNamePlaceholder(businessType);
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

  /** Slug dérivé du nom d’entreprise si renseigné, sinon du nom de la boutique. */
  useEffect(() => {
    const name = companyName.trim() || firstStoreName.trim();
    if (!name) return;
    const s = slugFromName(name);
    if (s && s !== companySlug) setCompanySlug(s);
  }, [companyName, firstStoreName, companySlug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const storeName = firstStoreName.trim();
    const companyRaw = companyName.trim();
    const effectiveCompanyName = companyRaw || storeName;
    if (effectiveCompanyName.length < 2) {
      setError(
        "Indiquez au moins le nom de l’entreprise ou le nom de votre boutique (2 caractères minimum).",
      );
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const effectiveSlug =
        companySlug.trim() || slugFromName(effectiveCompanyName);
      const btSlug = isValidBusinessTypeSlug(businessTypeSlug)
        ? businessTypeSlug!.trim()
        : null;
      await registerCompany(supabase, {
        companyName: effectiveCompanyName,
        companySlug: effectiveSlug,
        ownerEmail: ownerEmail.trim(),
        ownerPassword,
        ownerFullName: ownerFullName.trim(),
        firstStoreName: storeName,
        firstStorePhone: firstStorePhone.trim(),
        businessTypeSlug: btSlug,
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
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:p-6">
        <div className="mb-3 flex flex-col items-center gap-2 text-center sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-5">
          <Link
            href={ROUTES.login}
            className="text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
          >
            ← Retour à la connexion
          </Link>
          <Link
            href={ROUTES.registerSelectActivity}
            className="text-xs font-semibold text-neutral-500 underline-offset-4 hover:text-fs-accent hover:underline"
          >
            Changer le type d&apos;activité
          </Link>
        </div>

        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo2.png"
            alt=""
            width={120}
            height={120}
            className="h-20 w-20 object-contain sm:h-24 sm:w-24"
            priority
          />
          <p className="mt-2 text-[2rem] font-extrabold leading-none tracking-tight sm:text-[2.2rem]">
            <span className="text-[#111827]">Faso</span>
            <span className="text-[#f97316]">Stock</span>
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.65rem]">
            Créer une entreprise
          </h1>
          <p className="mt-1 text-sm text-neutral-600 sm:text-[15px]">
            Entreprise, compte propriétaire et première boutique.
          </p>
          {businessType ? (
            <div
              className="mt-3 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-fs-accent/25 bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)] px-3 py-2 text-center text-sm text-neutral-800 dark:text-neutral-100"
              role="status"
            >
              <span className="font-medium text-neutral-600 dark:text-neutral-400">Activité :</span>
              <span className="font-semibold text-fs-text">{businessType.label}</span>
            </div>
          ) : null}
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
              Nom de l&apos;entreprise (optionnel)
            </label>
            <input
              id="reg-company"
              className={authSimpleFieldClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoCapitalize="words"
              placeholder="Nom de l'entreprise (optionnel)"
              aria-describedby="reg-company-hint"
            />
            <p id="reg-company-hint" className="mt-1.5 text-left text-[11px] leading-snug text-neutral-500">
              Si vous l&apos;omettez, le nom de votre boutique ci-dessous sera utilisé comme nom d&apos;entreprise.
            </p>
          </div>

          {/* Slug entreprise : généré en arrière-plan (non affiché), toujours synchronisé avec le nom. */}
          <input
            id="reg-company-slug"
            name="companySlug"
            type="hidden"
            value={companySlug}
            readOnly
            tabIndex={-1}
            aria-hidden
          />

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
              placeholder={firstStorePlaceholder}
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
