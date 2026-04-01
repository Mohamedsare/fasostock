"use client";

import { subscribeToToasts } from "@/lib/toast";
import type { ToastPayload } from "@/lib/toast/types";
import { Z } from "@/lib/config/z-index";
import { cn } from "@/lib/utils/cn";
import { getStoredFsThemePref } from "@/lib/theme/fs-theme";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdCheckCircle, MdError, MdInfo } from "react-icons/md";

/** Couleurs alignées sur `app_toast.dart` (Flutter). */
const COLORS = {
  light: {
    success: "#166534",
    error: "#B91C1C",
    info: "#1E40AF",
  },
  dark: {
    success: "#15803D",
    error: "#DC2626",
    info: "#2563EB",
  },
} as const;

const DEFAULT_MS = 3200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<ToastPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const [dark, setDark] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const read = () => {
      const pref = getStoredFsThemePref();
      if (pref === "dark") setDark(true);
      else if (pref === "light") setDark(false);
      else setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => {
      if (getStoredFsThemePref() === "system") read();
    };
    mq.addEventListener("change", onMq);
    const onTheme = () => read();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "fs_theme_mode") return;
      read();
    };
    window.addEventListener("fs-theme-change", onTheme);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("fs-theme-change", onTheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    return subscribeToToasts((payload) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setActive(payload);
      setVisible(true);
      const d = payload.duration ?? DEFAULT_MS;
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        exitTimer.current = setTimeout(() => setActive(null), 220);
      }, d);
    });
  }, []);

  const palette = dark ? COLORS.dark : COLORS.light;
  const bg =
    active?.type === "success"
      ? palette.success
      : active?.type === "error"
        ? palette.error
        : palette.info;

  const Icon =
    active?.type === "success"
      ? MdCheckCircle
      : active?.type === "error"
        ? MdError
        : MdInfo;

  const live =
    active?.type === "error" ? ("assertive" as const) : ("polite" as const);

  const toastLayer =
    active && mounted ? (
      <div
        className="pointer-events-none fixed inset-x-0 flex justify-center px-4 max-md:bottom-[calc(5rem+var(--fs-safe-bottom))] md:bottom-8"
        style={{ zIndex: Z.toast }}
        aria-live={live}
        role={active.type === "error" ? "alert" : "status"}
      >
        <div
          className={cn(
            "pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-xl px-4 py-3.5 text-white shadow-2xl transition-[opacity,transform] duration-200 ease-out",
            visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
          style={{ backgroundColor: bg }}
        >
          <Icon className="mt-0.5 h-[22px] w-[22px] shrink-0" aria-hidden />
          <p className="line-clamp-3 min-w-0 flex-1 text-sm font-medium leading-snug">
            {active.message}
          </p>
        </div>
      </div>
    ) : null;

  return (
    <>
      {children}
      {toastLayer && typeof document !== "undefined"
        ? createPortal(toastLayer, document.body)
        : null}
    </>
  );
}
