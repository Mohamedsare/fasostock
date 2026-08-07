"use client";

import type { ReactNode } from "react";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";

/**
 * Angles de la page « Prix de revient ».
 *
 * Parti pris local : des cadres plus nets que dans le reste de l'application. La page
 * est faite de tableaux de chiffres imbriqués (lignes, encadrés de totaux, exemples du
 * guide) ; des angles très arrondis y font baver les alignements et donnent une allure
 * molle à ce qui doit se lire comme une facture.
 *
 * Regroupé ici pour qu'un seul endroit décide : le reste de l'app garde `FsCard` et
 * `fsInputClass` tels quels.
 */
const LC_RADIUS = "rounded-md sm:rounded-md";

/** `FsCard` aux angles réduits. Le `className` de l'appelant reste prioritaire. */
export function LcCard({
  children,
  className,
  padding,
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <FsCard className={cn(LC_RADIUS, className)} padding={padding}>
      {children}
    </FsCard>
  );
}

/** Champ de saisie aux angles réduits (mêmes couleurs et états que `fsInputClass`). */
export function lcInputClass(extra?: string): string {
  return fsInputClass(cn("rounded-md", extra));
}
