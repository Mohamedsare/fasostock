"use client";

import { cn } from "@/lib/utils/cn";

/** Dégradés d'avatar — couleur stable pour un même `seed` (identifiant utilisateur). */
const AVATAR_COLORS = [
  "from-orange-500 to-red-500",
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-cyan-600",
  "from-rose-500 to-pink-600",
  "from-lime-500 to-green-600",
] as const;

export function fsAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function fsAvatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * Pastille d'initiales (vendeur, employé). Purement décorative : le nom lisible
 * doit toujours être affiché à côté, d'où l'`aria-hidden`.
 */
export function FsInitialsAvatar({
  name,
  seed,
  className,
}: {
  name: string;
  /** Identifiant stable — garantit la même couleur d'un écran à l'autre. */
  seed: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br font-extrabold text-white shadow-sm",
        fsAvatarGradient(seed),
        className ?? "h-10 w-10 text-xs",
      )}
      aria-hidden
    >
      {fsAvatarInitials(name)}
    </span>
  );
}
