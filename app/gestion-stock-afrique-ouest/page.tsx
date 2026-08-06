import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site-url";
import {
  MdStorefront,
  MdWifiOff,
  MdWallet,
  MdDescription,
  MdHeadsetMic,
  MdSync,
} from "react-icons/md";
import { SeoLandingPage, type SeoFeature, type SeoFaqItem } from "@/components/seo/seo-landing-page";

const siteUrl = SITE_URL;
const path = "/gestion-stock-afrique-ouest";
const canonicalUrl = `${siteUrl}${path}`;

export const metadata: Metadata = {
  title: { absolute: "Gestion de Stock pour l'Afrique de l'Ouest | FasoStock" },
  description:
    "Logiciel de gestion de stock pour commerces en Afrique de l'Ouest : Burkina, Côte d'Ivoire, Mali, Niger, Togo, Bénin. Adapté au Franc CFA.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: "Gestion de Stock pour l'Afrique de l'Ouest | FasoStock",
    description:
      "Gérez votre stock en Afrique de l'Ouest avec FasoStock. Burkina Faso, Côte d'Ivoire, Mali, Niger, Togo, Bénin — une solution pour toute la région.",
    url: canonicalUrl,
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
    },
  },
};

const features: SeoFeature[] = [
  {
    icon: MdStorefront,
    title: "Multi-pays, une seule application",
    text: "Gérez vos boutiques dans plusieurs pays d'Afrique de l'Ouest depuis un seul compte. Burkina Faso, Côte d'Ivoire, Mali, Niger, Togo, Bénin — tout dans un seul tableau de bord.",
  },
  {
    icon: MdWifiOff,
    title: "Adapté aux réalités africaines",
    text: "Optimisé pour les faibles connexions, Mobile Money intégré, interface en français. FasoStock est conçu pour fonctionner dans les conditions réelles des marchés d'Afrique de l'Ouest.",
  },
  {
    icon: MdWallet,
    title: "Franc CFA nativement intégré",
    text: "Tout est affiché en Franc CFA (XOF), la devise de l'UEMOA. Pas d'adaptation nécessaire — FasoStock est fait pour les marchés francophones d'Afrique de l'Ouest.",
  },
  {
    icon: MdDescription,
    title: "Rapports localisés",
    text: "Des rapports adaptés aux pratiques commerciales d'Afrique de l'Ouest : ventes journalières, crédits clients, mouvements de stock — tout ce dont vous avez besoin.",
  },
  {
    icon: MdSync,
    title: "Synchronisation multi-sites",
    text: "Vos données se synchronisent entre vos différents points de vente, même dans plusieurs pays. Vision globale de votre activité en temps réel.",
  },
  {
    icon: MdHeadsetMic,
    title: "Support local en français",
    text: "Notre équipe vous accompagne par WhatsApp en français. Nous connaissons les réalités du commerce en Afrique de l'Ouest et nous sommes là pour vous aider.",
  },
];

const benefits: string[] = [
  "Disponible dans tous les pays d'Afrique de l'Ouest francophone de l'UEMOA",
  "Franc CFA (XOF) intégré nativement, pas de configuration nécessaire",
  "Fonctionne même avec une faible connexion internet, essentiel dans les zones à réseau variable",
  "Conçu avec les retours de commerçants burkinabè, ivoiriens, maliens et plus",
  "Mobile Money pris en charge : Orange Money, Moov Money, Wave et autres",
  "Prix très accessibles, adaptés aux marchés et revenus d'Afrique de l'Ouest",
  "Formation et accompagnement disponibles en français par WhatsApp",
  "Mises à jour incluses, toujours la dernière version sans frais supplémentaires",
];

const faqs: SeoFaqItem[] = [
  {
    q: "FasoStock est-il disponible en Côte d'Ivoire ?",
    a: "Oui. FasoStock fonctionne partout en Afrique de l'Ouest, y compris en Côte d'Ivoire, au Mali, au Niger, au Togo et au Bénin. Vous pouvez créer votre compte depuis n'importe quel pays et commencer immédiatement.",
  },
  {
    q: "FasoStock prend-il en charge le Franc CFA ?",
    a: "Oui. Le Franc CFA (XOF) est la devise par défaut, parfaitement adaptée aux marchés de l'UEMOA. Tous les prix, rapports et transactions sont affichés en FCFA.",
  },
  {
    q: "Est-ce que FasoStock fonctionne en zone rurale avec peu d'internet ?",
    a: "Oui. FasoStock est optimisé pour les faibles débits : il fonctionne même avec une connexion internet faible ou instable. Les données se synchronisent automatiquement dès que le débit s'améliore, que ce soit en ville ou en zone rurale.",
  },
  {
    q: "Puis-je gérer une boutique à Abidjan et une autre à Ouagadougou ?",
    a: "Oui. La gestion multi-boutiques permet de piloter des établissements dans différents pays depuis un seul tableau de bord. Vous avez une vue consolidée de toute votre activité.",
  },
  {
    q: "Y a-t-il un support client en Afrique de l'Ouest ?",
    a: "Oui. Notre support est disponible par WhatsApp en français, avec une équipe qui connaît les réalités du marché africain. Nous répondons rapidement du lundi au samedi.",
  },
  {
    q: "Combien coûte FasoStock pour les commerçants d'Afrique de l'Ouest ?",
    a: "Les tarifs sont conçus pour être accessibles aux commerçants africains. Commencez gratuitement sans carte bancaire, et choisissez ensuite le plan qui correspond à la taille de votre commerce.",
  },
  {
    q: "FasoStock supporte-t-il le Mobile Money en Afrique de l'Ouest ?",
    a: "Oui. FasoStock permet d'enregistrer les paiements par Orange Money, Moov Money, Wave et autres services Mobile Money disponibles en Afrique de l'Ouest. Tout est tracé dans vos rapports.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "FasoStock",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS, Windows, macOS",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "XOF",
        availability: "https://schema.org/InStock",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "127",
        bestRating: "5",
      },
      url: siteUrl,
      description:
        "Logiciel de gestion de stock pour commerces en Afrique de l'Ouest. Burkina Faso, Côte d'Ivoire, Mali, Niger, Togo, Bénin.",
      availableIn: [
        "BF", // Burkina Faso
        "CI", // Côte d'Ivoire
        "ML", // Mali
        "NE", // Niger
        "TG", // Togo
        "BJ", // Bénin
      ],
    },
    {
      "@type": "WebPage",
      name: "Logiciel de Gestion de Stock en Afrique de l'Ouest",
      description:
        "FasoStock — solution de gestion de stock pour commerces en Afrique de l'Ouest. Disponible au Burkina Faso, Côte d'Ivoire, Mali, Niger, Togo, Bénin.",
      url: canonicalUrl,
      inLanguage: "fr",
      isPartOf: { "@type": "WebSite", url: siteUrl, name: "FasoStock" },
    },
  ],
};

export default function GestionStockAfriqueOuest() {
  return (
    <SeoLandingPage
      path={path}
      breadcrumbLabel="Gestion de stock en Afrique de l'Ouest"
      badge="Burkina Faso · Côte d'Ivoire · Mali · Niger · Togo · Bénin"
      h1="La solution de gestion de stock pour l'Afrique de l'Ouest"
      heroSubtitle="FasoStock est conçu pour les commerçants d'Afrique de l'Ouest. Disponible au Burkina Faso, en Côte d'Ivoire, au Mali, au Niger, au Togo et au Bénin. Franc CFA natif, faible connexion gérée, Mobile Money — une solution adaptée à votre réalité."
      features={features}
      benefits={benefits}
      faqs={faqs}
      ctaTitle="Gérez votre stock partout en Afrique de l'Ouest"
      ctaSubtitle="Une seule application pour tous vos commerces en Afrique francophone. Simple, accessible, conçue pour vous."
      jsonLd={jsonLd}
    />
  );
}
