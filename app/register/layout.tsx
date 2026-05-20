import { AuthRouteShell } from "@/components/auth/auth-route-shell";
import type { ReactNode } from "react";

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <AuthRouteShell>{children}</AuthRouteShell>;
}
