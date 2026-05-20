import { AuthRouteShell } from "@/components/auth/auth-route-shell";
import type { ReactNode } from "react";

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return <AuthRouteShell>{children}</AuthRouteShell>;
}
