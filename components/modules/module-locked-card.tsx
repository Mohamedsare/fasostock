"use client";

import { MdLockOutline } from "react-icons/md";
import { FsPage, FsScreenHeader } from "@/components/ui/fs-screen-primitives";

/**
 * Carte plein écran affichée quand un module plateforme (Comptabilité, R. Humaine…)
 * est désactivé pour l'entreprise ou que l'utilisateur n'a pas le droit d'y accéder.
 * Alignée sur l'écran « Module indisponible / Accès réservé » du module Magasin.
 */
export function ModuleLockedCard({
  title,
  heading,
  message,
}: {
  title: string;
  heading: string;
  message: string;
}) {
  return (
    <FsPage>
      <FsScreenHeader title={title} />
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <MdLockOutline className="h-14 w-14 text-neutral-400" aria-hidden />
        <p className="mt-4 text-base font-bold text-fs-text">{heading}</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-600">{message}</p>
      </div>
    </FsPage>
  );
}
