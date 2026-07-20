import type { ElementType } from "react";
import Link from "next/link";
import {
  MdArrowForward,
  MdCheckCircle,
  MdPhone,
  MdWhatsapp,
} from "react-icons/md";
import { SiteHeader } from "@/components/marketing/site-header";
import { SeoFaq } from "./seo-faq";

export type SeoFeature = {
  icon: ElementType;
  title: string;
  text: string;
};

export type SeoFaqItem = {
  q: string;
  a: string;
};

type Props = {
  badge: string;
  h1: string;
  heroSubtitle: string;
  features: SeoFeature[];
  benefits: string[];
  faqs: SeoFaqItem[];
  ctaTitle: string;
  ctaSubtitle: string;
  jsonLd: Record<string, unknown>;
};

const STATS = [
  { value: "500+", label: "Commerces actifs" },
  { value: "4.8/5", label: "Note moyenne" },
  { value: "0 FCFA", label: "Pour commencer" },
  { value: "24/7", label: "Accès à vos données" },
] as const;

const TRUST_BADGES = [
  "Essai gratuit",
  "Fonctionne hors ligne",
  "Mobile & PC",
  "Sans engagement",
] as const;

export function SeoLandingPage({
  badge,
  h1,
  heroSubtitle,
  features,
  benefits,
  faqs,
  ctaTitle,
  ctaSubtitle,
  jsonLd,
}: Props) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-[#f8f7f5] dark:bg-[#121212]">
        <SiteHeader sectionHrefPrefix="/" />

        {/* Hero */}
        <section className="mx-auto w-full max-w-7xl px-4 pt-10 pb-8 sm:px-6 sm:pt-16 sm:pb-12">
          <div className="rounded-md border border-black/8 bg-white px-6 py-10 shadow-[0_22px_56px_-36px_rgba(17,24,39,0.28)] dark:border-white/8 dark:bg-[#1c1b1f] sm:px-10 sm:py-14">
            <div className="text-center">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent dark:bg-fs-accent/20">
                <MdCheckCircle className="h-4 w-4" aria-hidden />
                {badge}
              </p>
              <h1 className="mx-auto mt-4 max-w-4xl text-[2rem] font-black leading-[1.05] tracking-tight text-[#17253a] dark:text-[#e6e1e5] sm:text-[3.2rem]">
                {h1}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-base">
                {heroSubtitle}
              </p>
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/register/select-activity"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-fs-accent px-6 py-3 text-sm font-black text-white shadow-[0_10px_24px_-14px_rgba(232,93,44,0.95)]"
                >
                  Essayer gratuitement
                  <MdArrowForward className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-fs-accent/45 bg-white px-6 py-3 text-sm font-bold text-fs-accent dark:bg-transparent"
                >
                  Se connecter
                </Link>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-neutral-500">
                {TRUST_BADGES.map((t) => (
                  <span key={t} className="flex items-center gap-1">
                    <MdCheckCircle className="h-3.5 w-3.5 text-green-500" aria-hidden />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-md border border-black/8 bg-white px-4 py-5 text-center shadow-sm dark:border-white/8 dark:bg-[#1c1b1f]"
              >
                <p className="text-2xl font-black text-fs-accent sm:text-3xl">{s.value}</p>
                <p className="mt-1 text-xs text-neutral-600 sm:text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
          <div className="rounded-md border border-black/8 bg-white px-6 py-8 shadow-sm dark:border-white/8 dark:bg-[#1c1b1f] sm:px-8">
            <div className="text-center">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent dark:bg-fs-accent/20">
                Fonctionnalités
              </p>
              <h2 className="mx-auto mt-3 max-w-3xl text-[1.75rem] font-black leading-tight tracking-tight text-[#17253a] dark:text-[#e6e1e5] sm:text-[2.5rem]">
                Tout ce dont vous avez besoin
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-neutral-600">
                FasoStock réunit tous les outils essentiels pour gérer votre commerce facilement.
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <article
                  key={f.title}
                  className="rounded-md border border-black/10 bg-[#fbfbfb] p-5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)] dark:border-white/8 dark:bg-[#232323]"
                >
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-fs-accent/25 bg-[#fff5ef] text-fs-accent dark:bg-fs-accent/20">
                    <f.icon className="h-6 w-6" aria-hidden />
                  </div>
                  <h3 className="mt-3 text-base font-black text-[#1f2937] dark:text-[#e6e1e5]">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
          <div className="rounded-md border border-fs-accent/20 bg-[#fff7f1] px-6 py-8 dark:bg-fs-accent/8 sm:px-8">
            <h2 className="text-[1.5rem] font-black leading-tight text-[#17253a] dark:text-[#e6e1e5] sm:text-[2rem]">
              Pourquoi choisir <span className="text-fs-accent">FasoStock</span> ?
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Une solution pensée pour les commerçants d&apos;Afrique de l&apos;Ouest, pas pour les marchés étrangers.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {benefits.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 rounded-md bg-white/70 px-4 py-3 dark:bg-white/5"
                >
                  <MdCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-500" aria-hidden />
                  <span className="text-sm leading-relaxed text-neutral-700">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <SeoFaq faqs={faqs} />

        {/* CTA */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6">
          <div className="rounded-md bg-fs-accent px-6 py-10 text-center sm:px-10 sm:py-14">
            <h2 className="text-[1.75rem] font-black leading-tight text-white sm:text-[2.5rem]">
              {ctaTitle}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
              {ctaSubtitle}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register/select-activity"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black text-fs-accent shadow-lg"
              >
                Commencer gratuitement
                <MdArrowForward className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href="https://wa.me/22664712044?text=Bonjour%20FasoStock%2C%20je%20souhaite%20plus%20d%27informations."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/10"
              >
                <MdWhatsapp className="h-5 w-5" aria-hidden />
                Discuter sur WhatsApp
              </a>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-white/70">
              <a href="tel:+22664712044" className="flex items-center gap-1 hover:text-white">
                <MdPhone className="h-3.5 w-3.5" aria-hidden />
                +226 64 71 20 44
              </a>
              <span>Aucune carte bancaire requise</span>
              <span>Résiliation à tout moment</span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-black/8 bg-white px-4 py-6 text-center dark:border-white/8 dark:bg-[#1c1b1f] sm:px-6">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-black text-neutral-800">
              Faso<span className="text-[#f97316]">Stock</span>
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              La solution de gestion de stock N°1 au Burkina Faso
            </p>
            <nav className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-neutral-500">
              <Link href="/" className="hover:text-fs-accent">Accueil</Link>
              <Link href="/#tarifs" className="hover:text-fs-accent">Tarifs</Link>
              <Link href="/register/select-activity" className="hover:text-fs-accent">Essai gratuit</Link>
              <Link href="/login" className="hover:text-fs-accent">Se connecter</Link>
              <Link href="/politique-confidentialite" className="hover:text-fs-accent">Confidentialité</Link>
              <Link href="/conditions-utilisation" className="hover:text-fs-accent">CGU</Link>
            </nav>
            <p className="mt-4 text-[10px] text-neutral-400">
              © {new Date().getFullYear()} FasoStock — Tous droits réservés · Burkina Faso
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
