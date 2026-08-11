import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  getCachedLandingPartners,
  getCachedLandingSettings,
  getCachedLandingSupportImage,
} from "@/lib/features/landing/server";
import { PartnersSection } from "@/components/marketing/partners-section";
import { TestimonialsSection } from "@/components/marketing/testimonials-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { NewsletterSubscribeForm } from "@/components/marketing/newsletter-subscribe-form";
import { SiteHeader } from "@/components/marketing/site-header";
import { ScrollDirectionFab } from "@/components/marketing/scroll-direction-fab";
import { LandingChatbot } from "@/components/marketing/landing-chatbot";
import { WhatsappFloat } from "@/components/marketing/whatsapp-float";
import { VideoModalButton } from "@/components/marketing/video-modal-button";
import { ScrollProgress } from "@/components/marketing/scroll-progress";
import { LottiePlayer } from "@/components/marketing/lottie-player";
import { SEO_LANDING_LINKS } from "@/lib/seo/landing-links";
import { HOME_FAQS } from "@/lib/seo/home-faq";
import { SITE_URL } from "@/lib/seo/site-url";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  MdArrowForward,
  MdAutorenew,
  MdCalendarMonth,
  MdCardGiftcard,
  MdCheckCircle,
  MdCreditCard,
  MdDescription,
  MdEmojiEmotions,
  MdGroups,
  MdHeadsetMic,
  MdInventory2,
  MdLock,
  MdLogin,
  MdMailOutline,
  MdOutlinePhoneAndroid,
  MdOfflineBolt,
  MdPointOfSale,
  MdSecurity,
  MdSpeed,
  MdStorefront,
  MdSupportAgent,
  MdSync,
  MdTaskAlt,
  MdTrendingUp,
  MdVerifiedUser,
  MdWallet,
  MdWhatsapp,
  MdWifi,
  MdWifiOff,
} from "react-icons/md";
import { FaFacebookF, FaLinkedinIn, FaTiktok, FaWhatsapp, FaYoutube } from "react-icons/fa6";
import { FaApple, FaGooglePlay, FaWindows } from "react-icons/fa";
import { FaCcMastercard, FaCcVisa } from "react-icons/fa";

export const dynamic = "force-dynamic";

/** Identifiant éditeur Google AdSense (public). Surchargeable via env. */
const ADSENSE_CLIENT =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "ca-pub-2965888370366530";

const siteUrl = SITE_URL;

const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "FasoStock",
      alternateName: "FasoStock — logiciel de gestion commerciale",
      url: siteUrl,
      inLanguage: "fr-BF",
      publisher: { "@type": "Organization", name: "FasoStock", url: siteUrl },
    },
    {
      "@type": "WebPage",
      name: "Logiciel de gestion commerciale au Burkina Faso",
      description:
        "FasoStock, le logiciel de gestion commerciale des commerçants et PME du Burkina Faso : ventes, stock, caisse, factures, crédits clients et rapports.",
      url: siteUrl,
      inLanguage: "fr-BF",
      about: { "@type": "Thing", name: "Logiciel de gestion commerciale" },
      isPartOf: { "@type": "WebSite", url: siteUrl, name: "FasoStock" },
    },
    {
      "@type": "FAQPage",
      mainEntity: HOME_FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@type": "ItemList",
      name: "Solutions FasoStock",
      itemListElement: SEO_LANDING_LINKS.map((l, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: l.label,
        url: `${siteUrl}${l.href}`,
      })),
    },
  ],
};

export const metadata: Metadata = {
  title: { absolute: "Logiciel de gestion commerciale au Burkina Faso | FasoStock" },
  description:
    "FasoStock est le logiciel de gestion commerciale des commerçants et PME du Burkina Faso : ventes, stock, caisse, factures, crédits clients et rapports, sur mobile et PC. Essai gratuit.",
  keywords: [
    "logiciel de gestion commerciale Burkina Faso",
    "logiciel gestion commerciale Ouagadougou",
    "logiciel de gestion commerciale",
    "logiciel de caisse Burkina Faso",
    "logiciel de gestion de stock Burkina Faso",
    "logiciel de facturation Burkina Faso",
    "application gestion boutique Burkina Faso",
    "FasoStock",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Logiciel de gestion commerciale au Burkina Faso | FasoStock",
    description:
      "Ventes, stock, caisse, facturation, crédits clients et rapports dans un seul logiciel de gestion commerciale conçu au Burkina Faso.",
    url: "/",
    siteName: "FasoStock",
    locale: "fr_BF",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

const bannerFeatureStrip = [
  { icon: MdPointOfSale, title: "Ventes rapides", subtitle: "Encaissez facilement et rapidement" },
  { icon: MdInventory2, title: "Gestion de stock", subtitle: "Suivez votre stock en temps réel" },
  { icon: MdCreditCard, title: "Crédits clients", subtitle: "Gérez les dettes et encaissements" },
  { icon: MdTrendingUp, title: "Rapports clairs", subtitle: "Prenez de meilleures décisions" },
  { icon: MdGroups, title: "Employés & accès", subtitle: "Gérez vos employés et leurs droits" },
  { icon: MdWifi, title: "Faible connexion", subtitle: "Fonctionne même avec une connexion internet faible" },
] as const;

const bannerTrustStrip = [
  { icon: MdEmojiEmotions, title: "100%", text: "Conçu pour les commerçants" },
  { icon: MdSecurity, title: "Sécurisé", text: "Vos données sont protégées" },
  { icon: MdOfflineBolt, title: "Rapide", text: "Interface fluide et performante" },
  { icon: MdVerifiedUser, title: "Adapté à votre réalité", text: "Multi-boutiques, multi-utilisateurs" },
] as const;

const DOWNLOAD_LINKS = {
  windows: process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL ?? "",
  linux: process.env.NEXT_PUBLIC_DOWNLOAD_LINUX_URL ?? "",
  android: process.env.NEXT_PUBLIC_DOWNLOAD_ANDROID_URL ?? "",
  macos: process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_URL ?? "",
  ios: process.env.NEXT_PUBLIC_DOWNLOAD_IOS_URL ?? "",
} as const;

function isRealDownloadUrl(value: string) {
  const v = value.trim();
  return v.startsWith("http://") || v.startsWith("https://");
}

const dailyChallenges = [
  {
    icon: MdInventory2,
    title: "Stock mal suivi",
    text: "Vous ne savez pas exactement ce qui est disponible ou en rupture.",
    tone: "orange",
  },
  {
    icon: MdPointOfSale,
    title: "Ventes non enregistrées correctement",
    text: "Ventes oubliées, montants erronés, tickets non émis. Vos chiffres ne sont plus fiables.",
    tone: "blue",
  },
  {
    icon: MdCreditCard,
    title: "Crédits clients oubliés",
    text: "Dettes non suivies, paiements oubliés, pertes d'argent et relations clients fragilisées.",
    tone: "green",
  },
  {
    icon: MdGroups,
    title: "Employés difficiles à contrôler",
    text: "Sans gestion des accès et des rôles, vous ne savez plus qui fait quoi.",
    tone: "purple",
  },
  {
    icon: MdTrendingUp,
    title: "Rapports inexistants",
    text: "Pas de vision claire sur vos ventes, bénéfices, dépenses ou performances.",
    tone: "amber",
  },
  {
    icon: MdStorefront,
    title: "Difficulté à gérer plusieurs boutiques",
    text: "Les informations sont éparpillées, vous perdez du temps et la vue globale.",
    tone: "red",
  },
  {
    icon: MdWifiOff,
    title: "Connexion internet instable",
    text: "Impossible de continuer à travailler quand internet coupe.",
    tone: "cyan",
  },
] as const;

const solutionCapabilities = [
  {
    icon: MdPointOfSale,
    title: "Gestion des ventes",
    text: "Encaissez rapidement vos clients, imprimez des tickets et suivez toutes vos ventes en temps réel.",
    tone: "orange",
  },
  {
    icon: MdInventory2,
    title: "Gestion du stock",
    text: "Suivez vos produits, quantités, entrées et sorties. Soyez alerté en cas de rupture de stock.",
    tone: "blue",
  },
  {
    icon: MdCreditCard,
    title: "Gestion des crédits clients",
    text: "Enregistrez les dettes, paiements partiels et soldes. Suivez facilement vos clients et leurs historiques.",
    tone: "green",
  },
  {
    icon: MdWallet,
    title: "Gestion des dépenses",
    text: "Enregistrez et catégorisez toutes vos dépenses pour mieux contrôler vos charges et votre trésorerie.",
    tone: "purple",
  },
  {
    icon: MdGroups,
    title: "Gestion des employés",
    text: "Ajoutez vos employés, définissez des rôles et contrôlez leurs accès selon leurs responsabilités.",
    tone: "amber",
  },
  {
    icon: MdTrendingUp,
    title: "Rapports clairs",
    text: "Consultez des rapports détaillés sur vos ventes, bénéfices, dépenses, stocks, crédits et performances.",
    tone: "pink",
  },
  {
    icon: MdStorefront,
    title: "Multi-boutiques",
    text: "Gérez plusieurs boutiques ou points de vente depuis un seul compte en toute simplicité.",
    tone: "cyan",
  },
  {
    icon: MdWifi,
    title: "Faible connexion + sync",
    text: "Fonctionne même avec une faible connexion internet et synchronise vos données dès que le débit s'améliore.",
    tone: "indigo",
  },
] as const;

const landingFonctionnalitesPrincipales = [
  {
    icon: MdPointOfSale,
    title: "POS caisse rapide",
    text: "Encaissez rapidement vos clients, imprimez des tickets et suivez toutes vos ventes en temps réel.",
  },
  {
    icon: MdInventory2,
    title: "Stock en temps réel",
    text: "Suivez les entrées, sorties et quantités disponibles de vos produits. Soyez alerté en cas de rupture de stock.",
  },
  {
    icon: MdCreditCard,
    title: "Crédits clients",
    text: "Enregistrez les dettes, paiements partiels et soldes. Suivez facilement vos clients et leurs historiques de paiement.",
  },
  {
    icon: MdTrendingUp,
    title: "Rapports détaillés",
    text: "Analysez vos ventes, bénéfices, dépenses, stocks, crédits et performances grâce à des rapports clairs et précis.",
  },
  {
    icon: MdStorefront,
    title: "Multi-boutiques",
    text: "Gérez plusieurs boutiques ou points de vente depuis un seul compte, avec des données centralisées.",
  },
  {
    icon: MdGroups,
    title: "Utilisateurs & rôles",
    text: "Ajoutez vos employés, définissez des rôles et contrôlez leurs accès selon leurs responsabilités.",
  },
  {
    icon: MdDescription,
    title: "Tickets & factures",
    text: "Imprimez des tickets, factures ou reçus professionnels pour vos clients en un clic.",
  },
  {
    icon: MdSync,
    title: "Faible connexion + sync",
    text: "Fonctionne même avec une faible connexion internet et synchronise automatiquement vos données.",
  },
] as const;

const landingSimplifierBand = [
  { icon: MdSpeed, title: "Productivité", text: "Gagnez du temps et concentrez-vous sur l'essentiel." },
  { icon: MdTaskAlt, title: "Précision", text: "Réduisez les erreurs et améliorez la fiabilité." },
  { icon: MdSecurity, title: "Sécurité", text: "Vos données sont protégées et sauvegardées." },
  { icon: MdOfflineBolt, title: "Performance", text: "Une application rapide, fluide et toujours disponible." },
  { icon: MdSupportAgent, title: "Support dédié", text: "Une équipe disponible pour vous accompagner." },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string; type?: string }>;
}) {
  if (!hasSupabaseConfig()) redirect("/setup");

  const sp = await searchParams;
  if (sp.code) {
    const q = new URLSearchParams({ code: sp.code });
    const next =
      sp.next ??
      (sp.type === "recovery" ? "/reset-password" : undefined);
    if (next) q.set("next", next);
    redirect(`/auth/callback?${q.toString()}`);
  }

  const supabase = await createClient();
  // Auth + données publiques en parallèle (les données publiques sont mises en cache).
  const [authResult, partners, supportImage, landingSettings] = await Promise.all([
    supabase.auth.getUser(),
    getCachedLandingPartners(),
    getCachedLandingSupportImage(),
    getCachedLandingSettings(),
  ]);
  const user = authResult.data.user;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.is_super_admin) redirect("/admin");
    redirect("/dashboard");
  }

  const supportSectionImageUrl = supportImage.imageUrl;
  const heroBannerImageUrl = (landingSettings.hero_banner_image_url ?? "").trim();
  // La bannière hero peut être une image ou une vidéo. Le type est piloté par le
  // réglage `hero_banner_media_type` (défini à l'upload dans GPublique) ; à défaut
  // on le devine depuis l'extension de l'URL.
  const heroBannerMediaType = (landingSettings.hero_banner_media_type ?? "").trim().toLowerCase();
  const heroBannerIsVideo =
    heroBannerMediaType === "video" ||
    (heroBannerMediaType !== "image" && /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(heroBannerImageUrl));
  const supportDemoUrl = (landingSettings.support_demo_url ?? "").trim() || "/help";
  const whatsappDefaultUrl = `https://wa.me/212771668079?text=${encodeURIComponent(
    "Bonjour, je suis intéressé(e) par FasoStock. Pouvez-vous m'aider ?",
  )}`;
  const supportWhatsappUrl = (landingSettings.support_whatsapp_url ?? "").trim() || whatsappDefaultUrl;
  const footerWhatsappUrl = (landingSettings.footer_whatsapp_url ?? "").trim() || whatsappDefaultUrl;
  const footerFacebookUrl = (landingSettings.footer_facebook_url ?? "").trim() || "https://facebook.com";
  const footerYoutubeUrl = (landingSettings.footer_youtube_url ?? "").trim() || "https://youtube.com";
  const footerTiktokUrl = (landingSettings.footer_tiktok_url ?? "").trim() || "https://tiktok.com";
  const footerLinkedinUrl = (landingSettings.footer_linkedin_url ?? "").trim() || "https://linkedin.com";
  const trialDays = Math.max(1, Number.parseInt(landingSettings.pricing_trial_days ?? "7", 10) || 7);
  const monthlyAmount = Math.max(0, Number.parseInt(landingSettings.pricing_monthly_amount ?? "15000", 10) || 15000);
  const yearlyAmount = Math.max(0, Number.parseInt(landingSettings.pricing_yearly_amount ?? "150000", 10) || 150000);
  const yearlySavings = Math.max(0, Number.parseInt(landingSettings.pricing_yearly_savings ?? "30000", 10) || 30000);
  const testimonialsStats = [
    {
      value: (landingSettings.testimonials_stat_1_value ?? "").trim() || "2+",
      label: (landingSettings.testimonials_stat_1_label ?? "").trim() || "Commerçants utilisent déjà FasoStock",
    },
    {
      value: (landingSettings.testimonials_stat_2_value ?? "").trim() || "2+",
      label: (landingSettings.testimonials_stat_2_label ?? "").trim() || "Types de commerces accompagnés",
    },
    {
      value: (landingSettings.testimonials_stat_3_value ?? "").trim() || "98%",
      label: (landingSettings.testimonials_stat_3_label ?? "").trim() || "De clients satisfaits selon nos retours",
    },
    {
      value: (landingSettings.testimonials_stat_4_value ?? "").trim() || "+25%",
      label: (landingSettings.testimonials_stat_4_label ?? "").trim() || "D'augmentation moyenne de performance",
    },
  ];
  const testimonialsCtaTitle =
    (landingSettings.testimonials_cta_title ?? "").trim() ||
    "La confiance des commerçants comme vous";
  const testimonialsCtaSubtitle =
    (landingSettings.testimonials_cta_subtitle ?? "").trim() ||
    "Rejoignez la communauté FasoStock et faites passer votre commerce au niveau supérieur.";

  return (
    <main
      id="landing-page"
      className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(232,93,44,0.14),transparent_42%),linear-gradient(to_bottom,#fff,#fff7f3)] text-neutral-900 dark:bg-[radial-gradient(circle_at_top,rgba(232,93,44,0.22),transparent_42%),linear-gradient(to_bottom,#0b1220,#111827)] dark:text-neutral-100"
    >
      <ScrollProgress />
      {/*
        Données structurées de la page d'accueil : WebSite (nom du site dans les
        résultats), FAQPage (rich results « questions fréquentes ») et
        ItemList des pages solutions.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      {/* Google AdSense — chargé uniquement sur la landing (page publique, visiteurs anonymes). */}
      <Script
        id="google-adsense"
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        strategy="lazyOnload"
        crossOrigin="anonymous"
      />
      <SiteHeader />

      {/* ── HERO ── */}
      <section id="accueil" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-10 pt-5 sm:px-6 sm:pb-14 sm:pt-7">
        <div
          className={cn(
            "relative overflow-hidden rounded-md border border-black/10 p-4 shadow-[0_28px_70px_-35px_rgba(17,24,39,0.4)] sm:p-6",
            heroBannerImageUrl
              // Sur mobile, la bannière prend la hauteur du contenu : on garde un
              // plancher bas pour ne pas rallonger inutilement le premier écran.
              ? "min-h-[340px] sm:min-h-[520px]"
              : "bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.95),rgba(246,246,246,0.9)_52%),linear-gradient(to_bottom,#fafafa,#f3f3f3)]",
          )}
        >
          {heroBannerImageUrl ? (
            <>
              {heroBannerIsVideo ? (
                <video
                  src={heroBannerImageUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  aria-hidden
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroBannerImageUrl}
                  alt="FasoStock — logiciel de gestion de stock, ventes et caisse pour commerces au Burkina Faso"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgba(15,23,42,0.78)_0%,rgba(15,23,42,0.55)_45%,rgba(15,23,42,0.2)_75%,rgba(15,23,42,0.05)_100%)]"
              />
            </>
          ) : null}

          <div
            className={cn(
              "relative grid items-center gap-6",
              heroBannerImageUrl ? "" : "lg:grid-cols-[1.05fr_0.95fr]",
            )}
          >
            <div className="max-w-2xl">
              <h1
                className={cn(
                  "text-[1.95rem] font-black leading-[0.98] tracking-tight sm:text-6xl",
                  heroBannerImageUrl
                    ? "text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
                    : "text-[#202935]",
                )}
              >
                Prenez le contrôle
                <br />
                total de votre
                <br />
                <span className="text-fs-accent">commerce.</span>
                {/* Mot-clé principal, visible et lisible, à l'intérieur du H1. */}
                <span
                  className={cn(
                    "mt-2 block text-[13.5px] font-bold leading-snug tracking-normal sm:mt-3 sm:text-lg",
                    heroBannerImageUrl ? "text-white/90" : "text-neutral-700",
                  )}
                >
                  Le logiciel de gestion commerciale N°1 au Burkina Faso
                </span>
              </h1>
              <p
                className={cn(
                  "mt-3 max-w-lg text-[13.5px] leading-snug sm:mt-4 sm:text-base sm:leading-relaxed",
                  heroBannerImageUrl ? "text-white/90" : "text-neutral-600",
                )}
              >
                FasoStock est un logiciel de gestion commerciale simple et complet pour les commerçants et PME du
                Burkina Faso : gérez votre stock, vos ventes, votre caisse, vos factures, vos crédits clients, vos
                employés et vos rapports au même endroit.
              </p>

              {/* Sur mobile : « Se connecter » pleine largeur, « Voir en vidéo »
                  en dessous — deux rangées. */}
              <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 sm:gap-2.5">
                <Link
                  href="/login"
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-fs-accent px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white shadow-[0_18px_36px_-18px_rgba(232,93,44,0.95)] sm:w-auto sm:min-h-11 sm:px-5 sm:py-2.5 sm:text-sm"
                >
                  <MdLogin className="h-5 w-5" aria-hidden />
                  Se connecter
                </Link>
                <VideoModalButton className="inline-flex min-h-10 flex-1 basis-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-bold text-neutral-800 sm:flex-none sm:min-h-11 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm" />
              </div>
            </div>

            {!heroBannerImageUrl ? (
              <div className="relative flex items-center justify-center">
                <LottiePlayer
                  src="/animations/hero.json"
                  className="h-[260px] w-[260px] sm:h-[320px] sm:w-[320px]"
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── FEATURE STRIP ── */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6">
        <div className="overflow-hidden rounded-md border border-black/10 bg-white">
          <div
            data-fs-stagger
            className="grid grid-cols-2 gap-px bg-black/8 lg:grid-cols-6"
          >
            {bannerFeatureStrip.map((item) => (
              <article
                key={item.title}
                className="flex min-h-[72px] items-start gap-2.5 bg-white px-4 py-3 sm:min-h-[64px] sm:gap-2 sm:px-3 sm:py-2.5"
              >
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fs-accent text-white sm:h-7 sm:w-7">
                  <item.icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold uppercase leading-tight text-neutral-800 sm:text-[11px]">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold leading-snug text-neutral-600 sm:text-[10px]">
                    {item.subtitle}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ── */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-10">
        <div className="overflow-hidden rounded-md border border-[#eadfd8] bg-[#fff8f3]">
          <div
            data-fs-stagger
            className="grid grid-cols-2 gap-px bg-[#f0e5de] lg:grid-cols-4"
          >
            {bannerTrustStrip.map((item) => (
              <article
                key={item.title}
                className="flex min-h-[72px] items-start gap-2.5 bg-[#fff8f3] px-3 py-3 sm:min-h-0 sm:gap-3 sm:px-4"
              >
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-fs-accent text-fs-accent sm:h-9 sm:w-9">
                  <item.icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase leading-tight tracking-tight text-[#202935] sm:text-sm lg:text-base">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── ACCOMPAGNEMENT ── */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-12">
        <div className="grid items-center gap-6 rounded-md border border-black/8 bg-[#f8f8f8] p-4 shadow-[0_22px_56px_-36px_rgba(17,24,39,0.38)] sm:p-6 lg:grid-cols-[1fr_1fr] lg:p-8">
          <div className="max-w-[560px]">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#fff3ea] px-3.5 py-1.5 text-xs font-black uppercase tracking-wide text-fs-accent">
              <MdGroups className="h-4 w-4" />
              Accompagnement
            </p>
            <h2 className="mt-3 text-[2.05rem] font-black leading-[1.08] tracking-tight text-[#0f172a] sm:text-[3.35rem]">
              Un expert vous accompagne
              <br />
              dans la prise en main de
              <br />
              <span className="text-fs-accent">FasoStock</span>
            </h2>
            <div className="mt-4 h-1 w-14 rounded-full bg-fs-accent/90" />
            <p className="mt-5 max-w-md text-base leading-relaxed text-[#4b5563]">
              Notre équipe vous aide à configurer votre boutique, importer vos produits, former vos utilisateurs et
              démarrer rapidement avec FasoStock.
            </p>
            <div className="mt-6 flex flex-col gap-3 min-[460px]:flex-row">
              <Link
                href={supportDemoUrl}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-fs-accent px-5 py-2.5 text-base font-extrabold text-white shadow-[0_20px_34px_-18px_rgba(232,93,44,0.9)]"
              >
                <MdCalendarMonth className="h-5 w-5" aria-hidden />
                Demander une démo
              </Link>
              <Link
                href={supportWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#3ab88f]/55 bg-[#f8fffb] px-5 py-2.5 text-base font-extrabold text-[#149a71]"
              >
                <MdWhatsapp className="h-5 w-5" aria-hidden />
                WhatsApp
              </Link>
            </div>
            <div className="mt-7 grid gap-3 border-t border-black/10 pt-4 text-[1rem] font-semibold text-[#374151] sm:grid-cols-3">
              <p className="inline-flex items-center gap-2.5">
                <MdGroups className="h-5 w-5 text-fs-accent" />
                Accompagnement personnalisé
              </p>
              <p className="inline-flex items-center gap-2.5">
                <MdHeadsetMic className="h-5 w-5 text-fs-accent" />
                Support réactif et disponible
              </p>
              <p className="inline-flex items-center gap-2.5">
                <MdTrendingUp className="h-5 w-5 text-fs-accent" />
                Votre réussite est notre priorité
              </p>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[530px]">
            <div className="pointer-events-none absolute left-7 top-14 h-[230px] w-[120px] rounded-full border-2 border-dashed border-fs-accent/35" />
            <div className="absolute left-4 top-8 z-10 hidden w-[165px] flex-col gap-3 sm:flex">
              {[
                { title: "Configuration", subtitle: "Installation et paramétrage", icon: MdAutorenew },
                { title: "Support client", subtitle: "Assistance rapide et efficace", icon: MdHeadsetMic },
                { title: "Formation", subtitle: "Formation de vos équipes", icon: MdCalendarMonth },
                { title: "Suivi", subtitle: "Un suivi régulier de votre activité", icon: MdTrendingUp },
              ].map((item) => (
                <article key={item.title} className="rounded-md border border-black/10 bg-white/96 p-2.5 shadow-[0_14px_28px_-20px_rgba(17,24,39,0.5)]">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff3ea] text-fs-accent">
                      <item.icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-black leading-tight text-[#111827]">{item.title}</p>
                      <p className="mt-0.5 text-[10px] leading-tight text-[#6b7280]">{item.subtitle}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {supportSectionImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={supportSectionImageUrl}
                alt="Conseiller FasoStock"
                loading="lazy"
                decoding="async"
                className="relative z-[1] h-[350px] w-full rounded-md border border-black/10 object-cover sm:h-[520px]"
              />
            ) : (
              <div className="relative z-[1] flex h-[350px] w-full items-center justify-center rounded-md border border-dashed border-black/20 bg-white text-center text-sm text-neutral-500 sm:h-[520px]">
                Image d&apos;accompagnement non définie.
                <br />
                Ajoutez-la dans Super Admin &gt; GPublique.
              </div>
            )}
            <article className="relative z-[2] -mt-10 ml-auto mr-3 w-[90%] rounded-md border border-black/10 bg-white p-3 shadow-[0_20px_30px_-22px_rgba(17,24,39,0.7)] sm:-mt-14 sm:mr-4 sm:w-[82%] sm:p-4">
              <div className="grid grid-cols-[58px_1fr] items-center gap-3 sm:grid-cols-[66px_1fr]">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#fff1e7] text-fs-accent sm:h-16 sm:w-16">
                  <MdGroups className="h-8 w-8" aria-hidden />
                </span>
                <div>
                  <p className="text-[1.55rem] font-black leading-none text-[#111827]">
                    Conseiller <span className="text-fs-accent">FasoStock</span>
                  </p>
                  <p className="mt-1 text-sm text-[#4b5563]">Accompagnement, configuration et support client</p>
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#fff4ec] px-3 py-1 text-[12px] font-bold text-fs-accent">
                    <MdVerifiedUser className="h-4 w-4" />
                    À vos côtés à chaque étape
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ── DÉFIS QUOTIDIENS ── */}
      <section id="demonstration" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-8 sm:px-6 sm:pb-12">
        <div className="relative overflow-hidden rounded-md border border-black/8 bg-[#fbfbfb] px-4 py-6 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -left-12 -top-14 h-40 w-40 rounded-full bg-[#fff1e7]" />
          <div className="pointer-events-none absolute right-6 top-6 text-[11px] tracking-[0.25em] text-fs-accent/25">··············</div>

          <div className="relative flex flex-col items-center text-center">
            <LottiePlayer src="/animations/alert.json" className="h-20 w-20" />
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent">
              <MdEmojiEmotions className="h-4 w-4" />
              Les défis quotidiens
            </p>
            <h3 className="mx-auto mt-3 max-w-3xl text-[1.8rem] font-black leading-[1.05] tracking-tight text-[#17253a] sm:text-[3rem]">
              Vous perdez peut-être
              <br />
              <span className="text-fs-accent">de l&apos;argent sans le savoir</span>
            </h3>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-[1.05rem]">
              Gérer un commerce sans outil adapté peut entraîner des erreurs, des pertes et un manque de visibilité sur
              votre activité.
            </p>
          </div>

          <div data-fs-stagger className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dailyChallenges.map((item, i) => {
              const toneMap = {
                orange: "border-[#ffe2d2] bg-[#fff7f2] text-[#f97316]",
                blue: "border-[#d7e9ff] bg-[#f4f9ff] text-[#2f80ed]",
                green: "border-[#d9efdf] bg-[#f4fbf6] text-[#22a168]",
                purple: "border-[#e8defa] bg-[#f8f4ff] text-[#7c3aed]",
                amber: "border-[#f3e3c9] bg-[#fffaf2] text-[#d97706]",
                red: "border-[#ffe0dc] bg-[#fff6f5] text-[#ef4444]",
                cyan: "border-[#d7f2f6] bg-[#f3fbfc] text-[#0891b2]",
              } as const;
              const tone = toneMap[item.tone];
              const [borderClass, bgClass, textClass] = tone.split(" ") as [string, string, string];
              return (
                <article
                  key={item.title}
                  className={cn(
                    "relative rounded-md border p-4 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.45)]",
                    borderClass,
                    bgClass,
                    i >= 4 ? "lg:col-span-1" : "",
                  )}
                >
                  <span className="absolute right-3 top-3 inline-flex rounded-md bg-white px-2 py-0.5 text-xs font-black text-fs-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className={cn("mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border bg-white", textClass)}>
                    <item.icon className="h-6 w-6" aria-hidden />
                  </div>
                  <h4 className="mt-3 text-center text-lg font-black leading-tight text-[#1f2937]">
                    {item.title}
                  </h4>
                  <p className="mt-1.5 text-center text-xs leading-relaxed text-neutral-600">{item.text}</p>
                  <div className={cn("mx-auto mt-2.5 h-1 w-10 rounded-full", textClass.replace("text", "bg"))} />
                </article>
              );
            })}
          </div>

          <div className="mt-4 rounded-md border border-fs-accent/25 bg-[#fff7f1] px-4 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fs-accent text-white">
                <MdEmojiEmotions className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-black text-[#202938]">La bonne nouvelle ?</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                  FasoStock a été conçu pour résoudre tous ces problèmes et vous aider à reprendre le{" "}
                  <span className="font-black text-fs-accent">contrôle total</span> de votre commerce.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── NOTRE SOLUTION ── */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-12">
        <div className="relative overflow-hidden rounded-md border border-black/8 bg-[#fbfbfb] px-4 py-6 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -left-12 -top-14 h-40 w-40 rounded-full bg-[#fff1e7]" />
          <div className="pointer-events-none absolute right-6 top-6 text-[11px] tracking-[0.25em] text-fs-accent/25">··············</div>

          <div className="relative flex flex-col items-center text-center">
            <LottiePlayer src="/animations/check.json" className="h-20 w-20" />
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent">
              <MdCheckCircle className="h-4 w-4" />
              Notre solution
            </p>
            <h3 className="mx-auto mt-3 max-w-3xl text-[1.8rem] font-black leading-[1.05] tracking-tight text-[#17253a] sm:text-[3rem]">
              FasoStock centralise toute la
              <br />
              <span className="text-fs-accent">gestion de votre commerce</span>
            </h3>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-[1.05rem]">
              Une plateforme simple, complète et intelligente pour gérer tous les aspects de votre activité depuis un
              seul endroit.
            </p>
          </div>

          <div data-fs-stagger className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {solutionCapabilities.map((item) => {
              const toneMap = {
                orange: "text-[#f97316] bg-[#fff7f2] border-[#ffe2d2]",
                blue: "text-[#2f80ed] bg-[#f4f9ff] border-[#d7e9ff]",
                green: "text-[#22a168] bg-[#f4fbf6] border-[#d9efdf]",
                purple: "text-[#7c3aed] bg-[#f8f4ff] border-[#e8defa]",
                amber: "text-[#d97706] bg-[#fffaf2] border-[#f3e3c9]",
                pink: "text-[#db2777] bg-[#fff4fb] border-[#f8d8ec]",
                cyan: "text-[#0891b2] bg-[#f3fbfc] border-[#d7f2f6]",
                indigo: "text-[#2563eb] bg-[#f3f7ff] border-[#d8e3ff]",
              } as const;
              const [textClass, _bgClass, borderClass] = toneMap[item.tone].split(" ") as [string, string, string];
              return (
                <article
                  key={item.title}
                  className={cn(
                    "rounded-md border bg-white p-4 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.45)]",
                    borderClass,
                  )}
                >
                  <div
                    className={cn(
                      "inline-flex h-12 w-12 items-center justify-center rounded-full border bg-white",
                      textClass,
                    )}
                  >
                    <item.icon className="h-6 w-6" aria-hidden />
                  </div>
                  <h4 className="mt-3 text-lg font-black leading-tight text-[#1f2937]">{item.title}</h4>
                  <div className={cn("mt-2 h-1 w-10 rounded-full", textClass.replace("text", "bg"))} />
                  <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-[13px]">{item.text}</p>
                </article>
              );
            })}
          </div>

          <p className="relative mx-auto mt-6 max-w-2xl text-center text-base font-black text-[#17253a] sm:text-lg">
            Tout ce dont vous avez besoin,
            <br />
            <span className="text-fs-accent">dans une seule application.</span>
          </p>

          <div className="mt-4 overflow-hidden rounded-md border border-fs-accent/25 bg-[#fff7f1]">
            <div className="grid gap-0 divide-y divide-fs-accent/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              {[
                {
                  icon: MdSecurity,
                  title: "Sécurisé",
                  text: "Vos données sont protégées et confidentielles.",
                },
                {
                  icon: MdOfflineBolt,
                  title: "Simple & rapide",
                  text: "Interface intuitive pour gagner du temps.",
                },
                {
                  icon: MdOutlinePhoneAndroid,
                  title: "Accessible partout",
                  text: "Utilisez FasoStock sur mobile ou ordinateur.",
                },
                {
                  icon: MdHeadsetMic,
                  title: "Support local",
                  text: "Une équipe disponible pour vous accompagner.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3 px-4 py-3.5">
                  <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
                  <div>
                    <p className="text-sm font-black text-[#202938]">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TARIFS ── */}
      <section id="tarifs" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-8 sm:px-6 sm:pb-12">
        <div className="relative overflow-hidden rounded-md border border-black/8 bg-[#f8fafc] px-4 py-6 sm:px-7 sm:py-8">
          <div className="pointer-events-none absolute -left-14 -top-16 h-44 w-44 rounded-full bg-[#ffe8db]" />
          <div className="pointer-events-none absolute -bottom-14 -right-16 h-44 w-44 rounded-full bg-[#e7f4ef]" />

          <div className="relative text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-fs-accent">ABONNEMENT</p>
            <div className="mx-auto mt-2 h-0.5 w-12 rounded-full bg-fs-accent/70" />
            <h4 className="mt-3 text-[2rem] font-black leading-[1.04] tracking-tight text-[#202938] sm:text-[3.45rem]">
              Choisissez le plan qui
              <br />
              correspond à <span className="text-fs-accent">votre activité</span>
            </h4>
            <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-600 sm:text-[1.05rem]">
              Des formules simples, flexibles et adaptées à tous les types de commerces. Commencez gratuitement, puis
              évoluez selon vos besoins.
            </p>
          </div>

          <div data-fs-stagger className="relative mt-7 grid gap-4 lg:grid-cols-3">
            <article className="rounded-md border border-[#d5eadf] bg-white p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.5)] sm:min-h-[420px] sm:p-5">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#d5eadf] bg-[#f2fbf6] text-[#22a168]">
                <MdCardGiftcard className="h-6 w-6" aria-hidden />
              </div>
              <div className="mt-2 text-center">
                <span className="inline-flex rounded-full bg-[#e7f7ef] px-3 py-1 text-xs font-extrabold uppercase text-[#22a168]">
                  Gratuit
                </span>
                <p className="mt-2 text-[2rem] font-black text-[#202938]">Essai gratuit</p>
                <p className="mt-1 text-5xl font-black text-[#22a168]">{trialDays} jours</p>
              </div>
              <ul className="mt-5 space-y-2 text-[0.95rem] text-neutral-700">
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-[#22a168]" /> Accès complet</li>
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-[#22a168]" /> Aucune carte requise</li>
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-[#22a168]" /> Support inclus</li>
              </ul>
              <Link
                href="/register/select-activity"
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#7cd3a9] bg-white px-4 py-2 text-sm font-extrabold text-[#22a168]"
              >
                Commencer l&apos;essai gratuit
                <MdArrowForward className="h-4 w-4" />
              </Link>
            </article>

            <article className="relative rounded-md border-2 border-fs-accent bg-white p-4 shadow-[0_20px_40px_-24px_rgba(249,115,22,0.75)] sm:min-h-[420px] sm:p-5">
              <span className="absolute left-1/2 top-0 inline-flex -translate-x-1/2 -translate-y-1/2 rounded-full bg-fs-accent px-4 py-1 text-xs font-black uppercase text-white">
                Populaire
              </span>
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-fs-accent/20 bg-[#fff5ee] text-fs-accent">
                <MdCalendarMonth className="h-6 w-6" aria-hidden />
              </div>
              <div className="mt-2 text-center">
                <p className="text-[2rem] font-black text-[#202938]">Annuel</p>
                <p className="mt-1 text-6xl font-black text-fs-accent">{formatFcfa(yearlyAmount)}</p>
                <p className="text-2xl font-bold text-fs-accent/85">FCFA / an</p>
              </div>
              <ul className="mt-5 space-y-2 text-[0.95rem] text-neutral-700">
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-fs-accent" /> Tout le plan mensuel</li>
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-fs-accent" /> Économisez {formatFcfa(yearlySavings)} FCFA</li>
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-fs-accent" /> Facturation unique</li>
              </ul>
              <Link
                href="/register/select-activity"
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-fs-accent px-4 py-2 text-sm font-extrabold text-white"
              >
                Choisir le plan annuel
                <MdArrowForward className="h-4 w-4" />
              </Link>
            </article>

            <article className="rounded-md border border-[#d5e3ff] bg-white p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.5)] sm:min-h-[420px] sm:p-5">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#d5e3ff] bg-[#f1f6ff] text-[#2f80ed]">
                <MdWallet className="h-6 w-6" aria-hidden />
              </div>
              <div className="mt-2 text-center">
                <span className="inline-flex rounded-full bg-[#eaf2ff] px-3 py-1 text-xs font-extrabold uppercase text-[#2f80ed]">
                  Flexible
                </span>
                <p className="mt-2 text-[2rem] font-black text-[#202938]">Mensuel</p>
                <p className="mt-1 text-6xl font-black text-[#2f80ed]">{formatFcfa(monthlyAmount)}</p>
                <p className="text-2xl font-bold text-[#2f80ed]/85">FCFA / mois</p>
              </div>
              <ul className="mt-5 space-y-2 text-[0.95rem] text-neutral-700">
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-[#2f80ed]" /> Toutes les fonctionnalités</li>
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-[#2f80ed]" /> Multi-boutiques & utilisateurs</li>
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-[#2f80ed]" /> Support prioritaire</li>
                <li className="flex items-center gap-2"><MdCheckCircle className="h-4 w-4 text-[#2f80ed]" /> Mises à jour incluses</li>
              </ul>
              <Link
                href="/register/select-activity"
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#2f80ed] px-4 py-2 text-sm font-extrabold text-white"
              >
                Choisir le plan mensuel
                <MdArrowForward className="h-4 w-4" />
              </Link>
            </article>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border border-black/8 bg-white">
            <div className="grid grid-cols-2 divide-y divide-black/8 min-[760px]:grid-cols-4 min-[760px]:divide-x min-[760px]:divide-y-0">
              {[
                {
                  icon: MdSecurity,
                  title: "Sans engagement",
                  subtitle: "Résiliez à tout moment",
                  color: "text-[#22a168]",
                },
                {
                  icon: MdLock,
                  title: "Paiement sécurisé",
                  subtitle: "Vos données sont protégées",
                  color: "text-fs-accent",
                },
                {
                  icon: MdHeadsetMic,
                  title: "Support réactif",
                  subtitle: "Une équipe à votre écoute",
                  color: "text-[#2f80ed]",
                },
                {
                  icon: MdAutorenew,
                  title: "Mises à jour incluses",
                  subtitle: "Toujours la meilleure version",
                  color: "text-[#7c3aed]",
                },
              ].map((cell) => (
                <div key={cell.title} className="flex items-start gap-2.5 px-4 py-3">
                  <cell.icon className={cn("mt-0.5 h-5 w-5 shrink-0", cell.color)} aria-hidden />
                  <div>
                    <p className="text-sm font-bold text-[#202938]">{cell.title}</p>
                    <p className="text-xs text-neutral-600">{cell.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="fonctionnalites-principales" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-8 sm:px-6 sm:pb-12">
        <div className="relative overflow-hidden rounded-md border border-black/8 bg-white px-4 py-6 shadow-[0_22px_56px_-36px_rgba(17,24,39,0.28)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -left-12 -top-14 h-40 w-40 rounded-full bg-[#fff1e7]" />
          <div className="relative text-center">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent">
              <MdCheckCircle className="h-4 w-4" />
              Fonctionnalités principales
            </p>
            <h3 className="mx-auto mt-3 max-w-4xl text-[1.85rem] font-black leading-[1.05] tracking-tight text-[#17253a] sm:text-[3.1rem]">
              Toutes les fonctionnalités essentielles
              <br />
              <span className="text-fs-accent">pour gérer votre activité facilement</span>
            </h3>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-neutral-600 sm:text-[1.05rem]">
              FasoStock regroupe tous les outils dont vous avez besoin pour gérer votre commerce de manière simple,
              efficace et professionnelle.
            </p>
          </div>

          <div data-fs-stagger className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {landingFonctionnalitesPrincipales.map((item) => (
              <article
                key={item.title}
                className="flex h-full flex-col rounded-md border border-black/10 bg-[#fbfbfb] p-4 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.45)]"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-fs-accent/25 bg-[#fff5ef] text-fs-accent">
                  <item.icon className="h-6 w-6" aria-hidden />
                </div>
                <h4 className="mt-3 text-lg font-black leading-tight text-[#1f2937]">{item.title}</h4>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-neutral-600 sm:text-[13px]">{item.text}</p>
                <Link
                  href="#demonstration"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-black text-fs-accent hover:underline"
                >
                  En savoir plus
                  <MdArrowForward className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </article>
            ))}
          </div>

          <div className="relative mt-8 overflow-hidden rounded-md border border-fs-accent/20 bg-[#fff7f1] px-3 py-5 sm:px-6 sm:py-6">
            <p className="text-center text-xl font-black leading-[1.12] tracking-tight text-[#17253a] sm:text-[1.35rem] lg:text-3xl">
              Conçu pour simplifier
              <br />
              <span className="text-fs-accent">votre quotidien</span>
            </p>
            <div
              data-fs-stagger
              className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 lg:grid-cols-5"
            >
              {landingSimplifierBand.map((b) => (
                <article
                  key={b.title}
                  className="flex h-full flex-col rounded-md border border-black/8 bg-white/90 p-2.5 text-left shadow-sm sm:p-3 sm:text-center"
                >
                  <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff5ef] text-fs-accent sm:mx-auto sm:h-9 sm:w-9">
                    <b.icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </div>
                  <p className="mt-2 text-xs font-black leading-tight text-[#1f2937] sm:text-sm">{b.title}</p>
                  <p className="mt-1 flex-1 text-[10px] leading-snug text-neutral-600 sm:text-[11px] sm:leading-relaxed">
                    {b.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div id="temoignages" className="scroll-mt-24">
        <TestimonialsSection
          stats={testimonialsStats}
          ctaTitle={testimonialsCtaTitle}
          ctaSubtitle={testimonialsCtaSubtitle}
        />
      </div>

      <div id="faq" className="scroll-mt-24">
        <FaqSection />
      </div>

      <div id="partenaires" className="scroll-mt-24">
        <PartnersSection partners={partners} />
      </div>

      <footer id="contact" className="border-t border-white/10 bg-[#071427] text-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="rounded-md border border-white/10 bg-[#0b1b33] p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_1.3fr_auto] lg:items-center">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-fs-accent/20 text-fs-accent">
                  <MdMailOutline className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-2xl font-black leading-tight text-white">
                    Restez <span className="text-fs-accent">informé</span>
                  </p>
                  <p className="text-sm text-white/75">Recevez nos nouveautés, conseils et offres exclusives.</p>
                </div>
              </div>
              <NewsletterSubscribeForm />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr_1fr_1fr_1fr]">
            <div>
              <div className="inline-flex items-center gap-2.5">
                <Image src="/fs.png" alt="FasoStock" width={44} height={44} className="h-11 w-11 object-contain" />
                <p className="text-[1.55rem] font-black tracking-tight">
                  Faso<span className="text-fs-accent">Stock</span>
                </p>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/75">
                Le logiciel de gestion de commerce tout-en-un pour les commerçants africains.
              </p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/70">
                Vendez, gérez votre stock, suivez vos crédits et développez votre activité en toute simplicité.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <a
                  href={footerWhatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#0e223f] text-[#25D366] hover:border-[#25D366]/40"
                  aria-label="WhatsApp"
                >
                  <FaWhatsapp className="h-4 w-4" />
                </a>
                <a
                  href={footerFacebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#0e223f] text-[#1877F2] hover:border-[#1877F2]/40"
                  aria-label="Facebook"
                >
                  <FaFacebookF className="h-4 w-4" />
                </a>
                <a
                  href={footerYoutubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#0e223f] text-[#FF0000] hover:border-[#FF0000]/40"
                  aria-label="YouTube"
                >
                  <FaYoutube className="h-4 w-4" />
                </a>
                <a
                  href={footerTiktokUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#0e223f] text-white hover:border-white/40"
                  aria-label="TikTok"
                >
                  <FaTiktok className="h-4 w-4" />
                </a>
                <a
                  href={footerLinkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#0e223f] text-[#0A66C2] hover:border-[#0A66C2]/40"
                  aria-label="LinkedIn"
                >
                  <FaLinkedinIn className="h-4 w-4" />
                </a>
              </div>
            </div>

            {[
              {
                title: "Produit",
                links: [
                  { label: "Fonctionnalités", href: "#fonctionnalites-principales" },
                  { label: "Tarifs", href: "#tarifs" },
                  { label: "Démonstration", href: "#demonstration" },
                  { label: "Mises à jour", href: "/help" },
                  { label: "Intégrations", href: "/help" },
                ],
              },
              {
                title: "Ressources",
                links: [
                  { label: "Blog", href: "/help" },
                  { label: "Guides & Astuces", href: "/help" },
                  { label: "Centre d'aide", href: "/help" },
                  { label: "FAQ", href: "#faq" },
                  { label: "Vidéos tutoriels", href: "/help" },
                ],
              },
              {
                title: "Entreprise",
                links: [
                  { label: "À propos de nous", href: "#demonstration" },
                  { label: "Carrières", href: "/help" },
                  { label: "Partenaires", href: "#partenaires" },
                  { label: "Presse", href: "/help" },
                  { label: "Contact", href: "#contact" },
                ],
              },
              {
                title: "Légal",
                links: [
                  { label: "Conditions d'utilisation", href: "/conditions-utilisation" },
                  { label: "Politique de confidentialité", href: "/politique-confidentialite" },
                  { label: "Mentions légales", href: "/mentions-legales" },
                  { label: "Politique de remboursement", href: "/politique-remboursement" },
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <p className="text-[1.22rem] font-black text-fs-accent">{col.title}</p>
                <ul className="mt-3 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label} className="text-sm text-white/85">
                      <Link
                        href={l.href}
                        prefetch={false}
                        className="inline-flex items-center hover:text-fs-accent"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/*
            Maillage interne : les pages SEO ne doivent pas être orphelines.
            Un lien depuis l'accueil (page la plus forte du site) leur transmet
            de l'autorité et accélère leur indexation.
          */}
          <nav
            aria-label="Solutions FasoStock"
            className="mt-6 rounded-md border border-white/10 bg-[#0b1b33] p-4"
          >
            <p className="text-[1.22rem] font-black text-fs-accent">Nos solutions</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {SEO_LANDING_LINKS.map((l) => (
                <li key={l.href} className="text-sm text-white/85">
                  <Link href={l.href} className="hover:text-fs-accent">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-6 rounded-md border border-white/10 bg-[#0b1b33] p-4">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-fs-accent/20 text-fs-accent">
                <MdOutlinePhoneAndroid className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xl font-black">FasoStock sur tous vos appareils</p>
                <p className="text-sm text-white/70">Disponible sur Windows, Android et bientôt iOS</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isRealDownloadUrl(DOWNLOAD_LINKS.windows) ? (
                <a
                  href={DOWNLOAD_LINKS.windows}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-[#0e223f] px-3 text-xs font-bold text-white/90 hover:border-fs-accent/55"
                  title="Télécharger la version Windows"
                >
                  <FaWindows className="h-4 w-4" />
                  Windows
                </a>
              ) : (
                <span className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-[#0e223f] px-3 text-xs font-bold text-white/90">
                  <FaWindows className="h-4 w-4" />
                  Windows
                </span>
              )}
              {isRealDownloadUrl(DOWNLOAD_LINKS.android) ? (
                <a
                  href={DOWNLOAD_LINKS.android}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-[#0e223f] px-3 text-xs font-bold text-white/90 hover:border-fs-accent/55"
                  title="Télécharger la version Android"
                >
                  <FaGooglePlay className="h-4 w-4" />
                  Google Play
                </a>
              ) : (
                <span className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-[#0e223f] px-3 text-xs font-bold text-white/90">
                  <FaGooglePlay className="h-4 w-4" />
                  Google Play
                </span>
              )}
              <span
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-[#0e223f] px-3 text-xs font-bold text-white/65"
                title="Version iOS bientôt"
              >
                <FaApple className="h-4 w-4" />
                App Store (bientôt)
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              {isRealDownloadUrl(DOWNLOAD_LINKS.linux) ? (
                <a
                  href={DOWNLOAD_LINKS.linux}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center rounded-md border border-white/15 bg-[#0e223f] px-2.5 font-bold text-white/80 hover:border-fs-accent/55"
                  title="Télécharger la version Linux"
                >
                  Linux
                </a>
              ) : (
                <span className="inline-flex h-7 items-center rounded-md border border-white/15 bg-[#0e223f] px-2.5 font-bold text-white/80">
                  Linux
                </span>
              )}
              <span className="inline-flex h-7 items-center rounded-md border border-white/10 bg-[#0e223f]/75 px-2.5 font-bold text-white/50">
                macOS (bientôt)
              </span>
              <span className="inline-flex h-7 items-center rounded-md border border-white/10 bg-[#0e223f]/75 px-2.5 font-bold text-white/50">
                iOS (bientôt)
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} FasoStock. Tous droits réservés.</p>
            <p className="flex items-center gap-2">
              <span>🇧🇫</span>
              Fait avec ❤️ au Burkina Faso
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-[#0e223f] px-2.5 text-[11px] font-bold text-white">
                <FaCcVisa className="h-5 w-5 text-[#1A1F71]" />
                VISA
              </span>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-[#0e223f] px-2.5 text-[11px] font-bold text-white">
                <FaCcMastercard className="h-5 w-5 text-[#EB001B]" />
                MasterCard
              </span>
              <span className="inline-flex h-9 items-center rounded-md border border-[#1DA1F2]/35 bg-[#1DA1F2]/15 px-2.5 text-[11px] font-bold text-[#7BD0FF]">
                wave
              </span>
              <span className="inline-flex h-9 items-center rounded-md border border-[#f5bf3a]/35 bg-[#f5bf3a]/15 px-2.5 text-[11px] font-bold text-[#ffd672]">
                Moov Money
              </span>
              <span className="inline-flex h-9 items-center rounded-md border border-[#ff7a00]/35 bg-[#ff7a00]/15 px-2.5 text-[11px] font-bold text-[#ffb066]">
                Orange Money
              </span>
            </div>
          </div>
        </div>
      </footer>
      <ScrollDirectionFab />
      <LandingChatbot />
      {/* Bouton WhatsApp flottant — à gauche (le coin droit est occupé par le chatbot + FAB de scroll). */}
      <WhatsappFloat side="left" />
    </main>
  );
}

function formatFcfa(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.round(n)));
}
