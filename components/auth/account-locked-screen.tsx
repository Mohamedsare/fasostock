"use client";

import { AuthCard, AuthPageShell } from "@/components/auth/auth-page-shell";
import {
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_E164,
} from "@/lib/auth/constants";
import { Lock } from "lucide-react";
import Image from "next/image";

type AccountLockedScreenProps = {
  lockedEmail: string;
  onBackToLogin: () => void;
};

export function AccountLockedScreen({
  lockedEmail,
  onBackToLogin,
}: AccountLockedScreenProps) {
  const waUrl = `https://wa.me/${SUPPORT_PHONE_E164}`;
  const telUrl = `tel:${SUPPORT_PHONE_DISPLAY.replace(/\s/g, "")}`;

  return (
    <AuthPageShell
      title="Compte temporairement bloqué"
      subtitle="Après 5 tentatives incorrectes, l’accès est verrouillé pour votre sécurité. Le super administrateur peut débloquer votre compte."
    >
      <AuthCard>
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100">
            <Lock
              className="h-9 w-9 text-red-600"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
        </div>
        {lockedEmail ? (
          <p className="mt-4 text-center text-sm font-semibold text-fs-accent">
            {lockedEmail}
          </p>
        ) : null}
        <p className="mt-4 text-center text-sm leading-relaxed text-neutral-600 sm:text-[15px]">
          Contactez le support pour être débloqué :
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="fs-touch-target flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-opacity active:opacity-90"
            style={{ borderColor: "#25D366", color: "#25D366" }}
          >
            <Image
              src="/whatsapp.svg"
              alt=""
              width={22}
              height={22}
              className="shrink-0"
            />
            WhatsApp : {SUPPORT_PHONE_DISPLAY}
          </a>
          <a
            href={telUrl}
            className="fs-touch-target flex items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white/80 px-4 py-3 text-sm font-semibold text-fs-accent shadow-sm"
          >
            Appeler {SUPPORT_PHONE_DISPLAY}
          </a>
        </div>
        <button
          type="button"
          onClick={onBackToLogin}
          className="mt-6 w-full rounded-xl py-3 text-center text-sm font-semibold text-fs-accent underline-offset-4 hover:underline"
        >
          Retour à la connexion
        </button>
      </AuthCard>
    </AuthPageShell>
  );
}
