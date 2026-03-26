"use client";

import { signOutAndRedirect } from "@/lib/auth/sign-out-client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export function LogOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await signOutAndRedirect(router, { queryClient });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={loading}
      className={cn(
        "fs-touch-target rounded-xl border border-black/[0.1] bg-fs-card px-5 py-3 text-sm font-semibold text-neutral-800 shadow-sm",
        className,
      )}
    >
      {loading ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
