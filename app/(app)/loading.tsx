import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";

/** Transition rapide entre pages — pas le splash d'arrivée. */
export default function AppLoading() {
  return <AppShellSkeleton />;
}
