"use client";

import { useState } from "react";
import Link from "next/link";
import { MdChevronRight, MdChat, MdWhatsapp } from "react-icons/md";

type FaqItem = { q: string; a: string };

export function SeoFaq({ faqs }: { faqs: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number>(0);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
      <div className="rounded-md border border-black/8 bg-[#fbfbfb] px-6 py-8 dark:border-white/8 dark:bg-[#1a1a1a] sm:px-8">
        <div className="text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent dark:bg-fs-accent/20">
            <MdChat className="h-4 w-4" aria-hidden />
            Questions fréquentes
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl text-[1.75rem] font-black leading-tight tracking-tight text-[#17253a] dark:text-[#e6e1e5] sm:text-[2.5rem]">
            Tout ce que vous devez savoir
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-neutral-600">
            Des réponses claires à vos questions. Contactez-nous sur WhatsApp pour toute autre demande.
          </p>
        </div>

        <div className="mt-6 space-y-2.5">
          {faqs.map((item, idx) => {
            const open = idx === openIdx;
            return (
              <article
                key={idx}
                className="rounded-md border border-black/10 bg-white shadow-[0_6px_20px_-16px_rgba(15,23,42,0.35)] dark:border-white/8 dark:bg-[#1c1b1f]"
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? -1 : idx)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                  aria-expanded={open}
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#fff5ef] text-xs font-black text-fs-accent dark:bg-fs-accent/20">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-black leading-tight text-[#1f2937] dark:text-[#e6e1e5] sm:text-base">
                      {item.q}
                    </span>
                  </div>
                  <MdChevronRight
                    className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                    aria-hidden
                  />
                </button>
                {/*
                  La réponse reste toujours dans le DOM (masquée en CSS) : un
                  contenu retiré du DOM n'est pas indexé par Google.
                */}
                <div
                  className={`border-t border-black/8 px-4 pb-4 pt-3 dark:border-white/8 ${open ? "" : "hidden"}`}
                >
                  <p className="text-sm leading-relaxed text-neutral-600">{item.a}</p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-md border border-fs-accent/25 bg-[#fff7f1] px-4 py-3 dark:bg-fs-accent/8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-black text-[#202938] dark:text-[#e6e1e5]">Vous avez d&apos;autres questions ?</p>
            <p className="text-sm text-neutral-600">Notre équipe répond rapidement sur WhatsApp.</p>
          </div>
          <div className="flex gap-2">
            <a
              href="https://wa.me/22664712044?text=Bonjour%20FasoStock%2C%20j%27ai%20une%20question."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-fs-accent px-4 py-2 text-sm font-black text-white"
            >
              <MdWhatsapp className="h-4 w-4" aria-hidden />
              WhatsApp
            </a>
            <Link
              href="/register/select-activity"
              className="inline-flex items-center gap-2 rounded-md border border-fs-accent/45 bg-white px-4 py-2 text-sm font-black text-fs-accent dark:bg-transparent"
            >
              Essai gratuit
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
