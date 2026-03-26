"use client";

import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/lib/config/navigation";
import { signOutAndRedirect } from "@/lib/auth/sign-out-client";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type MoreSheetProps = {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
};

export function MoreSheet({ open, onClose, items }: MoreSheetProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function logout() {
    setLoggingOut(true);
    try {
      onClose();
      await signOutAndRedirect(router, { queryClient });
    } finally {
      setLoggingOut(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 max-h-[85dvh] w-full overflow-hidden rounded-t-2xl bg-neutral-800 text-white shadow-2xl sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-sheet-title"
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-9 rounded-full bg-white/30" aria-hidden />
        </div>
        <h2 id="more-sheet-title" className="sr-only">
          Autres sections
        </h2>
        <div className="max-h-[min(70dvh,520px)] overflow-y-auto px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className="flex min-h-0 flex-col items-center gap-1.5 rounded-lg bg-white/10 px-1.5 py-2.5 text-center text-xs font-semibold transition-colors hover:bg-white/20 sm:gap-2 sm:rounded-xl sm:px-2 sm:py-4 sm:text-sm"
                  >
                    <Icon
                      className="h-6 w-6 shrink-0 sm:h-8 sm:w-8"
                      strokeWidth={1.75}
                    />
                    <span className="line-clamp-2 leading-snug sm:leading-tight">
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border-t border-white/10 p-3 sm:p-4">
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60 sm:py-3.5"
          >
            <LogOut className="h-5 w-5" />
            {loggingOut ? "Déconnexion…" : "Déconnexion"}
          </button>
        </div>
      </div>
    </div>
  );
}
