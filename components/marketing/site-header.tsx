"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdMenu, MdPhone } from "react-icons/md";

type SiteHeaderProps = {
  sectionHrefPrefix?: string;
};

export function SiteHeader({ sectionHrefPrefix = "" }: SiteHeaderProps) {
  const section = (id: string) => `${sectionHrefPrefix}#${id}`;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const close = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    setMounted(true);
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
          <Link href="/help" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-black/5">
            Parler au support
          </Link>
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/8 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/fs.png" alt="FasoStock" width={44} height={44} className="h-11 w-11 object-contain" priority />
            <span className="text-xl font-extrabold tracking-tight">
              <span className="text-neutral-900">Faso</span>
              <span className="text-[#f97316]">Stock</span>
            </span>
          </Link>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-800 sm:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <MdClose className="h-5 w-5" aria-hidden /> : <MdMenu className="h-5 w-5" aria-hidden />}
            <span className="sr-only">{mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}</span>
          </button>

          <nav className="hidden items-center gap-6 lg:flex">
            <Link href={section("fonctionnalites-principales")} className="inline-flex items-center text-sm font-semibold text-neutral-800 hover:text-fs-accent">
              Fonctionnalités
            </Link>
            <Link href={section("tarifs")} className="text-sm font-semibold text-neutral-800 hover:text-fs-accent">
              Tarifs
            </Link>
            <Link href={section("temoignages")} className="text-sm font-semibold text-neutral-800 hover:text-fs-accent">
              Témoignages
            </Link>
            <Link href={section("faq")} className="text-sm font-semibold text-neutral-800 hover:text-fs-accent">
              FAQ
            </Link>
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-bold text-neutral-800">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fs-accent/12 text-fs-accent">
                <MdPhone className="h-4 w-4" />
              </span>
              +226 03 07 96 18
            </span>
            <Link
              href="/login"
              className="rounded-xl border border-fs-accent/55 bg-white px-3.5 py-2 text-sm font-semibold text-fs-accent"
            >
              Se connecter
            </Link>
            <Link
              href="/register/select-activity"
              className="inline-flex items-center gap-1 rounded-xl bg-fs-accent px-3.5 py-2 text-sm font-bold text-white shadow-[0_10px_24px_-14px_rgba(232,93,44,0.95)]"
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
