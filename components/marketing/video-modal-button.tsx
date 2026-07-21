"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdOutlinePlayCircleFilled } from "react-icons/md";

/** Vidéo de présentation FasoStock (YouTube). */
const YOUTUBE_ID = "uaMG_kec9LI";

/**
 * Bouton « Voir en vidéo » qui ouvre une modale élégante avec un lecteur
 * YouTube intégré — sans quitter le site. Fermeture par Échap, clic sur le
 * fond, ou bouton de fermeture. Rendu via portail sur `document.body`.
 */
export function VideoModalButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setShow(false);
    window.setTimeout(() => setOpen(false), 200);
  }, []);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShow(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vidéo de présentation FasoStock"
      className={`fixed inset-0 z-[2147483647] flex items-center justify-center p-4 transition-opacity duration-200 sm:p-6 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Fond cliquable */}
      <button
        type="button"
        aria-label="Fermer la vidéo"
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-md"
      />

      {/* Contenu */}
      <div
        className={`relative z-10 w-full max-w-2xl transition-all duration-200 ease-out ${
          show ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-wide text-white/95">
            <MdOutlinePlayCircleFilled className="h-5 w-5 text-fs-accent" aria-hidden />
            FasoStock en vidéo
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 active:scale-95"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_50px_120px_-24px_rgba(0,0,0,0.85)] ring-1 ring-fs-accent/20">
          <div className="relative aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title="Vidéo de présentation FasoStock"
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-white/60">
          Appuyez sur <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-semibold text-white/80">Échap</kbd> ou
          cliquez en dehors pour fermer
        </p>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <MdOutlinePlayCircleFilled className="h-4 w-4 text-neutral-500 sm:h-5 sm:w-5" aria-hidden />
        Voir en vidéo
      </button>
      {open && mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
