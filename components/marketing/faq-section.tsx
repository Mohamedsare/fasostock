"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import {
  MdAutorenew,
  MdChevronRight,
  MdChevronLeft,
  MdChat,
  MdHeadsetMic,
  MdShield,
  MdTag,
  MdWifi,
  MdWhatsapp,
} from "react-icons/md";

type FaqItem = {
  id: number;
  q: string;
  a: string;
};

const FAQS: FaqItem[] = [
  {
    id: 1,
    q: "FasoStock fonctionne-t-il sans internet ?",
    a: "Oui. FasoStock utilise un système offline + synchronisation. Vous pouvez continuer certaines opérations même avec une connexion instable, puis les données se synchronisent lorsque la connexion revient.",
  },
  { id: 2, q: "Est-ce que je peux gérer plusieurs boutiques ?", a: "Oui, vous pouvez gérer plusieurs boutiques depuis un seul compte." },
  { id: 3, q: "Est-ce que mes employés peuvent avoir leurs propres accès ?", a: "Oui, avec des rôles et permissions par utilisateur." },
  { id: 4, q: "Est-ce que je peux imprimer des tickets ou factures ?", a: "Oui, impression ticket et facture selon votre configuration." },
  { id: 5, q: "Est-ce que mes données sont sécurisées ?", a: "Oui, les données sont protégées avec des contrôles d'accès et des sauvegardes." },
  { id: 6, q: "Combien coûte FasoStock ?", a: "Vous pouvez commencer avec l'essai gratuit puis choisir le plan adapté." },
  { id: 7, q: "Puis-je le tester avant de payer ?", a: "Oui, une période d'essai est disponible." },
  { id: 8, q: "Est-ce adapté aux petits commerces ?", a: "Oui, FasoStock est conçu pour les petites, moyennes et grandes structures." },
  { id: 9, q: "Sur quels appareils puis-je utiliser FasoStock ?", a: "Sur mobile, tablette et ordinateur via navigateur." },
  { id: 10, q: "Que se passe-t-il si mon appareil est endommagé ou que je le change ?", a: "Vos données restent liées à votre compte et sont récupérables après reconnexion." },
];

export function FaqSection() {
  const [openId, setOpenId] = useState<number>(1);
  const left = useMemo(() => FAQS.slice(0, 4), []);
  const right = useMemo(() => FAQS.slice(4), []);

  const renderItem = (item: FaqItem) => {
    const open = item.id === openId;
    return (
      <article key={item.id} className="rounded-md border border-black/10 bg-white shadow-[0_10px_24px_-20px_rgba(15,23,42,0.45)]">
        <button
          type="button"
          onClick={() => setOpenId(open ? 0 : item.id)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#fff5ef] text-xs font-black text-fs-accent">
              {String(item.id).padStart(2, "0")}
            </span>
            <span className="text-base font-black leading-tight text-[#1f2937]">{item.q}</span>
          </div>
          {open ? <MdChevronLeft className="h-5 w-5 rotate-90 text-fs-accent" /> : <MdChevronRight className="h-5 w-5 rotate-90 text-neutral-500" />}
        </button>

        {open ? (
          <div className="border-t border-black/8 px-4 pb-4 pt-3">
            <p className="text-sm leading-relaxed text-neutral-700">{item.a}</p>
            {item.id === 1 ? (
              <div className="mt-3 rounded-md border border-[#f7d8c7] bg-[#fff7f1] px-3 py-2">
                <p className="text-sm font-bold text-[#b45309]">
                  Vous vendez, encaissez et gérez votre stock même sans internet.
                </p>
                <p className="text-sm text-neutral-700">Aucune vente ne sera perdue.</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-12">
      <div className="rounded-md border border-black/8 bg-[#fbfbfb] px-4 py-6 sm:px-8 sm:py-8">
        <div className="text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent">
            <MdChat className="h-4 w-4" />
            FAQ
          </p>
          <h3 className="mx-auto mt-3 max-w-4xl text-[2rem] font-black leading-[1.05] tracking-tight text-[#17253a] sm:text-[3.1rem]">
            Questions <span className="text-fs-accent">fréquentes</span>
          </h3>
          <p className="mx-auto mt-2 max-w-3xl text-sm text-neutral-600 sm:text-[1.05rem]">
            Tout ce que vous devez savoir sur FasoStock. Si vous ne trouvez pas votre réponse, contactez-nous sur WhatsApp.
          </p>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <div data-fs-stagger className="space-y-2.5">{left.map(renderItem)}</div>
          <div data-fs-stagger className="space-y-2.5">{right.map(renderItem)}</div>
        </div>

        <div className="mt-4 rounded-md border border-fs-accent/25 bg-[#fff7f1] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fs-accent text-white">
                <MdChat className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-black leading-tight text-[#202938]">Vous avez d&apos;autres questions ?</p>
                <p className="text-sm text-neutral-700">Notre équipe est disponible pour vous répondre rapidement sur WhatsApp.</p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Link
                href={`https://wa.me/212771668079?text=${encodeURIComponent(
                  "Bonjour, je suis intéressé(e) par FasoStock. Pouvez-vous m'aider ?",
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-fs-accent px-5 py-2 text-sm font-black text-white"
              >
                <MdWhatsapp className="h-5 w-5" />
                Discuter sur WhatsApp
              </Link>
              <Link
                href="/register/select-activity"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-fs-accent/45 bg-white px-5 py-2 text-sm font-black text-fs-accent"
              >
                Demander une démo
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-black/8 bg-white">
          <div className="grid grid-cols-1 divide-y divide-black/8 min-[860px]:grid-cols-5 min-[860px]:divide-x min-[860px]:divide-y-0">
            {[
              { icon: MdWifi, title: "Fonctionne hors ligne", text: "Continuez à vendre même sans connexion." },
              { icon: MdShield, title: "Données sécurisées", text: "Vos données sont protégées et sauvegardées." },
              { icon: MdAutorenew, title: "Synchronisation automatique", text: "Vos données se synchronisent dès que la connexion revient." },
              { icon: MdHeadsetMic, title: "Support réactif", text: "Notre équipe vous accompagne à chaque étape." },
              { icon: MdTag, title: "Prix accessibles", text: "Des abonnements adaptés à tous les commerces." },
            ].map((x) => (
              <div key={x.title} className="px-4 py-3">
                <p className={cn("flex items-center gap-2 text-sm font-bold text-[#202938]")}>
                  <x.icon className="h-5 w-5 text-fs-accent" /> {x.title}
                </p>
                <p className="text-xs text-neutral-600">{x.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
