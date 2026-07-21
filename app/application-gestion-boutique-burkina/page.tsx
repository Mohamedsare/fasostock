import type { Metadata } from "next";
import {
  MdOutlinePhoneAndroid,
  MdSpeed,
  MdCreditCard,
  MdInventory2,
  MdCalendarMonth,
  MdEmojiEmotions,
} from "react-icons/md";
import { SeoLandingPage, type SeoFeature, type SeoFaqItem } from "@/components/seo/seo-landing-page";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fasostock.com";
const canonicalUrl = `${siteUrl}/application-gestion-boutique-burkina`;

export const metadata: Metadata = {
  title: "Application de Gestion de Boutique au Burkina | FasoStock",
  description:
    "Application mobile et web pour gérer votre boutique au Burkina Faso : ventes, stock, crédits clients et caisse, même en faible connexion internet.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: "Application de Gestion de Boutique au Burkina | FasoStock",
    description:
      "FasoStock — l'application de gestion de boutique préférée des commerçants burkinabè. Mobile, rapide, simple et puissante.",
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
    icon: MdOutlinePhoneAndroid,
    title: "Application mobile intuitive",
    text: "Interface pensée pour être utilisée à la main pendant une vente. Grande lisibilité, boutons larges, navigation rapide — même sans formation préalable.",
  },
  {
    icon: MdSpeed,
    title: "Ventes ultra-rapides",
    text: "Scannez un code-barres ou tapez les premiers lettres d'un produit et encaissez en 3 secondes. Zéro temps d'attente pour vos clients même aux heures de pointe.",
  },
  {
    icon: MdCreditCard,
    title: "Crédits clients maîtrisés",
    text: "Sachez exactement qui vous doit combien. Relancez facilement vos débiteurs et encaissez les remboursements. Ne perdez plus un seul franc CFA de crédit.",
  },
  {
    icon: MdInventory2,
    title: "Stock mis à jour automatiquement",
    text: "Chaque vente enregistrée réduit votre stock en temps réel. Votre inventaire reflète toujours la réalité — sans saisie manuelle, sans erreur.",
  },
  {
    icon: MdCalendarMonth,
    title: "Résumé de caisse quotidien",
    text: "Clôturez votre journée en un clic et connaissez votre chiffre d'affaires, bénéfice net, et nombre de ventes. Un bilan complet chaque soir.",
  },
  {
    icon: MdEmojiEmotions,
    title: "Historique client complet",
    text: "Consultez tous les achats d'un client, ses crédits en cours, ses paiements passés. Une relation client professionnelle et personnalisée, même dans une petite boutique.",
  },
];

const benefits: string[] = [
  "Application téléchargeable sur Android et iPhone, aussi disponible sur PC via navigateur",
  "Peut être installée sans passer par le Play Store grâce à la technologie PWA",
  "Fonctionne même avec une faible connexion internet — pas d'interruption de vos activités",
  "Un seul outil pour remplacer votre carnet, votre caisse et vos fichiers Excel",
  "Parfait pour les boutiques, épiceries, salons, ateliers, quincailleries et autres commerces",
  "Mises à jour régulières et automatiques, toujours sans frais supplémentaires",
  "Interface en français, prise en main immédiate sans formation technique",
  "Données sauvegardées dans le cloud : changez de téléphone sans perdre vos données",
];

const faqs: SeoFaqItem[] = [
  {
    q: "Comment télécharger l'application FasoStock sur mon téléphone Android ?",
    a: "Ouvrez FasoStock depuis Chrome sur votre téléphone, créez votre compte et choisissez 'Ajouter à l'écran d'accueil' pour l'installer comme une application. Pas besoin du Play Store — tout se fait directement depuis le navigateur.",
  },
  {
    q: "Est-ce que FasoStock fonctionne sur les téléphones Android d'entrée de gamme ?",
    a: "Oui. FasoStock est optimisé pour fonctionner sur la majorité des téléphones Android, même les modèles moins récents avec peu de mémoire. L'application est légère et ne ralentit pas votre téléphone.",
  },
  {
    q: "Puis-je utiliser FasoStock sur mon ordinateur ET mon téléphone en même temps ?",
    a: "Oui. Vos données se synchronisent en temps réel entre tous vos appareils. Encaissez depuis votre téléphone en boutique et consultez les rapports depuis votre PC à la maison — tout est synchronisé.",
  },
  {
    q: "FasoStock est-il adapté pour une boutique de vêtements au Burkina Faso ?",
    a: "Oui. FasoStock gère les variantes de produits comme les tailles et les couleurs, parfait pour les boutiques de vêtements, chaussures, accessoires et textiles. Vous gérez vos collections facilement.",
  },
  {
    q: "Est-ce que l'application est sécurisée pour mes données commerciales ?",
    a: "Oui. Toutes vos données sont chiffrées et stockées de façon sécurisée dans le cloud. Seuls vous et les employés que vous autorisez peuvent y accéder. En cas de vol ou de perte de téléphone, vos données restent protégées.",
  },
  {
    q: "FasoStock propose-t-il une formation ou un tutoriel ?",
    a: "Oui. Des guides de démarrage sont disponibles dans l'application, et notre équipe WhatsApp vous accompagne à la prise en main. La plupart des commerçants maîtrisent l'essentiel en moins d'une heure.",
  },
  {
    q: "FasoStock fonctionne-t-il avec une connexion internet faible ?",
    a: "Oui. FasoStock est optimisé pour les faibles débits. Même avec une connexion internet faible ou instable, vous continuez à encaisser vos ventes et à gérer votre stock. Tout se synchronise automatiquement dès que le débit s'améliore.",
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
        "Application de gestion de boutique pour commerçants burkinabè. Ventes, stock, crédits clients, caisse — tout dans une application mobile.",
    },
    {
      "@type": "MobileApplication",
      name: "FasoStock",
      operatingSystem: "Android, iOS",
      applicationCategory: "BusinessApplication",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "XOF",
      },
      url: siteUrl,
    },
    {
      "@type": "WebPage",
      name: "Application de Gestion de Boutique au Burkina Faso",
      description:
        "FasoStock — application mobile et web pour gérer votre boutique au Burkina Faso. Ventes, stock, crédits, caisse, même en faible connexion.",
      url: canonicalUrl,
      inLanguage: "fr",
      isPartOf: { "@type": "WebSite", url: siteUrl, name: "FasoStock" },
    },
  ],
};

export default function ApplicationGestionBoutiqueBurkina() {
  return (
    <SeoLandingPage
      badge="Application Mobile & Web · Burkina Faso"
      h1="L'application de gestion de boutique des commerçants burkinabè"
      heroSubtitle="Gérez votre boutique au Burkina Faso depuis votre téléphone. Ventes ultra-rapides, stock automatisé, crédits clients maîtrisés et caisse journalière — tout dans une seule application mobile et web, qui fonctionne même avec une faible connexion internet."
      features={features}
      benefits={benefits}
      faqs={faqs}
      ctaTitle="Téléchargez FasoStock sur votre téléphone"
      ctaSubtitle="Des milliers de commerçants burkinabè gèrent déjà leur boutique avec FasoStock. Commencez gratuitement en moins de 5 minutes."
      jsonLd={jsonLd}
    />
  );
}
