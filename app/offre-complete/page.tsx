import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  MdArrowForward,
  MdBolt,
  MdCheck,
  MdCheckCircle,
  MdCloudDone,
  MdCreditCard,
  MdDevices,
  MdGroups,
  MdHeadsetMic,
  MdInsights,
  MdInventory2,
  MdKeyboard,
  MdLocalShipping,
  MdPhone,
  MdPointOfSale,
  MdPrint,
  MdSchool,
  MdSecurity,
  MdShoppingCartCheckout,
  MdStorefront,
  MdTrendingUp,
  MdVerifiedUser,
  MdWhatsapp,
} from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa6";
import { SiteHeader } from "@/components/marketing/site-header";
import { SeoFaq } from "@/components/seo/seo-faq";
import { getCachedLandingSettings } from "@/lib/features/landing/server";
import { cn } from "@/lib/utils/cn";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fasostock.com";
const canonicalUrl = `${siteUrl}/offre-complete`;

const OFFER_PRICE = "380 000";
const WHATSAPP_ORDER = `https://wa.me/22664712044?text=${encodeURIComponent(
  "Bonjour FasoStock, je souhaite commander l'Offre Complète (Matériels + Abonnement logiciel) à 380 000 CFA.",
)}`;
const WHATSAPP_FLOAT = `https://wa.me/22664712044?text=${encodeURIComponent(
  "Bonjour ! Je suis intéressé par votre offre complète logiciel FasoStock + Matériel complet !",
)}`;

// Réglages publics (image « offre » modifiable dans GPublique) — revalidés toutes les 60 s
// et invalidés immédiatement par revalidateLandingCache() après un upload admin.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Offre Complète : pack matériel POS + logiciel FasoStock",
  description:
    "Terminal POS, imprimante ticket 80mm, clavier, souris et abonnement logiciel FasoStock à 380 000 CFA. Installation, formation et garantie 12 mois incluses.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: "Offre Complète FasoStock — Matériel POS + Logiciel",
    description:
      "Le pack tout-en-un pour équiper votre commerce : caisse tactile, imprimante ticket, clavier, souris et abonnement FasoStock. 380 000 CFA.",
    url: canonicalUrl,
    siteName: "FasoStock",
    locale: "fr_BF",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

const advantages = [
  { icon: MdInventory2, title: "Gestion de stock en temps réel", text: "Suivez vos entrées, sorties et alertes de rupture instantanément." },
  { icon: MdShoppingCartCheckout, title: "Ventes rapides et efficaces", text: "Encaissez en quelques secondes et imprimez le ticket aussitôt." },
  { icon: MdInsights, title: "Rapports et statistiques", text: "Visualisez vos performances et prenez de meilleures décisions." },
] as const;

const pack = [
  {
    icon: MdPointOfSale,
    title: "Terminal POS tactile",
    text: "Caisse enregistreuse tactile professionnelle, prête à l'emploi pour vos ventes en boutique.",
    tag: "Matériel",
  },
  {
    icon: MdPrint,
    title: "Imprimante ticket 80mm",
    text: "Imprimante thermique rapide pour vos reçus et tickets de caisse, sans encre.",
    tag: "Matériel",
  },
  {
    icon: MdKeyboard,
    title: "Clavier + Souris",
    text: "Ensemble clavier et souris inclus pour une saisie confortable au quotidien.",
    tag: "Matériel",
  },
  {
    icon: MdCloudDone,
    title: "Abonnement logiciel FasoStock",
    text: "L'accès complet au logiciel FasoStock : ventes, stock, clients, rapports et mises à jour.",
    tag: "Logiciel",
  },
] as const;

const softwareFeatures = [
  { icon: MdPointOfSale, label: "Gestion des ventes (POS)" },
  { icon: MdInventory2, label: "Gestion de stock et alertes" },
  { icon: MdCreditCard, label: "Clients, fournisseurs, crédits" },
  { icon: MdTrendingUp, label: "Rapports détaillés" },
  { icon: MdGroups, label: "Multi-utilisateurs" },
  { icon: MdSecurity, label: "Sauvegarde et sécurité" },
  { icon: MdDevices, label: "Accessible sur mobile et PC" },
] as const;

const guarantees = [
  { icon: MdVerifiedUser, title: "Garantie 12 mois", text: "Matériel garanti un an." },
  { icon: MdHeadsetMic, title: "Support technique dédié", text: "Une équipe à votre écoute." },
  { icon: MdSchool, title: "Formation incluse", text: "Prise en main assurée." },
  { icon: MdLocalShipping, title: "Installation incluse", text: "Livré et configuré." },
] as const;

const miniStats = [
  { value: "1 234 500", label: "Total ventes (FCFA)" },
  { value: "85", label: "Commandes" },
  { value: "356", label: "Produits" },
  { value: "12", label: "Fournisseurs" },
] as const;

const topProducts = [
  { name: "Produit A", value: 325 },
  { name: "Produit B", value: 256 },
  { name: "Produit C", value: 176 },
  { name: "Produit D", value: 110 },
] as const;

const chartBars = [40, 62, 48, 78, 56, 90, 70, 100, 84];

const faqs = [
  {
    q: "Que comprend exactement l'Offre Complète à 380 000 CFA ?",
    a: "Le pack inclut un terminal POS tactile, une imprimante à ticket 80mm, un ensemble clavier et souris, ainsi que l'abonnement au logiciel FasoStock. L'installation et la formation sont incluses.",
  },
  {
    q: "L'installation et la formation sont-elles vraiment incluses ?",
    a: "Oui. Notre équipe installe et configure votre matériel, puis forme votre personnel à l'utilisation du logiciel FasoStock afin que vous soyez opérationnel immédiatement.",
  },
  {
    q: "Le matériel est-il garanti ?",
    a: "Oui. Tout le matériel du pack bénéficie d'une garantie de 12 mois. En cas de problème, notre support technique dédié vous accompagne rapidement.",
  },
  {
    q: "Puis-je utiliser FasoStock sur mon téléphone en plus du terminal ?",
    a: "Absolument. L'abonnement FasoStock est accessible sur le terminal POS, sur ordinateur et sur mobile. Vous suivez votre commerce où que vous soyez.",
  },
  {
    q: "Comment commander l'Offre Complète ?",
    a: "Cliquez sur « Commander sur WhatsApp » ou appelez-nous. Nous confirmons votre commande, planifions la livraison, l'installation et la formation à votre convenance.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Offre Complète FasoStock — Matériel POS + Logiciel",
  description:
    "Pack complet pour commerces : terminal POS tactile, imprimante ticket 80mm, clavier, souris et abonnement logiciel FasoStock. Installation et formation incluses.",
  brand: { "@type": "Brand", name: "FasoStock" },
  category: "Point of Sale System",
  offers: {
    "@type": "Offer",
    price: "380000",
    priceCurrency: "XOF",
    availability: "https://schema.org/InStock",
    url: canonicalUrl,
    seller: { "@type": "Organization", name: "FasoStock" },
  },
};

export default async function OffreCompletePage() {
  const landingSettings = await getCachedLandingSettings();
  const offerImageUrl = (landingSettings.offer_showcase_image_url ?? "").trim();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(232,93,44,0.14),transparent_42%),linear-gradient(to_bottom,#fff,#fff7f3)] text-neutral-900 dark:bg-[radial-gradient(circle_at_top,rgba(232,93,44,0.22),transparent_42%),linear-gradient(to_bottom,#0b1220,#111827)] dark:text-neutral-100">
        <SiteHeader sectionHrefPrefix="/" />

        {/* ── HERO ── */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 pt-6 sm:px-6 sm:pb-12 sm:pt-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1.02fr_0.98fr]">
            {/* Colonne texte + prix */}
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-fs-accent px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_-16px_rgba(232,93,44,0.9)]">
                <MdBolt className="h-4 w-4" aria-hidden />
                Offre complète
              </p>
              <h1 className="text-[2.3rem] font-black leading-[0.98] tracking-tight text-[#17253a] dark:text-white sm:text-[3.6rem]">
                La solution complète pour gérer votre{" "}
                <span className="text-fs-accent">commerce</span>
              </h1>
              <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#fff3ea] px-3 py-1.5 text-sm font-black uppercase tracking-wide text-fs-accent dark:bg-fs-accent/15">
                Matériels + Logiciel · Abonnement FasoStock
              </p>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-300 sm:text-base">
                Un pack tout-en-un, prêt à l&apos;emploi : le matériel de caisse professionnel
                <strong className="font-bold text-neutral-800 dark:text-neutral-100"> et </strong>
                l&apos;abonnement au logiciel FasoStock, installés et configurés pour vous.
              </p>

              {/* Carte prix */}
              <div className="mt-6 overflow-hidden rounded-md border border-black/10 bg-[#101828] text-white shadow-[0_28px_60px_-30px_rgba(16,24,40,0.8)] dark:border-white/10">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">
                      Prix du pack complet
                    </p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="whitespace-nowrap text-[2.1rem] font-black leading-none tracking-tight sm:text-[2.9rem]">
                        {OFFER_PRICE}
                      </span>
                      <span className="text-lg font-black text-fs-accent">CFA</span>
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-white/70">
                      Matériels + abonnement logiciel
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link
                      href={WHATSAPP_ORDER}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-fs-accent px-4 text-[13px] font-black text-white shadow-[0_18px_36px_-18px_rgba(232,93,44,0.95)] active:scale-[0.98]"
                    >
                      <MdWhatsapp className="h-6 w-6 shrink-0" aria-hidden />
                      Commander sur WhatsApp
                    </Link>
                    <a
                      href="tel:+22664712044"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/25 bg-white/5 px-4 text-[13px] font-bold text-white hover:bg-white/10"
                    >
                      <MdPhone className="h-4 w-4" aria-hidden />
                      +226 64 71 20 44
                    </a>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-4">
                  {guarantees.map((g) => (
                    <div key={g.title} className="flex items-center gap-2 bg-[#101828] px-3 py-2.5">
                      <g.icon className="h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
                      <span className="text-[11px] font-bold leading-tight text-white/85">{g.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Colonne visuelle : mockup tableau de bord */}
            <div className="relative mx-auto w-full max-w-[560px]">
              <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-fs-accent/15 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-8 -left-6 h-32 w-32 rounded-full bg-[#2f80ed]/15 blur-2xl" />

              {offerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={offerImageUrl}
                  alt="Offre complète FasoStock — pack matériel de caisse et logiciel"
                  className="relative w-full rounded-md border border-black/10 object-cover shadow-[0_40px_80px_-40px_rgba(16,24,40,0.55)] dark:border-white/10"
                />
              ) : (
                <>
              {/* Écran POS */}
              <div className="relative overflow-hidden rounded-md border border-black/10 bg-white shadow-[0_40px_80px_-40px_rgba(16,24,40,0.55)] dark:border-white/10 dark:bg-[#1c1b1f]">
                <div className="flex items-center gap-2 bg-fs-accent px-4 py-2.5 text-white">
                  <span className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                  </span>
                  <span className="ml-1 inline-flex items-center gap-1.5 text-sm font-black">
                    <MdStorefront className="h-4 w-4" aria-hidden />
                    FasoStock
                  </span>
                  <span className="ml-auto text-[11px] font-semibold text-white/80">Tableau de bord</span>
                </div>

                <div className="p-3 sm:p-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {miniStats.map((s) => (
                      <div key={s.label} className="rounded-md border border-black/8 bg-[#fbfbfb] px-3 py-2.5 dark:border-white/8 dark:bg-[#232323]">
                        <p className="text-sm font-black leading-none text-[#17253a] dark:text-white sm:text-base">
                          {s.value}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold leading-tight text-neutral-500">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1.15fr_0.85fr]">
                    {/* Bar chart */}
                    <div className="rounded-md border border-black/8 bg-[#fbfbfb] p-3 dark:border-white/8 dark:bg-[#232323]">
                      <p className="text-[11px] font-black text-[#17253a] dark:text-white">Ventes du jour</p>
                      <div className="mt-3 flex h-24 items-end gap-1.5">
                        {chartBars.map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-sm bg-fs-accent/85"
                            style={{ height: `${h}%` }}
                            aria-hidden
                          />
                        ))}
                      </div>
                    </div>
                    {/* Top produits */}
                    <div className="rounded-md border border-black/8 bg-[#fbfbfb] p-3 dark:border-white/8 dark:bg-[#232323]">
                      <p className="text-[11px] font-black text-[#17253a] dark:text-white">Top produits</p>
                      <ul className="mt-2 space-y-1.5">
                        {topProducts.map((p) => (
                          <li key={p.name} className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-neutral-600 dark:text-neutral-300">{p.name}</span>
                            <span className="font-black text-fs-accent">{p.value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Badges flottants matériel */}
              <div className="absolute -right-3 top-16 hidden rounded-md border border-black/10 bg-white px-3 py-2 shadow-[0_18px_30px_-20px_rgba(17,24,39,0.6)] dark:border-white/10 dark:bg-[#1c1b1f] sm:flex sm:items-center sm:gap-2">
                <MdPrint className="h-5 w-5 text-fs-accent" aria-hidden />
                <span className="text-xs font-black text-[#17253a] dark:text-white">Ticket 80mm</span>
              </div>
              <div className="absolute -left-3 bottom-6 hidden rounded-md border border-black/10 bg-white px-3 py-2 shadow-[0_18px_30px_-20px_rgba(17,24,39,0.6)] dark:border-white/10 dark:bg-[#1c1b1f] sm:flex sm:items-center sm:gap-2">
                <MdKeyboard className="h-5 w-5 text-fs-accent" aria-hidden />
                <span className="text-xs font-black text-[#17253a] dark:text-white">Clavier + Souris</span>
              </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── AVANTAGES ── */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {advantages.map((a) => (
              <article
                key={a.title}
                className="flex items-start gap-3 rounded-md border border-black/10 bg-white p-4 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.45)] dark:border-white/8 dark:bg-[#1c1b1f]"
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-fs-accent text-white">
                  <a.icon className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-black leading-tight text-[#17253a] dark:text-white">{a.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{a.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── CE PACK INCLUT ── */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-12">
          <div className="rounded-md border border-black/8 bg-white px-4 py-8 shadow-[0_22px_56px_-36px_rgba(17,24,39,0.28)] dark:border-white/8 dark:bg-[#1c1b1f] sm:px-8">
            <div className="text-center">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent dark:bg-fs-accent/20">
                <MdCheckCircle className="h-4 w-4" aria-hidden />
                Ce pack inclut
              </p>
              <h2 className="mx-auto mt-3 max-w-3xl text-[1.8rem] font-black leading-tight tracking-tight text-[#17253a] dark:text-white sm:text-[2.6rem]">
                Tout le nécessaire pour <span className="text-fs-accent">démarrer</span>
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-300">
                Matériel professionnel et logiciel réunis dans une seule offre, livrés prêts à l&apos;emploi.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {pack.map((item) => (
                <article
                  key={item.title}
                  className="flex h-full flex-col rounded-md border border-black/10 bg-[#fbfbfb] p-5 shadow-[0_10px_26px_-20px_rgba(15,23,42,0.4)] dark:border-white/8 dark:bg-[#232323]"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-fs-accent text-white">
                      <item.icon className="h-7 w-7" aria-hidden />
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide",
                        item.tag === "Logiciel"
                          ? "bg-[#eaf2ff] text-[#2f80ed]"
                          : "bg-[#fff3ea] text-fs-accent",
                      )}
                    >
                      {item.tag}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-black leading-tight text-[#1f2937] dark:text-white">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 flex-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                    {item.text}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-fs-accent">
                    <MdCheck className="h-4 w-4" aria-hidden />
                    Inclus dans l&apos;offre
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── LOGICIEL INCLUS ── */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-12">
          <div className="grid items-center gap-6 rounded-md border border-fs-accent/20 bg-[#fff7f1] p-4 dark:bg-fs-accent/8 sm:p-6 lg:grid-cols-[1fr_1fr] lg:p-8">
            <div>
              <div className="inline-flex items-center gap-2">
                <Image src="/fs.png" alt="Logo FasoStock" width={40} height={40} className="h-10 w-10 object-contain" />
                <p className="text-2xl font-black tracking-tight text-[#17253a] dark:text-white">
                  Faso<span className="text-fs-accent">Stock</span>
                </p>
              </div>
              <h2 className="mt-3 text-[1.7rem] font-black leading-[1.08] tracking-tight text-[#0f172a] dark:text-white sm:text-[2.4rem]">
                Le logiciel de gestion inclus dans l&apos;offre
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                Votre abonnement FasoStock vous donne accès à tous les outils pour piloter votre commerce, sur le
                terminal comme sur votre téléphone.
              </p>
              <div className="mt-5 flex flex-col gap-2.5 min-[460px]:flex-row">
                <Link
                  href={WHATSAPP_ORDER}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-fs-accent px-5 text-sm font-black text-white shadow-[0_18px_36px_-18px_rgba(232,93,44,0.95)]"
                >
                  <MdWhatsapp className="h-5 w-5" aria-hidden />
                  Commander le pack
                </Link>
                <Link
                  href="/register/select-activity"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-fs-accent/45 bg-white px-5 text-sm font-bold text-fs-accent dark:bg-transparent"
                >
                  Essayer le logiciel
                  <MdArrowForward className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>

            <ul className="grid gap-2.5 sm:grid-cols-2">
              {softwareFeatures.map((f) => (
                <li
                  key={f.label}
                  className="flex items-center gap-3 rounded-md border border-black/8 bg-white px-3.5 py-3 shadow-sm dark:border-white/8 dark:bg-[#1c1b1f]"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#fff5ef] text-fs-accent dark:bg-fs-accent/20">
                    <f.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-sm font-bold leading-tight text-[#1f2937] dark:text-neutral-100">
                    {f.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── INSTALLATION & FORMATION ── */}
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-12">
          <div className="overflow-hidden rounded-md bg-[#101828] px-5 py-8 text-white sm:px-8">
            <div className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-fs-accent/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent">
                  <MdSchool className="h-4 w-4" aria-hidden />
                  Installation & formation incluses
                </p>
                <h2 className="mt-3 text-[1.7rem] font-black leading-tight tracking-tight sm:text-[2.3rem]">
                  On vous installe tout et on forme votre équipe
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/80">
                  Pas besoin d&apos;être un expert. Notre équipe livre le matériel, l&apos;installe, le configure et forme
                  votre personnel pour que vous soyez opérationnel dès le premier jour.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {guarantees.map((g) => (
                  <div key={g.title} className="rounded-md border border-white/10 bg-white/5 p-3.5">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-fs-accent/20 text-fs-accent">
                      <g.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="mt-2 text-sm font-black leading-tight">{g.title}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-white/70">{g.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── RÉCAP PRIX / CTA ── */}
        <section className="mx-auto w-full max-w-5xl px-4 pb-10 sm:px-6 sm:pb-14">
          <div className="overflow-hidden rounded-md border-2 border-fs-accent bg-white shadow-[0_28px_60px_-34px_rgba(232,93,44,0.55)] dark:bg-[#1c1b1f]">
            <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent dark:bg-fs-accent/20">
                  Offre complète
                </p>
                <h2 className="mt-3 text-[1.7rem] font-black leading-tight tracking-tight text-[#17253a] dark:text-white sm:text-[2.3rem]">
                  Équipez votre commerce dès aujourd&apos;hui
                </h2>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    "Terminal POS tactile",
                    "Imprimante ticket 80mm",
                    "Clavier + Souris",
                    "Abonnement logiciel FasoStock",
                    "Installation & formation",
                    "Garantie 12 mois",
                  ].map((label) => (
                    <li key={label} className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                      <MdCheckCircle className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md bg-[#101828] p-5 text-center text-white sm:p-6">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">Prix du pack</p>
                <p className="mt-1 flex items-baseline justify-center gap-1.5">
                  <span className="whitespace-nowrap text-[2.6rem] font-black leading-none tracking-tight">{OFFER_PRICE}</span>
                  <span className="text-lg font-black text-fs-accent">CFA</span>
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-white/70">
                  Matériels + logiciel
                </p>
                <Link
                  href={WHATSAPP_ORDER}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-fs-accent px-5 text-sm font-black text-white active:scale-[0.98]"
                >
                  <MdWhatsapp className="h-5 w-5" aria-hidden />
                  Commander sur WhatsApp
                </Link>
                <a
                  href="tel:+22664712044"
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/25 bg-white/5 px-5 text-sm font-bold text-white hover:bg-white/10"
                >
                  <MdPhone className="h-4 w-4" aria-hidden />
                  Être rappelé
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <SeoFaq faqs={faqs} />

        {/* ── FOOTER ── */}
        <footer className="border-t border-black/8 bg-white px-4 py-8 dark:border-white/8 dark:bg-[#101828] sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-2.5">
                <Image src="/fs.png" alt="FasoStock" width={40} height={40} className="h-10 w-10 object-contain" />
                <div>
                  <p className="text-lg font-black tracking-tight dark:text-white">
                    Faso<span className="text-fs-accent">Stock</span>
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Gérez. Vendez. Développez.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                <span className="inline-flex items-center gap-1.5">
                  <MdVerifiedUser className="h-4 w-4 text-fs-accent" aria-hidden /> Garantie 12 mois
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MdHeadsetMic className="h-4 w-4 text-fs-accent" aria-hidden /> Support technique dédié
                </span>
                <a href="tel:+22664712044" className="inline-flex items-center gap-1.5 hover:text-fs-accent">
                  <MdPhone className="h-4 w-4 text-fs-accent" aria-hidden /> +226 64 71 20 44
                </a>
              </div>
            </div>
            <nav className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 border-t border-black/8 pt-4 text-xs text-neutral-500 dark:border-white/8 dark:text-neutral-400">
              <Link href="/" className="hover:text-fs-accent">Accueil</Link>
              <Link href="/#tarifs" className="hover:text-fs-accent">Tarifs</Link>
              <Link href="/register/select-activity" className="hover:text-fs-accent">Essai gratuit</Link>
              <Link href="/facture-devis" className="hover:text-fs-accent">Facture &amp; Devis</Link>
              <Link href="/politique-confidentialite" className="hover:text-fs-accent">Confidentialité</Link>
            </nav>
            <p className="mt-4 text-center text-[10px] text-neutral-400">
              © {new Date().getFullYear()} FasoStock — Tous droits réservés · Burkina Faso · www.fasostock.com
            </p>
          </div>
        </footer>

        {/* ── Bouton WhatsApp flottant ── */}
        <a
          href={WHATSAPP_FLOAT}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contacter FasoStock sur WhatsApp pour l'offre complète"
          title="Discuter sur WhatsApp"
          className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_14px_34px_-8px_rgba(37,211,102,0.7)] transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
        >
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366]/40"
            aria-hidden
          />
          <span
            className="absolute inline-flex h-full w-full rounded-full bg-[#25D366]/20 blur-md"
            aria-hidden
          />
          <FaWhatsapp className="relative h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
        </a>
      </main>
    </>
  );
}
