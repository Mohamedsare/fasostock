import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#f6f3ee] text-fs-text">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-25%,rgba(232,93,44,0.16),transparent_52%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-20 h-[420px] w-[420px] rounded-full bg-fs-accent/[0.09] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-32 bottom-0 h-[320px] w-[320px] rounded-full bg-amber-200/25 blur-3xl"
        aria-hidden
      />
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center py-10 sm:py-14">
        {children}
      </div>
    </div>
  );
}
