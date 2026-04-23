"use client";

import { BusinessTypeCard } from "@/components/auth/business-type-card";
import { BUSINESS_TYPES } from "@/lib/config/business-types";
import { ROUTES } from "@/lib/config/routes";
import { cn } from "@/lib/utils/cn";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SelectBusinessTypeScreen() {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  function onContinue() {
    if (!selectedSlug) return;
    const q = new URLSearchParams({ businessType: selectedSlug });
    router.push(`${ROUTES.register}?${q.toString()}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:p-6 dark:border-white/10 dark:bg-fs-surface-low/80">
        <div className="mb-4 text-center sm:mb-5">
          <Link
            href={ROUTES.login}
            className="inline-flex items-center gap-1 text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Retour à la connexion
          </Link>
        </div>

        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo2.png"
            alt=""
            width={80}
            height={80}
            className="h-[72px] w-[72px] object-contain sm:h-20 sm:w-20"
            priority
          />
          <h1 className="mt-3 max-w-md text-[1.45rem] font-bold leading-tight tracking-tight text-fs-text sm:text-[1.65rem]">
            Quel type de commerce gérez-vous ?
          </h1>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-400">
            Choisissez votre activité principale pour que FasoStock adapte votre espace.
          </p>
        </div>

        <div
          className={cn(
            "mt-8 grid gap-3 sm:grid-cols-2 sm:gap-3.5",
            "lg:grid-cols-2 xl:grid-cols-3",
          )}
          role="radiogroup"
          aria-label="Type d’activité"
        >
          {BUSINESS_TYPES.map((option) => (
            <BusinessTypeCard
              key={option.slug}
              option={option}
              selected={selectedSlug === option.slug}
              onSelect={() => setSelectedSlug(option.slug)}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-col items-stretch gap-3 sm:mt-10">
          <button
            type="button"
            disabled={!selectedSlug}
            onClick={onContinue}
            className={cn(
              "fs-touch-target flex w-full items-center justify-center rounded-xl bg-fs-accent py-3.5 text-base font-semibold text-white shadow-sm transition-all",
              "hover:opacity-[0.97] active:scale-[0.99]",
              "disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none dark:disabled:bg-neutral-600",
            )}
          >
            Continuer
          </button>
          <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
            Déjà un compte ?{" "}
            <Link
              href={ROUTES.login}
              className="font-semibold text-fs-accent underline-offset-4 hover:underline"
            >
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
