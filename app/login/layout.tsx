import { AuthRouteShell } from "@/components/auth/auth-route-shell";
import type { ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <AuthRouteShell>{children}</AuthRouteShell>;
}
