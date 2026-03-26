"use client";

import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { WifiOff } from "lucide-react";

export function OfflineStrip() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      className="flex items-center justify-center gap-2 bg-neutral-800 px-3 py-2 text-center text-xs font-medium text-white sm:text-sm"
      role="status"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      Hors ligne — vos actions sont mises en file et envoyées à la reconnexion.
    </div>
  );
}
