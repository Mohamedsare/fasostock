"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdDarkMode, MdLightMode, MdMenu, MdPhone } from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa6";
import { persistAndApplyFsTheme } from "@/lib/theme/fs-theme";

type SiteHeaderProps = {
  sectionHrefPrefix?: string;
};

export function SiteHeader({ sectionHrefPrefix = "" }: SiteHeaderProps) {
  const section = (id: string) => `${sectionHrefPrefix}#${id}`;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const close = useCallback(() => setMobileOpen(false), []);
  const toggleTheme = useCallback(() => {
    persistAndApplyFsTheme(isDark ? "light" : "dark");
  }, [isDark]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const syncThemeState = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    syncThemeState();
    window.addEventListener("fs-theme-change", syncThemeState);
    return () => {
      window.removeEventListener("fs-theme-change", syncThemeState);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen, close]);

  const drawer = (
    <div
      id="mobile-nav-drawer"
      style={{ zIndex: 2147483647 }}
      className={`fixed inset-0 sm:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!mobileOpen}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "opacity-0"}`}
        aria-label="Fermer le menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={close}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-[min(92vw,320px)] flex-col border-l border-black/10 bg-white shadow-[0_0_40px_rgba(17,24,39,0.12)] transition-transform duration-200 ease-out ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/8 px-4 py-3">
          <span className="text-sm font-extrabold text-neutral-900">Menu</span>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-neutral-800"
            onClick={close}
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3" onClick={close}>
          <button
            type="button"
            className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 bg-white text-neutral-800 hover:bg-black/5"
            onClick={toggleTheme}
            aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
            title={isDark ? "Mode clair" : "Mode sombre"}
          >
            {isDark ? <MdLightMode className="h-5 w-5 text-amber-500" /> : <MdDarkMode className="h-5 w-5 text-fs-accent" />}
          </button>
          <Link href={section("fonctionnalites-principales")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
            Fonctionnalités
          </Link>
          <Link href={section("tarifs")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
            Tarifs
          </Link>
          <Link href={section("temoignages")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
            Témoignages
          </Link>
          <Link href={section("faq")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
            FAQ
          </Link>
          <Link
            href="/login"
            className="mt-2 rounded-xl border border-fs-accent/45 bg-fs-accent/8 px-3 py-2.5 text-sm font-extrabold text-fs-accent shadow-[0_10px_24px_-18px_rgba(232,93,44,0.85)]"
          >
            Se connecter
          </Link>
          <Link href="/register/select-activity" className="rounded-xl bg-fs-accent px-3 py-2.5 text-sm font-bold text-white">
            Essai gratuit
          </Link>
          <a
            href="tel:+22603079618"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-black/5"
            aria-label="Appeler FasoStock au +226 03 07 96 18"
            title="Appeler +226 03 07 96 18"
          >
            <MdPhone className="h-4 w-4 text-fs-accent" />
            +226 03 07 96 18
          </a>
          <a
            href={`https://wa.me/22603079618?text=${encodeURIComponent(
              "Bonjour FasoStock, je souhaite avoir plus d'informations sur votre solution.",
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-black/5"
            aria-label="Contacter FasoStock sur WhatsApp"
            title="WhatsApp"
          >
            <FaWhatsapp className="h-4 w-4 text-[#25D366]" />
            WhatsApp
          </a>
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/8 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/fs.png" alt="FasoStock" width={40} height={40} className="h-10 w-10 object-contain" priority />
            <span className="text-lg font-extrabold tracking-tight sm:text-[1.15rem]">
              <span className="text-neutral-900">Faso</span>
              <span className="text-[#f97316]">Stock</span>
            </span>
          </Link>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-800 sm:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <MdClose className="h-5 w-5" aria-hidden /> : <MdMenu className="h-5 w-5" aria-hidden />}
            <span className="sr-only">{mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}</span>
          </button>

          <nav className="hidden items-center gap-5 lg:flex">
            <Link href={section("fonctionnalites-principales")} className="inline-flex items-center text-[13px] font-semibold text-neutral-800 hover:text-fs-accent">
              Fonctionnalités
            </Link>
            <Link href={section("tarifs")} className="text-[13px] font-semibold text-neutral-800 hover:text-fs-accent">
              Tarifs
            </Link>
            <Link href={section("temoignages")} className="text-[13px] font-semibold text-neutral-800 hover:text-fs-accent">
              Témoignages
            </Link>
            <Link href={section("faq")} className="text-[13px] font-semibold text-neutral-800 hover:text-fs-accent">
              FAQ
            </Link>
          </nav>

          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-white text-neutral-800 hover:bg-black/5"
              aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
              title={isDark ? "Mode clair" : "Mode sombre"}
            >
              {isDark ? <MdLightMode className="h-4.5 w-4.5 text-amber-500" /> : <MdDarkMode className="h-4.5 w-4.5 text-fs-accent" />}
            </button>
            <a
              href="tel:+22603079618"
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-[13px] font-bold text-neutral-800 hover:bg-black/5"
              aria-label="Appeler FasoStock au +226 03 07 96 18"
              title="Appeler +226 03 07 96 18"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fs-accent/12 text-fs-accent">
                <MdPhone className="h-3.5 w-3.5" />
              </span>
              +226 03 07 96 18
            </a>
            <Link
              href="/login"
              className="rounded-xl border border-fs-accent/55 bg-white px-3 py-1.5 text-[13px] font-semibold text-fs-accent"
            >
              Se connecter
            </Link>
            <Link
              href="/register/select-activity"
              className="inline-flex items-center gap-1 rounded-xl bg-fs-accent px-3 py-1.5 text-[13px] font-bold text-white shadow-[0_10px_24px_-14px_rgba(232,93,44,0.95)]"
            >
              ☰ Essayer gratuitement
            </Link>
          </div>
        </div>
      </header>

      {mounted ? createPortal(drawer, document.body) : null}
    </>
  );
}
