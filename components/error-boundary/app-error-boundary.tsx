"use client";

import { captureWebAppError } from "@/lib/monitoring/remote-error-logger";
import { ROUTES } from "@/lib/config/routes";
import Link from "next/link";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = { hasError: boolean };

/**
 * Filet de sécurité React : erreurs de rendu / lifecycle côté client → super-admin.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack =
      error.stack != null
        ? `${error.stack}\n--- componentStack ---\n${info.componentStack}`
        : info.componentStack;
    void captureWebAppError(error, {
      source: "react-error-boundary",
      stack,
      extra: { digest: (error as Error & { digest?: string }).digest },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fs-surface px-6 text-center">
          <p className="max-w-md text-sm font-medium text-fs-text">
            Une erreur d’affichage s’est produite. Vous pouvez recharger la page ou retourner au tableau de
            bord.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="rounded-xl bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white"
              onClick={() => this.setState({ hasError: false })}
            >
              Réessayer
            </button>
            <Link
              href={ROUTES.dashboard}
              className="rounded-xl border border-black/12 px-5 py-2.5 text-sm font-semibold text-fs-text"
            >
              Tableau de bord
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
