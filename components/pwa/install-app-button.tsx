"use client";

import { useEffect, useMemo, useState } from "react";
import { MdDownload } from "react-icons/md";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallAppButtonProps = {
  className?: string;
  compact?: boolean;
};

function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  const standaloneIOS = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const standalonePwa = window.matchMedia("(display-mode: standalone)").matches;
  return standaloneIOS || standalonePwa;
}

export function InstallAppButton({ className, compact = false }: InstallAppButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setIsInstalled(isRunningStandalone());
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const helpText = useMemo(() => {
    if (typeof navigator === "undefined") return "Ouvrez le menu de votre navigateur puis choisissez Installer l’application.";
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    if (isIOS) return "Sur iPhone/iPad: bouton Partager puis Ajouter à l’écran d’accueil.";
    return "Dans le navigateur: menu (⋮) puis Installer l’application / Ajouter à l’écran d’accueil.";
  }, []);

  if (isInstalled) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setShowHelp(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
      setShowHelp(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstall()}
        className={
          className ??
          (compact
            ? "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-fs-accent/45 bg-white px-3 text-xs font-bold text-fs-accent"
            : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-fs-accent/45 bg-white px-4 py-2 text-sm font-bold text-fs-accent")
        }
      >
        <MdDownload className="h-4 w-4" />
        Installer l&apos;app
      </button>

      {showHelp ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <p className="text-base font-black text-[#1f2937]">Installer FasoStock</p>
            <p className="mt-2 text-sm text-neutral-700">{helpText}</p>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-fs-accent text-sm font-bold text-white"
            >
              Compris
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
