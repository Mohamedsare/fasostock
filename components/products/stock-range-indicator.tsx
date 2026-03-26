"use client";

import { cn } from "@/lib/utils/cn";

/** Aligné sur `StockRangeIndicator` (Flutter) — barre colorée selon le seuil. */
export function StockRangeIndicator({
  quantity,
  alertThreshold,
  className,
}: {
  quantity: number;
  alertThreshold: number;
  /** Ex. contrainte largeur sur petits écrans (liste stock caissier). */
  className?: string;
}) {
  const t = alertThreshold <= 0 ? 5 : alertThreshold;
  const q = Math.max(0, quantity);
  const variant = variantFor(q, t);
  const color =
    variant === "danger"
      ? "bg-red-600"
      : variant === "warning"
        ? "bg-amber-500"
        : variant === "success"
          ? "bg-green-600"
          : "bg-neutral-400";
  const bgTint =
    variant === "danger"
      ? "bg-red-600/20"
      : variant === "warning"
        ? "bg-amber-500/20"
        : variant === "success"
          ? "bg-green-600/20"
          : "bg-neutral-400/20";

  const max = Math.max(q, 2 * t, 10);
  const percent = max > 0 ? Math.min(1, q / max) : 0;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-neutral-800">
        {quantity}
      </span>
      <div
        className={cn("h-2 w-[100px] max-w-full overflow-hidden rounded", bgTint)}
        role="presentation"
      >
        <div
          className={cn("h-full rounded transition-[width]", color)}
          style={{ width: `${percent * 100}%` }}
        />
      </div>
    </div>
  );
}

function variantFor(qty: number, threshold: number): string {
  const t = threshold <= 0 ? 5 : threshold;
  if (qty <= 0) return "danger";
  if (qty <= t) return "warning";
  if (qty <= 2 * t) return "default";
  return "success";
}
